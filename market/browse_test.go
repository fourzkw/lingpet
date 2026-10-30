package main

import (
	"net/url"
	"testing"
	"time"
)

func TestBrowseCombinesFiltersAndOnlyShowsLatestIdentity(t *testing.T) {
	now := time.Now().UTC()
	base := Record{ID: "fox", Repository: "alice/collection", Status: "approved", Pet: &Pet{ID: "fox", Name: "Fox", Version: "1.0.0", Character: &Character{ID: "forest-role", Name: "Forest"}}, Updated: now, Preview: &Manifest{Variants: []string{"original", "pixel"}, Clips: map[string]Clip{"click": {}, "pet": {}}}}
	old := base
	old.ID = "old"
	old.Pet = &Pet{ID: "fox", Version: "0.9.0"}
	other := base
	other.ID = "cat"
	other.Pet = &Pet{ID: "cat", Name: "Cat", Version: "1.0.0"}
	other.Preview = &Manifest{Variants: []string{"pixel"}, Clips: map[string]Clip{}}
	all := []Record{base, old, other}
	for _, search := range []string{"fox", "FOREST", "alice/collection"} {
		q := url.Values{"q": {search}, "style": {"both"}, "interaction": {"both"}, "recent": {"7"}}
		rows := filterPets(all, q, now)
		if len(rows) != 1 || rows[0].ID != "fox" {
			t.Fatalf("combined filters failed for %s: %+v", search, rows)
		}
	}
	base.Updated = now.Add(-8 * 24 * time.Hour)
	if len(filterPets([]Record{base}, url.Values{"recent": {"7"}}, now)) != 0 {
		t.Fatal("old publication included")
	}
	newest := base
	newest.ID = "newest"
	newest.Pet = &Pet{ID: "fox", Version: "2.0.0"}
	newest.Preview = other.Preview
	if len(filterPets([]Record{base, newest}, url.Values{"style": {"both"}}, now)) != 0 {
		t.Fatal("historical matching version resurfaced")
	}
}

func TestBrowseOrdersMissingStatsLastAndUsesStableTies(t *testing.T) {
	now := time.Now().UTC()
	rows := []Record{{ID: "unknown", Pet: &Pet{Name: "Z"}, Updated: now}, {ID: "zero", Pet: &Pet{Name: "A"}, Size: 40, Stats: &PetStats{}, Updated: now.Add(-time.Hour)}, {ID: "popular", Pet: &Pet{Name: "B"}, Size: 10, Stats: &PetStats{Downloads: 100, Stars: 20}, Updated: now.Add(-2 * time.Hour)}}
	for order, first := range map[string]string{"updated": "unknown", "downloads": "popular", "stars": "popular", "name": "zero", "size": "popular"} {
		copyRows := append([]Record{}, rows...)
		sortPets(copyRows, order)
		if copyRows[0].ID != first {
			t.Fatalf("%s starts with %s", order, copyRows[0].ID)
		}
		if (order == "downloads" || order == "stars" || order == "size") && copyRows[2].ID != "unknown" {
			t.Fatal("missing values not last")
		}
	}
	ties := []Record{{ID: "b", Pet: &Pet{Name: "Same"}}, {ID: "a", Pet: &Pet{Name: "Same"}}}
	sortPets(ties, "name")
	if ties[0].ID != "a" {
		t.Fatal("unstable ties")
	}
}

func TestBrowseRejectsUnknownOptions(t *testing.T) {
	_, ts, c := fixtureServer(t)
	for _, query := range []string{"sort=bogus", "style=script", "recent=-1", "interaction=unknown"} {
		status, _ := call(t, c, ts.URL, "GET", "/api/pets?"+query, nil)
		if status != 400 {
			t.Fatal(query, status)
		}
	}
}
