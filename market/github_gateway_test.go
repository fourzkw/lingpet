package main

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
)

func TestGitHubGatewayFallbackAndTokenIsolation(t *testing.T) {
	var hosts []string
	g := &githubClient{token: "secret-test-token", routes: []string{"direct", "gh-proxy", "ghfast"}}
	g.client = &http.Client{Transport: presentationTransport(func(r *http.Request) (*http.Response, error) {
		hosts = append(hosts, r.URL.Hostname())
		status, body := 200, `{"id":42}`
		if r.URL.Hostname() == "api.github.com" {
			if r.Header.Get("Authorization") != "Bearer secret-test-token" {
				t.Fatal("missing direct token")
			}
			status = 503
		} else {
			if r.Header.Get("Authorization") != "" {
				t.Fatal("token exposed to gateway")
			}
			if !strings.HasPrefix(r.URL.Path, "/https://api.github.com/repos/") {
				t.Fatal(r.URL)
			}
			if r.URL.Hostname() == "gh-proxy.com" {
				body = "<html>unavailable</html>"
			}
		}
		return &http.Response{StatusCode: status, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}, nil
	})}
	var result struct{ ID int }
	if e := g.get(context.Background(), "/repos/alice/pet", &result); e != nil || result.ID != 42 || strings.Join(hosts, ",") != "api.github.com,gh-proxy.com,ghfast.top" {
		t.Fatalf("%v %+v %v", e, result, hosts)
	}
}
func TestGitHubGatewayRedirectAndRouteRestrictions(t *testing.T) {
	for _, raw := range []string{"https://evil.test", "direct,unknown", ""} {
		if _, e := githubRoutes(raw); e == nil {
			t.Fatal("invalid routes accepted")
		}
	}
	routes, e := githubRoutes("gh-proxy,direct,gh-proxy")
	if e != nil || strings.Join(routes, ",") != "gh-proxy,direct" {
		t.Fatal(routes, e)
	}
	for _, location := range []string{"http://gh-proxy.com/unsafe", "https://evil.test/steal", "https://127.0.0.1/private"} {
		calls := 0
		g := &githubClient{routes: []string{"gh-proxy"}, client: &http.Client{Transport: presentationTransport(func(r *http.Request) (*http.Response, error) {
			calls++
			return &http.Response{StatusCode: 302, Header: http.Header{"Location": []string{location}}, Body: io.NopCloser(strings.NewReader(""))}, nil
		})}}
		if e := g.get(context.Background(), "/repos/alice/pet", &map[string]any{}); e == nil || calls != 1 {
			t.Fatal("unsafe redirect followed", location, calls, e)
		}
	}
}
func TestGitHubDirectNotFoundDoesNotUseGateway(t *testing.T) {
	calls := 0
	g := &githubClient{routes: []string{"direct", "gh-proxy"}, client: &http.Client{Transport: presentationTransport(func(r *http.Request) (*http.Response, error) {
		calls++
		return &http.Response{StatusCode: 404, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(""))}, nil
	})}}
	if e := g.get(context.Background(), "/repos/alice/missing", &map[string]any{}); e == nil || calls != 1 {
		t.Fatal(calls, e)
	}
}
