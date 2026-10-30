package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path"
	"strings"
)

const maxRepositoryPets = 20

type RepositoryPet struct {
	ID        string `json:"id"`
	Version   string `json:"version"`
	Path      string `json:"path"`
	Tag       string `json:"tag"`
	AssetName string `json:"assetName"`
	SHA256    string `json:"sha256,omitempty"`
}

func (p RepositoryPet) validate() error {
	if !packageID.MatchString(p.ID) || !semver.MatchString(p.Version) || len(p.Version) > 32 || !field(p.Tag, 100) || !field(p.AssetName, 120) || path.Base(p.AssetName) != p.AssetName || strings.ContainsAny(p.AssetName, "\\\x00") || !strings.HasSuffix(p.AssetName, ".petpack") {
		return errors.New("索引中的作品 ID、版本、标签或附件名无效")
	}
	if len(p.Path) > 200 || !strings.HasPrefix(p.Path, "pets/") || path.Clean(p.Path) != p.Path || strings.ContainsAny(p.Path, "\\%?#\x00") || strings.Contains(p.Path, "..") {
		return errors.New("索引中的作品目录必须是 pets/ 下的相对目录")
	}
	return nil
}

// The index is read from the latest formal release tag, never from a moving default branch.
func (g *githubClient) Discover(ctx context.Context, repo string) ([]RepositoryPet, error) {
	var release struct {
		Tag               string `json:"tag_name"`
		Draft, Prerelease bool
	}
	if e := g.get(ctx, "/repos/"+repo+"/releases/latest", &release); e != nil {
		return nil, e
	}
	if release.Draft || release.Prerelease || release.Tag == "" {
		return nil, errors.New("请提交正式公开 Release")
	}
	raw, e := g.repositoryFile(ctx, repo, release.Tag, "lingpet-index.json", 128<<10)
	if errors.Is(e, errGitHubNotFound) {
		return nil, nil
	}
	if e != nil {
		return nil, e
	}
	var index struct {
		SchemaVersion int             `json:"schemaVersion"`
		Pets          []RepositoryPet `json:"pets"`
	}
	if e = json.Unmarshal(raw, &index); e != nil {
		return nil, fmt.Errorf("仓库索引格式无效: %w", e)
	}
	if index.SchemaVersion != 1 || len(index.Pets) == 0 || len(index.Pets) > maxRepositoryPets {
		return nil, errors.New("仓库索引需要 schemaVersion=1，且包含 1 至 20 个作品")
	}
	return index.Pets, nil
}

func (g *githubClient) PresentationAt(ctx context.Context, repo, tag, directory string) (Pet, []byte, error) {
	var pet Pet
	raw, e := g.repositoryFile(ctx, repo, tag, directory+"/pet.json", 32<<10)
	if e != nil {
		return pet, nil, e
	}
	if e = json.Unmarshal(raw, &pet); e != nil {
		return pet, nil, e
	}
	cover, e := g.repositoryFile(ctx, repo, tag, directory+"/previews/cover.png", 1<<20)
	return pet, cover, e
}

// Stream to a temporary file with both advertised and actual size bounds.
func (g *githubClient) Download(ctx context.Context, asset Asset, destination string) error {
	if !githubURL(asset.URL) || asset.Size < 1 || asset.Size > maxPackage {
		return errors.New("附件地址或体积无效")
	}
	req, e := http.NewRequestWithContext(ctx, "GET", asset.URL, nil)
	if e != nil {
		return e
	}
	req.Header.Set("User-Agent", "LingPet-Market")
	client := *g.client
	client.CheckRedirect = func(next *http.Request, via []*http.Request) error {
		next.Header.Del("Authorization")
		if len(via) > 5 || !githubURL(next.URL.String()) {
			return errors.New("拒绝非 GitHub 下载重定向")
		}
		return nil
	}
	response, e := client.Do(req)
	if e != nil {
		return e
	}
	defer response.Body.Close()
	if response.StatusCode != 200 || response.ContentLength > maxPackage {
		return errors.New("GitHub 附件下载失败或体积超限")
	}
	file, e := os.OpenFile(destination, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if e != nil {
		return e
	}
	n, e := io.Copy(file, io.LimitReader(response.Body, maxPackage+1))
	closeError := file.Close()
	if e != nil {
		return e
	}
	if closeError != nil {
		return closeError
	}
	if n != asset.Size || n > maxPackage {
		return errors.New("附件实际大小与 Release 信息不符")
	}
	return nil
}
