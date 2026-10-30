package main

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

var repositoryPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9-]{0,38}/[A-Za-z0-9_.-]{1,100}$`)

func parseRepository(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if strings.HasPrefix(raw, "https://github.com/") {
		u, e := url.Parse(raw)
		if e != nil || u.RawQuery != "" || u.Fragment != "" || u.User != nil || u.Port() != "" {
			return "", errors.New("无效仓库地址")
		}
		raw = strings.Trim(u.Path, "/")
	}
	raw = strings.TrimSuffix(raw, ".git")
	if !repositoryPattern.MatchString(raw) || strings.Contains(raw, "..") {
		return "", errors.New("仅支持 github.com 的公开仓库 owner/repo")
	}
	return raw, nil
}
func githubURL(raw string) bool {
	u, e := url.Parse(raw)
	if e != nil || u.Scheme != "https" || u.User != nil || u.Port() != "" {
		return false
	}
	switch u.Hostname() {
	case "github.com", "api.github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com", "github-releases.githubusercontent.com":
		return true
	}
	return false
}
func publicClient() *http.Client {
	transport := &http.Transport{Proxy: nil, TLSHandshakeTimeout: 15 * time.Second, ResponseHeaderTimeout: 30 * time.Second}
	transport.DialContext = func(ctx context.Context, network, address string) (net.Conn, error) {
		host, port, e := net.SplitHostPort(address)
		if e != nil {
			return nil, e
		}
		ips, e := net.DefaultResolver.LookupIPAddr(ctx, host)
		if e != nil {
			return nil, e
		}
		var last error
		for _, v := range ips {
			ip := v.IP
			if !ip.IsGlobalUnicast() || ip.IsPrivate() || ip.IsLoopback() || ip.IsLinkLocalUnicast() {
				return nil, errors.New("拒绝访问非公网地址")
			}
			d := net.Dialer{Timeout: 20 * time.Second}
			c, e := d.DialContext(ctx, network, net.JoinHostPort(ip.String(), port))
			if e == nil {
				return c, nil
			}
			last = e
		}
		return nil, last
	}
	return &http.Client{Transport: transport, Timeout: 3 * time.Minute, CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) > 5 || !githubURL(req.URL.String()) {
			return errors.New("拒绝非 GitHub 下载重定向")
		}
		if req.URL.Hostname() != "api.github.com" {
			req.Header.Del("Authorization")
		}
		return nil
	}}
}

type GitHub interface {
	Resolve(context.Context, string, string, string) (Asset, error)
	Presentation(context.Context, string, string) (Pet, []byte, error)
	Download(context.Context, Asset, string) error
}

var errSourceUnavailable = errors.New("仓库、正式 Release 或附件已不可用")

type githubClient struct {
	client *http.Client
	token  string
	routes []string
}

func (g *githubClient) Resolve(ctx context.Context, repo, tag, name string) (Asset, error) {
	var repository struct {
		ID      int64
		Private bool
	}
	if e := g.get(ctx, "/repos/"+repo, &repository); e != nil {
		return Asset{}, e
	}
	if repository.Private {
		return Asset{}, fmt.Errorf("仅支持公开仓库: %w", errSourceUnavailable)
	}
	var release struct {
		ID                           int64
		Draft, Prerelease, Immutable bool
		Tag                          string `json:"tag_name"`
		Assets                       []struct {
			ID          int64
			Name, State string
			Size        int64
			URL         string `json:"browser_download_url"`
		}
	}
	releasePath := "/repos/" + repo + "/releases/latest"
	if tag != "" {
		releasePath = "/repos/" + repo + "/releases/tags/" + url.PathEscape(tag)
	}
	if e := g.get(ctx, releasePath, &release); e != nil {
		if tag == "" {
			return Asset{}, errors.New("无法读取最新正式 Release，请确认公开仓库已发布正式版本：" + e.Error())
		}
		return Asset{}, e
	}
	if release.Draft || release.Prerelease {
		return Asset{}, fmt.Errorf("请提交正式公开 Release: %w", errSourceUnavailable)
	}
	if name == "" {
		for _, a := range release.Assets {
			if strings.HasSuffix(a.Name, ".petpack") && a.State == "uploaded" {
				if name != "" {
					return Asset{}, errors.New("最新正式 Release 包含多个 .petpack，请仅保留一个作品分享包")
				}
				name = a.Name
			}
		}
		if name == "" {
			return Asset{}, errors.New("最新正式 Release 中没有 .petpack 分享包")
		}
	}
	parts := strings.Split(repo, "/")
	for _, a := range release.Assets {
		if a.Name == name && a.State == "uploaded" {
			if a.Size < 1 || a.Size > maxPackage || !githubURL(a.URL) {
				return Asset{}, errors.New("附件超限或下载地址无效")
			}
			return Asset{repository.ID, release.ID, a.ID, parts[0], parts[1], release.Tag, a.Name, a.URL, a.Size, release.Immutable}, nil
		}
	}
	return Asset{}, fmt.Errorf("Release 中未找到指定附件: %w", errSourceUnavailable)
}
