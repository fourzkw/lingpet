package main

import (
	"encoding/json"
	"net/http"
	"net/http/cookiejar"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestBootstrapPasswordChangeAndUpgradePersistence(t *testing.T) {
	s, ts, c := fixtureServer(t)
	var old AdminCredential
	if e := s.store.consume("meta", adminCredentialKey, &old); e != nil {
		t.Fatal(e)
	}
	initial, e := s.store.initializeAdmin("admin", "")
	if e != nil {
		t.Fatal(e)
	}
	file, e := os.ReadFile(s.store.initialPasswordFile())
	if e != nil {
		t.Fatal(e)
	}
	password := strings.TrimSpace(string(file))
	if len(password) != 48 || !checkPassword(password, initial.PasswordHash) || !initial.MustChange {
		t.Fatal("bootstrap not private or not forced")
	}
	retry, e := s.store.initializeAdmin("changed-environment", testAdminHash)
	if e != nil || retry.Revision != initial.Revision || !retry.MustChange {
		t.Fatal("restart reset bootstrap")
	}
	status, b := call(t, c, ts.URL, "POST", "/auth/admin", map[string]string{"username": "admin", "password": password})
	if status != 200 {
		t.Fatalf("initial login %d %s", status, b)
	}
	status, _ = call(t, c, ts.URL, "GET", "/api/admin/versions", nil)
	if status != 403 {
		t.Fatal("bootstrap session could review")
	}
	status, _ = call(t, c, ts.URL, "POST", "/auth/username", map[string]string{"newUsername": "new-owner", "currentPassword": password})
	if status != 403 {
		t.Fatal("username change bypassed mandatory password setup")
	}
	status, b = call(t, c, ts.URL, "GET", "/api/me", nil)
	var me struct{ MustChangePassword bool }
	json.Unmarshal(b, &me)
	if status != 200 || !me.MustChangePassword {
		t.Fatal("force-change flag missing")
	}
	otherJar, _ := cookiejar.New(nil)
	other := &http.Client{Jar: otherJar}
	call(t, other, ts.URL, "POST", "/auth/admin", map[string]string{"username": "admin", "password": password})
	newPassword := "a-new-persistent-password-123"
	change := map[string]string{"currentPassword": "wrong-password-value", "newPassword": newPassword, "confirmPassword": newPassword}
	status, _ = call(t, c, ts.URL, "POST", "/auth/password", change)
	if status != 401 {
		t.Fatal("wrong current password accepted")
	}
	change["currentPassword"] = password
	change["confirmPassword"] = "different-password"
	status, _ = call(t, c, ts.URL, "POST", "/auth/password", change)
	if status != 400 {
		t.Fatal("mismatched confirmation accepted")
	}
	change["confirmPassword"] = newPassword
	status, b = call(t, c, ts.URL, "POST", "/auth/password", change)
	if status != 200 {
		t.Fatalf("change %d %s", status, b)
	}
	status, _ = call(t, c, ts.URL, "GET", "/api/admin/versions", nil)
	if status != 200 {
		t.Fatal("new session cannot review")
	}
	status, _ = call(t, other, ts.URL, "GET", "/api/admin/versions", nil)
	if status != 403 {
		t.Fatal("other old session survived")
	}
	if _, e = os.Stat(s.store.initialPasswordFile()); !os.IsNotExist(e) {
		t.Fatal("bootstrap plaintext not removed")
	}
	dir := filepath.Dir(s.store.db.Path())
	if e = s.store.db.Close(); e != nil {
		t.Fatal(e)
	}
	replacement, e := openStore(dir)
	if e != nil {
		t.Fatal(e)
	}
	defer replacement.db.Close()
	s.store = replacement
	// Upgrade with changed or obsolete environment values must keep the saved login.
	saved, e := replacement.initializeAdmin("new-config-user", "obsolete-invalid-env-hash")
	if e != nil || saved.MustChange || saved.Username != "admin" || !checkPassword(newPassword, saved.PasswordHash) {
		t.Fatal("upgrade reset saved credentials")
	}
	status, _ = call(t, c, ts.URL, "POST", "/auth/admin", map[string]string{"username": "admin", "password": password})
	if status != 401 {
		t.Fatal("initial password still works")
	}
	status, _ = call(t, c, ts.URL, "POST", "/auth/admin", map[string]string{"username": "admin", "password": newPassword})
	if status != 200 {
		t.Fatal("saved password lost after restart")
	}
	status, _ = call(t, http.DefaultClient, ts.URL, "POST", "/auth/password", change)
	if status != 401 {
		t.Fatal("anonymous password change allowed")
	}
}

func TestAdminUsernameAuthorizationAndPersistence(t *testing.T) {
	s, ts, c := fixtureServer(t)
	body := map[string]string{"newUsername": "market-owner", "currentPassword": "test-admin-password-123456789"}
	status, _ := call(t, http.DefaultClient, ts.URL, "POST", "/auth/username", body)
	if status != 403 {
		t.Fatal("anonymous rename allowed")
	}
	loginAs(t, c, ts.URL, "admin")
	otherJar, _ := cookiejar.New(nil)
	other := &http.Client{Jar: otherJar}
	loginAs(t, other, ts.URL, "admin")
	original, _ := s.store.adminCredential()
	body["currentPassword"] = "incorrect-password-123"
	status, _ = call(t, c, ts.URL, "POST", "/auth/username", body)
	if status != 401 {
		t.Fatal("wrong password renamed administrator")
	}
	body["currentPassword"] = "test-admin-password-123456789"
	for _, name := range []string{"", "bad name", "admin"} {
		body["newUsername"] = name
		status, _ = call(t, c, ts.URL, "POST", "/auth/username", body)
		if status != 400 {
			t.Fatal("invalid username accepted", name, status)
		}
	}
	body["newUsername"] = "market-owner"
	status, b := call(t, c, ts.URL, "POST", "/auth/username", body)
	if status != 200 {
		t.Fatalf("rename %d %s", status, b)
	}
	updated, _ := s.store.adminCredential()
	if updated.Username != "market-owner" || updated.PasswordHash != original.PasswordHash || updated.Revision == original.Revision {
		t.Fatal("credentials not updated correctly")
	}
	status, _ = call(t, c, ts.URL, "GET", "/api/admin/versions", nil)
	if status != 200 {
		t.Fatal("current session not refreshed")
	}
	status, _ = call(t, other, ts.URL, "GET", "/api/admin/versions", nil)
	if status != 403 {
		t.Fatal("other old session survived rename")
	}
	status, _ = call(t, c, ts.URL, "POST", "/auth/admin", map[string]string{"username": "admin", "password": body["currentPassword"]})
	if status != 401 {
		t.Fatal("old username still accepted")
	}
	dir := filepath.Dir(s.store.db.Path())
	if e := s.store.db.Close(); e != nil {
		t.Fatal(e)
	}
	replacement, e := openStore(dir)
	if e != nil {
		t.Fatal(e)
	}
	defer replacement.db.Close()
	s.store = replacement
	saved, e := replacement.initializeAdmin("obsolete-user", "obsolete-hash")
	if e != nil || saved.Username != "market-owner" || saved.PasswordHash != original.PasswordHash {
		t.Fatal("upgrade overwrote renamed account")
	}
	status, _ = call(t, c, ts.URL, "POST", "/auth/admin", map[string]string{"username": "market-owner", "password": body["currentPassword"]})
	if status != 200 {
		t.Fatal("renamed login lost after restart")
	}
}

func TestAdminUsernameValidation(t *testing.T) {
	for _, name := range []string{"", " ", "has space", "bad\nname", "bad\tname", "\x00control", strings.Repeat("a", 65)} {
		if validAdminUsername(name) {
			t.Fatal("unsafe username accepted", name)
		}
	}
	for _, name := range []string{"admin", "market-owner", "灵伴管理员", "owner_2026"} {
		if !validAdminUsername(name) {
			t.Fatal("valid username rejected", name)
		}
	}
}
