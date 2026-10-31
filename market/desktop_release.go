package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"
)

const (
	desktopRepository     = "fourzkw/lingpet"
	desktopManifestName   = "release.json"
	desktopReleaseTTL     = 15 * time.Minute
	desktopReleaseTimeout = 25 * time.Second
	desktopInstallerLimit = 512 << 20
)

var (
	desktopVersionPattern   = regexp.MustCompile(`^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$`)
	desktopInstallerPattern = regexp.MustCompile(`^LingPet-Setup-[0-9A-Za-z._-]+\.exe$`)
	desktopDigestPattern    = regexp.MustCompile(`^[a-f0-9]{64}$`)
)

// desktopRelease is the published Windows installer the site links to and the
// desktop app checks against. The URL always points at a GitHub Release asset,
// so downloads go straight to GitHub without a Release page in between.
type desktopRelease struct {
	Version     string `json:"version"`
	FileName    string `json:"fileName"`
	URL         string `json:"url"`
	Bytes       int64  `json:"bytes"`
	SHA256      string `json:"sha256"`
	PublishedAt string `json:"publishedAt"`
	Notes       string `json:"notes"`
	ReleaseURL  string `json:"releaseURL"`
}

type desktopAsset struct {
	Name  string `json:"name"`
	State string `json:"state"`
	Size  int64  `json:"size"`
	URL   string `json:"browser_download_url"`
}

type desktopRemoteRelease struct {
	Draft       bool          `json:"draft"`
	Prerelease  bool          `json:"prerelease"`
	Tag         string        `json:"tag_name"`
	Body        string        `json:"body"`
	PublishedAt time.Time     `json:"published_at"`
	Assets      []desktopAsset `json:"assets"`
}

type desktopManifest struct {
	Format     int    `json:"format"`
	Version    string `json:"version"`
	Setup      string `json:"setup"`
	SHA256     string `json:"sha256"`
	Bytes      int64  `json:"bytes"`
	CodeSigned bool   `json:"codeSigned"`
}

// latestDesktopRelease resolves the newest formal release into a download that
// anyone can follow without visiting the GitHub Release page.
func (g *githubClient) latestDesktopRelease(ctx context.Context) (desktopRelease, error) {
	var remote desktopRemoteRelease
	if e := g.get(ctx, "/repos/"+desktopRepository+"/releases/latest", &remote); e != nil {
		return desktopRelease{}, e
	}
	if remote.Draft || remote.Prerelease {
		return desktopRelease{}, errors.New("最新 Release 尚未正式发布")
	}
	var installer, manifest *desktopAsset
	for i := range remote.Assets {
		asset := &remote.Assets[i]
		if asset.State != "uploaded" {
			continue
		}
		if desktopInstallerPattern.MatchString(asset.Name) {
			installer = asset
		}
		if asset.Name == desktopManifestName {
			manifest = asset
		}
	}
	if installer == nil {
		return desktopRelease{}, errors.New("最新 Release 缺少 LingPet-Setup 安装程序")
	}
	if manifest == nil {
		return desktopRelease{}, errors.New("最新 Release 缺少 release.json 更新清单")
	}
	if !githubURL(installer.URL) {
		return desktopRelease{}, errors.New("安装程序不是 GitHub 资产地址")
	}
	if installer.Size <= 0 || installer.Size > desktopInstallerLimit {
		return desktopRelease{}, errors.New("安装程序体积异常")
	}
	body, e := g.asset(ctx, manifest.URL, 16<<10)
	if e != nil {
		return desktopRelease{}, e
	}
	var info desktopManifest
	if e = json.Unmarshal(body, &info); e != nil {
		return desktopRelease{}, errors.New("release.json 解析失败")
	}
	version := strings.TrimSpace(info.Version)
	if version == "" {
		version = strings.TrimPrefix(strings.TrimSpace(remote.Tag), "v")
	}
	if !desktopVersionPattern.MatchString(version) {
		return desktopRelease{}, errors.New("Release 版本号无效")
	}
	if info.Setup != installer.Name {
		return desktopRelease{}, errors.New("release.json 与 Release 附件不一致")
	}
	digest := strings.ToLower(strings.TrimSpace(info.SHA256))
	if !desktopDigestPattern.MatchString(digest) {
		return desktopRelease{}, errors.New("release.json 缺少安装程序校验值")
	}
	if info.Bytes != installer.Size {
		return desktopRelease{}, errors.New("release.json 体积与附件不一致")
	}
	return desktopRelease{
		Version:     version,
		FileName:    installer.Name,
		URL:         installer.URL,
		Bytes:       installer.Size,
		SHA256:      digest,
		PublishedAt: remote.PublishedAt.UTC().Format(time.RFC3339),
		Notes:       clipNotes(remote.Body),
		ReleaseURL:  desktopReleaseURL,
	}, nil
}

