package main

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func contentsJSON(raw []byte) string {
	data, _ := json.Marshal(map[string]any{"type": "file", "size": len(raw), "encoding": "base64", "content": base64.StdEncoding.EncodeToString(raw)})
	return string(data)
}

func rewritePack(t *testing.T, raw []byte, edit func(map[string][]byte)) []byte {
	t.Helper()
	reader, e := zip.NewReader(bytes.NewReader(raw), int64(len(raw)))
	if e != nil {
		t.Fatal(e)
	}
	files := map[string][]byte{}
	for _, entry := range reader.File {
		r, e := entry.Open()
		if e != nil {
			t.Fatal(e)
		}
		files[entry.Name], e = io.ReadAll(r)
		r.Close()
		if e != nil {
			t.Fatal(e)
		}
	}
	edit(files)
	var out bytes.Buffer
	writer := zip.NewWriter(&out)
	for name, data := range files {
		w, e := writer.Create(name)
		if e != nil {
			t.Fatal(e)
		}
		if _, e = w.Write(data); e != nil {
			t.Fatal(e)
		}
	}
	if e = writer.Close(); e != nil {
		t.Fatal(e)
	}
	return out.Bytes()
}

type multiGitHub struct {
	*fakeGitHub
	works    []RepositoryPet
	packages map[string][]byte
}

func (g *multiGitHub) Discover(context.Context, string) ([]RepositoryPet, error) { return g.works, nil }
func (g *multiGitHub) Resolve(ctx context.Context, repo, tag, name string) (Asset, error) {
	raw, ok := g.packages[name]
	if !ok {
		return Asset{}, errors.New("missing asset")
	}
	a, _ := g.fakeGitHub.Resolve(ctx, repo, tag, name)
	a.Size = int64(len(raw))
	return a, nil
}
func (g *multiGitHub) Download(_ context.Context, a Asset, dest string) error {
	return os.WriteFile(dest, g.packages[a.Name], 0600)
}
func (g *multiGitHub) PresentationAt(ctx context.Context, repo, tag, directory string) (Pet, []byte, error) {
	for _, work := range g.works {
		if work.Path == directory && work.Tag == tag {
			f := &fakeGitHub{g.packages[work.AssetName]}
			return f.Presentation(ctx, repo, tag)
		}
	}
	return Pet{}, nil, errors.New("missing presentation")
}

func multiFixture(t *testing.T) *multiGitHub {
	base := fixturePack(t, "")
	g := &multiGitHub{fakeGitHub: &fakeGitHub{base}, packages: map[string][]byte{}}
	for _, id := range []string{"snowfox", "orange-scholar", "broken-pet"} {
		raw := rewritePack(t, base, func(files map[string][]byte) {
			var pet Pet
			json.Unmarshal(files["pet.json"], &pet)
			pet.ID = id
			pet.Name = id
			files["pet.json"], _ = json.Marshal(pet)
		})
		hash := sha256.Sum256(raw)
		work := RepositoryPet{ID: id, Version: "1.0.0", Path: "pets/" + id, Tag: "collection-v1", AssetName: id + "-1.0.0.petpack", SHA256: hex.EncodeToString(hash[:])}
		if id == "broken-pet" {
			work.Path = "../invalid"
		}
		g.works = append(g.works, work)
		g.packages[work.AssetName] = raw
	}
	return g
}

