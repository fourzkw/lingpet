package main

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"
)

type latestGitHub struct{ *fakeGitHub }

func (g latestGitHub) Resolve(ctx context.Context, repo, tag, name string) (Asset, error) {
	if tag == "" {
		tag = "v1.0.0"
	}
	if name == "" {
		name = "test.petpack"
	}
	return g.fakeGitHub.Resolve(ctx, repo, tag, name)
}

func TestRepositorySubmissionAndPublicStatus(t *testing.T) {
	s, ts, c := fixtureServer(t)
	s.github = latestGitHub{&fakeGitHub{fixturePack(t, "")}}
	status, body := call(t, c, ts.URL, "POST", "/api/submissions", map[string]string{"repository": "https://github.com/alice/pet.git"})
	if status != 202 {
		t.Fatalf("submit: %d %s", status, body)
	}
	var receipt struct {
		ID, Token string
		Record    Record
	}
	json.Unmarshal(body, &receipt)
	if receipt.Record.Tag != "v1.0.0" || receipt.Record.AssetName != "test.petpack" {
		t.Fatalf("not resolved: %s", body)
	}
	status, body = call(t, c, ts.URL, "POST", "/api/submissions", map[string]string{"repository": "ALICE/PET"})
	if status != 200 || !strings.Contains(string(body), `"existing":true`) || strings.Contains(string(body), receipt.Token) {
		t.Fatalf("duplicate: %d %s", status, body)
	}
	newer := receipt.Record
	newer.ID = newID()
	newer.Tag = "v2.0.0"
	newer.Created = time.Now().Add(time.Second)
	newer.Status = "rejected"
	newer.Submitter = "private-submitter"
	newer.Reviews = []Review{{Actor: "private-admin", Reason: "请修改封面"}}
	if e := s.store.put("records", newer.ID, newer); e != nil {
		t.Fatal(e)
	}
	status, body = call(t, c, ts.URL, "POST", "/api/submissions/lookup", map[string]string{"repository": "https://github.com/ALICE/PET/"})
	var result struct {
		Records []struct{ ID, Status, Reason string }
	}
	json.Unmarshal(body, &result)
	if status != 200 || len(result.Records) != 2 || result.Records[0].ID != newer.ID || result.Records[0].Reason != "请修改封面" {
		t.Fatalf("lookup: %d %s", status, body)
	}
	for _, secret := range []string{receipt.Token, "private-admin", "private-submitter", "token", "source", "preview"} {
		if strings.Contains(string(body), secret) {
			t.Fatalf("leaked %s: %s", secret, body)
		}
	}
	status, body = call(t, c, ts.URL, "POST", "/api/submissions/lookup", map[string]string{"repository": "alice/missing"})
	if status != 200 || !strings.Contains(string(body), `"records":[]`) {
		t.Fatalf("missing: %d %s", status, body)
	}
	for _, repo := range []string{"https://evil.test/alice/pet", "https://github.com/alice/pet/tree/main", "https://github.com/alice/pet?token=x"} {
		status, _ = call(t, c, ts.URL, "POST", "/api/submissions", map[string]string{"repository": repo})
		if status != 400 {
			t.Fatalf("invalid repository accepted: %s", repo)
		}
	}
}

func TestResolveLatestReleaseSelectsUniquePetpack(t *testing.T) {
	for _, tc := range []struct {
		name, assets string
		prerelease   bool
		want         string
	}{
		{"unique", `[{"id":20,"name":"test.petpack","state":"uploaded","size":100,"browser_download_url":"https://github.com/alice/pet/releases/download/v1/test.petpack"},{"name":"notes.txt","state":"uploaded"}]`, false, ""},
		{"missing", `[]`, false, "没有 .petpack"},
		{"ambiguous", `[{"name":"a.petpack","state":"uploaded"},{"name":"b.petpack","state":"uploaded"}]`, false, "多个 .petpack"},
		{"prerelease", `[]`, true, "正式公开"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			g := &githubClient{routes: []string{"direct"}, client: &http.Client{Transport: presentationTransport(func(r *http.Request) (*http.Response, error) {
				body := `{"id":42,"private":false}`
				if r.URL.Path != "/repos/alice/pet" {
					if r.URL.Path != "/repos/alice/pet/releases/latest" {
						t.Fatal(r.URL)
					}
					data, _ := json.Marshal(map[string]any{"id": 10, "tag_name": "v1", "prerelease": tc.prerelease, "assets": json.RawMessage(tc.assets)})
					body = string(data)
				}
				return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(body))}, nil
			})}}
			asset, e := g.Resolve(context.Background(), "alice/pet", "", "")
			if tc.want != "" {
				if e == nil || !strings.Contains(e.Error(), tc.want) {
					t.Fatalf("%+v %v", asset, e)
				}
			} else if e != nil || asset.Tag != "v1" || asset.Name != "test.petpack" {
				t.Fatalf("%+v %v", asset, e)
			}
		})
	}
}
