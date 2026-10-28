package main

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"testing"
)

func TestInteractionPackageAndPreview(t *testing.T) {
	base := fixturePack(t, "")
	reader, err := zip.NewReader(bytes.NewReader(base), int64(len(base)))
	if err != nil {
		t.Fatal(err)
	}
	files := map[string][]byte{}
	for _, f := range reader.File {
		r, e := f.Open()
		if e != nil {
			t.Fatal(e)
		}
		files[f.Name], e = io.ReadAll(r)
		r.Close()
		if e != nil {
			t.Fatal(e)
		}
	}
	var m Manifest
	json.Unmarshal(files["manifest.json"], &m)
	for _, state := range []string{"click", "pet"} {
		c := m.Clips["done"]
		c.File = "sprites/" + state + ".png"
		c.Loop = false
		m.Clips[state] = c
		files[c.File] = files["sprites/done.png"]
		files["original/"+c.File] = files["original/sprites/done.png"]
	}
	var pet Pet
	json.Unmarshal(files["pet.json"], &pet)
	pet.MinAppVersion = "0.5.0"
	files["manifest.json"], _ = json.Marshal(m)
	files["pet.json"], _ = json.Marshal(pet)
	var out bytes.Buffer
	z := zip.NewWriter(&out)
	for name, b := range files {
		w, e := z.Create(name)
		if e != nil {
			t.Fatal(e)
		}
		w.Write(b)
	}
	z.Close()
	root := t.TempDir()
	file := filepath.Join(root, "test.petpack")
	os.WriteFile(file, out.Bytes(), 0600)
	pack, e := parsePack(file)
	if e != nil {
		t.Fatal(e)
	}
	preview, e := previewPack(pack, filepath.Join(root, "preview"))
	if e != nil {
		t.Fatal(e)
	}
	if len(preview.Clips) != 10 {
		t.Fatal("lost interaction clips")
	}
	if _, e = os.Stat(filepath.Join(root, "preview", "sprites", "pet.png")); e != nil {
		t.Fatal(e)
	}
	clip := m.Clips["pet"]
	clip.Loop = true
	m.Clips["pet"] = clip
	if validateManifest(m) == nil {
		t.Fatal("looping interaction accepted")
	}
}