func TestMultiPetRepositoryIndependentValidationPublicationAndRetry(t *testing.T) {
	s, ts, c := fixtureServer(t)
	g := multiFixture(t)
	s.github = g
	status, raw := call(t, c, ts.URL, "POST", "/api/submissions", map[string]string{"repository": "alice/pet"})
	var receipt struct {
		Records        []submissionReceipt
		Created, Total int
	}
	json.Unmarshal(raw, &receipt)
	if status != 202 || receipt.Created != 3 || len(receipt.Records) != 3 {
		t.Fatalf("%d %s", status, raw)
	}
	all, _ := s.store.records()
	for _, a := range all {
		s.validate(context.Background(), a)
	}
	all, _ = s.store.records()
	approved, failed := 0, 0
	for _, a := range all {
		if a.Status == "approved" {
			approved++
			if len(a.SHA256) != 64 || a.Preview == nil || a.Work == nil {
				t.Fatalf("missing independent snapshot: %+v", a)
			}
		} else if a.Status == "failed" && strings.Contains(a.Error, "目录") {
			failed++
		} else {
			t.Fatalf("unexpected result %+v", a)
		}
	}
	if approved != 2 || failed != 1 {
		t.Fatalf("approved=%d failed=%d", approved, failed)
	}
	status, raw = call(t, c, ts.URL, "GET", "/api/pets", nil)
	var cards []Record
	json.Unmarshal(raw, &cards)
	if status != 200 || len(cards) != 2 || cards[0].Pet.ID == cards[1].Pet.ID {
		t.Fatalf("repository merged or failed entry published: %s", raw)
	}
	status, raw = call(t, c, ts.URL, "POST", "/api/submissions", map[string]string{"repository": "alice/pet"})
	json.Unmarshal(raw, &receipt)
	if status != 202 || receipt.Created != 1 || receipt.Total != 3 {
		t.Fatalf("retry recreated good entries: %d %s", status, raw)
	}
	entries, _ := os.ReadDir(filepath.Join(s.cfg.DataDir, "tmp"))
	if len(entries) != 0 {
		t.Fatal("downloaded packages retained")
	}
}

func TestRepositoryIndexRejectsUnsafeEntries(t *testing.T) {
	good := multiFixture(t).works[0]
	if e := good.validate(); e != nil {
		t.Fatal(e)
	}
	for _, directory := range []string{"../pets/fox", "pets/../fox", "/pets/fox", "pets/a%2fb", "pets/a\\b", "pets/a?ref=x", "pets/a#x", "pets/"} {
		bad := good
		bad.Path = directory
		if bad.validate() == nil {
			t.Fatalf("unsafe path %q", directory)
		}
	}
}

func TestReplacedAttachmentDoesNotCompareIndexOrPreviousHashes(t *testing.T) {
	s, _, _ := fixtureServer(t)
	g := multiFixture(t)
	work := g.works[0]
	work.SHA256 = "outdated-index-hash"
	s.github = g
	a := Record{ID: newID(), Repository: "alice/pet", Tag: work.Tag, AssetName: work.AssetName, Work: &work, SHA256: "old-attachment-hash"}
	if e := s.validateInner(context.Background(), &a); e != nil {
		t.Fatal(e)
	}
	if a.Pet == nil || a.Pet.ID != work.ID {
		t.Fatal("package identity validation lost")
	}
	work.SHA256 = ""
	if e := work.validate(); e != nil {
		t.Fatal("hash remains required", e)
	}
}

func TestDiscoverIndexPinnedToReleaseAndLegacyFallback(t *testing.T) {
	for _, mode := range []string{"index", "missing", "malformed", "forbidden"} {
		t.Run(mode, func(t *testing.T) {
			g := &githubClient{routes: []string{"direct"}, client: &http.Client{Transport: presentationTransport(func(r *http.Request) (*http.Response, error) {
				status := 200
				body := `{"tag_name":"collection-v1"}`
				if strings.Contains(r.URL.Path, "/contents/") {
					if r.URL.Query().Get("ref") != "collection-v1" {
						t.Fatal("moving ref")
					}
					switch mode {
					case "missing":
						status = 404
					case "forbidden":
						status = 403
					default:
						raw := []byte(`{"schemaVersion":1,"pets":[{"id":"snowfox"}]}`)
						if mode == "malformed" {
							raw = []byte(`{"schemaVersion":99,"pets":[]}`)
						}
						body = contentsJSON(raw)
					}
				}
				return &http.Response{StatusCode: status, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(body))}, nil
			})}}
			works, e := g.Discover(context.Background(), "alice/pet")
			switch mode {
			case "index":
				if e != nil || len(works) != 1 {
					t.Fatalf("%+v %v", works, e)
				}
			case "missing":
				if e != nil || works != nil {
					t.Fatalf("legacy fallback failed: %v", e)
				}
			default:
				if e == nil {
					t.Fatal("invalid index silently treated as legacy")
				}
			}
		})
	}
}

