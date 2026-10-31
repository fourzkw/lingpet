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

func TestGitHubPetStatsSelectsPackageAsset(t *testing.T) {
	g := &githubClient{client: &http.Client{Transport: presentationTransport(func(r *http.Request) (*http.Response, error) {
		body := `{"private":false,"stargazers_count":1234}`
		if strings.Contains(r.URL.Path, "/releases/") {
			body = `{"assets":[{"name":"cover.png","download_count":999},{"name":"pet.petpack","download_count":42}]}`
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}, nil
	})}}
	stats, err := g.Stats(context.Background(), "alice/pet", "v1.0.0", "pet.petpack")
	if err != nil || stats.Downloads != 42 || stats.Stars != 1234 {
		t.Fatalf("%+v %v", stats, err)
	}
	if _, err := g.Stats(context.Background(), "alice/pet", "v1.0.0", "missing.petpack"); err == nil {
		t.Fatal("missing asset reported as zero downloads")
	}
}

type statsGitHub struct {
	*fakeGitHub
	calls      int
	fail       bool
	downloads  map[string]int64
	failingTag string
}

func (g *statsGitHub) Stats(_ context.Context, _ string, tag string, _ string) (PetStats, error) {
	g.calls++
	if g.fail || tag == g.failingTag {
		return PetStats{}, errors.New("offline")
	}
	if g.downloads != nil {
		return PetStats{Downloads: g.downloads[tag], Stars: 7}, nil
	}
	return PetStats{Downloads: 42, Stars: 0}, nil
}

func TestPublicPetStatsCacheAndFailure(t *testing.T) {
	s, ts, c := fixtureServer(t)
	g := &statsGitHub{fakeGitHub: s.github.(*fakeGitHub)}
	s.github = g
	record := Record{ID: newID(), Repository: "alice/pet", Tag: "v1", AssetName: "pet.petpack", Status: "approved", Pet: &Pet{Name: "pet"}}
	s.store.put("records", record.ID, record)
	status, body := call(t, c, ts.URL, "GET", "/api/pets", nil)
	var records []Record
	json.Unmarshal(body, &records)
	if status != 200 || len(records) != 1 || records[0].Stats == nil || records[0].Stats.Downloads != 42 || records[0].Stats.Stars != 0 {
		t.Fatalf("%d %s", status, body)
	}
	status, body = call(t, c, ts.URL, "GET", "/api/versions/"+record.ID, nil)
	var detail Record
	json.Unmarshal(body, &detail)
	if status != 200 || detail.Stats == nil || g.calls != 1 {
		t.Fatalf("cache not shared: %d %s calls=%d", status, body, g.calls)
	}
	g.fail = true
	old := time.Now().Add(-time.Hour)
	s.store.put("meta", "pet-stats:"+record.ID, cachedPetStats{Stats: detail.Stats, CheckedAt: old, UpdatedAt: old})
	if stats := s.petStats(context.Background(), record); stats == nil || stats.Downloads != 42 {
		t.Fatal("lost last successful stats")
	}
	s.petStats(context.Background(), record)
	if g.calls != 2 {
		t.Fatal("failure not cached")
	}
	record.ID = newID()
	record.Pet = &Pet{ID: "other", Name: "other"}
	if s.petStats(context.Background(), record) != nil {
		t.Fatal("unknown stats reported as zero")
	}
}

func TestPetStatsAccumulatesPublishedVersions(t *testing.T) {
	s, ts, c := fixtureServer(t)
	g := &statsGitHub{fakeGitHub: s.github.(*fakeGitHub), downloads: map[string]int64{"v1": 42, "v2": 8}}
	s.github = g
	latest := Record{ID: newID(), Repository: "alice/pet", Tag: "v2", AssetName: "pet.petpack", Status: "approved", Pet: &Pet{ID: "fox", Version: "2.0.0"}}
	old := latest
	old.ID, old.Tag, old.Pet = newID(), "v1", &Pet{ID: "fox", Version: "1.0.0"}
	duplicate := old
	duplicate.ID = newID()
	other := old
	other.ID, other.Pet = newID(), &Pet{ID: "cat", Version: "1.0.0"}
	pending := latest
	pending.ID, pending.Tag, pending.Status = newID(), "v3", "pending"
	for _, record := range []Record{latest, old, duplicate, other, pending} {
		if err := s.store.put("records", record.ID, record); err != nil {
			t.Fatal(err)
		}
	}
	status, body := call(t, c, ts.URL, "GET", "/api/versions/"+latest.ID, nil)
	var detail Record
	if err := json.Unmarshal(body, &detail); err != nil {
		t.Fatal(err)
	}
	if status != 200 || detail.Stats == nil || detail.Stats.Downloads != 50 || detail.Stats.Stars != 7 || g.calls != 2 {
		t.Fatalf("expected distinct published assets: %d %s calls=%d", status, body, g.calls)
	}
	if stats := s.petStats(context.Background(), old); stats == nil || stats.Downloads != 50 {
		t.Fatalf("historical detail must share cumulative count: %+v", stats)
	}
}

func TestPetStatsDoesNotExposePartialTotal(t *testing.T) {
	s, _, _ := fixtureServer(t)
	g := &statsGitHub{fakeGitHub: s.github.(*fakeGitHub), failingTag: "v1"}
	s.github = g
	latest := Record{ID: newID(), Repository: "alice/pet", Tag: "v2", AssetName: "pet.petpack", Status: "approved", Pet: &Pet{ID: "fox"}}
	old := latest
	old.ID, old.Tag = newID(), "v1"
	if stats := s.petStatsWithHistory(context.Background(), latest, []Record{old}); stats != nil {
		t.Fatalf("unknown history must not appear as a complete total: %+v", stats)
	}
	then := time.Now().Add(-time.Hour)
	s.store.put("meta", "pet-stats:"+old.ID, cachedPetStats{Stats: &PetStats{Downloads: 10}, CheckedAt: then, UpdatedAt: then})
	if stats := s.petStatsWithHistory(context.Background(), latest, []Record{old}); stats == nil || stats.Downloads != 52 {
		t.Fatalf("retain cached historical count on failure: %+v", stats)
	}
}
