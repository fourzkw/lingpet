package main

import (
	"archive/zip"
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"image/png"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"unicode/utf16"
)

const maxPackage int64 = 200 << 20
const maxExpanded uint64 = 512 << 20
const maxFile uint64 = 64 << 20
const maxPixels = 16 * 1024 * 1024

var states = []string{"idle", "thinking", "working", "input", "approval", "done", "error", "sleep"}
var packageID = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{2,63}$`)
var semver = regexp.MustCompile(`^\d+\.\d+\.\d+$`)
var packageFile = regexp.MustCompile(`^(pet\.json|manifest\.json|cover\.png|(?:original/)?sprites/(?:idle|thinking|working|input|approval|done|error|sleep|click|pet)\.png)$`)

type Pack struct {
	Pet      Pet
	Manifest Manifest
	Files    map[string][]byte
	Hash     string
	Size     int64
}

func parsePack(file string) (*Pack, error) {
	stat, e := os.Stat(file)
	if e != nil || stat.Size() > maxPackage {
		return nil, errors.New("资源包大小超限")
	}
	raw, e := os.ReadFile(file)
	if e != nil {
		return nil, e
	}
	digest := sha256.Sum256(raw)
	reader, e := zip.NewReader(bytes.NewReader(raw), int64(len(raw)))
	if e != nil {
		return nil, e
	}
	if len(reader.File) > 40 {
		return nil, errors.New("资源包文件过多")
	}
	p := &Pack{Files: map[string][]byte{}, Hash: hex.EncodeToString(digest[:]), Size: int64(len(raw))}
	var total uint64
	for _, f := range reader.File {
		if !packageFile.MatchString(f.Name) || f.Mode()&os.ModeSymlink != 0 || f.Flags&1 != 0 || f.UncompressedSize64 > maxFile {
			return nil, errors.New("存在非法或超限文件")
		}
		if _, ok := p.Files[f.Name]; ok {
			return nil, errors.New("文件名重复")
		}
		total += f.UncompressedSize64
		if total > maxExpanded {
			return nil, errors.New("解压体积超限")
		}
		if filepath.Ext(f.Name) == ".json" && f.UncompressedSize64 > 65536 {
			return nil, errors.New("JSON 过大")
		}
		r, e := f.Open()
		if e != nil {
			return nil, e
		}
		b, e := io.ReadAll(io.LimitReader(r, int64(f.UncompressedSize64)+1))
		r.Close()
		if e != nil || uint64(len(b)) != f.UncompressedSize64 {
			return nil, errors.New("ZIP 数据或校验损坏")
		}
		p.Files[f.Name] = b
	}
	if e = json.Unmarshal(p.Files["pet.json"], &p.Pet); e != nil {
		return nil, e
	}
	m := p.Pet
	if m.FormatVersion != 1 || !packageID.MatchString(m.ID) || (!semver.MatchString(m.Version) || len(m.Version) > 32) || (m.MinAppVersion != "0.4.0" && m.MinAppVersion != "0.4.9" && m.MinAppVersion != "0.5.0") || !field(m.Name, 40) || !field(m.Author, 100) || !field(m.License, 200) || len(utf16.Encode([]rune(m.Description))) > 2000 {
		return nil, errors.New("无效作品信息或格式版本")
	}
	if e = json.Unmarshal(p.Files["manifest.json"], &p.Manifest); e != nil {
		return nil, e
	}
	var manifestRaw struct {
		Clips map[string]map[string]json.RawMessage
	}
	if e = json.Unmarshal(p.Files["manifest.json"], &manifestRaw); e != nil {
		return nil, e
	}
	for state := range p.Manifest.Clips {
		if value, ok := manifestRaw.Clips[state]["loop"]; !ok || (string(bytes.TrimSpace(value)) != "true" && string(bytes.TrimSpace(value)) != "false") {
			return nil, errors.New("缺少 loop 字段")
		}
	}
	if e = validateManifest(p.Manifest); e != nil {
		return nil, e
	}
	expected := map[string]bool{"pet.json": true, "manifest.json": true, "cover.png": true}
	if _, e = decodePNG(p.Files["cover.png"], true); e != nil {
		return nil, e
	}
	for state := range p.Manifest.Clips {
		c := p.Manifest.Clips[state]
		for _, v := range p.Manifest.Variants {
			tile := p.Manifest.TileSize
			name := c.File
			if v == "original" {
				tile = p.Manifest.Original.TileSize
				name = "original/" + name
			}
			expected[name] = true
			im, e := decodePNG(p.Files[name], false)
			if e != nil {
				return nil, fmt.Errorf("%s: %w", name, e)
			}
			if im.Bounds().Dx() != p.Manifest.Columns*tile || im.Bounds().Dy() != ((c.SourceFrames+p.Manifest.Columns-1)/p.Manifest.Columns)*tile {
				return nil, errors.New("图集尺寸与清单不符")
			}
		}
	}
	if len(expected) != len(p.Files) {
		return nil, errors.New("存在清单外资源")
	}
	return p, nil
}
func field(s string, max int) bool {
	return strings.TrimSpace(s) != "" && len(utf16.Encode([]rune(s))) <= max
}
func validateManifest(m Manifest) error {
	if m.SchemaVersion != 1 || m.Columns < 1 || m.Columns > 16 || len(m.Variants) < 1 || len(m.Variants) > 2 || len(m.Clips) < 8 || len(m.Clips) > 10 {
		return errors.New("无效图集清单")
	}
	seen := map[string]bool{}
	for _, v := range m.Variants {
		if seen[v] || (v != "original" && v != "pixel") {
			return errors.New("无效显示版本")
		}
		seen[v] = true
		if v == "original" && (m.Original == nil || m.Original.Directory != "original/") {
			return errors.New("无效原图目录")
		}
	}
	for _, s := range states {
		if _, ok := m.Clips[s]; !ok {
			return errors.New("缺少会话动作")
		}
	}
	for s := range m.Clips {
		known := s == "click" || s == "pet"
		for _, state := range states {
			if state == s {
				known = true
			}
		}
		if !known || ((s == "click" || s == "pet") && m.Clips[s].Loop) {
			return errors.New("无效互动动作")
		}
		c, ok := m.Clips[s]
		if !ok || c.File != "sprites/"+s+".png" || c.SourceFrames < 1 || c.SourceFrames > 128 || len(c.Frames) < 1 || len(c.Frames) > 256 || len(c.Frames) != len(c.Durations) || c.LoopFrom < 0 || c.LoopFrom >= len(c.Frames) {
			return errors.New("动作不完整或时序错误")
		}
		for i, f := range c.Frames {
			if f < 0 || f >= c.SourceFrames || c.Durations[i] < 1 || c.Durations[i] > 10000 {
				return errors.New("动作帧或时长无效")
			}
		}
		for _, v := range m.Variants {
			tile := m.TileSize
			if v == "original" {
				tile = m.Original.TileSize
			}
			if tile < 16 || tile > 512 || m.Columns*tile*((c.SourceFrames+m.Columns-1)/m.Columns)*tile > maxPixels {
				return errors.New("图集像素超限")
			}
		}
	}
	return nil
}
func decodePNG(b []byte, cover bool) (image.Image, error) {
	if len(b) < 33 || !bytes.Equal(b[:8], []byte{137, 80, 78, 71, 13, 10, 26, 10}) || b[24] != 8 || b[25] != 6 || b[28] != 0 {
		return nil, errors.New("需要非交错 8bit RGBA PNG")
	}
	c, e := png.DecodeConfig(bytes.NewReader(b))
	if e != nil {
		return nil, e
	}
	limit := maxPixels
	if cover {
		limit = 1024 * 1024
	}
	if c.Width < 1 || c.Height < 1 || int64(c.Width)*int64(c.Height) > int64(limit) {
		return nil, errors.New("PNG 像素超限")
	}
	return png.Decode(bytes.NewReader(b))
}
func previewPack(p *Pack, directory string) (*Manifest, error) {
	if e := os.MkdirAll(directory, 0700); e != nil {
		return nil, e
	}
	clone, _ := json.Marshal(p.Manifest)
	var m Manifest
	json.Unmarshal(clone, &m)
	m.TileSize = 96
	if m.Original != nil {
		m.Original.TileSize = 96
	}
	cover, e := decodePNG(p.Files["cover.png"], true)
	if e != nil {
		return nil, e
	}
	if e = writePNG(filepath.Join(directory, "cover.png"), cover); e != nil {
		return nil, e
	}
	for state := range p.Manifest.Clips {
		c := p.Manifest.Clips[state]
		for _, v := range p.Manifest.Variants {
			tile := p.Manifest.TileSize
			name := c.File
			if v == "original" {
				tile = p.Manifest.Original.TileSize
				name = "original/" + name
			}
			src, e := decodePNG(p.Files[name], false)
			if e != nil {
				return nil, e
			}
			dst := image.NewNRGBA(image.Rect(0, 0, m.Columns*96, ((c.SourceFrames+m.Columns-1)/m.Columns)*96))
			for f := 0; f < c.SourceFrames; f++ {
				sx, sy := f%p.Manifest.Columns*tile, f/p.Manifest.Columns*tile
				dx, dy := f%m.Columns*96, f/m.Columns*96
				for y := 0; y < 96; y++ {
					for x := 0; x < 96; x++ {
						dst.Set(dx+x, dy+y, src.At(sx+x*tile/96, sy+y*tile/96))
					}
				}
			}
			if e = writePNG(filepath.Join(directory, filepath.FromSlash(name)), dst); e != nil {
				return nil, e
			}
		}
	}
	return &m, nil
}
func writePNG(file string, im image.Image) error {
	if e := os.MkdirAll(filepath.Dir(file), 0700); e != nil {
		return e
	}
	f, e := os.OpenFile(file, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if e != nil {
		return e
	}
	e = png.Encode(f, im)
	closeErr := f.Close()
	if e != nil {
		return e
	}
	return closeErr
}