func TestLatestCatalogGroupsByPetNotRepositoryAndComparesNumericVersions(t *testing.T) {
	records := []Record{{ID: "old", Repository: "alice/pet", Status: "approved", Source: &Asset{RepoID: 42}, Pet: &Pet{ID: "fox", Version: "1.9.0"}}, {ID: "new", Repository: "alice/pet", Status: "approved", Source: &Asset{RepoID: 42}, Pet: &Pet{ID: "fox", Version: "1.10.0"}}, {ID: "other", Repository: "alice/pet", Status: "approved", Source: &Asset{RepoID: 42}, Pet: &Pet{ID: "dragon", Version: "1.0.0"}}, {ID: "foreign", Repository: "bob/pet", Status: "approved", Source: &Asset{RepoID: 43}, Pet: &Pet{ID: "fox", Version: "1.0.0"}}}
	cards := latestPets(records)
	if len(cards) != 3 {
		t.Fatalf("%+v", cards)
	}
	for _, a := range cards {
		if a.ID == "old" {
			t.Fatal("old version displayed as another card")
		}
	}
}

func TestCandidateActionsValidatedAndPreviewed(t *testing.T) {
	raw := rewritePack(t, fixturePack(t, ""), func(files map[string][]byte) {
		var m Manifest
		json.Unmarshal(files["manifest.json"], &m)
		base := m.Clips["idle"]
		alt := base
		alt.File = "sprites/idle-1.png"
		base.Alternatives = []Clip{alt}
		base.Selection = "round-robin"
		m.Clips["idle"] = base
		files[alt.File] = files["sprites/idle.png"]
		files["original/"+alt.File] = files["original/sprites/idle.png"]
		files["manifest.json"], _ = json.Marshal(m)
	})
	file := filepath.Join(t.TempDir(), "pet.petpack")
	os.WriteFile(file, raw, 0600)
	pack, e := parsePack(file)
	if e != nil {
		t.Fatal(e)
	}
	out := t.TempDir()
	if _, e = previewPack(pack, out); e != nil {
		t.Fatal(e)
	}
	if _, e = os.Stat(filepath.Join(out, "sprites/idle-1.png")); e != nil {
		t.Fatal(e)
	}
}

func TestMultiPetValidationRejectsWrongIdentityUnsafePathAndMalformedPackage(t *testing.T) {
	for _, kind := range []string{"identity", "path", "package", "metadata"} {
		t.Run(kind, func(t *testing.T) {
			s, _, _ := fixtureServer(t)
			g := multiFixture(t)
			work := g.works[0]
			switch kind {
			case "identity":
				work.ID = "different-pet"
			case "path":
				work.Path = "pets/../secret"
			case "package":
				g.packages[work.AssetName] = rewritePack(t, g.packages[work.AssetName], func(files map[string][]byte) { delete(files, "sprites/sleep.png") })
			case "metadata":
				g.packages[work.AssetName] = rewritePack(t, g.packages[work.AssetName], func(files map[string][]byte) {
					var pet Pet
					json.Unmarshal(files["pet.json"], &pet)
					pet.Version = "2.0.0"
					files["pet.json"], _ = json.Marshal(pet)
				})
			}
			s.github = g
			a := Record{ID: newID(), Repository: "alice/pet", Tag: work.Tag, AssetName: work.AssetName, Work: &work, Status: "queued"}
			s.store.put("records", a.ID, a)
			s.validate(context.Background(), a)
			s.store.get("records", a.ID, &a)
			if a.Status != "failed" || a.Error == "" || a.Source != nil || a.SHA256 != "" {
				t.Fatalf("invalid package published: %+v", a)
			}
		})
	}
}

