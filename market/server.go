package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type Config struct {
	Addr, PublicURL, DataDir, GitHubToken, AdminUser, AdminPasswordHash, DownloadDir string
	Dev                                                                              bool
}
type Server struct {
	releaseMu sync.Mutex
	uploadMu  sync.Mutex
	authMu    sync.RWMutex
	submitMu  sync.Mutex
	rateMu    sync.Mutex
	rates     map[string]rateWindow
	cfg       Config
	store     *Store
	github    GitHub
	client    *http.Client
}

func (s *Server) admin(login string) bool {
	a, e := s.store.adminCredential()
	return e == nil && login != "" && login == a.Username
}
func sessionKey(raw string) string { h := sha256.Sum256([]byte(raw)); return hex.EncodeToString(h[:]) }
func (s *Server) session(r *http.Request) (Session, error) {
	c, e := r.Cookie("lingpet_session")
	if e != nil {
		return Session{}, e
	}
	var u Session
	e = s.store.get("sessions", sessionKey(c.Value), &u)
	if e != nil || time.Now().After(u.Expires) || !s.admin(u.Login) || u.AuthKey != s.adminKey() {
		return Session{}, errors.New("请先登录")
	}
	return u, nil
}
func respond(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}
func failure(w http.ResponseWriter, status int, e error) {
	respond(w, status, map[string]string{"error": e.Error()})
}
func (s *Server) input(w http.ResponseWriter, r *http.Request, v any) error {
	if !strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
		return errors.New("需要 JSON 请求")
	}
	if r.Header.Get("Sec-Fetch-Site") == "cross-site" {
		return errors.New("拒绝跨站请求")
	}
	r.Body = http.MaxBytesReader(w, r.Body, 32768)
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	if e := d.Decode(v); e != nil {
		return e
	}
	if d.Decode(new(any)) != io.EOF {
		return errors.New("多余请求数据")
	}
	return nil
}
func requestSecure(r *http.Request) bool {
	if r.TLS != nil {
		return true
	}
	host, _, _ := net.SplitHostPort(r.RemoteAddr)
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback() && r.Header.Get("X-Forwarded-Proto") == "https"
}
func (s *Server) login(w http.ResponseWriter, r *http.Request, login string, id int64) error {
	raw := newID()
	if e := s.store.put("sessions", sessionKey(raw), Session{Login: login, UserID: id, Expires: time.Now().Add(8 * time.Hour), AuthKey: s.adminKey()}); e != nil {
		return e
	}
	http.SetCookie(w, &http.Cookie{Name: "lingpet_session", Value: raw, Path: "/", HttpOnly: true, Secure: requestSecure(r), SameSite: http.SameSiteLaxMode, MaxAge: 8 * 3600})
	return nil
}
func (s *Server) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /{$}", s.home)
	mux.HandleFunc("GET /market", func(w http.ResponseWriter, r *http.Request) {
		serveWebFile("market.html")(w, r)
		if r.Method == "GET" {
			_ = s.store.metric("visit.market", 0)
		}
	})
	mux.HandleFunc("GET /admin", serveWebFile("admin.html"))
	mux.HandleFunc("GET /admin/{$}", func(w http.ResponseWriter, r *http.Request) { http.Redirect(w, r, "/admin", http.StatusFound) })
	mux.HandleFunc("GET /api/downloads", s.listDownloads)
	mux.HandleFunc("GET /downloads/{id}", s.serveDownload)
	mux.HandleFunc("GET /api/admin/stats", s.adminStats)
	mux.HandleFunc("GET /api/admin/stats.csv", s.adminStatsCSV)
	mux.HandleFunc("GET /api/admin/releases", s.adminReleases)
	mux.HandleFunc("POST /api/admin/releases/upload", s.uploadRelease)
	mux.HandleFunc("POST /api/admin/releases/{id}/{action}", s.manageRelease)
	mux.HandleFunc("GET /api/admin/audit", s.adminAudit)
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		respond(w, 200, map[string]any{"ok": true, "service": "lingpet-market", "version": strings.TrimSpace(marketVersion), "formatVersion": 1})
	})
	mux.HandleFunc("GET /api/config", func(w http.ResponseWriter, r *http.Request) {
		respond(w, 200, map[string]any{"anonymousSubmissions": true, "adminLogin": true})
	})
	mux.HandleFunc("GET /api/me", func(w http.ResponseWriter, r *http.Request) {
		u, e := s.session(r)
		if e != nil {
			respond(w, 200, map[string]any{"user": nil})
			return
		}
		a, e := s.store.adminCredential()
		if e != nil {
			failure(w, 500, e)
			return
		}
		respond(w, 200, map[string]any{"user": u.Login, "admin": s.admin(u.Login), "mustChangePassword": a.MustChange})
	})
	mux.HandleFunc("POST /auth/admin", s.adminLogin)
	mux.HandleFunc("POST /auth/password", s.changePassword)
	mux.HandleFunc("POST /auth/username", s.changeUsername)
	mux.HandleFunc("POST /auth/logout", func(w http.ResponseWriter, r *http.Request) {
		var b struct{}
		if e := s.input(w, r, &b); e != nil {
			failure(w, 400, e)
			return
		}
		if c, e := r.Cookie("lingpet_session"); e == nil {
			var old Session
			s.store.consume("sessions", sessionKey(c.Value), &old)
		}
		http.SetCookie(w, &http.Cookie{Name: "lingpet_session", Path: "/", MaxAge: -1, HttpOnly: true, Secure: requestSecure(r), SameSite: http.SameSiteLaxMode})
		respond(w, 200, map[string]bool{"ok": true})
	})
	mux.HandleFunc("POST /api/submissions", s.submit)
	mux.HandleFunc("POST /api/submissions/lookup", s.lookupSubmission)
	mux.HandleFunc("GET /api/pets", func(w http.ResponseWriter, r *http.Request) {
		all, e := s.store.records()
		if e != nil {
			failure(w, 500, e)
			return
		}
		out := []Record{}
		q := strings.ToLower(r.URL.Query().Get("q"))
		for _, a := range all {
			if a.Status == "approved" && (q == "" || strings.Contains(strings.ToLower(a.Pet.Name+" "+a.Pet.Description+" "+a.Pet.Author), q)) {
				out = append(out, a)
			}
		}
		if len(out) > 200 {
			out = out[:200]
		}
		respond(w, 200, out)
	})
	mux.HandleFunc("GET /api/versions/{id}", func(w http.ResponseWriter, r *http.Request) {
		a, ok := s.visible(w, r)
		if ok {
			respond(w, 200, a)
		}
	})
	mux.HandleFunc("GET /api/versions/{id}/install", func(w http.ResponseWriter, r *http.Request) {
		var a Record
		if s.store.get("records", r.PathValue("id"), &a) != nil || a.Status != "approved" {
			http.NotFound(w, r)
			return
		}
		respond(w, 200, map[string]any{"id": a.ID, "pet": a.Pet, "source": a.Source, "sha256": a.SHA256, "size": a.Size, "url": a.Source.URL})
	})
	mux.HandleFunc("GET /api/versions/{id}/preview/{file...}", func(w http.ResponseWriter, r *http.Request) {
		a, ok := s.visible(w, r)
		if !ok {
			return
		}
		file := r.PathValue("file")
		if !packageFile.MatchString(file) || !strings.HasSuffix(file, ".png") {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Cache-Control", "private, max-age=3600")
		w.Header().Set("Content-Type", "image/png")
		http.ServeFile(w, r, filepath.Join(s.cfg.DataDir, "previews", a.ID, filepath.FromSlash(file)))
	})
	mux.HandleFunc("GET /api/admin/versions", func(w http.ResponseWriter, r *http.Request) {
		if _, ok := s.requireAdmin(w, r); !ok {
			return
		}
		all, e := s.store.records()
		if e != nil {
			failure(w, 500, e)
			return
		}
		respond(w, 200, all)
	})
	mux.HandleFunc("POST /api/admin/versions/{id}/{action}", func(w http.ResponseWriter, r *http.Request) {
		u, ok := s.requireAdmin(w, r)
		if !ok {
			return
		}
		var b struct {
			Reason string `json:"reason"`
		}
		if e := s.input(w, r, &b); e != nil || len(b.Reason) > 2000 {
			failure(w, 400, errors.New("无效审核原因"))
			return
		}
		if e := s.store.review(r.PathValue("id"), u.Login, r.PathValue("action"), b.Reason); e != nil {
			failure(w, 409, e)
			return
		}
		_ = s.store.audit(u.Login, "pet."+r.PathValue("action"), r.PathValue("id"), b.Reason)
		respond(w, 200, map[string]bool{"ok": true})
	})
	mux.Handle("/", http.FileServer(http.FS(webFiles())))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "same-origin")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'")
		if r.Method == "POST" && !s.allowRequest(r) {
			failure(w, 429, errors.New("请求过于频繁，请稍后重试"))
			return
		}
		mux.ServeHTTP(w, r)
	})
}
func (s *Server) visible(w http.ResponseWriter, r *http.Request) (Record, bool) {
	var a Record
	if s.store.get("records", r.PathValue("id"), &a) != nil {
		http.NotFound(w, r)
		return a, false
	}
	if a.Status != "approved" {
		u, e := s.session(r)
		credential, credentialError := s.store.adminCredential()
		if e != nil || !s.admin(u.Login) || credentialError != nil || credential.MustChange {
			http.NotFound(w, r)
			return a, false
		}
	}
	return a, true
}
func (s *Server) requireAdmin(w http.ResponseWriter, r *http.Request) (Session, bool) {
	u, e := s.session(r)
	if e != nil || !s.admin(u.Login) {
		failure(w, 403, errors.New("需要管理员权限"))
		return u, false
	}
	a, e := s.store.adminCredential()
	if e != nil || a.MustChange {
		failure(w, 403, errors.New("请先修改初始管理员密码"))
		return u, false
	}
	return u, true
}
func (s *Server) submit(w http.ResponseWriter, r *http.Request) {
	s.submitMu.Lock()
	defer s.submitMu.Unlock()
	var b struct {
		Repository string
		Tag        string
		AssetName  string
	}
	if e := s.input(w, r, &b); e != nil {
		failure(w, 400, e)
		return
	}
	repo, e := parseRepository(b.Repository)
	if e != nil || !field(b.Tag, 100) || !field(b.AssetName, 120) || !strings.HasSuffix(b.AssetName, ".petpack") {
		failure(w, 400, errors.New("请填写有效仓库、标签和 .petpack 附件名"))
		return
	}
	if !s.allowRate("submission:"+clientIP(r), 10, time.Hour) {
		failure(w, 429, errors.New("投稿过于频繁，请稍后重试"))
		return
	}
	salt, e := s.store.submissionSalt()
	if e != nil {
		failure(w, 500, e)
		return
	}
	ipHash := sessionKey(salt + "/" + clientIP(r))
	all, e := s.store.records()
	if e != nil {
		failure(w, 500, e)
		return
	}
	pending, total := 0, 0
	for _, a := range all {
		if a.Repository == repo && a.Tag == b.Tag && a.AssetName == b.AssetName && a.Status != "failed" {
			failure(w, 409, errors.New("该附件已经提交"))
			return
		}
		if a.Status == "queued" || a.Status == "validating" || a.Status == "pending" {
			total++
			var secret SubmissionSecret
			if s.store.get("submission-secrets", a.ID, &secret) == nil && secret.IPHash == ipHash {
				pending++
			}
		}
	}
	if pending >= 5 || total >= 200 {
		failure(w, 429, errors.New("待处理投稿已达上限，请稍后再试"))
		return
	}
	token := newID()
	a := Record{ID: newID(), Repository: repo, Tag: b.Tag, AssetName: b.AssetName, Submitter: "匿名投稿（身份未验证）", Status: "queued", Reviews: []Review{}, Created: time.Now().UTC(), Updated: time.Now().UTC()}
	if e = s.store.createSubmission(a, SubmissionSecret{TokenHash: sessionKey(token), IPHash: ipHash}); e != nil {
		failure(w, 500, e)
		return
	}
	respond(w, 202, map[string]any{"id": a.ID, "token": token, "record": a})
}
func (s *Server) lookupSubmission(w http.ResponseWriter, r *http.Request) {
	var b struct {
		ID    string
		Token string
	}
	if e := s.input(w, r, &b); e != nil {
		failure(w, 400, e)
		return
	}
	var secret SubmissionSecret
	var a Record
	if len(b.ID) != 48 || len(b.Token) != 48 || s.store.get("submission-secrets", b.ID, &secret) != nil || secret.TokenHash != sessionKey(b.Token) || s.store.get("records", b.ID, &a) != nil {
		failure(w, 404, errors.New("投稿编号或管理凭证无效"))
		return
	}
	respond(w, 200, a)
}
func (s *Server) worker(ctx context.Context) {
	_ = s.store.cleanExpired()
	lastCleanup := time.Now()
	all, _ := s.store.records()
	for _, a := range all {
		if a.Status == "validating" {
			a.Status = "queued"
			s.store.put("records", a.ID, a)
		}
	}
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if time.Since(lastCleanup) > time.Minute {
				_ = s.store.cleanExpired()
				lastCleanup = time.Now()
			}
			all, e := s.store.records()
			if e != nil {
				log.Print(e)
				continue
			}
			for _, a := range all {
				if a.Status == "queued" {
					s.validate(ctx, a)
					break
				}
			}
		}
	}
}
func (s *Server) validate(ctx context.Context, a Record) {
	a.Status = "validating"
	a.Updated = time.Now().UTC()
	if e := s.store.put("records", a.ID, a); e != nil {
		log.Print(e)
		return
	}
	e := s.validateInner(ctx, &a)
	if e != nil {
		a.Status = "failed"
		a.Error = e.Error()
		if ctx.Err() != nil {
			a.Status = "queued"
			a.Error = ""
		}
	} else {
		a.Status = "pending"
	}
	a.Updated = time.Now().UTC()
	if e = s.store.put("records", a.ID, a); e != nil {
		log.Print(e)
	}
}
func (s *Server) validateInner(ctx context.Context, a *Record) error {
	source, e := s.github.Resolve(ctx, a.Repository, a.Tag, a.AssetName)
	if e != nil {
		return e
	}
	pet, cover, e := s.github.Presentation(ctx, a.Repository, a.Tag)
	if e != nil {
		return e
	}
	if pet.FormatVersion != 1 || !packageID.MatchString(pet.ID) || !semver.MatchString(pet.Version) || len(pet.Version) > 32 || (pet.MinAppVersion != "0.4.0" && pet.MinAppVersion != "0.4.9" && pet.MinAppVersion != "0.5.0") || !field(pet.Name, 40) || !field(pet.Author, 100) || !field(pet.License, 200) || len([]rune(pet.Description)) > 2000 {
		return errors.New("仓库 pet.json 的作品信息无效")
	}
	image, e := decodePNG(cover, true)
	if e != nil {
		return e
	}
	all, e := s.store.records()
	if e != nil {
		return e
	}
	for _, old := range all {
		if old.ID != a.ID && old.Source != nil && old.Pet != nil && old.Source.RepoID == source.RepoID && old.Pet.ID == pet.ID && old.Pet.Version == pet.Version {
			return errors.New("该作品版本已存在，请增加版本号后重新提交")
		}
	}
	dest := filepath.Join(s.cfg.DataDir, "previews", a.ID)
	if e = os.MkdirAll(dest, 0700); e != nil {
		return e
	}
	// Only a re-encoded local cover is served; repository changes cannot alter approved display data.
	coverFile := filepath.Join(dest, "cover.png")
	if e = os.Remove(coverFile); e != nil && !os.IsNotExist(e) {
		return e
	}
	if e = writePNG(coverFile, image); e != nil {
		return e
	}
	a.Source = &source
	a.Pet = &pet
	a.SHA256 = ""
	a.Size = source.Size
	a.Preview = nil
	return nil
}
func validPublicURL(raw string, dev bool) error {
	u, e := url.Parse(raw)
	if e != nil || u.User != nil || u.RawQuery != "" || u.Fragment != "" || u.Path != "" {
		return errors.New("PUBLIC_URL 必须是无路径的域名根地址")
	}
	if u.Scheme == "https" && u.Hostname() != "" {
		return nil
	}
	if dev && u.Scheme == "http" && (u.Hostname() == "127.0.0.1" || u.Hostname() == "localhost") {
		return nil
	}
	return fmt.Errorf("生产 PUBLIC_URL 必须使用 HTTPS")
}

