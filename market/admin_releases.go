package main

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	bolt "go.etcd.io/bbolt"
	"io"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

const maxInstallerBytes int64 = 1 << 30

type Release struct {
	Download
	ReleaseID string    `json:"releaseId"`
	Notes     string    `json:"notes"`
	Actor     string    `json:"actor"`
	Created   time.Time `json:"createdAt"`
	Managed   bool      `json:"managed"`
	Published bool      `json:"published"`
}

func (s *Server) packageRoot() string { return filepath.Join(s.cfg.DataDir, "packages") }
func (s *Server) selectedRelease(host string) string {
	var id string
	_ = s.store.get("release-channels", host, &id)
	return id
}
func (s *Server) materialize(release Release) Release {
	root := s.downloadRoot()
	if release.Managed {
		root = s.packageRoot()
	}
	release.Download.root = root
	info, e := os.Lstat(filepath.Join(root, release.File))
	release.Available = e == nil && info.Mode().IsRegular() && info.Size() == release.Size
	release.Published = s.selectedRelease(release.ID) == release.ReleaseID
	release.URL = ""
	if release.Published && release.Available {
		release.URL = "/downloads/" + release.ID
	}
	return release
}
func (s *Server) downloadManifest() (DownloadManifest, error) {
	legacy, legacyError := s.legacyDownloadManifest()
	out := DownloadManifest{Downloads: []Download{}}
	entries := map[string]Download{}
	if legacyError == nil {
		for _, d := range legacy.Downloads {
			d.root = s.downloadRoot()
			entries[d.ID] = d
		}
	}
	explicit := false
	for _, host := range []string{"dsh", "cursor", "codex"} {
		var id string
		e := s.store.get("release-channels", host, &id)
		if e != nil {
			continue
		}
		explicit = true
		delete(entries, host)
		var release Release
		if id != "" && s.store.get("releases", id, &release) == nil {
			entries[host] = s.materialize(release).Download
		}
	}
	if legacyError != nil && !explicit {
		return out, legacyError
	}
	for _, host := range []string{"dsh", "cursor", "codex"} {
		if d, ok := entries[host]; ok {
			out.Downloads = append(out.Downloads, d)
		}
	}
	return out, nil
}
func (s *Server) releaseList() ([]Release, error) {
	out := []Release{}
	e := s.store.db.View(func(tx *bolt.Tx) error {
		return tx.Bucket([]byte("releases")).ForEach(func(_, v []byte) error {
			var a Release
			if e := json.Unmarshal(v, &a); e != nil {
				return e
			}
			out = append(out, a)
			return nil
		})
	})
	if e != nil {
		return nil, e
	}
	for i := range out {
		out[i] = s.materialize(out[i])
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Created.After(out[j].Created) })
	return out, nil
}
func (s *Server) importLegacyReleases() error {
	legacy, e := s.legacyDownloadManifest()
	if e != nil {
		return e
	}
	for _, d := range legacy.Downloads {
		if !d.Available {
			continue
		}
		id := sessionKey("legacy/" + d.ID + "/" + d.Version + "/" + d.SHA256)[:48]
		e = s.store.db.Update(func(tx *bolt.Tx) error {
			meta := tx.Bucket([]byte("meta"))
			key := []byte("legacy-release-import:" + id)
			if meta.Get(key) != nil {
				return nil
			}
			b := tx.Bucket([]byte("releases"))
			duplicate := false
			if e := b.ForEach(func(_, v []byte) error {
				var a Release
				if e := json.Unmarshal(v, &a); e != nil {
					return e
				}
				if a.ID == d.ID && a.Version == d.Version {
					duplicate = true
				}
				return nil
			}); e != nil {
				return e
			}
			if !duplicate {
				a := Release{Download: d, ReleaseID: id, Actor: "system", Created: time.Now().UTC(), Notes: "从服务器下载清单导入"}
				data, e := json.Marshal(a)
				if e != nil {
					return e
				}
				if e = b.Put([]byte(id), data); e != nil {
					return e
				}
				channels := tx.Bucket([]byte("release-channels"))
				if channels.Get([]byte(d.ID)) == nil {
					value, _ := json.Marshal(id)
					if e = channels.Put([]byte(d.ID), value); e != nil {
						return e
					}
				}
				if e = appendAudit(tx, "system", "package.import", id, d.ID+" "+d.Version); e != nil {
					return e
				}
			}
			return meta.Put(key, []byte("true"))
		})
		if e != nil {
			return e
		}
	}
	return nil
}
func (s *Server) adminReleases(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireAdmin(w, r); !ok {
		return
	}
	s.releaseMu.Lock()
	defer s.releaseMu.Unlock()
	if e := s.importLegacyReleases(); e != nil {
		failure(w, 500, e)
		return
	}
	releases, e := s.releaseList()
	if e != nil {
		failure(w, 500, e)
		return
	}
	respond(w, 200, releases)
}
func installerExtension(host string) string {
	return map[string]string{"dsh": ".tgz", "cursor": ".vsix", "codex": ".zip"}[host]
}
func safeInstallerPath(name string) bool {
	name = strings.TrimSuffix(name, "/")
	return name != "" && !strings.ContainsAny(name, "\\:") && !strings.HasPrefix(name, "/") && path.Clean(name) == name && name != ".." && !strings.HasPrefix(name, "../")
}
func installerMetadata(data []byte, expectedName, version string) error {
	var value struct {
		Name    string
		Version string
	}
	if len(data) > 1<<20 || json.Unmarshal(data, &value) != nil || value.Version != version {
		return errors.New("安装包内版本号与填写的版本不一致")
	}
	if value.Name != expectedName && !(expectedName == "lingpet" && value.Name == "dsh-board-pet") {
		return errors.New("请上传对应的灵伴插件安装包")
	}
	return nil
}
func validateInstaller(file, host, version string) error {
	if host == "dsh" {
		f, e := os.Open(file)
		if e != nil {
			return e
		}
		defer f.Close()
		gz, e := gzip.NewReader(f)
		if e != nil {
			return errors.New("不是有效的 .tgz 安装包")
		}
		defer gz.Close()
		reader := tar.NewReader(gz)
		found := false
		var expanded int64
		count := 0
		seen := map[string]bool{}
		for {
			entry, e := reader.Next()
			if e == io.EOF {
				break
			}
			if e != nil {
				return e
			}
			count++
			if entry.Size < 0 || entry.Size > (4<<30)-expanded {
				return errors.New("安装包解压体积超限")
			}
			expanded += entry.Size
			if count > 100000 || !safeInstallerPath(entry.Name) || seen[entry.Name] || (entry.Typeflag != tar.TypeReg && entry.Typeflag != tar.TypeRegA && entry.Typeflag != tar.TypeDir) {
				return errors.New("安装包包含不支持的路径、链接或超限资源")
			}
			seen[entry.Name] = true
			if entry.Name == "package/package.json" {
				data, e := io.ReadAll(io.LimitReader(reader, (1<<20)+1))
				if e != nil {
					return e
				}
				if e = installerMetadata(data, "lingpet", version); e != nil {
					return e
				}
				found = true
			}
		}
		if !found {
			return errors.New("缺少灵伴 package.json")
		}
		if !seen["package/src/plugin.js"] || !seen["package/desktop/main.js"] {
			return errors.New("安装包缺少灵伴运行文件")
		}
		n, e := io.Copy(io.Discard, io.LimitReader(gz, (1<<20)+1))
		if e != nil || n > 1<<20 {
			return errors.New("安装包压缩数据损坏或包含多余内容")
		}
		return nil
	}
	archive, e := zip.OpenReader(file)
	if e != nil {
		return errors.New("不是有效的 ZIP/VSIX 安装包")
	}
	defer archive.Close()
	if len(archive.File) > 100000 {
		return errors.New("安装包文件数超限")
	}
	expected := "extension/package.json"
	name := "board-pet"
	required := "extension.vsixmanifest"
	if host == "codex" {
		expected = "plugins/board-pet/plugin.json"
		required = ".agents/plugins/marketplace.json"
	}
	var expanded uint64
	found, complete := false, false
	seen := map[string]bool{}
	for _, entry := range archive.File {
		if entry.UncompressedSize64 > (4<<30)-expanded {
			return errors.New("安装包解压体积超限")
		}
		expanded += entry.UncompressedSize64
		if expanded > 4<<30 || !safeInstallerPath(entry.Name) || entry.Mode()&os.ModeSymlink != 0 || entry.Flags&1 != 0 || seen[entry.Name] {
			return errors.New("安装包包含不支持的路径、链接、加密或超限资源")
		}
		seen[entry.Name] = true
		if entry.Name == required {
			complete = true
		}
		if entry.Name == expected {
			if entry.UncompressedSize64 > 1<<20 {
				return errors.New("安装包元数据超限")
			}
			f, e := entry.Open()
			if e != nil {
				return e
			}
			data, e := io.ReadAll(io.LimitReader(f, (1<<20)+1))
			f.Close()
			if e != nil {
				return e
			}
			if e = installerMetadata(data, name, version); e != nil {
				return e
			}
			found = true
		} else if !entry.FileInfo().IsDir() {
			f, e := entry.Open()
			if e != nil {
				return e
			}
			n, e := io.Copy(io.Discard, io.LimitReader(f, int64(entry.UncompressedSize64)+1))
			f.Close()
			if e != nil || uint64(n) != entry.UncompressedSize64 {
				return errors.New("安装包文件损坏")
			}
		}
	}
	if !found || !complete {
		return errors.New("安装包缺少对应客户端的必需文件")
	}
	if host == "cursor" && (!seen["extension/extension.cjs"] || !seen["extension/cursor-plugin/runtime/desktop/main.js"]) {
		return errors.New("Cursor 安装包缺少灵伴运行文件")
	}
	if host == "codex" && (!seen["plugins/board-pet/.mcp.json"] || !seen["plugins/board-pet/runtime/desktop/main.js"]) {
		return errors.New("Codex 安装包缺少灵伴运行文件")
	}
	return nil
}
func (s *Server) uploadRelease(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireAdmin(w, r); !ok {
		return
	}
	if r.ContentLength > maxInstallerBytes+65536 {
		failure(w, 413, errors.New("安装包超过上传限制"))
		return
	}
	if r.Header.Get("Sec-Fetch-Site") == "cross-site" {
		failure(w, 400, errors.New("拒绝跨站请求"))
		return
	}
	if !s.uploadMu.TryLock() {
		failure(w, 409, errors.New("已有安装包正在上传，请稍后再试"))
		return
	}
	defer s.uploadMu.Unlock()
	_ = http.NewResponseController(w).SetReadDeadline(time.Now().Add(15 * time.Minute))
	_ = http.NewResponseController(w).SetWriteDeadline(time.Now().Add(15 * time.Minute))
	r.Body = http.MaxBytesReader(w, r.Body, maxInstallerBytes+65536)
	reader, e := r.MultipartReader()
	if e != nil {
		failure(w, 400, errors.New("请选择安装包文件"))
		return
	}
	if e = os.MkdirAll(s.packageRoot(), 0700); e != nil {
		failure(w, 500, e)
		return
	}
	fields := map[string]string{}
	temp, original := "", ""
	hash := ""
	var size int64
	defer func() {
		if temp != "" {
			_ = os.Remove(temp)
		}
	}()
	for count := 0; ; count++ {
		part, e := reader.NextPart()
		if e == io.EOF {
			break
		}
		if e != nil {
			failure(w, 400, errors.New("上传中断或文件体积超限"))
			return
		}
		if count >= 5 {
			part.Close()
			failure(w, 400, errors.New("上传字段过多"))
			return
		}
		if part.FormName() == "package" && part.FileName() != "" {
			if temp != "" {
				part.Close()
				failure(w, 400, errors.New("一次只能上传一个安装包"))
				return
			}
			f, e := os.CreateTemp(s.packageRoot(), ".upload-")
			if e != nil {
				failure(w, 500, e)
				return
			}
			temp = f.Name()
			original = part.FileName()
			hasher := sha256.New()
			size, e = io.Copy(io.MultiWriter(f, hasher), io.LimitReader(part, maxInstallerBytes+1))
			if e == nil {
				e = f.Sync()
			}
			closeError := f.Close()
			part.Close()
			if e != nil || closeError != nil || size > maxInstallerBytes || size < 1 {
				failure(w, 400, errors.New("上传失败或安装包超过1GiB"))
				return
			}
			hash = hex.EncodeToString(hasher.Sum(nil))
		} else {
			key := part.FormName()
			if part.FileName() != "" || (key != "host" && key != "version" && key != "notes") {
				part.Close()
				failure(w, 400, errors.New("无效上传字段"))
				return
			}
			if _, exists := fields[key]; exists {
				part.Close()
				failure(w, 400, errors.New("重复上传字段"))
				return
			}
			data, e := io.ReadAll(io.LimitReader(part, 8193))
			part.Close()
			if e != nil || len(data) > 8192 {
				failure(w, 400, errors.New("上传字段过长"))
				return
			}
			fields[key] = string(data)
		}
	}
	host, version := fields["host"], fields["version"]
	fields["notes"] = strings.TrimSpace(fields["notes"])
	extension := installerExtension(host)
	if temp == "" || extension == "" || len(version) > 32 || !downloadVersion.MatchString(version) || (fields["notes"] != "" && !field(fields["notes"], 2000)) || strings.ToLower(filepath.Ext(original)) != extension {
		failure(w, 400, errors.New("请填写客户端、有效版本号，并选择匹配的安装包"))
		return
	}
	if e = validateInstaller(temp, host, version); e != nil {
		failure(w, 400, e)
		return
	}
	if r.Context().Err() != nil {
		return
	}
	actor, ok := s.requireAdmin(w, r)
	if !ok {
		return
	}
	s.releaseMu.Lock()
	defer s.releaseMu.Unlock()
	if e = s.importLegacyReleases(); e != nil {
		failure(w, 500, e)
		return
	}
	existing, e := s.releaseList()
	if e != nil {
		failure(w, 500, e)
		return
	}
	for _, old := range existing {
		if old.ID == host && old.Version == version {
			failure(w, 409, errors.New("该客户端版本已存在，请增加版本号"))
			return
		}
	}
	if len(existing) >= 150 {
		failure(w, 409, errors.New("安装包版本过多，请先删除不再使用的历史版本"))
		return
	}
	id := newID()
	filename := "lingpet-" + host + "-" + version + "-" + id[:12] + extension
	if e = os.Rename(temp, filepath.Join(s.packageRoot(), filename)); e != nil {
		failure(w, 500, e)
		return
	}
	temp = filepath.Join(s.packageRoot(), filename)
	release := Release{Download: Download{ID: host, Name: map[string]string{"dsh": "DSH 插件", "cursor": "Cursor 扩展", "codex": "Codex 插件"}[host], Version: version, File: filename, Size: size, SHA256: hash}, ReleaseID: id, Actor: actor.Login, Notes: fields["notes"], Created: time.Now().UTC(), Managed: true}
	data, _ := json.Marshal(release)
	e = s.store.db.Update(func(tx *bolt.Tx) error {
		if e := tx.Bucket([]byte("releases")).Put([]byte(id), data); e != nil {
			return e
		}
		return appendAudit(tx, actor.Login, "package.upload", id, host+" "+version)
	})
	if e != nil {
		failure(w, 500, e)
		return
	}
	temp = ""
	respond(w, 201, s.materialize(release))
}
func (s *Server) manageRelease(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.requireAdmin(w, r)
	if !ok {
		return
	}
	var body struct{}
	if e := s.input(w, r, &body); e != nil {
		failure(w, 400, e)
		return
	}
	s.releaseMu.Lock()
	defer s.releaseMu.Unlock()
	var release Release
	if e := s.store.get("releases", r.PathValue("id"), &release); e != nil {
		failure(w, 404, errors.New("安装包版本不存在"))
		return
	}
	release = s.materialize(release)
	action := r.PathValue("action")
	if action == "publish" && !release.Available {
		failure(w, 409, errors.New("安装包文件不可用，无法发布"))
		return
	}
	if (action == "delete" && release.Published) || (action == "unpublish" && !release.Published) {
		failure(w, 409, errors.New("请先下架当前版本，或选择当前已发布版本"))
		return
	}
	if action != "publish" && action != "unpublish" && action != "delete" {
		failure(w, 400, errors.New("未知安装包操作"))
		return
	}
	if action == "delete" && release.Managed {
		if !downloadName.MatchString(release.File) {
			failure(w, 500, errors.New("无效安装包路径"))
			return
		}
		if e := os.Remove(filepath.Join(s.packageRoot(), release.File)); e != nil && !errors.Is(e, os.ErrNotExist) {
			failure(w, 500, e)
			return
		}
	}
	e := s.store.db.Update(func(tx *bolt.Tx) error {
		if action == "delete" {
			if e := tx.Bucket([]byte("releases")).Delete([]byte(release.ReleaseID)); e != nil {
				return e
			}
		} else {
			value := ""
			if action == "publish" {
				value = release.ReleaseID
			}
			data, _ := json.Marshal(value)
			if e := tx.Bucket([]byte("release-channels")).Put([]byte(release.ID), data); e != nil {
				return e
			}
		}
		return appendAudit(tx, actor.Login, "package."+action, release.ReleaseID, fmt.Sprintf("%s %s", release.ID, release.Version))
	})
	if e != nil {
		failure(w, 500, e)
		return
	}
	respond(w, 200, map[string]bool{"ok": true})
}
