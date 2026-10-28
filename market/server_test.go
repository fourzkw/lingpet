package main

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"image"
	"image/color"
	"image/png"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

func fixturePack(t *testing.T, extra string) []byte {
	t.Helper()
	im := image.NewNRGBA(image.Rect(0, 0, 32, 16))
	for y := 2; y < 14; y++ {
		for x := 2; x < 30; x++ {
			im.Set(x, y, color.NRGBA{160, 100, 230, 255})
		}
	}
	var pb bytes.Buffer
	if e := png.Encode(&pb, im); e != nil {
		t.Fatal(e)
	}
	p := Pet{1, "test-pet", "测试桌宠", "1.0.0", "alice", "CC0", "测试作品", "0.4.0"}
	m := Manifest{SchemaVersion: 1, TileSize: 16, Columns: 2, Variants: []string{"pixel", "original"}, Original: &Original{TileSize: 16, Directory: "original/"}, Clips: map[string]Clip{}}
	files := map[string][]byte{"cover.png": pb.Bytes()}
	for _, s := range states {
		m.Clips[s] = Clip{"sprites/" + s + ".png", 2, []int{0, 1}, []int{80, 90}, s != "done" && s != "error", 0}
		files["sprites/"+s+".png"] = pb.Bytes()
		files["original/sprites/"+s+".png"] = pb.Bytes()
	}
	files["pet.json"], _ = json.Marshal(p)
	files["manifest.json"], _ = json.Marshal(m)
	if extra != "" {
		files[extra] = []byte("untrusted")
	}
	var out bytes.Buffer
	z := zip.NewWriter(&out)
	for name, b := range files {
		w, e := z.Create(name)
		if e != nil {
			t.Fatal(e)
		}
		w.Write(b)
	}
	if e := z.Close(); e != nil {
		t.Fatal(e)
	}
	return out.Bytes()
}

type fakeGitHub struct{ bytes []byte }

func (f *fakeGitHub) Resolve(_ context.Context, repo, tag, name string) (Asset, error) {
	return Asset{RepoID: 42, ReleaseID: 10, AssetID: 20, Owner: "alice", Repo: "pet", Tag: tag, Name: name, URL: "https://github.com/alice/pet/releases/download/" + tag + "/" + name, Size: int64(len(f.bytes))}, nil
}
func (f *fakeGitHub) Presentation(_ context.Context, _, _ string) (Pet, []byte, error) {
	z, e := zip.NewReader(bytes.NewReader(f.bytes), int64(len(f.bytes)))
	if e != nil {
		return Pet{}, nil, e
	}
	var p Pet
	var cover []byte
	for _, v := range z.File {
		if v.Name != "pet.json" && v.Name != "cover.png" {
			continue
		}
		r, e := v.Open()
		if e != nil {
			return p, nil, e
		}
		b, e := io.ReadAll(r)
		r.Close()
		if e != nil {
			return p, nil, e
		}
		if v.Name == "pet.json" {
			json.Unmarshal(b, &p)
		} else {
			cover = b
		}
	}
	return p, cover, nil
}

var testAdminHash, _ = hashPassword("test-admin-password-123456789")

