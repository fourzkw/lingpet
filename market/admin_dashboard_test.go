package main

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func fixtureInstaller(t *testing.T, host, version string, extra map[string]string) []byte {
	t.Helper()
	files := map[string]string{}
	meta, _ := json.Marshal(map[string]string{"name": "board-pet", "version": version})
	switch host {
	case "dsh":
		meta, _ = json.Marshal(map[string]string{"name": "lingpet", "version": version})
		files["package/package.json"] = string(meta)
		files["package/src/plugin.js"] = "fixture"
		files["package/desktop/main.js"] = "fixture"
	case "cursor":
		files["extension/package.json"] = string(meta)
		files["extension.vsixmanifest"] = "<PackageManifest/>"
		files["extension/extension.cjs"] = "fixture"
		files["extension/cursor-plugin/runtime/desktop/main.js"] = "fixture"
	case "codex":
		files["plugins/board-pet/plugin.json"] = string(meta)
		files[".agents/plugins/marketplace.json"] = "{}"
		files["plugins/board-pet/.mcp.json"] = "{}"
		files["plugins/board-pet/runtime/desktop/main.js"] = "fixture"
	}
	for name, data := range extra {
		files[name] = data
	}
	var output bytes.Buffer
	if host == "dsh" {
		gz := gzip.NewWriter(&output)
		writer := tar.NewWriter(gz)
		for name, data := range files {
			if e := writer.WriteHeader(&tar.Header{Name: name, Size: int64(len(data)), Mode: 0600}); e != nil {
				t.Fatal(e)
			}
			writer.Write([]byte(data))
		}
		writer.Close()
		gz.Close()
	} else {
		writer := zip.NewWriter(&output)
		for name, data := range files {
			f, e := writer.Create(name)
			if e != nil {
				t.Fatal(e)
			}
			f.Write([]byte(data))
		}
		writer.Close()
	}
	return output.Bytes()
}
func uploadFixture(t *testing.T, c *http.Client, base, host, version string, data []byte) (int, []byte) {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	writer.WriteField("host", host)
	writer.WriteField("version", version)
	writer.WriteField("notes", "release test")
	f, e := writer.CreateFormFile("package", "lingpet-test"+installerExtension(host))
	if e != nil {
		t.Fatal(e)
	}
	f.Write(data)
	writer.Close()
	req, e := http.NewRequest("POST", base+"/api/admin/releases/upload", &body)
	if e != nil {
		t.Fatal(e)
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("Origin", base)
	res, e := c.Do(req)
	if e != nil {
		t.Fatal(e)
	}
	defer res.Body.Close()
	result, _ := io.ReadAll(res.Body)
	return res.StatusCode, result
}
func TestAdminReleaseLifecycleAndStatistics(t *testing.T) {
	s, ts, c := fixtureLegacyDownloadServer(t)
	for _, route := range []string{"/api/admin/stats", "/api/admin/stats.csv", "/api/admin/releases", "/api/admin/audit"} {
		status, _ := call(t, c, ts.URL, "GET", route, nil)
		if status != 403 {
			t.Fatal("private admin endpoint exposed", route)
		}
	}
	data := fixtureInstaller(t, "dsh", "1.0.0", nil)
	status, _ := uploadFixture(t, c, ts.URL, "dsh", "1.0.0", data)
	if status != 403 {
		t.Fatal("anonymous upload accepted")
	}
	loginAs(t, c, ts.URL, "admin")
	status, b := uploadFixture(t, c, ts.URL, "dsh", "1.0.0", data)
	if status != 201 {
		t.Fatalf("upload %d %s", status, b)
	}
	var first Release
	json.Unmarshal(b, &first)
	hash := sha256.Sum256(data)
	if first.SHA256 != hex.EncodeToString(hash[:]) || first.Published || !first.Available {
		t.Fatal("upload not stored as valid draft")
	}
	status, b = call(t, c, ts.URL, "GET", "/api/downloads", nil)
	if status != 200 || strings.Contains(string(b), "1.0.0") {
		t.Fatal("draft was published")
	}
	action := func(id, action string, want int) {
		t.Helper()
		status, b := call(t, c, ts.URL, "POST", "/api/admin/releases/"+id+"/"+action, map[string]string{})
		if status != want {
			t.Fatalf("%s %d %s", action, status, b)
		}
	}
	action(first.ReleaseID, "publish", 200)
	action(first.ReleaseID, "delete", 409)
	req, _ := http.NewRequest("GET", ts.URL+"/downloads/dsh", nil)
	req.Header.Set("Range", "bytes=0-4")
	res, e := c.Do(req)
	if e != nil {
		t.Fatal(e)
	}
	etag := res.Header.Get("ETag")
	downloaded, _ := io.ReadAll(res.Body)
	res.Body.Close()
	if res.StatusCode != 206 || !bytes.Equal(downloaded, data[:5]) {
		t.Fatal("published bytes differ")
	}
	req, _ = http.NewRequest("GET", ts.URL+"/downloads/dsh", nil)
	req.Header.Set("If-None-Match", etag)
	res, e = c.Do(req)
	if e != nil {
		t.Fatal(e)
	}
	res.Body.Close()
	if res.StatusCode != 304 {
		t.Fatal("conditional download broken")
	}
	call(t, c, ts.URL, "HEAD", "/downloads/dsh", nil)
	call(t, c, ts.URL, "GET", "/", nil)
	call(t, c, ts.URL, "GET", "/market", nil)
	status, b = call(t, c, ts.URL, "GET", "/api/admin/stats", nil)
	var stats struct{ Totals map[string]Metric }
	json.Unmarshal(b, &stats)
	if status != 200 || stats.Totals["download.dsh"].Count != 1 || stats.Totals["download.dsh"].Bytes != 5 || stats.Totals["visit.home"].Count != 1 || stats.Totals["visit.market"].Count != 1 {
		t.Fatalf("incorrect request metrics: %s", b)
	}
	status, b = call(t, c, ts.URL, "GET", "/api/admin/stats.csv?days=7", nil)
	if status != 200 || !strings.Contains(string(b), "首页访问") {
		t.Fatal("CSV missing")
	}
	status, _ = uploadFixture(t, c, ts.URL, "dsh", "1.0.0", data)
	if status != 409 {
		t.Fatal("duplicate version accepted")
	}
	secondData := fixtureInstaller(t, "dsh", "1.1.0", nil)
	status, b = uploadFixture(t, c, ts.URL, "dsh", "1.1.0", secondData)
	if status != 201 {
		t.Fatal(string(b))
	}
	var second Release
	json.Unmarshal(b, &second)
	action(second.ReleaseID, "publish", 200)
	action(first.ReleaseID, "publish", 200)
	action(second.ReleaseID, "delete", 200)
	if _, e = os.Stat(filepath.Join(s.packageRoot(), second.File)); !os.IsNotExist(e) {
		t.Fatal("managed file not deleted")
	}
	action(first.ReleaseID, "unpublish", 200)
	status, _ = call(t, c, ts.URL, "GET", "/downloads/dsh", nil)
	if status != 404 {
		t.Fatal("unpublished file downloadable")
	}
	action(first.ReleaseID, "publish", 200)
	status, b = call(t, c, ts.URL, "GET", "/api/admin/audit", nil)
	if status != 200 || !strings.Contains(string(b), "package.upload") || !strings.Contains(string(b), "package.delete") {
		t.Fatal("audit log incomplete")
	}
	dir := filepath.Dir(s.store.db.Path())
	s.store.db.Close()
	replacement, e := openStore(dir)
	if e != nil {
		t.Fatal(e)
	}
	defer replacement.db.Close()
	s.store = replacement
	status, b = call(t, c, ts.URL, "GET", "/api/downloads", nil)
	if status != 200 || !strings.Contains(string(b), "1.0.0") {
		t.Fatal("published version not preserved after restart")
	}
	entries, _ := os.ReadDir(s.packageRoot())
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), ".upload-") {
			t.Fatal("temporary upload retained")
		}
	}
}
func TestInstallerValidationAndLegacyImport(t *testing.T) {
	s, ts, c := fixtureLegacyDownloadServer(t)
	loginAs(t, c, ts.URL, "admin")
	for _, host := range []string{"dsh", "cursor", "codex"} {
		good := fixtureInstaller(t, host, "2.0.0", nil)
		file := filepath.Join(t.TempDir(), "installer")
		os.WriteFile(file, good, 0600)
		if e := validateInstaller(file, host, "2.0.0"); e != nil {
			t.Fatal(host, e)
		}
		if e := validateInstaller(file, host, "3.0.0"); e == nil {
			t.Fatal("mismatched package version accepted")
		}
		unsafe := fixtureInstaller(t, host, "2.0.0", map[string]string{"../escape": "bad"})
		status, b := uploadFixture(t, c, ts.URL, host, "2.0.0", unsafe)
		if status != 400 {
			t.Fatalf("unsafe package %s %d %s", host, status, b)
		}
	}
	s.cfg.DownloadDir = t.TempDir()
	legacy := []byte("existing manual installer")
	filename := "lingpet-0.4.2.tgz"
	os.WriteFile(filepath.Join(s.downloadRoot(), filename), legacy, 0600)
	hash := sha256.Sum256(legacy)
	manifest := DownloadManifest{Downloads: []Download{{ID: "dsh", Name: "DSH", Version: "0.4.2", File: filename, Size: int64(len(legacy)), SHA256: hex.EncodeToString(hash[:])}}}
	raw, _ := json.Marshal(manifest)
	os.WriteFile(filepath.Join(s.downloadRoot(), "manifest.json"), raw, 0600)
	status, b := call(t, c, ts.URL, "GET", "/api/admin/releases", nil)
	var records []Release
	json.Unmarshal(b, &records)
	if status != 200 || len(records) != 1 || records[0].Managed || !records[0].Published {
		t.Fatal("legacy installer not imported", string(b))
	}
	id := records[0].ReleaseID
	call(t, c, ts.URL, "POST", "/api/admin/releases/"+id+"/unpublish", map[string]string{})
	call(t, c, ts.URL, "POST", "/api/admin/releases/"+id+"/delete", map[string]string{})
	if _, e := os.Stat(filepath.Join(s.downloadRoot(), filename)); e != nil {
		t.Fatal("legacy source deleted")
	}
	status, b = call(t, c, ts.URL, "GET", "/api/admin/releases", nil)
	json.Unmarshal(b, &records)
	if status != 200 || len(records) != 0 {
		t.Fatal("removed legacy version reappeared")
	}
	status, b = call(t, c, ts.URL, "GET", "/api/downloads", nil)
	if status != 200 || strings.Contains(string(b), "0.4.2") {
		t.Fatal("unpublished legacy download reappeared")
	}
}

func TestRealInstallerCompatibility(t *testing.T) {
	directory := os.Getenv("LINGPET_TEST_INSTALLERS")
	if directory == "" {
		t.Skip("set LINGPET_TEST_INSTALLERS to validate real release packages")
	}
	raw, e := os.ReadFile(filepath.Join(directory, "manifest.json"))
	if e != nil {
		t.Fatal(e)
	}
	var manifest DownloadManifest
	if e = json.Unmarshal(raw, &manifest); e != nil {
		t.Fatal(e)
	}
	for _, download := range manifest.Downloads {
		t.Run(download.ID, func(t *testing.T) {
			if e := validateInstaller(filepath.Join(directory, download.File), download.ID, download.Version); e != nil {
				t.Fatal(e)
			}
		})
	}
}
