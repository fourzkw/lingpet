package main

import (
	"bytes"
	"context"
	"encoding/json"
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"testing"
)

type displayGitHub struct {
	*fakeGitHub
	edit  func(*Pet)
	cover []byte
}

func (g displayGitHub) Presentation(ctx context.Context, repo, tag string) (Pet, []byte, error) {
	p, c, e := g.fakeGitHub.Presentation(ctx, repo, tag)
	if g.edit != nil {
		g.edit(&p)
	}
	if g.cover != nil {
		c = g.cover
	}
	return p, c, e
}

func TestMarketDisplayMetadataAndCoverCanDifferFromPackage(t *testing.T) {
	for _, kind := range []string{"display", "id", "version", "role", "missing-role"} {
		t.Run(kind, func(t *testing.T) {
			s, _, _ := fixtureServer(t)
			raw := rewritePack(t, fixturePack(t, ""), func(files map[string][]byte) {
				var p Pet
				json.Unmarshal(files["pet.json"], &p)
				p.Character = &Character{ID: "fox-role", Name: "包内角色"}
				files["pet.json"], _ = json.Marshal(p)
				var m Manifest
				json.Unmarshal(files["manifest.json"], &m)
				m.Character = p.Character.ID
				files["manifest.json"], _ = json.Marshal(m)
			})
			im := image.NewNRGBA(image.Rect(0, 0, 64, 48))
			im.Set(2, 2, color.NRGBA{255, 40, 50, 180})
			var out bytes.Buffer
			if e := png.Encode(&out, im); e != nil {
				t.Fatal(e)
			}
			s.github = displayGitHub{fakeGitHub: &fakeGitHub{raw}, cover: out.Bytes(), edit: func(p *Pet) {
				p.Name = "市场宣传名称"
				p.Description = "市场介绍"
				p.Character.Name = "市场角色名"
				p.Character.Description = "市场角色介绍"
				switch kind {
				case "id":
					p.ID = "different-pet"
				case "version":
					p.Version = "2.0.0"
				case "role":
					p.Character.ID = "other-role"
				case "missing-role":
					p.Character = nil
				}
			}}
			a := Record{ID: newID(), Repository: "alice/pet", Tag: "v1", AssetName: "test.petpack"}
			e := s.validateInner(context.Background(), &a)
			if kind != "display" {
				if e == nil {
					t.Fatal("identity mismatch accepted")
				}
				return
			}
			if e != nil {
				t.Fatal(e)
			}
			if a.Pet.Name != "市场宣传名称" || a.Pet.Character.Name != "市场角色名" {
				t.Fatal("repository display metadata not used")
			}
			saved, e := os.ReadFile(filepath.Join(s.cfg.DataDir, "previews", a.ID, "cover.png"))
			if e != nil {
				t.Fatal(e)
			}
			cover, e := decodePNG(saved, true)
			if e != nil || cover.Bounds() != im.Bounds() {
				t.Fatal("promotional cover not preserved", e)
			}
		})
	}
}