func fixtureServer(t *testing.T) (*Server, *httptest.Server, *http.Client) {
	t.Helper()
	store, e := openStore(t.TempDir())
	if e != nil {
		t.Fatal(e)
	}
	s := &Server{cfg: Config{DataDir: t.TempDir(), PublicURL: "http://127.0.0.1", Dev: true, AdminUser: "admin", AdminPasswordHash: testAdminHash}, store: store, github: &fakeGitHub{fixturePack(t, "")}, client: http.DefaultClient}
	if _, e := store.initializeAdmin(s.cfg.AdminUser, s.cfg.AdminPasswordHash); e != nil {
		t.Fatal(e)
	}
	ts := httptest.NewServer(s.routes())
	s.cfg.PublicURL = ts.URL
	jar, _ := cookiejar.New(nil)
	c := &http.Client{Jar: jar}
	t.Cleanup(func() { ts.Close(); store.db.Close() })
	return s, ts, c
}
func call(t *testing.T, c *http.Client, base, method, route string, body any) (int, []byte) {
	t.Helper()
	var input io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		input = bytes.NewReader(b)
	}
	r, e := http.NewRequest(method, base+route, input)
	if e != nil {
		t.Fatal(e)
	}
	if body != nil {
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("Origin", base)
	}
	res, e := c.Do(r)
	if e != nil {
		t.Fatal(e)
	}
	defer res.Body.Close()
	b, e := io.ReadAll(res.Body)
	if e != nil {
		t.Fatal(e)
	}
	return res.StatusCode, b
}
func loginAs(t *testing.T, c *http.Client, base, login string) {
	t.Helper()
	status, b := call(t, c, base, "POST", "/auth/admin", map[string]string{"username": login, "password": "test-admin-password-123456789"})
	if status != 200 {
		t.Fatalf("login %d %s", status, b)
	}
}
func TestReviewAndInstallLifecycle(t *testing.T) {
	s, ts, c := fixtureServer(t)
	status, b := call(t, c, ts.URL, "POST", "/api/submissions", map[string]string{"repository": "https://github.com/alice/pet.git", "tag": "v1.0.0", "assetName": "test.petpack"})
	if status != 202 {
		t.Fatalf("submit %d %s", status, b)
	}
	var receipt struct {
		ID     string
		Token  string
		Record Record
	}
	json.Unmarshal(b, &receipt)
	record := receipt.Record
	s.validate(context.Background(), record)
	s.store.get("records", record.ID, &record)
	if record.Status != "pending" || record.SHA256 != "" || record.Preview != nil {
		t.Fatalf("validation: %+v", record)
	}
	status, _ = call(t, http.DefaultClient, ts.URL, "GET", "/api/versions/"+record.ID+"/install", nil)
	if status != 404 {
		t.Fatal("pending install was visible")
	}
	status, _ = call(t, c, ts.URL, "POST", "/api/admin/versions/"+record.ID+"/approve", map[string]string{"reason": ""})
	if status != 403 {
		t.Fatal("author approved own work")
	}
	status, _ = call(t, http.DefaultClient, ts.URL, "GET", "/api/versions/"+record.ID+"/preview/cover.png", nil)
	if status != 404 {
		t.Fatal("pending preview visible")
	}
	loginAs(t, c, ts.URL, "admin")
	status, b = call(t, c, ts.URL, "POST", "/api/admin/versions/"+record.ID+"/approve", map[string]string{"reason": "通过"})
	if status != 200 {
		t.Fatalf("approve %d %s", status, b)
	}
	status, b = call(t, http.DefaultClient, ts.URL, "GET", "/api/versions/"+record.ID+"/install", nil)
	if status != 200 {
		t.Fatal(string(b))
	}
	var install map[string]any
	json.Unmarshal(b, &install)
	if install["sha256"] != record.SHA256 {
		t.Fatal("hash mismatch")
	}
	status, _ = call(t, http.DefaultClient, ts.URL, "GET", "/api/versions/"+record.ID+"/preview/cover.png", nil)
	if status != 200 {
		t.Fatal("approved preview missing")
	}
	entries, _ := os.ReadDir(filepath.Join(s.cfg.DataDir, "tmp"))
	if len(entries) != 0 {
		t.Fatal("review package was retained")
	}
	status, _ = call(t, c, ts.URL, "POST", "/api/admin/versions/"+record.ID+"/unpublish", map[string]string{"reason": ""})
	if status != 409 {
		t.Fatal("unpublish reason required")
	}
	status, _ = call(t, c, ts.URL, "POST", "/api/admin/versions/"+record.ID+"/unpublish", map[string]string{"reason": "作品撤回"})
	if status != 200 {
		t.Fatal(status)
	}
	status, _ = call(t, http.DefaultClient, ts.URL, "GET", "/api/versions/"+record.ID+"/install", nil)
	if status != 404 {
		t.Fatal("unpublished version installable")
	}
}
func TestArchiveValidation(t *testing.T) {
	for _, extra := range []string{"../escape", "manifest.js", "original/../../outside", "sprites/unknown.png"} {
		t.Run(extra, func(t *testing.T) {
			file := filepath.Join(t.TempDir(), "bad.petpack")
			os.WriteFile(file, fixturePack(t, extra), 0600)
			if _, e := parsePack(file); e == nil {
				t.Fatal("unsafe archive accepted")
			}
		})
	}
	file := filepath.Join(t.TempDir(), "ok.petpack")
	os.WriteFile(file, fixturePack(t, ""), 0600)
	p, e := parsePack(file)
	if e != nil {
		t.Fatal(e)
	}
	if p.Pet.ID != "test-pet" {
		t.Fatal("bad metadata")
	}
	p.Manifest.Clips["sleep"] = Clip{}
	if validateManifest(p.Manifest) == nil {
		t.Fatal("incomplete animation accepted")
	}
}
func TestSessionOriginAndOwner(t *testing.T) {
	s, ts, c := fixtureServer(t)
	status, _ := call(t, c, ts.URL, "POST", "/api/submissions", map[string]string{"repository": "bob/pet", "tag": "v1", "assetName": "test.petpack"})
	if status != 202 {
		t.Fatal("anonymous repository recommendation rejected")
	}
	loginAs(t, c, ts.URL, "admin")
	r, _ := http.NewRequest("POST", ts.URL+"/auth/logout", bytes.NewBufferString("{}"))
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("Origin", "https://evil.example")
	r.Header.Set("Sec-Fetch-Site", "cross-site")
	res, e := c.Do(r)
	if e != nil {
		t.Fatal(e)
	}
	res.Body.Close()
	if res.StatusCode != 400 {
		t.Fatal("cross-origin write allowed")
	}
	status, _ = call(t, c, ts.URL, "POST", "/auth/logout", map[string]string{})
	if status != 200 {
		t.Fatal(status)
	}
	status, _ = call(t, c, ts.URL, "GET", "/api/admin/versions", nil)
	if status != 403 {
		t.Fatal("logout session retained")
	}
	if s.admin("alice") {
		t.Fatal("author is administrator")
	}
}
func TestURLPoliciesAndPersistence(t *testing.T) {
	for _, u := range []string{"https://github.com.evil.example/x", "http://github.com/a/b", "https://user@github.com/a/b", "https://127.0.0.1/"} {
		if githubURL(u) {
			t.Fatal("unsafe URL", u)
		}
	}
	for _, repo := range []string{"http://127.0.0.1/a", "owner/../b", "https://github.com/a/b?x=1"} {
		if _, e := parseRepository(repo); e == nil {
			t.Fatal("unsafe repo", repo)
		}
	}
	dir := t.TempDir()
	s, e := openStore(dir)
	if e != nil {
		t.Fatal(e)
	}
	r := Record{ID: "test", Status: "pending", Created: time.Now()}
	if e = s.put("records", r.ID, r); e != nil {
		t.Fatal(e)
	}
	s.db.Close()
	s, e = openStore(dir)
	if e != nil {
		t.Fatal(e)
	}
	defer s.db.Close()
	var saved Record
	if s.get("records", r.ID, &saved) != nil || saved.Status != "pending" {
		t.Fatal("state lost after restart")
	}
}

