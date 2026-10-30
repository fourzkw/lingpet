package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// Old installer helpers remain tested for data preservation. Production routes
// no longer expose these upload or file-serving handlers.
func fixtureLegacyDownloadServer(t *testing.T) (*Server, *httptest.Server, *http.Client) {
	s, ts, c := fixtureServer(t)
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/downloads", s.listLegacyDownloads)
	mux.HandleFunc("GET /downloads/{id}", s.serveLegacyDownload)
	mux.HandleFunc("GET /api/admin/releases", s.adminReleases)
	mux.HandleFunc("POST /api/admin/releases/upload", s.uploadRelease)
	mux.HandleFunc("POST /api/admin/releases/{id}/{action}", s.manageRelease)
	mux.Handle("/", s.routes())
	ts.Config.Handler = mux
	return s, ts, c
}

func TestDesktopReleaseDownloadAndRetiredInstallers(t *testing.T) {
	_, ts, c := fixtureServer(t)
	status, raw := call(t, c, ts.URL, "GET", "/api/downloads", nil)
	if status != 200 || !strings.Contains(string(raw), desktopReleaseURL) || !strings.Contains(string(raw), `"id":"desktop"`) || strings.Contains(string(raw), `"id":"dsh"`) {
		t.Fatalf("desktop manifest: %d %s", status, raw)
	}
	redirectClient := &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	for _, method := range []string{"GET", "HEAD"} {
		req, _ := http.NewRequest(method, ts.URL+"/downloads/desktop", nil)
		res, err := redirectClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		if res.StatusCode != 302 || res.Header.Get("Location") != desktopReleaseURL {
			t.Fatal("wrong release destination")
		}
	}
	for _, host := range []string{"dsh", "cursor", "codex"} {
		status, _ := call(t, c, ts.URL, "GET", "/downloads/"+host, nil)
		if status != 410 {
			t.Fatal("old download still enabled", host, status)
		}
	}
	status, _ = call(t, c, ts.URL, "GET", "/api/admin/releases", nil)
	if status != 403 {
		t.Fatal("retired API missing auth")
	}
	loginAs(t, c, ts.URL, "admin")
	for _, endpoint := range []struct{ method, path string }{{"GET", "/api/admin/releases"}, {"POST", "/api/admin/releases/upload"}, {"POST", "/api/admin/releases/old/publish"}} {
		status, _ := call(t, c, ts.URL, endpoint.method, endpoint.path, map[string]string{})
		if status != 410 {
			t.Fatal("old installer management still enabled", endpoint.path, status)
		}
	}
	status, raw = call(t, c, ts.URL, "GET", "/api/admin/stats", nil)
	if status != 200 || !strings.Contains(string(raw), `"download.desktop":{"Count":1,"Bytes":0}`) {
		t.Fatalf("redirect metrics wrong: %s", raw)
	}
	for _, route := range []string{"/", "/admin"} {
		status, raw = call(t, c, ts.URL, "GET", route, nil)
		if status != 200 || strings.Contains(string(raw), "packageUploadForm") || strings.Contains(string(raw), "从 VSIX 安装") || strings.Contains(string(raw), "Node.js ≥22.19") {
			t.Fatal("obsolete installation UI", route)
		}
	}
}
