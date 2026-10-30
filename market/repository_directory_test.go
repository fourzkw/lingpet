package main

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// Optional integration check against repositories generated from real exported packages.
type directoryGitHub struct {
	root  string
	works []RepositoryPet
}

func (g directoryGitHub) Resolve(_ context.Context, repo, tag, name string) (Asset, error) {
	info, e := os.Stat(filepath.Join(g.root, "release-assets", name))
	if e != nil {
		return Asset{}, e
	}
	return Asset{RepoID: 42, Tag: tag, Name: name, Size: info.Size(), URL: "https://github.com/alice/pets/releases/download/" + tag + "/" + name}, nil
}
func (g directoryGitHub) Presentation(ctx context.Context, repo, tag string) (Pet, []byte, error) {
	return g.PresentationAt(ctx, repo, tag, "")
}
func (g directoryGitHub) PresentationAt(_ context.Context, _, _, directory string) (Pet, []byte, error) {
	var pet Pet
	raw, e := os.ReadFile(filepath.Join(g.root, directory, "pet.json"))
	if e != nil {
		return pet, nil, e
	}
	if e = json.Unmarshal(raw, &pet); e != nil {
		return pet, nil, e
	}
	cover, e := os.ReadFile(filepath.Join(g.root, directory, "previews/cover.png"))
	return pet, cover, e
}
func (g directoryGitHub) Download(_ context.Context, a Asset, dest string) error {
	raw, e := os.ReadFile(filepath.Join(g.root, "release-assets", a.Name))
	if e != nil {
		return e
	}
	return os.WriteFile(dest, raw, 0600)
}

func TestGeneratedRepositoryRealPackages(t *testing.T) {
	root := os.Getenv("LINGPET_REPOSITORY_FIXTURE")
	if root == "" {
		t.Skip("set LINGPET_REPOSITORY_FIXTURE to a generated repository directory")
	}
	raw, e := os.ReadFile(filepath.Join(root, "lingpet-index.json"))
	if e != nil {
		t.Fatal(e)
	}
	var index struct{ Pets []RepositoryPet }
	if e = json.Unmarshal(raw, &index); e != nil {
		t.Fatal(e)
	}
	if len(index.Pets) == 0 {
		t.Fatal("empty repository")
	}
	s, _, _ := fixtureServer(t)
	s.github = directoryGitHub{root: root, works: index.Pets}
	for _, work := range index.Pets {
		a := Record{ID: newID(), Repository: "alice/pets", Tag: work.Tag, AssetName: work.AssetName, Work: &work, Status: "queued"}
		s.store.put("records", a.ID, a)
		s.validate(context.Background(), a)
		s.store.get("records", a.ID, &a)
		if a.Status != "approved" {
			t.Fatalf("%s: %s", work.ID, a.Error)
		}
		t.Logf("validated %s %s", work.ID, work.Version)
	}
	records, _ := s.store.records()
	if len(latestPets(records)) != len(index.Pets) {
		t.Fatal("same-repository pets were merged")
	}
}
