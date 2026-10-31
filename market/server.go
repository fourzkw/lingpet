package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type Config struct {
	SyncInterval                                                                     time.Duration
	Addr, PublicURL, DataDir, GitHubToken, AdminUser, AdminPasswordHash, DownloadDir string
	Dev                                                                              bool
}
type Server struct {
	queueMu      sync.RWMutex
	activeCheck  string
	statsMu      sync.Mutex
	statsLoading map[string]bool
	releaseMu    sync.Mutex
	uploadMu     sync.Mutex
	authMu       sync.RWMutex
	submitMu     sync.Mutex
	rateMu       sync.Mutex
	rates        map[string]rateWindow
	cfg          Config
	store        *Store
	github       GitHub
	client       *http.Client

	desktopMu     sync.Mutex
	desktop       desktopRelease
	desktopAt     time.Time
	desktopLoader func(context.Context) (desktopRelease, error)
}

func (s *Server) admin(login string) bool {
	a, e := s.store.adminCredential()
	return e == nil && login != "" && login == a.Username
}
func sessionKey(raw string) string { h := sha256.Sum256([]byte(raw)); return hex.EncodeToString(h[:]) }
func (s *Server) session(r *http.Request) (Session, error) {
	c, e := r.Cookie("lingpet_session")
	if e != nil {
		return Session{}, e
	}
	var u Session
	e = s.store.get("sessions", sessionKey(c.Value), &u)
	if e != nil || time.Now().After(u.Expires) || !s.admin(u.Login) || u.AuthKey != s.adminKey() {
		return Session{}, errors.New("请先登录")
	}
	return u, nil
}
func respond(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}
func failure(w http.ResponseWriter, status int, e error) {
	respond(w, status, map[string]string{"error": e.Error()})
}
func (s *Server) input(w http.ResponseWriter, r *http.Request, v any) error {
	if !strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
		return errors.New("需要 JSON 请求")
	}
	if r.Header.Get("Sec-Fetch-Site") == "cross-site" {
		return errors.New("拒绝跨站请求")
	}
	r.Body = http.MaxBytesReader(w, r.Body, 32768)
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	if e := d.Decode(v); e != nil {
		return e
	}
	if d.Decode(new(any)) != io.EOF {
		return errors.New("多余请求数据")
	}
	return nil
}
func requestSecure(r *http.Request) bool {
	if r.TLS != nil {
		return true
	}
	host, _, _ := net.SplitHostPort(r.RemoteAddr)
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback() && r.Header.Get("X-Forwarded-Proto") == "https"
}
func (s *Server) login(w http.ResponseWriter, r *http.Request, login string, id int64) error {
	raw := newID()
	if e := s.store.put("sessions", sessionKey(raw), Session{Login: login, UserID: id, Expires: time.Now().Add(8 * time.Hour), AuthKey: s.adminKey()}); e != nil {
		return e
	}
	http.SetCookie(w, &http.Cookie{Name: "lingpet_session", Value: raw, Path: "/", HttpOnly: true, Secure: requestSecure(r), SameSite: http.SameSiteLaxMode, MaxAge: 8 * 3600})
	return nil
}
func (s *Server) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /{$}", s.home)
	mux.HandleFunc("GET /market", func(w http.ResponseWriter, r *http.Request) {
		serveWebFile("market.html")(w, r)
		if r.Method == "GET" {
			_ = s.store.metric("visit.market", 0)
		}
	})
	mux.HandleFunc("GET /admin", serveWebFile("admin.html"))
	mux.HandleFunc("GET /admin/{$}", func(w http.ResponseWriter, r *http.Request) { http.Redirect(w, r, "/admin", http.StatusFound) })
	mux.HandleFunc("GET /api/downloads", s.listDownloads)
	mux.HandleFunc("GET /downloads/{id}", s.serveDownload)
	mux.HandleFunc("GET /api/admin/stats", s.adminStats)
	mux.HandleFunc("GET /api/admin/stats.csv", s.adminStatsCSV)
	mux.HandleFunc("GET /api/admin/releases", s.retiredInstallerManagement)
	mux.HandleFunc("POST /api/admin/releases/upload", s.retiredInstallerManagement)
	mux.HandleFunc("POST /api/admin/releases/{id}/{action}", s.retiredInstallerManagement)
	mux.HandleFunc("GET /api/announcements", s.listPublicAnnouncements)
	mux.HandleFunc("GET /api/admin/announcements", s.adminListAnnouncements)
	mux.HandleFunc("POST /api/admin/announcements", s.adminCreateAnnouncement)
	mux.HandleFunc("POST /api/admin/announcements/{id}", s.adminUpdateAnnouncement)
	mux.HandleFunc("POST /api/admin/announcements/{id}/{action}", s.adminAnnouncementAction)
	mux.HandleFunc("GET /api/admin/audit", s.adminAudit)
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		respond(w, 200, map[string]any{"ok": true, "service": "lingpet-market", "version": strings.TrimSpace(marketVersion), "formatVersion": 1})
	})
	mux.HandleFunc("GET /api/config", func(w http.ResponseWriter, r *http.Request) {
		respond(w, 200, map[string]any{"anonymousSubmissions": true, "adminLogin": true})
	})
	mux.HandleFunc("GET /api/me", func(w http.ResponseWriter, r *http.Request) {
		u, e := s.session(r)
		if e != nil {
			respond(w, 200, map[string]any{"user": nil})
			return
		}
		a, e := s.store.adminCredential()
		if e != nil {
			failure(w, 500, e)
			return
		}
		respond(w, 200, map[string]any{"user": u.Login, "admin": s.admin(u.Login), "mustChangePassword": a.MustChange})
	})
	mux.HandleFunc("POST /auth/admin", s.adminLogin)
	mux.HandleFunc("POST /auth/password", s.changePassword)
	mux.HandleFunc("POST /auth/username", s.changeUsername)
	mux.HandleFunc("POST /auth/logout", func(w http.ResponseWriter, r *http.Request) {
		var b struct{}
		if e := s.input(w, r, &b); e != nil {
			failure(w, 400, e)
			return
		}
		if c, e := r.Cookie("lingpet_session"); e == nil {
			var old Session
			s.store.consume("sessions", sessionKey(c.Value), &old)
		}
		http.SetCookie(w, &http.Cookie{Name: "lingpet_session", Path: "/", MaxAge: -1, HttpOnly: true, Secure: requestSecure(r), SameSite: http.SameSiteLaxMode})
		respond(w, 200, map[string]bool{"ok": true})
	})
	mux.HandleFunc("POST /api/submissions", s.submit)
	mux.HandleFunc("POST /api/submissions/lookup", s.lookupSubmission)
	mux.HandleFunc("GET /api/pets", func(w http.ResponseWriter, r *http.Request) {
		query := r.URL.Query()
		if err := validateBrowse(query); err != nil {
			failure(w, 400, err)
			return
		}
		all, e := s.store.records()
		if e != nil {
			failure(w, 500, e)
			return
		}
		out := filterPets(all, query, time.Now().UTC())
		s.populatePetStats(r.Context(), out)
		sortPets(out, query.Get("sort"))
		if len(out) > 200 {
			out = out[:200]
		}
		respond(w, 200, out)
	})
	mux.HandleFunc("GET /api/versions/{id}/history", func(w http.ResponseWriter, r *http.Request) {
		a, ok := s.visible(w, r)
		if !ok {
			return
		}
		all, e := s.store.records()
		if e != nil {
			failure(w, 500, e)
			return
		}
		out := []Record{}
		for _, entry := range all {
			if entry.Status == "approved" && entry.Pet != nil && petIdentity(entry) == petIdentity(a) {
				out = append(out, marketPresentation(entry))
			}
		}
		respond(w, 200, out)
	})
	mux.HandleFunc("GET /api/versions/{id}", func(w http.ResponseWriter, r *http.Request) {
		a, ok := s.visible(w, r)
		if ok {
			if a.Status == "approved" {
				ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
				a.Stats = s.petStats(ctx, a)
				cancel()
			}
			respond(w, 200, a)
		}
	})
	mux.HandleFunc("GET /api/versions/{id}/install", func(w http.ResponseWriter, r *http.Request) {
		var a Record
		if s.store.get("records", r.PathValue("id"), &a) != nil || a.Status != "approved" {
			http.NotFound(w, r)
			return
		}
		a = marketPresentation(a)
		respond(w, 200, map[string]any{"id": a.ID, "pet": a.Pet, "source": a.Source, "sha256": a.SHA256, "size": a.Size, "url": a.Source.URL})
	})
	mux.HandleFunc("GET /api/versions/{id}/preview/{file...}", func(w http.ResponseWriter, r *http.Request) {
		a, ok := s.visible(w, r)
		if !ok {
			return
		}
		file := r.PathValue("file")
		if !packageFile.MatchString(file) || !strings.HasSuffix(file, ".png") {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Cache-Control", "private, max-age=3600")
		w.Header().Set("Content-Type", "image/png")
		http.ServeFile(w, r, filepath.Join(s.cfg.DataDir, "previews", previewKey(a), filepath.FromSlash(file)))
	})
	mux.HandleFunc("GET /api/admin/versions", func(w http.ResponseWriter, r *http.Request) {
		if _, ok := s.requireAdmin(w, r); !ok {
			return
		}
		all, e := s.store.records()
		if e != nil {
			failure(w, 500, e)
			return
		}
		respond(w, 200, all)
	})
	mux.HandleFunc("GET /api/admin/queue", s.adminQueue)
	mux.HandleFunc("POST /api/admin/versions/{id}/{action}", func(w http.ResponseWriter, r *http.Request) {
		u, ok := s.requireAdmin(w, r)
		if !ok {
			return
		}
		var b struct {
			Reason string `json:"reason"`
		}
		if e := s.input(w, r, &b); e != nil || len(b.Reason) > 2000 {
			failure(w, 400, errors.New("无效管理原因"))
			return
		}
		if e := s.store.review(r.PathValue("id"), u.Login, r.PathValue("action"), b.Reason); e != nil {
			failure(w, 409, e)
			return
		}
		_ = s.store.audit(u.Login, "pet."+r.PathValue("action"), r.PathValue("id"), b.Reason)
		respond(w, 200, map[string]bool{"ok": true})
	})
	mux.Handle("/", staticWeb(webFiles()))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "same-origin")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'")
		if r.Method == "POST" && !s.allowRequest(r) {
			failure(w, 429, errors.New("请求过于频繁，请稍后重试"))
			return
		}
		mux.ServeHTTP(w, r)
	})
}