func TestCrossLanguageInstall(t *testing.T) {
	node, e := exec.LookPath("node")
	if e != nil {
		t.Skip("Node not installed; desktop integration requires Node")
	}
	s, ts, _ := fixtureServer(t)
	r := Record{ID: newID(), Repository: "alice/pet", Tag: "v1.0.0", AssetName: "test.petpack", Submitter: "alice", Status: "queued", Reviews: []Review{}, Created: time.Now()}
	if e = s.store.put("records", r.ID, r); e != nil {
		t.Fatal(e)
	}
	s.validate(context.Background(), r)
	if e = s.store.review(r.ID, "admin", "approve", ""); e != nil {
		t.Fatal(e)
	}
	root := t.TempDir()
	file := filepath.Join(root, "fixture.petpack")
	os.WriteFile(file, s.github.(*fakeGitHub).bytes, 0600)
	command := exec.Command(node, "../scripts/market-e2e.mjs", ts.URL, r.ID, file, filepath.Join(root, "desktop-data"))
	out, e := command.CombinedOutput()
	if e != nil {
		t.Fatalf("desktop integration: %v\n%s", e, out)
	}
	t.Log(string(out))
}

func TestBrowserAndDesktopUI(t *testing.T) {
	electron := os.Getenv("LINGPET_TEST_ELECTRON")
	if electron == "" {
		t.Skip("set LINGPET_TEST_ELECTRON for optional GUI integration")
	}
	s, ts, _ := fixtureServer(t)
	r := Record{ID: newID(), Repository: "alice/pet", Tag: "v1.0.0", AssetName: "test.petpack", Submitter: "alice", Status: "queued", Reviews: []Review{}, Created: time.Now()}
	s.store.put("records", r.ID, r)
	s.validate(context.Background(), r)
	if e := s.store.review(r.ID, "admin", "approve", ""); e != nil {
		t.Fatal(e)
	}
	root := t.TempDir()
	file := filepath.Join(root, "fixture.petpack")
	os.WriteFile(file, s.github.(*fakeGitHub).bytes, 0600)
	script, e := filepath.Abs("../scripts/market-ui-smoke.cjs")
	if e != nil {
		t.Fatal(e)
	}
	command := exec.Command(electron, script, ts.URL, r.ID, file, root)
	if runtime.GOOS == "windows" {
		quote := func(s string) string { return "'" + strings.ReplaceAll(s, "'", "''") + "'" }
		args := []string{script}
		parts := []string{}
		for _, v := range args {
			parts = append(parts, quote("\""+v+"\""))
		}
		ps := "$p=Start-Process -FilePath " + quote(electron) + " -ArgumentList @(" + strings.Join(parts, ",") + ") -WindowStyle Hidden -PassThru -Wait; exit $p.ExitCode"
		command = exec.Command("powershell.exe", "-NoProfile", "-WindowStyle", "Hidden", "-Command", ps)
	}
	for _, v := range os.Environ() {
		if !strings.HasPrefix(v, "ELECTRON_RUN_AS_NODE=") && !strings.HasPrefix(v, "NODE_OPTIONS=") {
			command.Env = append(command.Env, v)
		}
	}
	var previous AdminCredential
	if e := s.store.consume("meta", adminCredentialKey, &previous); e != nil {
		t.Fatal(e)
	}
	if _, e := s.store.initializeAdmin("admin", ""); e != nil {
		t.Fatal(e)
	}
	initialBytes, e := os.ReadFile(s.store.initialPasswordFile())
	if e != nil {
		t.Fatal(e)
	}
	fixture, _ := json.Marshal([]string{ts.URL, r.ID, file, root, strings.TrimSpace(string(initialBytes)), base64.StdEncoding.EncodeToString(fixtureInstaller(t, "dsh", "7.8.9", nil))})
	command.Env = append(command.Env, "LINGPET_UI_FIXTURE="+string(fixture))
	command.Dir = filepath.Dir(filepath.Dir(script))
	out, e := command.CombinedOutput()
	if e != nil {
		t.Fatalf("GUI integration %v\n%s", e, out)
	}
	t.Log(string(out))
}
