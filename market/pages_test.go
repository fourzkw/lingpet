package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPublicPagesAndPrivateAdminEntry(t *testing.T) {
	_, ts, c := fixtureServer(t)
	for _, route := range []string{"/", "/market"} {
		status, b := call(t, c, ts.URL, "GET", route, nil)
		if status != 200 || strings.Contains(string(b), "adminLogin") || strings.Contains(string(b), `href="/admin"`) {
			t.Fatal("public page includes login entry", route, status)
		}
	}
	status, b := call(t, c, ts.URL, "GET", "/admin", nil)
	if status != 200 || !strings.Contains(string(b), "adminLoginForm") {
		t.Fatal("admin route missing")
	}
	client := &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	res, e := client.Get(ts.URL + "/?version=" + strings.Repeat("a", 48))
	if e != nil {
		t.Fatal(e)
	}
	res.Body.Close()
	if res.StatusCode != 302 || !strings.HasPrefix(res.Header.Get("Location"), "/market?version=") {
		t.Fatal("old desktop detail links broken")
	}
}
func TestPluginDownloadsAndRange(t *testing.T) {
	s, ts, c := fixtureLegacyDownloadServer(t)
	s.cfg.DownloadDir = t.TempDir()
	data := []byte("fixture-plugin-package")
	file := "lingpet-1.0.0.tgz"
	os.WriteFile(filepath.Join(s.cfg.DownloadDir, file), data, 0600)
	hash := sha256.Sum256(data)
	manifest := DownloadManifest{Downloads: []Download{{ID: "dsh", Name: "DSH", Version: "1.0.0", File: file, Size: int64(len(data)), SHA256: hex.EncodeToString(hash[:])}}}
	save := func() {
		b, _ := json.Marshal(manifest)
		if e := os.WriteFile(filepath.Join(s.cfg.DownloadDir, "manifest.json"), b, 0600); e != nil {
			t.Fatal(e)
		}
	}
	save()
	status, b := call(t, c, ts.URL, "GET", "/api/downloads", nil)
	if status != 200 || !strings.Contains(string(b), `"available":true`) {
		t.Fatal("download availability missing", status, string(b))
	}
	req, _ := http.NewRequest("GET", ts.URL+"/downloads/dsh", nil)
	req.Header.Set("Range", "bytes=0-6")
	res, e := c.Do(req)
	if e != nil {
		t.Fatal(e)
	}
	res.Body.Close()
	if res.StatusCode != 206 || !strings.Contains(res.Header.Get("Content-Disposition"), file) {
		t.Fatal("ranged plugin download failed")
	}
	manifest.Downloads[0].File = "../secrets.tgz"
	save()
	status, _ = call(t, c, ts.URL, "GET", "/downloads/dsh", nil)
	if status != 404 {
		t.Fatal("unsafe file path accepted")
	}
	manifest.Downloads[0].File = file
	manifest.Downloads[0].Size++
	save()
	status, b = call(t, c, ts.URL, "GET", "/api/downloads", nil)
	if status != 200 || strings.Contains(string(b), `"available":true`) {
		t.Fatal("mismatched file advertised")
	}
}
func TestConfiguredPublicOriginDoesNotRejectActualSite(t *testing.T) {
	s, ts, c := fixtureServer(t)
	s.cfg.PublicURL = "https://old-config.example"
	status, _ := call(t, c, ts.URL, "POST", "/auth/admin", map[string]string{"username": "admin", "password": "test-admin-password-123456789"})
	if status != 200 {
		t.Fatal("actual HTTP origin rejected")
	}
	status, _ = call(t, c, ts.URL, "GET", "/api/admin/versions", nil)
	if status != 200 {
		t.Fatal("HTTP session cookie did not work")
	}
	request := httptest.NewRequest("POST", "http://example.test/auth/logout", bytes.NewBufferString("{}"))
	request.RemoteAddr = "198.51.100.9:1234"
	request.Header.Set("X-Forwarded-Proto", "https")
	if requestSecure(request) {
		t.Fatal("untrusted proxy changed cookie transport")
	}
	request.RemoteAddr = "127.0.0.1:1234"
	if !requestSecure(request) {
		t.Fatal("trusted HTTPS proxy not recognized")
	}
}
