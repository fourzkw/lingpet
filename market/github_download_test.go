package main

import (
	"context"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type brokenDownload struct{}

func (brokenDownload) Read([]byte) (int, error) { return 0, io.ErrUnexpectedEOF }

func TestPackageDownloadFallsBackAndRemovesPartialFiles(t *testing.T) {
	for _, failure := range []string{"timeout", "http", "truncated", "size", "html"} {
		t.Run(failure, func(t *testing.T) {
			var hosts []string
			g := &githubClient{token: "must-not-leak", routes: []string{"direct", "gh-proxy", "ghfast"}}
			g.client = &http.Client{Transport: presentationTransport(func(r *http.Request) (*http.Response, error) {
				hosts = append(hosts, r.URL.Hostname())
				if r.Header.Get("Authorization") != "" {
					t.Fatal("download leaked credentials")
				}
				if _, ok := r.Context().Deadline(); !ok {
					t.Fatal("missing attempt deadline")
				}
				response := &http.Response{StatusCode: 200, Header: make(http.Header), ContentLength: 4, Body: io.NopCloser(strings.NewReader("data"))}
				if r.URL.Hostname() == "github.com" {
					switch failure {
					case "timeout":
						return nil, context.DeadlineExceeded
					case "http":
						response.StatusCode = 503
					case "truncated":
						response.Body = io.NopCloser(io.MultiReader(strings.NewReader("pa"), brokenDownload{}))
					case "size":
						response.Body = io.NopCloser(strings.NewReader("extra"))
						response.ContentLength = 5
					case "html":
						response.Header.Set("Content-Type", "text/html; charset=utf-8")
					}
				} else if !strings.HasPrefix(r.URL.Path, "/https://github.com/alice/pet/releases/download/") {
					t.Fatal(r.URL)
				}
				return response, nil
			})}
			file := filepath.Join(t.TempDir(), "download.petpack")
			err := g.Download(context.Background(), Asset{URL: "https://github.com/alice/pet/releases/download/v1/a.petpack", Size: 4}, file)
			if err != nil {
				t.Fatal(err)
			}
			data, err := os.ReadFile(file)
			if err != nil || string(data) != "data" || strings.Join(hosts, ",") != "github.com,gh-proxy.com" {
				t.Fatal(string(data), hosts, err)
			}
		})
	}
}

func TestPackageDownloadRoutesCancelAndProtectExistingFiles(t *testing.T) {
	asset := Asset{URL: "https://github.com/alice/pet/releases/download/v1/a.petpack", Size: 4}
	var calls int
	g := &githubClient{routes: []string{"direct", "gh-proxy", "ghfast"}, client: &http.Client{Transport: presentationTransport(func(r *http.Request) (*http.Response, error) {
		calls++
		return &http.Response{StatusCode: 503, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(""))}, nil
	})}}
	file := filepath.Join(t.TempDir(), "download.petpack")
	err := g.Download(context.Background(), asset, file)
	if err == nil || calls != 3 {
		t.Fatal(calls, err)
	}
	for _, route := range g.routes {
		if !strings.Contains(err.Error(), route+":") {
			t.Fatal(err)
		}
	}
	if _, err := os.Stat(file); !os.IsNotExist(err) {
		t.Fatal("failed download left a file", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	calls = 0
	if err := g.Download(ctx, asset, file); !errors.Is(err, context.Canceled) || calls != 0 {
		t.Fatal(calls, err)
	}
	if err := os.WriteFile(file, []byte("keep"), 0600); err != nil {
		t.Fatal(err)
	}
	g.client.Transport = presentationTransport(func(*http.Request) (*http.Response, error) {
		calls++
		return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(strings.NewReader("data"))}, nil
	})
	if err := g.Download(context.Background(), asset, file); err == nil || calls != 1 {
		t.Fatal(calls, err)
	}
	data, _ := os.ReadFile(file)
	if string(data) != "keep" {
		t.Fatal("existing destination overwritten")
	}
}

func TestPackageGatewayRejectsUntrustedRedirects(t *testing.T) {
	for _, location := range []string{"https://evil.test/payload", "http://gh-proxy.com/unsafe", "https://127.0.0.1/private"} {
		calls := 0
		g := &githubClient{routes: []string{"gh-proxy"}, client: &http.Client{Transport: presentationTransport(func(*http.Request) (*http.Response, error) {
			calls++
			return &http.Response{StatusCode: 302, Header: http.Header{"Location": []string{location}}, Body: io.NopCloser(strings.NewReader(""))}, nil
		})}}
		err := g.Download(context.Background(), Asset{URL: "https://github.com/alice/pet/releases/download/v1/a.petpack", Size: 4}, filepath.Join(t.TempDir(), "download.petpack"))
		if err == nil || calls != 1 {
			t.Fatal(location, calls, err)
		}
	}
}