// staticWeb 伺服内嵌的官网/集市资源。embed.FS 的文件没有修改时间，浏览器既拿不到
// Last-Modified 也没有 ETag，只能按启发式规则缓存：升级二进制后用户可能一直看到旧
// 的 CSS。所以文本资源一律要求回源（no-cache），图片这类大文件才允许长缓存。
func staticWeb(files fs.FS) http.Handler {
	serve := http.FileServer(http.FS(files))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch strings.ToLower(path.Ext(r.URL.Path)) {
		case ".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico", ".svg":
			w.Header().Set("Cache-Control", "public, max-age=604800")
		default:
			w.Header().Set("Cache-Control", "no-cache")
		}
		serve.ServeHTTP(w, r)
	})
}
func (s *Server) visible(w http.ResponseWriter, r *http.Request) (Record, bool) {
	var a Record
	if s.store.get("records", r.PathValue("id"), &a) != nil {
		http.NotFound(w, r)
		return a, false
	}
	if a.Status != "approved" {
		u, e := s.session(r)
		credential, credentialError := s.store.adminCredential()
		if e != nil || !s.admin(u.Login) || credentialError != nil || credential.MustChange {
			http.NotFound(w, r)
			return a, false
		}
	}
	return marketPresentation(a), true
}
func (s *Server) requireAdmin(w http.ResponseWriter, r *http.Request) (Session, bool) {
	u, e := s.session(r)
	if e != nil || !s.admin(u.Login) {
		failure(w, 403, errors.New("需要管理员权限"))
		return u, false
	}
	a, e := s.store.adminCredential()
	if e != nil || a.MustChange {
		failure(w, 403, errors.New("请先修改初始管理员密码"))
		return u, false
	}
	return u, true
}
func (s *Server) submit(w http.ResponseWriter, r *http.Request) {
	s.submitMu.Lock()
	defer s.submitMu.Unlock()
	var b struct {
		Repository string
		Tag        string
		AssetName  string
	}
	if e := s.input(w, r, &b); e != nil {
		failure(w, 400, e)
		return
	}
	repo, e := parseRepository(b.Repository)
	if e != nil {
		failure(w, 400, e)
		return
	}
	repositoryOnly := b.Tag == "" && b.AssetName == ""
	if !repositoryOnly && (!field(b.Tag, 100) || !field(b.AssetName, 120) || !strings.HasSuffix(b.AssetName, ".petpack")) {
		failure(w, 400, errors.New("请填写有效仓库、标签和 .petpack 附件名"))
		return
	}
	if !s.allowRate("submission:"+clientIP(r), 10, time.Hour) {
		failure(w, 429, errors.New("投稿过于频繁，请稍后重试"))
		return
	}
	if repositoryOnly {
		if discoverer, ok := s.github.(interface {
			Discover(context.Context, string) ([]RepositoryPet, error)
		}); ok {
			ctx, cancel := context.WithTimeout(r.Context(), 45*time.Second)
			works, err := discoverer.Discover(ctx, repo)
			cancel()
			if err != nil {
				failure(w, 400, err)
				return
			}
			if works != nil {
				s.submitRepository(w, r, repo, works)
				return
			}
		}
		ctx, cancel := context.WithTimeout(r.Context(), 12*time.Second)
		defer cancel()
		source, err := s.github.Resolve(ctx, repo, "", "")
		if err != nil {
			failure(w, 400, err)
			return
		}
		b.Tag, b.AssetName = source.Tag, source.Name
	}
	salt, e := s.store.submissionSalt()
	if e != nil {
		failure(w, 500, e)
		return
	}
	ipHash := sessionKey(salt + "/" + clientIP(r))
	all, e := s.store.records()
	if e != nil {
		failure(w, 500, e)
		return
	}
	// A legacy single-pet repository can move unchanged identity to a new Release.
	if repositoryOnly {
		candidate := Record{Repository: repo, Tag: b.Tag, AssetName: b.AssetName}
		hasPublished, knownTarget := false, false
		for _, a := range all {
			if a.RefreshOf == "" && strings.EqualFold(a.Repository, repo) {
				knownTarget = knownTarget || (a.Tag == b.Tag && a.AssetName == b.AssetName)
				hasPublished = hasPublished || (a.Status == "approved" && a.Work == nil)
			}
		}
		if hasPublished && !knownTarget {
			if pet, _, err := s.readPresentation(r.Context(), candidate); err == nil {
				for _, a := range all {
					if a.RefreshOf == "" && a.Status == "approved" && a.Work == nil && strings.EqualFold(a.Repository, repo) && a.Pet != nil && a.Pet.ID == pet.ID && a.Pet.Version == pet.Version {
						work := RepositoryPet{Tag: b.Tag, AssetName: b.AssetName}
						task, created, err := s.queuePresentationRefresh(a, &work, "手动资料刷新", false)
						if err != nil {
							failure(w, 429, err)
							return
						}
						code := 200
						if created {
							code = 202
						}
						respond(w, code, map[string]any{"id": task.ID, "record": submissionStatus(task), "existing": !created, "refreshCount": boolCount(created)})
						return
					}
				}
			}
		}
	}
	pending, total := 0, 0
	for _, a := range all {
		if strings.EqualFold(a.Repository, repo) && a.Tag == b.Tag && a.AssetName == b.AssetName && a.Status != "failed" && a.RefreshOf == "" {
			if a.Status == "approved" {
				task, created, err := s.queuePresentationRefresh(a, nil, "手动资料刷新", false)
				if err != nil {
					failure(w, 429, err)
					return
				}
				code := 200
				if created {
					code = 202
				}
				respond(w, code, map[string]any{"id": task.ID, "record": submissionStatus(task), "existing": !created, "refreshCount": boolCount(created)})
				return
			}
			if repositoryOnly {
				respond(w, 200, map[string]any{"id": a.ID, "record": submissionStatus(a), "existing": true})
				return
			}
			failure(w, 409, errors.New("该附件已经提交"))
			return
		}
		if a.Status == "queued" || a.Status == "validating" || a.Status == "pending" {
			total++
			var secret SubmissionSecret
			if s.store.get("submission-secrets", a.ID, &secret) == nil && secret.IPHash == ipHash {
				pending++
			}
		}
	}
	if pending >= 5 || total >= 200 {
		failure(w, 429, errors.New("待处理投稿已达上限，请稍后再试"))
		return
	}
	token := newID()
	a := Record{ID: newID(), Repository: repo, Tag: b.Tag, AssetName: b.AssetName, Submitter: "匿名投稿（身份未验证）", Status: "queued", Reviews: []Review{}, Created: time.Now().UTC(), Updated: time.Now().UTC()}
	if e = s.store.createSubmission(a, SubmissionSecret{TokenHash: sessionKey(token), IPHash: ipHash}); e != nil {
		failure(w, 500, e)
		return
	}
	respond(w, 202, map[string]any{"id": a.ID, "token": token, "record": a})
}
func (s *Server) lookupSubmission(w http.ResponseWriter, r *http.Request) {
	var b struct {
		Repository string
		ID         string
		Token      string
	}
	if e := s.input(w, r, &b); e != nil {
		failure(w, 400, e)
		return
	}
	if b.Repository != "" {
		repo, e := parseRepository(b.Repository)
		if e != nil {
			failure(w, 400, e)
			return
		}
		all, e := s.store.records()
		if e != nil {
			failure(w, 500, e)
			return
		}
		rows := []any{}
		for _, a := range all {
			if strings.EqualFold(a.Repository, repo) {
				rows = append(rows, submissionStatus(a))
			}
		}
		respond(w, 200, map[string]any{"repository": repo, "records": rows})
		return
	}
	var secret SubmissionSecret
	var a Record
	if len(b.ID) != 48 || len(b.Token) != 48 || s.store.get("submission-secrets", b.ID, &secret) != nil || secret.TokenHash != sessionKey(b.Token) || s.store.get("records", b.ID, &a) != nil {
		failure(w, 404, errors.New("投稿编号或管理凭证无效"))
		return
	}
	respond(w, 200, a)
}

