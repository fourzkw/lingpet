package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"
)

func fixtureDesktopLoader(t *testing.T, release desktopRelease, err error) (func(context.Context) (desktopRelease, error), *int) {
	t.Helper()
	calls := 0
	return func(context.Context) (desktopRelease, error) {
		calls++
		return release, err
	}, &calls
}

func TestDesktopDownloadFollowsGitHubAsset(t *testing.T) {
	asset := "https://github.com/fourzkw/lingpet/releases/download/v0.7.34/LingPet-Setup-0.7.34.exe"
	s, ts, c := fixtureServer(t)
	s.desktopLoader, _ = fixtureDesktopLoader(t, desktopRelease{
		Version:  "0.7.34",
		FileName: "LingPet-Setup-0.7.34.exe",
		URL:      asset,
		Bytes:    211800576,
		SHA256:   strings.Repeat("a", 64),
		Notes:    "本次更新修复了若干问题。",
	}, nil)
	status, raw := call(t, c, ts.URL, "GET", "/api/downloads", nil)
	if status != 200 || !strings.Contains(string(raw), `"version":"0.7.34"`) || !strings.Contains(string(raw), `"notes":"本次更新修复了若干问题。"`) || !strings.Contains(string(raw), `"releaseURL":"`+desktopReleaseURL+`"`) {
		t.Fatalf("download manifest: %d %s", status, raw)
	}
	redirectClient := &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	for _, method := range []string{"GET", "HEAD"} {
		req, _ := http.NewRequest(method, ts.URL+"/downloads/desktop", nil)
		res, err := redirectClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		if res.StatusCode != 302 || res.Header.Get("Location") != asset {
			t.Fatalf("%s did not redirect to the release asset: %d %s", method, res.StatusCode, res.Header.Get("Location"))
		}
	}
}

func TestDesktopDownloadFallsBackToReleasePage(t *testing.T) {
	s, ts, c := fixtureServer(t)
	s.desktopLoader, _ = fixtureDesktopLoader(t, desktopRelease{}, errors.New("GitHub 暂不可用"))
	status, raw := call(t, c, ts.URL, "GET", "/api/downloads", nil)
	if status != 200 || strings.Contains(string(raw), `"desktop":{`) {
		t.Fatalf("unexpected manifest without release info: %s", raw)
	}
	redirectClient := &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	res, err := redirectClient.Get(ts.URL + "/downloads/desktop")
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != 302 || res.Header.Get("Location") != desktopReleaseURL {
		t.Fatalf("fallback redirect wrong: %d %s", res.StatusCode, res.Header.Get("Location"))
	}
}

func TestDesktopReleaseIsCached(t *testing.T) {
	s, ts, c := fixtureServer(t)
	loader, calls := fixtureDesktopLoader(t, desktopRelease{Version: "0.7.34", FileName: "LingPet-Setup-0.7.34.exe", URL: "https://github.com/fourzkw/lingpet/releases/download/v0.7.34/LingPet-Setup-0.7.34.exe", Bytes: 1, SHA256: strings.Repeat("b", 64)}, nil)
	s.desktopLoader = loader
	for i := 0; i < 3; i++ {
		if status, _ := call(t, c, ts.URL, "GET", "/api/downloads", nil); status != 200 {
			t.Fatal("download manifest unavailable")
		}
	}
	if *calls != 1 {
		t.Fatalf("expected a single GitHub lookup, got %d", *calls)
	}
}

func TestDesktopReleaseKeepsStaleDataWhenRefreshFails(t *testing.T) {
	s, _, _ := fixtureServer(t)
	release := desktopRelease{Version: "0.7.34", FileName: "LingPet-Setup-0.7.34.exe", URL: "https://github.com/fourzkw/lingpet/releases/download/v0.7.34/LingPet-Setup-0.7.34.exe", Bytes: 1, SHA256: strings.Repeat("c", 64)}
	s.desktop = release
	s.desktopAt = time.Now().Add(-time.Hour)
	s.desktopLoader = func(context.Context) (desktopRelease, error) { return desktopRelease{}, errors.New("offline") }
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	got, err := s.desktopRelease(ctx)
	if err != nil || got.Version != "0.7.34" {
		t.Fatalf("stale release lost: %v %v", got, err)
	}
}

