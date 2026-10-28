package main

import (
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"
)

const passwordIterations = 600000

func hashPassword(password string) (string, error) {
	if len(password) < 12 || len(password) > 256 {
		return "", errors.New("管理员密码需为12至256字节")
	}
	salt := make([]byte, 16)
	if _, e := rand.Read(salt); e != nil {
		return "", e
	}
	key, e := pbkdf2.Key(sha256.New, password, salt, passwordIterations, 32)
	if e != nil {
		return "", e
	}
	return fmt.Sprintf("pbkdf2-sha256$%d$%s$%s", passwordIterations, base64.RawStdEncoding.EncodeToString(salt), base64.RawStdEncoding.EncodeToString(key)), nil
}
func passwordParts(encoded string) ([]byte, []byte, error) {
	parts := strings.Split(encoded, "$")
	if len(parts) != 4 || parts[0] != "pbkdf2-sha256" || parts[1] != "600000" {
		return nil, nil, errors.New("无效的管理员密码哈希，请使用 --hash-password 生成")
	}
	salt, e := base64.RawStdEncoding.DecodeString(parts[2])
	if e != nil || len(salt) != 16 {
		return nil, nil, errors.New("无效密码盐")
	}
	key, e := base64.RawStdEncoding.DecodeString(parts[3])
	if e != nil || len(key) != 32 {
		return nil, nil, errors.New("无效密码哈希")
	}
	return salt, key, nil
}
func checkPassword(password, encoded string) bool {
	if len(password) < 12 || len(password) > 256 {
		return false
	}
	salt, want, e := passwordParts(encoded)
	if e != nil {
		return false
	}
	actual, e := pbkdf2.Key(sha256.New, password, salt, passwordIterations, 32)
	return e == nil && subtle.ConstantTimeCompare(actual, want) == 1
}
func (s *Server) adminKey() string {
	a, e := s.store.adminCredential()
	if e != nil {
		return ""
	}
	return sessionKey("local-admin-v2/" + a.Username + "/" + a.Revision)
}
func (s *Server) adminLogin(w http.ResponseWriter, r *http.Request) {
	var b struct {
		Username string
		Password string
	}
	if e := s.input(w, r, &b); e != nil {
		failure(w, 400, e)
		return
	}
	if !s.allowRate("login:"+clientIP(r), 5, 15*time.Minute) {
		failure(w, 429, errors.New("登录尝试过于频繁，请15分钟后重试"))
		return
	}
	s.authMu.RLock()
	defer s.authMu.RUnlock()
	a, e := s.store.adminCredential()
	if e != nil {
		failure(w, 500, e)
		return
	}
	valid := checkPassword(b.Password, a.PasswordHash)
	if !valid || subtle.ConstantTimeCompare([]byte(b.Username), []byte(a.Username)) != 1 {
		failure(w, 401, errors.New("管理员账号或密码错误"))
		return
	}
	if c, e := r.Cookie("lingpet_session"); e == nil {
		var old Session
		_ = s.store.consume("sessions", sessionKey(c.Value), &old)
	}
	if e := s.login(w, r, a.Username, 0); e != nil {
		failure(w, 500, e)
		return
	}
	respond(w, 200, map[string]bool{"ok": true, "mustChangePassword": a.MustChange})
}

func (s *Server) changePassword(w http.ResponseWriter, r *http.Request) {
	if _, e := s.session(r); e != nil {
		failure(w, 401, errors.New("请先登录"))
		return
	}
	var b struct {
		CurrentPassword string
		NewPassword     string
		ConfirmPassword string
	}
	if e := s.input(w, r, &b); e != nil {
		failure(w, 400, e)
		return
	}
	if !s.allowRate("password:"+clientIP(r), 5, 15*time.Minute) {
		failure(w, 429, errors.New("修改尝试过于频繁，请稍后重试"))
		return
	}
	s.authMu.Lock()
	defer s.authMu.Unlock()
	if _, e := s.session(r); e != nil {
		failure(w, 401, errors.New("登录状态已变化，请重新登录"))
		return
	}
	a, e := s.store.adminCredential()
	if e != nil {
		failure(w, 500, e)
		return
	}
	if !checkPassword(b.CurrentPassword, a.PasswordHash) {
		failure(w, 401, errors.New("当前密码错误"))
		return
	}
	if b.NewPassword != b.ConfirmPassword {
		failure(w, 400, errors.New("两次输入的新密码不一致"))
		return
	}
	if b.NewPassword == b.CurrentPassword {
		failure(w, 400, errors.New("新密码不能与当前密码相同"))
		return
	}
	hash, e := hashPassword(b.NewPassword)
	if e != nil {
		failure(w, 400, e)
		return
	}
	if _, e = s.store.changeAdminPassword(a.Revision, hash); e != nil {
		failure(w, 409, e)
		return
	}
	if c, e := r.Cookie("lingpet_session"); e == nil {
		var old Session
		_ = s.store.consume("sessions", sessionKey(c.Value), &old)
	}
	if e = s.login(w, r, a.Username, 0); e != nil {
		failure(w, 500, e)
		return
	}
	_ = s.store.audit(a.Username, "account.password", "administrator", "")
	respond(w, 200, map[string]bool{"ok": true})
}

func (s *Server) changeUsername(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireAdmin(w, r); !ok {
		return
	}
	var b struct {
		NewUsername     string
		CurrentPassword string
	}
	if e := s.input(w, r, &b); e != nil {
		failure(w, 400, e)
		return
	}
	if !s.allowRate("username:"+clientIP(r), 5, 15*time.Minute) {
		failure(w, 429, errors.New("修改尝试过于频繁，请稍后重试"))
		return
	}
	s.authMu.Lock()
	defer s.authMu.Unlock()
	if _, ok := s.requireAdmin(w, r); !ok {
		return
	}
	a, e := s.store.adminCredential()
	if e != nil {
		failure(w, 500, e)
		return
	}
	if !checkPassword(b.CurrentPassword, a.PasswordHash) {
		failure(w, 401, errors.New("当前密码错误"))
		return
	}
	if !validAdminUsername(b.NewUsername) || b.NewUsername == a.Username {
		failure(w, 400, errors.New("请填写不同的新用户名（1至64个字符，不含空白或控制字符）"))
		return
	}
	updated, e := s.store.changeAdminUsername(a.Revision, b.NewUsername)
	if e != nil {
		failure(w, 409, e)
		return
	}
	if c, e := r.Cookie("lingpet_session"); e == nil {
		var old Session
		_ = s.store.consume("sessions", sessionKey(c.Value), &old)
	}
	if e = s.login(w, r, updated.Username, 0); e != nil {
		failure(w, 500, e)
		return
	}
	_ = s.store.audit(a.Username, "account.username", updated.Username, updated.Username)
	respond(w, 200, map[string]any{"ok": true, "username": updated.Username})
}