// Repository lookups are public status summaries, never private records or previews.
func submissionStatus(a Record) map[string]any {
	result := map[string]any{"id": a.ID, "repository": a.Repository, "tag": a.Tag, "assetName": a.AssetName, "status": a.Status, "createdAt": a.Created, "updatedAt": a.Updated}
	if a.RefreshOf != "" {
		result["refreshOf"] = a.RefreshOf
	}
	if a.Error != "" {
		result["error"] = a.Error
	}
	if a.Pet != nil {
		result["pet"] = map[string]string{"name": a.Pet.Name, "version": a.Pet.Version}
	}
	if len(a.Reviews) > 0 {
		result["reason"] = a.Reviews[len(a.Reviews)-1].Reason
	}
	return result
}
func (s *Server) worker(ctx context.Context) {
	_ = s.store.cleanExpired()
	lastCleanup := time.Now()
	all, _ := s.store.records()
	for _, a := range all {
		if a.Status == "validating" || a.Status == "pending" {
			a.Status = "queued"
			s.store.put("records", a.ID, a)
		}
	}
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if time.Since(lastCleanup) > time.Minute {
				_ = s.store.cleanExpired()
				lastCleanup = time.Now()
			}
			all, e := s.store.records()
			if e != nil {
				log.Print(e)
				continue
			}
			processed := false
			for i := len(all) - 1; i >= 0; i-- {
				a := all[i]
				if a.Status == "queued" {
					s.validate(ctx, a)
					processed = true
					break
				}
			}
			if !processed && s.cfg.SyncInterval > 0 {
				s.checkNextSource(ctx, all, time.Now().UTC())
			}
			ticker.Reset(10 * time.Second)
		}
	}
}
func (s *Server) validate(ctx context.Context, a Record) {
	if a.RefreshOf != "" {
		s.validatePresentationRefresh(ctx, a)
		return
	}
	a.Status = "validating"
	a.Updated = time.Now().UTC()
	if e := s.store.put("records", a.ID, a); e != nil {
		log.Print(e)
		return
	}
	e := s.validateInner(ctx, &a)
	if e != nil {
		a.Status = "failed"
		a.Error = e.Error()
		if ctx.Err() != nil {
			a.Status = "queued"
			a.Error = ""
		}
	} else {
		a.Status = "approved"
		a.Error = ""
		a.Reviews = append(a.Reviews, Review{Actor: "system", Action: "auto-publish", Reason: "资料自动校验通过，已上架", At: time.Now().UTC()})
	}
	a.Updated = time.Now().UTC()
	if e = s.store.put("records", a.ID, a); e != nil {
		log.Print(e)
	} else if a.Status == "approved" {
		if err := s.store.audit("system", "pet.auto-publish", a.ID, "资料自动校验通过，已上架"); err != nil {
			log.Print(err)
		}
	}
}
func (s *Server) validateInner(ctx context.Context, a *Record) error {
	if a.Work != nil {
		if e := a.Work.validate(); e != nil {
			return e
		}
	}
	source, e := s.github.Resolve(ctx, a.Repository, a.Tag, a.AssetName)
	if e != nil {
		return e
	}
	var pet Pet
	var cover []byte
	if a.Work != nil {
		reader, ok := s.github.(interface {
			PresentationAt(context.Context, string, string, string) (Pet, []byte, error)
		})
		if !ok {
			return errors.New("当前仓库读取器不支持多作品目录")
		}
		pet, cover, e = reader.PresentationAt(ctx, a.Repository, a.Tag, a.Work.Path)
	} else {
		pet, cover, e = s.github.Presentation(ctx, a.Repository, a.Tag)
	}
	if e != nil {
		return e
	}
	if !validCharacter(pet.Character) {
		return errors.New("仓库 pet.json 的角色信息无效")
	}
	if strings.TrimSpace(pet.Author) == "" {
		pet.Author = repositoryOwner(Record{Repository: a.Repository, Source: &source})
	}
	if pet.FormatVersion != 1 || !packageID.MatchString(pet.ID) || !semver.MatchString(pet.Version) || len(pet.Version) > 32 || (pet.MinAppVersion != "0.4.0" && pet.MinAppVersion != "0.4.9" && pet.MinAppVersion != "0.5.0") || !field(pet.Name, 40) || !field(pet.Author, 100) || !field(pet.License, 200) || len([]rune(pet.Description)) > 2000 {
		return errors.New("仓库 pet.json 的作品信息无效")
	}
	image, e := decodePNG(cover, true)
	if e != nil {
		return e
	}
	if a.Work != nil && (pet.ID != a.Work.ID || pet.Version != a.Work.Version) {
		return errors.New("作品资料与索引中的 ID 或版本不符")
	}
	tmpRoot := filepath.Join(s.cfg.DataDir, "tmp")
	if e = os.MkdirAll(tmpRoot, 0700); e != nil {
		return e
	}
	tmp, e := os.MkdirTemp(tmpRoot, "validate-")
	if e != nil {
		return e
	}
	defer os.RemoveAll(tmp)
	packageFile := filepath.Join(tmp, "download.petpack")
	if e = s.github.Download(ctx, source, packageFile); e != nil {
		return e
	}
	pack, e := parsePack(packageFile)
	if e != nil {
		return e
	}
	if pack.Size != source.Size {
		return errors.New("资源包大小与 Release 信息不符")
	}
	roleID := func(p *Character) string {
		if p == nil {
			return ""
		}
		return p.ID
	}
	if pack.Pet.ID != pet.ID || pack.Pet.Version != pet.Version || roleID(pack.Pet.Character) != roleID(pet.Character) {
		return errors.New("包内作品 ID、版本或角色归属与仓库资料不符")
	}
	digest, e := presentationDigest(pet, cover)
	if e != nil {
		return e
	}
	// Repository fields describe the market listing; technical compatibility comes from the package.
	pet.FormatVersion = pack.Pet.FormatVersion
	pet.MinAppVersion = pack.Pet.MinAppVersion
	all, e := s.store.records()
	if e != nil {
		return e
	}
	for _, old := range all {
		if old.ID != a.ID && old.ID != a.RefreshOf && old.RefreshOf == "" && old.Source != nil && old.Pet != nil && old.Source.RepoID == source.RepoID && old.Pet.ID == pet.ID && old.Pet.Version == pet.Version {
			return errors.New("该作品版本已存在，请增加版本号后重新提交")
		}
	}
	dest := filepath.Join(s.cfg.DataDir, "previews", a.ID)
	if e = os.MkdirAll(dest, 0700); e != nil {
		return e
	}
	previewDir := filepath.Join(tmp, "preview")
	preview, e := previewPack(pack, previewDir)
	if e != nil {
		return e
	}
	// Use the independently authored repository cover for the market snapshot.
	if e = os.Remove(filepath.Join(previewDir, "cover.png")); e != nil {
		return e
	}
	if e = writePNG(filepath.Join(previewDir, "cover.png"), image); e != nil {
		return e
	}
	if e = os.RemoveAll(dest); e != nil {
		return e
	}
	if e = os.Rename(previewDir, dest); e != nil {
		return e
	}
	a.Source = &source
	a.Pet = &pet
	a.SHA256 = pack.Hash
	a.Size = source.Size
	a.Preview = preview
	a.PresentationDigest = digest
	return nil
}
func validPublicURL(raw string, dev bool) error {
	u, e := url.Parse(raw)
	if e != nil || u.User != nil || u.RawQuery != "" || u.Fragment != "" || u.Path != "" {
		return errors.New("PUBLIC_URL 必须是无路径的域名根地址")
	}
	if u.Scheme == "https" && u.Hostname() != "" {
		return nil
	}
	if dev && u.Scheme == "http" && (u.Hostname() == "127.0.0.1" || u.Hostname() == "localhost") {
		return nil
	}
	return fmt.Errorf("生产 PUBLIC_URL 必须使用 HTTPS")
}

