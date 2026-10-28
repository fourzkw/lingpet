package main

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"
)

func TestAnonymousReceiptPrivacyAndQuota(t *testing.T) {
	s, ts, c := fixtureServer(t)
	var receipt struct {
		ID     string
		Token  string
		Record Record
	}
	status, b := call(t, c, ts.URL, "POST", "/api/submissions", map[string]string{"repository": "an-organization/pet", "tag": "v1", "assetName": "test.petpack"})
	if status != 202 {
		t.Fatalf("anonymous submission %d %s", status, b)
	}
	json.Unmarshal(b, &receipt)
	if len(receipt.Token) != 48 || receipt.ID != receipt.Record.ID {
		t.Fatal("missing receipt")
	}
	var secret SubmissionSecret
	if s.store.get("submission-secrets", receipt.ID, &secret) != nil || secret.TokenHash != sessionKey(receipt.Token) {
		t.Fatal("receipt not persisted")
	}
	if strings.Contains(secret.TokenHash, receipt.Token) {
		t.Fatal("plaintext secret stored")
	}
	status, _ = call(t, c, ts.URL, "POST", "/api/submissions/lookup", map[string]string{"id": receipt.ID, "token": strings.Repeat("0", 48)})
	if status != 404 {
		t.Fatal("invalid receipt accepted")
	}
	status, b = call(t, c, ts.URL, "POST", "/api/submissions/lookup", map[string]string{"id": receipt.ID, "token": receipt.Token})
	if status != 200 || strings.Contains(string(b), receipt.Token) || strings.Contains(string(b), secret.IPHash) {
		t.Fatal("lookup failed or leaked private data")
	}
	status, _ = call(t, http.DefaultClient, ts.URL, "GET", "/api/versions/"+receipt.ID, nil)
	if status != 404 {
		t.Fatal("pending data public")
	}
	status, _ = call(t, c, ts.URL, "POST", "/api/admin/versions/"+receipt.ID+"/approve", map[string]string{"reason": ""})
	if status != 403 {
		t.Fatal("anonymous approval allowed")
	}
	for i := 0; i < 4; i++ {
		status, b = call(t, c, ts.URL, "POST", "/api/submissions", map[string]string{"repository": "alice/pet", "tag": string(rune('a' + i)), "assetName": "test.petpack"})
		if status != 202 {
			t.Fatalf("quota filled early: %d %s", status, b)
		}
	}
	status, _ = call(t, c, ts.URL, "POST", "/api/submissions", map[string]string{"repository": "alice/pet", "tag": "overflow", "assetName": "test.petpack"})
	if status != 429 {
		t.Fatal("pending quota ignored")
	}
	loginAs(t, c, ts.URL, "admin")
	status, b = call(t, c, ts.URL, "GET", "/api/admin/versions", nil)
	if status != 200 || strings.Contains(string(b), receipt.Token) || strings.Contains(string(b), "TokenHash") {
		t.Fatal("admin listing leaked receipt")
	}
}
func TestLocalAdminAuthenticationAndRevocation(t *testing.T) {
	s, ts, c := fixtureServer(t)
	for _, route := range []string{"/auth/github", "/auth/github/callback", "/auth/dev"} {
		status, _ := call(t, c, ts.URL, "GET", route, nil)
		if status != 404 {
			t.Fatal("obsolete login available")
		}
	}
	status, _ := call(t, c, ts.URL, "POST", "/auth/admin", map[string]string{"username": "admin", "password": "wrong-password-value"})
	if status != 401 {
		t.Fatal("wrong password accepted")
	}
	loginAs(t, c, ts.URL, "admin")
	status, _ = call(t, c, ts.URL, "GET", "/api/admin/versions", nil)
	if status != 200 {
		t.Fatal("admin denied")
	}
	credential, _ := s.store.adminCredential()
	newHash, _ := hashPassword("new-admin-password-123456789")
	if _, e := s.store.changeAdminPassword(credential.Revision, newHash); e != nil {
		t.Fatal(e)
	}
	status, _ = call(t, c, ts.URL, "GET", "/api/admin/versions", nil)
	if status != 403 {
		t.Fatal("password rotation did not revoke session")
	}
	raw := newID()
	s.store.put("sessions", sessionKey(raw), Session{Login: "admin", Expires: time.Now().Add(time.Hour)})
	req, _ := http.NewRequest("GET", ts.URL+"/api/admin/versions", nil)
	req.AddCookie(&http.Cookie{Name: "lingpet_session", Value: raw})
	res, e := http.DefaultClient.Do(req)
	if e != nil {
		t.Fatal(e)
	}
	res.Body.Close()
	if res.StatusCode != 403 {
		t.Fatal("legacy session accepted")
	}
	for i := 0; i < 3; i++ {
		call(t, c, ts.URL, "POST", "/auth/admin", map[string]string{"username": "admin", "password": "wrong-password-value"})
	}
	status, _ = call(t, c, ts.URL, "POST", "/auth/admin", map[string]string{"username": "admin", "password": "new-admin-password-123456789"})
	if status != 429 {
		t.Fatal("login brute-force bound ignored")
	}
}
