package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
)

type presentationTransport func(*http.Request) (*http.Response, error)

func (f presentationTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func TestPresentationUsesOnlyBoundedRepositoryFiles(t *testing.T) {
	calls := 0
	g := &githubClient{client: &http.Client{Transport: presentationTransport(func(r *http.Request) (*http.Response, error) {
		calls++
		if r.URL.Host != "api.github.com" || r.URL.Query().Get("ref") != "v1.0.0" {
			t.Fatalf("unexpected request %s", r.URL)
		}
		var data []byte
		switch r.URL.Path {
		case "/repos/alice/pet/contents/pet.json":
			data = []byte(`{"formatVersion":1,"id":"test-pet","version":"1.0.0"}`)
		case "/repos/alice/pet/contents/previews/cover.png":
			data = []byte("cover")
		default:
			t.Fatalf("must not download package: %s", r.URL)
		}
		b, _ := json.Marshal(map[string]any{"type": "file", "size": len(data), "encoding": "base64", "content": base64.StdEncoding.EncodeToString(data)})
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(string(b))), Header: make(http.Header)}, nil
	})}}
	pet, cover, e := g.Presentation(context.Background(), "alice/pet", "v1.0.0")
	if e != nil || pet.ID != "test-pet" || string(cover) != "cover" || calls != 2 {
		t.Fatalf("%+v %s %v calls=%d", pet, cover, e, calls)
	}
	g.client.Transport = presentationTransport(func(r *http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"type":"file","size":9999999,"encoding":"base64","content":"eA=="}`)), Header: make(http.Header)}, nil
	})
	if _, _, e = g.Presentation(context.Background(), "alice/pet", "v1.0.0"); e == nil {
		t.Fatal("oversized metadata accepted")
	}
}
func TestFailedSubmissionCanRetryLightweightValidation(t *testing.T) {
	s, ts, c := fixtureServer(t)
	r := Record{ID: newID(), Repository: "alice/pet", Tag: "v1.0.0", AssetName: "test.petpack", Status: "failed", Error: "timeout"}
	s.store.put("records", r.ID, r)
	status, _ := call(t, c, ts.URL, "POST", "/api/admin/versions/"+r.ID+"/retry", map[string]string{"reason": ""})
	if status != 403 {
		t.Fatal("anonymous retry allowed")
	}
	loginAs(t, c, ts.URL, "admin")
	status, b := call(t, c, ts.URL, "POST", "/api/admin/versions/"+r.ID+"/retry", map[string]string{"reason": ""})
	if status != 200 {
		t.Fatalf("%d %s", status, b)
	}
	id := r.ID
	r = Record{}
	s.store.get("records", id, &r)
	if r.Status != "queued" || r.Error != "" {
		t.Fatalf("%+v", r)
	}
	s.validate(context.Background(), r)
	s.store.get("records", r.ID, &r)
	if r.Status != "pending" || r.Preview != nil || r.SHA256 != "" {
		t.Fatalf("%+v", r)
	}
}
