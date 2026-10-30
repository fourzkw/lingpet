package main

import (
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

type Download struct {
	root      string
	ID        string `json:"id"`
	Name      string `json:"name"`
	Version   string `json:"version"`
	File      string `json:"file"`
	Size      int64  `json:"size"`
	SHA256    string `json:"sha256"`
	Available bool   `json:"available"`
	URL       string `json:"url"`
}
type DownloadManifest struct {
	Downloads []Download `json:"downloads"`
}

var downloadName = regexp.MustCompile("^[a-zA-Z0-9][a-zA-Z0-9._-]{1,150}[.](tgz|zip|vsix)$")
var downloadHash = regexp.MustCompile("^[a-f0-9]{64}$")
var downloadVersion = regexp.MustCompile("^[0-9]+[.][0-9]+[.][0-9]+$")

func (s *Server) downloadRoot() string {
	if s.cfg.DownloadDir != "" {
		return s.cfg.DownloadDir
	}
	return filepath.Join(s.cfg.DataDir, "downloads")
}
func (s *Server) legacyDownloadManifest() (DownloadManifest, error) {
	var result DownloadManifest
	file, e := os.Open(filepath.Join(s.downloadRoot(), "manifest.json"))
	if errors.Is(e, os.ErrNotExist) {
		result.Downloads = []Download{}
		return result, nil
	}
	if e != nil {
		return result, e
	}
	defer file.Close()
	if info, e := file.Stat(); e != nil || info.Size() > 65536 {
		return result, errors.New("下载清单体积超限")
	}
	decoder := json.NewDecoder(io.LimitReader(file, 65537))
	decoder.DisallowUnknownFields()
	if e = decoder.Decode(&result); e != nil {
		return result, e
	}
	if decoder.Decode(new(any)) != io.EOF || len(result.Downloads) > 3 {
		return result, errors.New("无效下载清单")
	}
	seen := map[string]bool{}
	for i := range result.Downloads {
		d := &result.Downloads[i]
		if !map[string]bool{"dsh": true, "cursor": true, "codex": true}[d.ID] || seen[d.ID] || !field(d.Name, 60) || len(d.Version) > 32 || !downloadVersion.MatchString(d.Version) || !downloadName.MatchString(d.File) || !downloadHash.MatchString(d.SHA256) || d.Size < 1 {
			return result, errors.New("无效下载条目")
		}
		seen[d.ID] = true
		info, e := os.Lstat(filepath.Join(s.downloadRoot(), d.File))
		d.Available = e == nil && info.Mode().IsRegular() && info.Size() == d.Size
		d.URL = ""
		if d.Available {
			d.URL = "/downloads/" + d.ID
		}
	}
	return result, nil
}

const desktopReleaseURL = "https://github.com/fourzkw/lingpet/releases/latest"

func (s *Server) listDownloads(w http.ResponseWriter, r *http.Request) {
	respond(w, 200, map[string]any{"provider": "github", "releaseURL": desktopReleaseURL, "downloads": []map[string]any{{"id": "desktop", "name": "灵伴桌面版", "url": "/downloads/desktop"}}})
}

func (s *Server) serveDownload(w http.ResponseWriter, r *http.Request) {
	if r.PathValue("id") != "desktop" {
		failure(w, http.StatusGone, errors.New("独立插件安装包已停止提供，请安装灵伴桌面版"))
		return
	}
	if r.Method == "GET" {
		_ = s.store.metric("download.desktop", 0)
	}
	w.Header().Set("Cache-Control", "no-store")
	http.Redirect(w, r, desktopReleaseURL, http.StatusFound)
}

func (s *Server) retiredInstallerManagement(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireAdmin(w, r); !ok {
		return
	}
	respond(w, http.StatusGone, map[string]string{"error": "安装包现由 GitHub Release 发布，请前往仓库管理版本", "releaseURL": desktopReleaseURL})
}

// Retained for legacy data regression coverage, not exposed by production routes.
func (s *Server) listLegacyDownloads(w http.ResponseWriter, r *http.Request) {
	manifest, e := s.downloadManifest()
	if e != nil {
		failure(w, 503, errors.New("插件下载清单暂不可用"))
		return
	}
	respond(w, 200, manifest)
}
func (s *Server) serveLegacyDownload(w http.ResponseWriter, r *http.Request) {
	manifest, e := s.downloadManifest()
	if e != nil {
		http.NotFound(w, r)
		return
	}
	for _, d := range manifest.Downloads {
		if d.ID != r.PathValue("id") || !d.Available {
			continue
		}
		root := d.root
		if root == "" {
			root = s.downloadRoot()
		}
		file, e := os.Open(filepath.Join(root, d.File))
		if e != nil {
			http.NotFound(w, r)
			return
		}
		defer file.Close()
		info, e := file.Stat()
		if e != nil || !info.Mode().IsRegular() || info.Size() != d.Size {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/octet-stream")
		w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": d.File}))
		w.Header().Set("ETag", strconv.Quote(d.SHA256))
		w.Header().Set("Cache-Control", "public, max-age=300")
		_ = http.NewResponseController(w).SetWriteDeadline(time.Time{})
		tracked := &trackedResponse{ResponseWriter: w}
		http.ServeContent(tracked, r, d.File, info.ModTime(), file)
		if r.Method == "GET" && (tracked.status == 200 || tracked.status == 206) && tracked.bytes > 0 {
			_ = s.store.metric("download."+d.ID, tracked.bytes)
		}
		return
	}
	http.NotFound(w, r)
}
func serveWebFile(name string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		data, e := frontend.ReadFile("web/" + name)
		if e != nil {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-cache")
		w.Write(data)
	}
}
func (s *Server) home(w http.ResponseWriter, r *http.Request) {
	if version := r.URL.Query().Get("version"); len(version) == 48 && strings.Trim(version, "0123456789abcdef") == "" {
		http.Redirect(w, r, "/market?version="+version, http.StatusFound)
		return
	}
	serveWebFile("index.html")(w, r)
	if r.Method == "GET" {
		_ = s.store.metric("visit.home", 0)
	}
}