// roundTripFunc lets the release parsing run without talking to GitHub.
type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func jsonResponse(body string) *http.Response {
	return &http.Response{StatusCode: 200, Status: "200 OK", Header: http.Header{"Content-Type": {"application/json"}}, Body: io.NopCloser(strings.NewReader(body))}
}

func TestLatestDesktopReleaseResolvesInstaller(t *testing.T) {
	asset := "https://github.com/fourzkw/lingpet/releases/download/v0.7.34/LingPet-Setup-0.7.34.exe"
	manifest := "https://github.com/fourzkw/lingpet/releases/download/v0.7.34/release.json"
	release := map[string]any{
		"tag_name":     "v0.7.34",
		"body":         "## 0.7.34\n\n- 公告中心\n- 直接下载",
		"draft":        false,
		"prerelease":   false,
		"published_at": "2026-10-31T07:00:00Z",
		"assets": []map[string]any{
			{"name": "LingPet-Setup-0.7.34.exe", "state": "uploaded", "size": 211800576, "browser_download_url": asset},
			{"name": "release.json", "state": "uploaded", "size": 260, "browser_download_url": manifest},
		},
	}
	info := map[string]any{"format": 1, "version": "0.7.34", "setup": "LingPet-Setup-0.7.34.exe", "sha256": strings.Repeat("d", 64), "bytes": 211800576, "codeSigned": false}
	remove := []string{desktopManifestName}
	payload, _ := json.Marshal(release)
	manifestBody, _ := json.Marshal(info)
	client := &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		switch {
		case r.URL.Hostname() == "api.github.com" && strings.HasPrefix(r.URL.Path, "/repos/fourzkw/lingpet/releases/latest"):
			return jsonResponse(string(payload)), nil
		case r.URL.Hostname() == "github.com" && strings.HasSuffix(r.URL.Path, "/"+remove[0]):
			return jsonResponse(string(manifestBody)), nil
		}
		return &http.Response{StatusCode: 404, Status: "404 Not Found", Header: http.Header{}, Body: io.NopCloser(strings.NewReader(""))}, nil
	})}
	g := &githubClient{client: client, routes: []string{"direct"}}
	got, err := g.latestDesktopRelease(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if got.Version != "0.7.34" || got.FileName != "LingPet-Setup-0.7.34.exe" || got.URL != asset || got.Bytes != 211800576 || got.SHA256 != strings.Repeat("d", 64) {
		t.Fatalf("resolved release: %+v", got)
	}
	if !strings.Contains(got.Notes, "直接下载") || got.PublishedAt != "2026-10-31T07:00:00Z" || got.ReleaseURL != desktopReleaseURL {
		t.Fatalf("release metadata: %+v", got)
	}
}

func TestLatestDesktopReleaseRejectsIncompleteRelease(t *testing.T) {
	release := `{"tag_name":"v0.7.34","assets":[{"name":"LingPet-Setup-0.7.34.exe","state":"uploaded","size":12,"browser_download_url":"https://github.com/fourzkw/lingpet/releases/download/v0.7.34/LingPet-Setup-0.7.34.exe"}]}`
	client := &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		return jsonResponse(release), nil
	})}
	g := &githubClient{client: client, routes: []string{"direct"}}
	if _, err := g.latestDesktopRelease(context.Background()); err == nil || !strings.Contains(err.Error(), "release.json") {
		t.Fatalf("missing manifest accepted: %v", err)
	}
}

func TestClipNotesLimitsLength(t *testing.T) {
	raw := strings.Repeat("更", 3000)
	if got := clipNotes(raw); len(got) > 4000 || !strings.HasPrefix(got, "更") {
		t.Fatalf("notes clipping: %d", len(got))
	}
	if got := clipNotes("  a\r\nb  "); got != "a\nb" {
		t.Fatalf("notes normalisation: %q", got)
	}
}
