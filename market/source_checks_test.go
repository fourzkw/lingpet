package main

import (
	"context"
	"errors"
	"testing"
	"time"
)

type checkedGitHub struct {
	*multiGitHub
	err   error
	calls int
}

func (g *checkedGitHub) Resolve(ctx context.Context, repo, tag, name string) (Asset, error) {
	g.calls++
	if g.err != nil {
		return Asset{}, g.err
	}
	return g.multiGitHub.Resolve(ctx, repo, tag, name)
}

func TestScheduledDiscoveryAndManualSubmissionShareQueue(t *testing.T) {
	s, ts, client := fixtureServer(t)
	g := multiFixture(t)
	g.works = g.works[:2]
	s.github = g
	if err := s.discoverUpdates(context.Background(), "alice/pet"); err != nil {
		t.Fatal(err)
	}
	if err := s.discoverUpdates(context.Background(), "alice/pet"); err != nil {
		t.Fatal(err)
	}
	status, _ := call(t, client, ts.URL, "POST", "/api/submissions", map[string]string{"repository": "alice/pet"})
	if status != 200 {
		t.Fatalf("manual submit duplicated scheduled tasks: %d", status)
	}
	all, _ := s.store.records()
	if len(all) != 2 {
		t.Fatalf("got %d tasks", len(all))
	}
	for _, a := range all {
		if a.Status != "queued" {
			t.Fatal(a.Status)
		}
		s.validate(context.Background(), a)
	}
	all, _ = s.store.records()
	for _, a := range all {
		if a.Status != "approved" {
			t.Fatal(a.Error)
		}
	}
	if err := s.store.review(all[0].ID, "admin", "unpublish", "withdraw"); err != nil {
		t.Fatal(err)
	}
	if err := s.discoverUpdates(context.Background(), "alice/pet"); err != nil {
		t.Fatal(err)
	}
	all, _ = s.store.records()
	if len(all) != 2 {
		t.Fatal("withdrawn version recreated")
	}
}

func TestDailyChecksPersistAndRequireThreeConfirmedFailures(t *testing.T) {
	s, _, _ := fixtureServer(t)
	g := &checkedGitHub{multiGitHub: multiFixture(t)}
	s.github = g
	s.cfg.SyncInterval = 24 * time.Hour
	now := time.Now().UTC()
	a := Record{ID: newID(), Repository: "alice/pet", Tag: "collection-v1", AssetName: g.works[0].AssetName, Status: "approved", Created: now, Updated: now}
	if err := s.store.put("records", a.ID, a); err != nil {
		t.Fatal(err)
	}
	// Keep discovery out of this health-only scenario.
	if err := s.store.put("meta", "repository-check/alice/pet", sourceCheck{At: now.Add(30 * 24 * time.Hour)}); err != nil {
		t.Fatal(err)
	}
	run := func(at time.Time) { all, _ := s.store.records(); s.checkNextSource(context.Background(), all, at) }
	g.err = errGitHubNotFound
	run(now)
	run(now.Add(time.Hour))
	if g.calls != 1 {
		t.Fatal("checked more than once per day")
	}
	// Reload persisted state through a new Server, as after restart.
	s = &Server{cfg: s.cfg, store: s.store, github: g}
	g.err = errors.New("rate limited")
	run(now.Add(24 * time.Hour))
	g.err = errGitHubNotFound
	for day := 2; day <= 4; day++ {
		run(now.Add(time.Duration(day) * 24 * time.Hour))
		if day < 4 {
			var current Record
			s.store.get("records", a.ID, &current)
			if current.Status != "approved" {
				t.Fatal("transient error did not reset consecutive failure count")
			}
		}
	}
	var got Record
	s.store.get("records", a.ID, &got)
	if got.Status != "unpublished" {
		t.Fatalf("source not removed: %+v", got)
	}
	if len(got.Reviews) != 1 || got.Reviews[0].Actor != "system" {
		t.Fatal("missing audit trail")
	}
}

func TestWorkerUsesOldestFirstAndWaitsBetweenTasks(t *testing.T) {
	s, _, _ := fixtureServer(t)
	now := time.Now().UTC()
	older := Record{ID: newID(), Repository: "alice/pet", Tag: "v1", AssetName: "test.petpack", Status: "queued", Created: now.Add(-time.Hour)}
	newer := Record{ID: newID(), Repository: "alice/pet", Tag: "v2", AssetName: "test.petpack", Status: "queued", Created: now}
	for _, a := range []Record{newer, older} {
		if err := s.store.put("records", a.ID, a); err != nil {
			t.Fatal(err)
		}
	}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() { defer close(done); s.worker(ctx) }()
	defer func() { cancel(); <-done }()
	deadline := time.NewTimer(5 * time.Second)
	defer deadline.Stop()
	poll := time.NewTicker(20 * time.Millisecond)
	defer poll.Stop()
	for {
		select {
		case <-deadline.C:
			t.Fatal("worker failed to process oldest task")
		case <-poll.C:
			var a, b Record
			s.store.get("records", older.ID, &a)
			s.store.get("records", newer.ID, &b)
			if b.Status != "queued" {
				t.Fatal("newer task ran before oldest or without cooldown")
			}
			if a.Status == "approved" {
				return
			}
			if a.Status == "failed" {
				t.Fatal(a.Error)
			}
		}
	}
}

func TestDiscoveryRejectsAmbiguousIndexAndRespectsCapacity(t *testing.T) {
	s, _, _ := fixtureServer(t)
	g := multiFixture(t)
	g.works = []RepositoryPet{g.works[0], g.works[0]}
	s.github = g
	if err := s.discoverUpdates(context.Background(), "alice/pet"); err == nil {
		t.Fatal("ambiguous index accepted")
	}
	all, _ := s.store.records()
	if len(all) != 0 {
		t.Fatal("partially queued invalid index")
	}
	g.works = g.works[:1]
	for i := 0; i < 180; i++ {
		a := Record{ID: newID(), Status: "queued"}
		if err := s.store.put("records", a.ID, a); err != nil {
			t.Fatal(err)
		}
	}
	if err := s.discoverUpdates(context.Background(), "alice/pet"); err == nil {
		t.Fatal("manual queue slots consumed")
	}
}
