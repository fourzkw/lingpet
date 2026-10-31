package main

import (
	"strings"
	"testing"
)

// embed.FS 里的文件没有修改时间，浏览器拿不到 Last-Modified/ETag，只能按启发式规则
// 缓存：升级服务端二进制后用户可能一直是旧样式。这些断言保证页面与样式始终回源。
func TestWebAssetsRevalidateAfterUpgrade(t *testing.T) {
	_, ts, c := fixtureServer(t)
	for _, route := range []string{"/", "/market", "/admin", "/style.css", "/site.css", "/companion.css", "/refine.css", "/theme-tokens.css", "/theme.js", "/app.js", "/home.js"} {
		r, e := c.Get(ts.URL + route)
		if e != nil {
			t.Fatal(e)
		}
		_ = r.Body.Close()
		if r.StatusCode != 200 {
			t.Fatal("asset unavailable", route, r.StatusCode)
		}
		if got := r.Header.Get("Cache-Control"); got != "no-cache" {
			t.Fatal("asset must revalidate", route, got)
		}
	}
	for _, route := range []string{"/brand.svg", "/favicon.ico", "/apple-touch-icon.png"} {
		r, e := c.Get(ts.URL + route)
		if e != nil {
			t.Fatal(e)
		}
		_ = r.Body.Close()
		if r.StatusCode != 200 {
			t.Fatal("image unavailable", route, r.StatusCode)
		}
		if got := r.Header.Get("Cache-Control"); !strings.Contains(got, "max-age=604800") {
			t.Fatal("image should be cacheable", route, got)
		}
	}
}
