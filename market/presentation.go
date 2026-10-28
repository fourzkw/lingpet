package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
)

// Read fixed, small files through GitHub's Contents API. Never fetch the petpack.
func (g *githubClient) repositoryFile(ctx context.Context, repo, tag, file string, limit int) ([]byte, error) {
	var entry struct {
		Type     string
		Size     int
		Encoding string
		Content  string
	}
	if e := g.get(ctx, "/repos/"+repo+"/contents/"+file+"?ref="+url.QueryEscape(tag), &entry); e != nil {
		return nil, fmt.Errorf("读取仓库 %s: %w", file, e)
	}
	if entry.Type != "file" || entry.Size < 1 || entry.Size > limit || entry.Encoding != "base64" || len(entry.Content) > limit*2 {
		return nil, errors.New("仓库展示文件格式无效或体积超限: " + file)
	}
	b, e := base64.StdEncoding.DecodeString(entry.Content)
	if e != nil {
		return nil, e
	}
	if len(b) > limit || len(b) != entry.Size {
		return nil, errors.New("仓库展示文件大小不符")
	}
	return b, nil
}
func (g *githubClient) Presentation(ctx context.Context, repo, tag string) (Pet, []byte, error) {
	var pet Pet
	b, e := g.repositoryFile(ctx, repo, tag, "pet.json", 32<<10)
	if e != nil {
		return pet, nil, e
	}
	if e = json.Unmarshal(b, &pet); e != nil {
		return pet, nil, e
	}
	cover, e := g.repositoryFile(ctx, repo, tag, "previews/cover.png", 1<<20)
	return pet, cover, e
}
