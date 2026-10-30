package main

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

type invalidPresentation struct{ *fakeGitHub }

func (g invalidPresentation) Presentation(context.Context, string, string) (Pet, []byte, error) {
	return Pet{}, nil, errors.New("pet.json 无效")
}

func TestAutomaticPublicationRequiresValidPresentation(t *testing.T) {
	s, ts, c := fixtureServer(t)
	a := Record{ID: newID(), Repository: "alice/pet", Tag: "v1", AssetName: "test.petpack", Status: "queued"}
	s.store.put("records", a.ID, a)
	s.github = invalidPresentation{s.github.(*fakeGitHub)}
	s.validate(context.Background(), a)
	s.store.get("records", a.ID, &a)
	if a.Status != "failed" || !strings.Contains(a.Error, "pet.json") || len(a.Reviews) != 0 {
		t.Fatalf("invalid presentation published: %+v", a)
	}
	status, _ := call(t, c, ts.URL, "GET", "/api/versions/"+a.ID, nil)
	if status != 404 {
		t.Fatal("failed submission visible")
	}
	loginAs(t, c, ts.URL, "admin")
	for _, action := range []string{"approve", "reject"} {
		status, _ = call(t, c, ts.URL, "POST", "/api/admin/versions/"+a.ID+"/"+action, map[string]string{"reason": "bypass"})
		if status != 409 {
			t.Fatal("manual review bypass remains available", action, status)
		}
	}
	s.github = s.github.(invalidPresentation).fakeGitHub
	if e := s.store.review(a.ID, "admin", "retry", ""); e != nil {
		t.Fatal(e)
	}
	s.store.get("records", a.ID, &a)
	s.validate(context.Background(), a)
	a = Record{ID: a.ID}
	s.store.get("records", a.ID, &a)
	if a.Status != "approved" || a.Error != "" || len(a.Reviews) != 2 || a.Reviews[1].Action != "auto-publish" {
		t.Fatalf("retry did not automatically publish: %+v", a)
	}
	status, _ = call(t, c, ts.URL, "GET", "/api/versions/"+a.ID+"/install", nil)
	if status != 200 {
		t.Fatal("validated submission not installable")
	}
}

func TestWorkerRevalidatesLegacyPendingWithoutRestoringWithdrawnRecords(t *testing.T) {
	s, _, _ := fixtureServer(t)
	legacy := Record{ID: newID(), Repository: "alice/pet", Tag: "v1", AssetName: "test.petpack", Status: "pending"}
	s.store.put("records", legacy.ID, legacy)
	for _, status := range []string{"unpublished", "rejected", "failed", "approved"} {
		a := Record{ID: status, Status: status}
		s.store.put("records", a.ID, a)
	}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() { defer close(done); s.worker(ctx) }()
	defer func() { cancel(); <-done }()
	deadline := time.After(5 * time.Second)
	for {
		var a Record
		s.store.get("records", legacy.ID, &a)
		if a.Status == "approved" {
			if a.Pet == nil || a.Source == nil || len(a.Reviews) != 1 || a.Reviews[0].Actor != "system" {
				t.Fatalf("legacy submission bypassed validation: %+v", a)
			}
			break
		}
		select {
		case <-deadline:
			t.Fatalf("legacy submission stuck: %+v", a)
		case <-time.After(20 * time.Millisecond):
		}
	}
	for _, status := range []string{"unpublished", "rejected", "failed", "approved"} {
		var a Record
		s.store.get("records", status, &a)
		if a.Status != status {
			t.Fatalf("unrelated record changed: %+v", a)
		}
	}
}