func TestMultiPetBatchIdempotencyHistoryAndIndependentUpdates(t *testing.T) {
	s, ts, c := fixtureServer(t)
	g := multiFixture(t)
	g.works = g.works[:2]
	s.github = g
	status, body := call(t, c, ts.URL, "POST", "/api/submissions", map[string]string{"repository": "alice/pet"})
	if status != 202 {
		t.Fatalf("%d %s", status, body)
	}
	all, _ := s.store.records()
	for _, a := range all {
		s.validate(context.Background(), a)
	}
	status, body = call(t, c, ts.URL, "POST", "/api/submissions", map[string]string{"repository": "alice/pet"})
	if status != 200 || !strings.Contains(string(body), `"created":0`) || strings.Contains(string(body), `"token"`) {
		t.Fatalf("duplicate batch %d %s", status, body)
	}
	work := g.works[0]
	oldAsset := work.AssetName
	work.Version = "1.1.0"
	work.Tag = "snowfox-v1.1.0"
	work.AssetName = "snowfox-1.1.0.petpack"
	raw := rewritePack(t, g.packages[oldAsset], func(files map[string][]byte) {
		var pet Pet
		json.Unmarshal(files["pet.json"], &pet)
		pet.Version = work.Version
		files["pet.json"], _ = json.Marshal(pet)
	})
	hash := sha256.Sum256(raw)
	work.SHA256 = hex.EncodeToString(hash[:])
	g.packages[work.AssetName] = raw
	g.works[0] = work
	status, body = call(t, c, ts.URL, "POST", "/api/submissions", map[string]string{"repository": "alice/pet"})
	if status != 202 || !strings.Contains(string(body), `"created":1`) {
		t.Fatalf("%d %s", status, body)
	}
	all, _ = s.store.records()
	for _, a := range all {
		if a.Status == "queued" {
			s.validate(context.Background(), a)
		}
	}
	status, body = call(t, c, ts.URL, "GET", "/api/pets", nil)
	var cards []Record
	json.Unmarshal(body, &cards)
	if status != 200 || len(cards) != 2 {
		t.Fatalf("%s", body)
	}
	for _, a := range cards {
		if a.Pet.ID == "snowfox" {
			if a.Pet.Version != "1.1.0" {
				t.Fatal("old version listed")
			}
			status, body = call(t, c, ts.URL, "GET", "/api/versions/"+a.ID+"/history", nil)
			var history []Record
			json.Unmarshal(body, &history)
			if status != 200 || len(history) != 2 {
				t.Fatalf("%s", body)
			}
		}
	}
}

func TestPackageDownloadBoundsAndRejectsUntrustedOrigins(t *testing.T) {
	for _, kind := range []string{"ok", "size", "body", "origin"} {
		t.Run(kind, func(t *testing.T) {
			calls := 0
			g := &githubClient{client: &http.Client{Transport: presentationTransport(func(r *http.Request) (*http.Response, error) {
				calls++
				if r.Header.Get("Authorization") != "" {
					t.Fatal("credentials leaked")
				}
				raw := "data"
				if kind == "body" {
					raw = "extra"
				}
				return &http.Response{StatusCode: 200, Header: make(http.Header), ContentLength: int64(len(raw)), Body: io.NopCloser(strings.NewReader(raw))}, nil
			})}}
			asset := Asset{URL: "https://github.com/alice/pet/releases/download/v1/a.petpack", Size: 4}
			if kind == "size" {
				asset.Size = 3
			}
			if kind == "origin" {
				asset.URL = "http://127.0.0.1/private"
			}
			e := g.Download(context.Background(), asset, filepath.Join(t.TempDir(), "download.petpack"))
			if kind == "ok" {
				if e != nil {
					t.Fatal(e)
				}
			} else if e == nil {
				t.Fatal("invalid download accepted")
			}
			if kind == "origin" && calls != 0 {
				t.Fatal("untrusted request made")
			}
		})
	}
}
