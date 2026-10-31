package main

import (
	"context"
	"encoding/json"
	"testing"
)

type refreshGitHub struct {
	*fakeGitHub
	name      string
	downloads int
	invalid   bool
}

func (g *refreshGitHub) Presentation(ctx context.Context, repo, tag string) (Pet, []byte, error) {
	p, c, e := g.fakeGitHub.Presentation(ctx, repo, tag)
	if g.name != "" {
		p.Name = g.name
	}
	if g.invalid {
		p.Character = &Character{ID: "wrong-role", Name: "错误角色"}
	}
	return p, c, e
}
func (g *refreshGitHub) Download(ctx context.Context, a Asset, dest string) error {
	g.downloads++
	return g.fakeGitHub.Download(ctx, a, dest)
}
func TestSameVersionPresentationRefreshLifecycle(t *testing.T) {
	s, ts, c := fixtureServer(t)
	g := &refreshGitHub{fakeGitHub: &fakeGitHub{fixturePack(t, "")}}
	s.github = g
	parent := Record{ID: newID(), Repository: "alice/pet", Tag: "v1", AssetName: "test.petpack"}
	s.validate(context.Background(), parent)
	s.store.get("records", parent.ID, &parent)
	if parent.Status != "approved" {
		t.Fatal(parent.Error)
	}
	baseline := g.downloads
	if err := s.detectPresentationRefresh(context.Background(), parent, nil); err != nil {
		t.Fatal(err)
	}
	all, _ := s.store.records()
	if len(all) != 1 {
		t.Fatal("unchanged automatically queued")
	}
	status, body := call(t, c, ts.URL, "POST", "/api/submissions", map[string]string{"repository": "alice/pet", "tag": "v1", "assetName": "test.petpack"})
	if status != 202 {
		t.Fatalf("%d %s", status, body)
	}
	var receipt struct {
		ID string `json:"id"`
	}
	json.Unmarshal(body, &receipt)
	var task Record
	s.store.get("records", receipt.ID, &task)
	repeated, added, err := s.queuePresentationRefresh(parent, nil, "manual", false)
	if err != nil || added || repeated.ID != task.ID {
		t.Fatal("pending refresh not deduplicated", err)
	}
	s.validate(context.Background(), task)
	if g.downloads != baseline {
		t.Fatal("unchanged metadata downloaded attachment")
	}
	g.name = "更新后的名称"
	if err := s.detectPresentationRefresh(context.Background(), parent, nil); err != nil {
		t.Fatal(err)
	}
	all, _ = s.store.records()
	for _, a := range all {
		if a.Status == "queued" {
			task = a
		}
	}
	var before Record
	s.store.get("records", parent.ID, &before)
	if before.Pet.Name != parent.Pet.Name || before.Status != "approved" {
		t.Fatal("parent changed before validation")
	}
	s.validate(context.Background(), task)
	var updated Record
	s.store.get("records", parent.ID, &updated)
	if updated.Pet.Name != g.name || updated.ID != parent.ID || updated.PreviewKey != task.ID || updated.Status != "approved" {
		t.Fatalf("refresh not applied: %+v", updated)
	}
	code, _ := call(t, c, ts.URL, "GET", "/api/versions/"+parent.ID+"/preview/cover.png", nil)
	if code != 200 {
		t.Fatal("refreshed preview unavailable")
	}
	g.invalid = true
	bad, _, err := s.queuePresentationRefresh(updated, nil, "manual", false)
	if err != nil {
		t.Fatal(err)
	}
	s.validate(context.Background(), bad)
	s.store.get("records", bad.ID, &bad)
	s.store.get("records", parent.ID, &before)
	if bad.Status != "failed" || before.PreviewKey != updated.PreviewKey || before.Status != "approved" {
		t.Fatal("failed refresh changed published snapshot")
	}
	g.invalid = false
	cancelled, _, _ := s.queuePresentationRefresh(updated, nil, "manual", false)
	if err := s.store.review(parent.ID, "admin", "unpublish", "test"); err != nil {
		t.Fatal(err)
	}
	s.validate(context.Background(), cancelled)
	s.store.get("records", parent.ID, &before)
	if before.Status != "unpublished" {
		t.Fatal("refresh restored unpublished record")
	}
}

func TestDailyDiscoveryQueuesSameVersionNewRelease(t *testing.T) {
	s, _, _ := fixtureServer(t)
	g := multiFixture(t)
	g.works = g.works[:1]
	s.github = g
	if err := s.discoverUpdates(context.Background(), "alice/pet"); err != nil {
		t.Fatal(err)
	}
	all, _ := s.store.records()
	s.validate(context.Background(), all[0])
	var parent Record
	s.store.get("records", all[0].ID, &parent)
	g.works[0].Tag = "metadata-update"
	if err := s.discoverUpdates(context.Background(), "alice/pet"); err != nil {
		t.Fatal(err)
	}
	if err := s.discoverUpdates(context.Background(), "alice/pet"); err != nil {
		t.Fatal(err)
	}
	all, _ = s.store.records()
	if len(all) != 2 {
		t.Fatalf("refresh was not deduplicated: %d", len(all))
	}
	for _, a := range all {
		if a.RefreshOf == parent.ID {
			s.validate(context.Background(), a)
		}
	}
	s.store.get("records", parent.ID, &parent)
	if parent.Tag != "metadata-update" || parent.Status != "approved" {
		t.Fatalf("new release reference was not applied: %+v", parent)
	}
}

type latestRefreshGitHub struct{ *refreshGitHub }

func (g latestRefreshGitHub) Resolve(ctx context.Context, repo, tag, name string) (Asset, error) {
	if tag == "" {
		tag = "v2"
		name = "test.petpack"
	}
	return g.refreshGitHub.Resolve(ctx, repo, tag, name)
}
func TestLegacySameVersionNewRelease(t *testing.T) {
	for _, manual := range []bool{true, false} {
		t.Run(map[bool]string{true: "manual", false: "daily"}[manual], func(t *testing.T) {
			s, ts, c := fixtureServer(t)
			g := latestRefreshGitHub{&refreshGitHub{fakeGitHub: &fakeGitHub{fixturePack(t, "")}}}
			s.github = g
			parent := Record{ID: newID(), Repository: "alice/pet", Tag: "v1", AssetName: "test.petpack"}
			s.validate(context.Background(), parent)
			if manual {
				code, body := call(t, c, ts.URL, "POST", "/api/submissions", map[string]string{"repository": "alice/pet"})
				if code != 202 {
					t.Fatalf("%d %s", code, body)
				}
			} else {
				if err := s.discoverUpdates(context.Background(), "alice/pet"); err != nil {
					t.Fatal(err)
				}
			}
			all, _ := s.store.records()
			if len(all) != 2 {
				t.Fatal(len(all))
			}
			for _, a := range all {
				if a.RefreshOf == parent.ID {
					if a.Work != nil {
						t.Fatal("legacy refresh became an indexed work")
					}
					s.validate(context.Background(), a)
				}
			}
			s.store.get("records", parent.ID, &parent)
			if parent.Tag != "v2" || parent.Status != "approved" {
				t.Fatalf("%+v", parent)
			}
		})
	}
}
