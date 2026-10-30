package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

var githubGateways = map[string]string{"direct": "", "gh-proxy": "https://gh-proxy.com/", "ghfast": "https://ghfast.top/"}
var errGitHubNotFound = errors.New("GitHub 返回 404，请检查公开仓库、Release 标签或展示文件是否存在")

func githubRoutes(raw string) ([]string, error) {
	var routes []string
	seen := map[string]bool{}
	for _, v := range strings.Split(raw, ",") {
		v = strings.TrimSpace(v)
		if _, ok := githubGateways[v]; !ok {
			return nil, fmt.Errorf("未知 GitHub 访问线路 %q（支持 direct、gh-proxy、ghfast）", v)
		}
		if !seen[v] {
			routes = append(routes, v)
			seen[v] = true
		}
	}
	return routes, nil
}
func (g *githubClient) get(ctx context.Context, path string, out any) error {
	if !strings.HasPrefix(path, "/repos/") {
		return errors.New("拒绝非仓库 API 请求")
	}
	routes := g.routes
	if len(routes) == 0 {
		routes = []string{"direct"}
	}
	var failures []string
	for _, route := range routes {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		prefix, ok := githubGateways[route]
		if !ok {
			return errors.New("未知 GitHub 访问线路")
		}
		body, status, e := g.getRoute(ctx, prefix+"https://api.github.com"+path, route)
		if e == nil {
			e = json.Unmarshal(body, out)
			if e == nil {
				return nil
			}
		}
		// A direct GitHub 404 is authoritative. Mirrors may have incomplete API support.
		if route == "direct" && status == 404 {
			return errGitHubNotFound
		}
		failures = append(failures, fmt.Sprintf("%s: %v", route, e))
	}
	return fmt.Errorf("GitHub 资料读取失败（%s）", strings.Join(failures, "；"))
}
func (g *githubClient) getRoute(ctx context.Context, target, route string) ([]byte, int, error) {
	attempt, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	req, e := http.NewRequestWithContext(attempt, "GET", target, nil)
	if e != nil {
		return nil, 0, e
	}
	req.Header.Set("User-Agent", "LingPet-Market")
	req.Header.Set("Accept", "application/vnd.github+json")
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
	if res.ContentLength > 2<<20 {
		return nil, res.StatusCode, errors.New("GitHub 响应过大")
	}
	b, e := io.ReadAll(io.LimitReader(res.Body, (2<<20)+1))
	if e != nil {
		return nil, res.StatusCode, e
	}
	if len(b) > 2<<20 {
		return nil, res.StatusCode, errors.New("GitHub 响应过大")
	}
	return b, res.StatusCode, nil
}