func clipNotes(raw string) string {
	raw = strings.TrimSpace(strings.ReplaceAll(raw, "\r\n", "\n"))
	if len(raw) > 4000 {
		raw = strings.ToValidUTF8(raw[:4000], "")
	}
	return raw
}

// asset downloads a small GitHub asset (release.json) through the configured
// route order so mirrors can be used when github.com is unreachable.
func (g *githubClient) asset(ctx context.Context, rawURL string, limit int64) ([]byte, error) {
	if !githubURL(rawURL) {
		return nil, errors.New("附件地址无效")
	}
	if limit <= 0 {
		limit = 16 << 10
	}
	routes := g.routes
	if len(routes) == 0 {
		routes = []string{"direct"}
	}
	var failures []string
	for _, route := range routes {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		prefix, ok := githubGateways[route]
		if !ok {
			return nil, errors.New("未知 GitHub 访问线路")
		}
		body, status, e := g.assetRoute(ctx, prefix+rawURL, route, limit)
		if e == nil {
			return body, nil
		}
		if route == "direct" && status == 404 {
			return nil, errGitHubNotFound
		}
		failures = append(failures, fmt.Sprintf("%s: %v", route, e))
	}
	return nil, fmt.Errorf("GitHub 附件读取失败（%s）", strings.Join(failures, "；"))
}

func (g *githubClient) assetRoute(ctx context.Context, target, route string, limit int64) ([]byte, int, error) {
	attempt, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	req, e := http.NewRequestWithContext(attempt, "GET", target, nil)
	if e != nil {
		return nil, 0, e
	}
	req.Header.Set("User-Agent", "LingPet-Market")
	if route == "direct" && g.token != "" {
		req.Header.Set("Authorization", "Bearer "+g.token)
	}
	// Copy the client so the gateway redirect policy cannot affect other requests.
	client := *g.client
	client.CheckRedirect = func(next *http.Request, via []*http.Request) error {
		if route != "direct" {
			next.Header.Del("Authorization")
		}
		if len(via) > 5 {
			return errors.New("GitHub 重定向过多")
		}
		if route == "direct" {
			if g.client.CheckRedirect != nil {
				return g.client.CheckRedirect(next, via)
			}
			if !githubURL(next.URL.String()) {
				return errors.New("拒绝非 GitHub 重定向")
			}
			if next.URL.Hostname() != "api.github.com" {
				next.Header.Del("Authorization")
			}
			return nil
		}
		if next.URL.Scheme != "https" || next.URL.User != nil || next.URL.Port() != "" {
			return errors.New("拒绝无效中转重定向")
		}
		allowed := next.URL.Hostname() == "gh-proxy.com" || next.URL.Hostname() == "ghfast.top" || githubURL(next.URL.String())
		if !allowed {
			return errors.New("拒绝非受信任中转重定向")
		}
		return nil
	}
	res, e := client.Do(req)
	if e != nil {
		return nil, 0, e
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return nil, res.StatusCode, fmt.Errorf("HTTP %d", res.StatusCode)
	}
	if res.ContentLength > limit {
		return nil, res.StatusCode, errors.New("GitHub 附件过大")
	}
	body, e := io.ReadAll(io.LimitReader(res.Body, limit+1))
	if e != nil {
		return nil, res.StatusCode, e
	}
	if int64(len(body)) > limit {
		return nil, res.StatusCode, errors.New("GitHub 附件过大")
	}
	return body, res.StatusCode, nil
}

// desktopRelease resolves the cached release, refreshing it every 15 minutes and
// falling back to the stale copy when GitHub is temporarily unreachable.
func (s *Server) desktopRelease(ctx context.Context) (desktopRelease, error) {
	s.desktopMu.Lock()
	defer s.desktopMu.Unlock()
	if !s.desktopAt.IsZero() && time.Since(s.desktopAt) < desktopReleaseTTL {
		return s.desktop, nil
	}
	if s.desktopLoader == nil {
		return desktopRelease{}, errors.New("未配置桌面版发布源")
	}
	attempt, cancel := context.WithTimeout(ctx, desktopReleaseTimeout)
	defer cancel()
	value, e := s.desktopLoader(attempt)
	if e != nil {
		if !s.desktopAt.IsZero() {
			return s.desktop, nil
		}
		return desktopRelease{}, e
	}
	s.desktop, s.desktopAt = value, time.Now()
	return value, nil
}
