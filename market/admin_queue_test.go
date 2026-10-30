package main

import (
	"encoding/json"
	"testing"
	"time"
)

func TestAdminQueueReportsWorkerOrderAndScheduledChecks(t *testing.T) {
	s, ts, client := fixtureServer(t)
	status, _ := call(t, client, ts.URL, "GET", "/api/admin/queue", nil)
	if status != 403 {
		t.Fatalf("anonymous queue access: %d", status)
	}
	loginAs(t, client, ts.URL, "admin")
	now := time.Now().UTC()
	s.cfg.SyncInterval = 24 * time.Hour
	for i, state := range []string{"queued", "queued", "validating", "approved", "approved", "unpublished"} {
		a := Record{ID: []string{"old", "new", "running", "due", "future", "hidden"}[i], Repository: "alice/pet", Status: state, AssetName: "pet.petpack", Created: now.Add(time.Duration(i) * time.Minute), Pet: &Pet{ID: "test-pet", Name: "Test", Version: "1.0.0"}}
		if err := s.store.put("records", a.ID, a); err != nil {
			t.Fatal(err)
		}
	}
	if err := s.store.put("meta", "source-check/future", sourceCheck{At: now, Missing: 2, Error: "previous failure"}); err != nil {
		t.Fatal(err)
	}
	s.activeCheck = "repository-check/alice/pet"
	status, raw := call(t, client, ts.URL, "GET", "/api/admin/queue", nil)
	if status != 200 {
		t.Fatalf("queue: %d %s", status, raw)
	}
	var result struct {
		Validations, Checks              []queueEntry
		IntervalSeconds, CooldownSeconds int
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		t.Fatal(err)
	}
	if len(result.Validations) != 3 || len(result.Checks) != 3 {
		t.Fatalf("unexpected tasks: %s", raw)
	}
	if result.IntervalSeconds != 86400 || result.CooldownSeconds != 10 {
		t.Fatal("incorrect worker policy")
	}
	if result.Validations[0].ID != "old" || result.Validations[0].Position != 1 || result.Validations[1].ID != "new" || result.Validations[1].Position != 2 || result.Validations[2].Position != 0 {
		t.Fatalf("incorrect FIFO positions: %s", raw)
	}
	for _, entry := range result.Checks {
		switch entry.ID {
		case "source-check/due":
			if entry.Status != "due" || entry.Position != 1 {
				t.Fatal(entry)
			}
		case "source-check/future":
			if entry.Status != "scheduled" || entry.Missing != 2 || entry.LastCheck == nil || entry.NextCheck == nil || !entry.NextCheck.Equal(now.Add(24*time.Hour)) || entry.Error != "previous failure" {
				t.Fatal(entry)
			}
		case "repository-check/alice/pet":
			if entry.Status != "running" || entry.Position != 0 {
				t.Fatal(entry)
			}
		default:
			t.Fatal("unpublished task exposed", entry)
		}
	}
	s.cfg.SyncInterval = 0
	status, raw = call(t, client, ts.URL, "GET", "/api/admin/queue", nil)
	if status != 200 {
		t.Fatal(status)
	}
	result.Checks = nil
	if err := json.Unmarshal(raw, &result); err != nil {
		t.Fatal(err)
	}
	for _, entry := range result.Checks {
		if entry.Status != "disabled" || entry.NextCheck != nil {
			t.Fatal("disabled scheduler still scheduled", entry)
		}
	}
}
