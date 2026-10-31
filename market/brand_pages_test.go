package main

import (
	"strings"
	"testing"
)

func TestBrandAndThemeAssetsEmbedded(t *testing.T) {
	_, ts, c := fixtureServer(t)
	for _, route := range []string{"/brand.svg", "/favicon.ico", "/apple-touch-icon.png", "/site.css", "/refine.css", "/theme.js", "/theme-tokens.css"} {
		status, body := call(t, c, ts.URL, "GET", route, nil)
		if status != 200 || len(body) < 100 || strings.Contains(string(body), "<!doctype html>") {
			t.Fatal("brand asset unavailable", route, status)
		}
	}
	for _, route := range []string{"/", "/market", "/admin"} {
		_, body := call(t, c, ts.URL, "GET", route, nil)
		for _, needle := range []string{"/favicon.ico", "/theme.js", "siteTheme", "paper-journal", "terminal-pulse"} {
			if !strings.Contains(string(body), needle) {
				t.Fatal("page missing shared brand/theme", route, needle)
			}
		}
	}
}