type rateWindow struct {
	Start  time.Time
	Count  int
	Window time.Duration
}

func clientIP(r *http.Request) string {
	host, _, _ := net.SplitHostPort(r.RemoteAddr)
	if ip := net.ParseIP(host); ip != nil && ip.IsLoopback() {
		if forwarded := net.ParseIP(r.Header.Get("X-Forwarded-For")); forwarded != nil {
			host = forwarded.String()
		}
	}
	return host
}
func (s *Server) allowRequest(r *http.Request) bool {
	return s.allowRate("request:"+clientIP(r), 120, time.Minute)
}
func (s *Server) allowRate(key string, limit int, window time.Duration) bool {
	s.rateMu.Lock()
	defer s.rateMu.Unlock()
	if s.rates == nil {
		s.rates = map[string]rateWindow{}
	}
	now := time.Now()
	if len(s.rates) >= 4096 {
		for key, v := range s.rates {
			if now.Sub(v.Start) > v.Window {
				delete(s.rates, key)
			}
		}
	}
	v, ok := s.rates[key]
	if !ok && len(s.rates) >= 4096 {
		return false
	}
	if !ok || now.Sub(v.Start) > window {
		v = rateWindow{Start: now, Window: window}
	}
	v.Count++
	s.rates[key] = v
	return v.Count <= limit
}