type rateWindow struct {
	Start  time.Time
	Count  int
	Window time.Duration
}

func clientIP(r *http.Request) string {
	host, _, _ := net.SplitHostPort(r.RemoteAddr)
	if ip := net.ParseIP(host); ip != nil && ip.IsLoopback() {
		if forwarded := net.ParseIP(r.Header.Get("X-Forwarded-For")); forwarded != nil {
			host = forwarded.String()
		}
	}
	return host
}
func (s *Server) allowRequest(r *http.Request) bool {
	return s.allowRate("request:"+clientIP(r), 120, time.Minute)
}
func (s *Server) allowRate(key string, limit int, window time.Duration) bool {
	s.rateMu.Lock()
	defer s.rateMu.Unlock()
	if s.rates == nil {
		s.rates = map[string]rateWindow{}
	}
	now := time.Now()
	if len(s.rates) >= 4096 {
		for key, v := range s.rates {
			if now.Sub(v.Start) > v.Window {
				delete(s.rates, key)
			}
		}
	}
	v, ok := s.rates[key]
	if !ok && len(s.rates) >= 4096 {
		return false
	}
	if !ok || now.Sub(v.Start) > window {
		v = rateWindow{Start: now, Window: window}
	}
	v.Count++
	s.rates[key] = v
	return v.Count <= limit
}
