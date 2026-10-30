package main

import (
	"context"
	"encoding/json"
	"net/url"
	"testing"
	"time"
)

func TestMarketAuthorDefaultsToRepositoryOwnerWithoutMutatingMetadata(t *testing.T) {
	a := Record{Repository: "old-owner/pets", Source: &Asset{Owner: "fourzkw"}, Pet: &Pet{Author: "LingPet"}}
	if got := marketPresentation(a); got.Pet.Author != "fourzkw" {
		t.Fatal(got.Pet.Author)
	}
	if a.Pet.Author != "LingPet" {
		t.Fatal("original author overwritten")
	}
	a.Source = nil
	a.Repository = "https://github.com/pet-org/pets"
	if got := marketPresentation(a); got.Pet.Author != "pet-org" {
		t.Fatal("legacy repository owner not used")
	}
	a.Repository = "invalid"
	if got := marketPresentation(a); got.Pet.Author != "LingPet" {
		t.Fatal("invalid repository erased author")
	}
}

func TestExistingMarketAuthorConsistentAcrossEndpoints(t *testing.T) {
	s, ts, c := fixtureServer(t)
	a := Record{ID: newID(), Repository: "fourzkw/fourzkw_pets", Status: "approved", Source: &Asset{RepoID: 42, Owner: "fourzkw", URL: "https://github.com/fourzkw/fourzkw_pets/releases/download/v1/pet.petpack"}, Pet: &Pet{ID: "fox", Name: "Fox", Version: "1.0.0", Author: "LingPet"}}
	if err := s.store.put("records", a.ID, a); err != nil {
		t.Fatal(err)
	}
	for _, route := range []string{"/api/pets?q=fourzkw", "/api/versions/" + a.ID, "/api/versions/" + a.ID + "/history", "/api/versions/" + a.ID + "/install"} {
		status, raw := call(t, c, ts.URL, "GET", route, nil)
		if status != 200 {
			t.Fatal(route, status)
		}
		var records []Record
		if route == "/api/pets?q=fourzkw" || route == "/api/versions/"+a.ID+"/history" {
			if err := json.Unmarshal(raw, &records); err != nil {
				t.Fatal(err)
			}
		} else {
			var item Record
			if err := json.Unmarshal(raw, &item); err != nil {
				t.Fatal(err)
			}
			records = []Record{item}
		}
		if len(records) != 1 || records[0].Pet.Author != "fourzkw" {
			t.Fatalf("%s: %s", route, raw)
		}
	}
	var saved Record
	s.store.get("records", a.ID, &saved)
	if saved.Pet.Author != "LingPet" {
		t.Fatal("stored historical metadata changed")
	}
	if len(filterPets([]Record{a}, url.Values{"q": {"LingPet"}}, time.Now())) != 1 {
		t.Fatal("original author no longer searchable")
	}
}

func TestRepositoryMetadataAuthorMayBeOmitted(t *testing.T) {
	s, _, _ := fixtureServer(t)
	s.github = displayGitHub{fakeGitHub: s.github.(*fakeGitHub), edit: func(p *Pet) { p.Author = "" }}
	a := Record{ID: newID(), Repository: "alice/pet", Tag: "v1", AssetName: "test.petpack"}
	if err := s.validateInner(context.Background(), &a); err != nil {
		t.Fatal(err)
	}
	if a.Pet.Author != "alice" {
		t.Fatal("missing author did not default to repository owner")
	}
}
