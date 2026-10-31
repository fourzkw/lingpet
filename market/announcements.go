package main

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode/utf16"

	bolt "go.etcd.io/bbolt"
)

var appVersionPattern = downloadVersion

type Announcement struct {
	ID             string     `json:"id"`
	Title          string     `json:"title"`
	Body           string     `json:"body"`
	Level          string     `json:"level"`
	MinAppVersion  string     `json:"minAppVersion,omitempty"`
	MaxAppVersion  string     `json:"maxAppVersion,omitempty"`
	ForceShow      bool       `json:"forceShow"`
	Link           string     `json:"link,omitempty"`
	LinkLabel      string     `json:"linkLabel,omitempty"`
	Published      bool       `json:"published"`
	StartsAt       *time.Time `json:"startsAt,omitempty"`
	EndsAt         *time.Time `json:"endsAt,omitempty"`
	Actor          string     `json:"actor,omitempty"`
	Created        time.Time  `json:"createdAt"`
	Updated        time.Time  `json:"updatedAt"`
}

type announcementInput struct {
	Title         string `json:"title"`
	Body          string `json:"body"`
	Level         string `json:"level"`
	MinAppVersion string `json:"minAppVersion"`
	MaxAppVersion string `json:"maxAppVersion"`
	ForceShow     bool   `json:"forceShow"`
	Link          string `json:"link"`
	LinkLabel     string `json:"linkLabel"`
	Published     bool   `json:"published"`
	StartsAt      string `json:"startsAt"`
	EndsAt        string `json:"endsAt"`
}

func announcementLevels() map[string]int {
	return map[string]int{"info": 1, "important": 2, "critical": 3}
}

func compareAppVersions(a, b string) (int, error) {
	parse := func(v string) ([3]int, error) {
		if !appVersionPattern.MatchString(v) {
			return [3]int{}, errors.New("无效应用版本")
		}
		parts := strings.Split(v, ".")
		out := [3]int{}
		for i := 0; i < 3; i++ {
			n, e := strconv.Atoi(parts[i])
			if e != nil {
				return [3]int{}, errors.New("无效应用版本")
			}
			out[i] = n
		}
		return out, nil
	}
	x, e := parse(a)
	if e != nil {
		return 0, e
	}
	y, e := parse(b)
	if e != nil {
		return 0, e
	}
	for i := 0; i < 3; i++ {
		if x[i] != y[i] {
			if x[i] > y[i] {
				return 1, nil
			}
			return -1, nil
		}
	}
	return 0, nil
}

func parseAnnouncementTime(raw string) (*time.Time, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, nil
	}
	for _, layout := range []string{time.RFC3339, "2006-01-02T15:04", "2006-01-02"} {
		if t, e := time.Parse(layout, raw); e == nil {
			u := t.UTC()
			return &u, nil
		}
	}
	return nil, errors.New("时间格式无效，请使用 RFC3339 或 YYYY-MM-DD")
}

func validateAnnouncementLink(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", nil
	}
	if len(raw) > 500 {
		return "", errors.New("链接过长")
	}
	u, e := url.Parse(raw)
	if e != nil || u.User != nil || u.Fragment != "" || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" {
		return "", errors.New("链接须为 http 或 https 地址")
	}
	return u.String(), nil
}

func normalizeAnnouncementInput(in announcementInput) (Announcement, error) {
	title := strings.TrimSpace(in.Title)
	body := strings.TrimSpace(in.Body)
	level := strings.TrimSpace(in.Level)
	if level == "" {
		level = "info"
	}
	if !field(title, 80) || len(utf16.Encode([]rune(body))) == 0 || len(utf16.Encode([]rune(body))) > 4000 {
		return Announcement{}, errors.New("请填写有效的标题与正文")
	}
	if announcementLevels()[level] == 0 {
		return Announcement{}, errors.New("公告级别无效")
	}
	minVersion := strings.TrimSpace(in.MinAppVersion)
	maxVersion := strings.TrimSpace(in.MaxAppVersion)
	if minVersion != "" && !appVersionPattern.MatchString(minVersion) {
		return Announcement{}, errors.New("最低版本格式无效")
	}
	if maxVersion != "" && !appVersionPattern.MatchString(maxVersion) {
		return Announcement{}, errors.New("最高版本格式无效")
	}
	if minVersion != "" && maxVersion != "" {
		if order, e := compareAppVersions(minVersion, maxVersion); e != nil || order > 0 {
			return Announcement{}, errors.New("版本范围无效")
		}
	}
	link, e := validateAnnouncementLink(in.Link)
	if e != nil {
		return Announcement{}, e
	}
	label := strings.TrimSpace(in.LinkLabel)
	if link == "" {
		label = ""
	} else if label == "" {
		label = "了解详情"
	} else if !field(label, 40) {
		return Announcement{}, errors.New("链接文案无效")
	}
	starts, e := parseAnnouncementTime(in.StartsAt)
	if e != nil {
		return Announcement{}, e
	}
	ends, e := parseAnnouncementTime(in.EndsAt)
	if e != nil {
		return Announcement{}, e
	}
	if starts != nil && ends != nil && !ends.After(*starts) {
		return Announcement{}, errors.New("结束时间须晚于开始时间")
	}
	return Announcement{
		Title:         title,
		Body:          body,
		Level:         level,
		MinAppVersion: minVersion,
		MaxAppVersion: maxVersion,
		ForceShow:     in.ForceShow,
		Link:          link,
		LinkLabel:     label,
		Published:     in.Published,
		StartsAt:      starts,
		EndsAt:        ends,
	}, nil
}

func publicAnnouncement(a Announcement) Announcement {
	a.Actor = ""
	return a
}

func announcementActive(a Announcement, now time.Time) bool {
	if !a.Published {
		return false
	}
	if a.StartsAt != nil && now.Before(*a.StartsAt) {
		return false
	}
	if a.EndsAt != nil && !now.Before(*a.EndsAt) {
		return false
	}
	return true
}

func announcementMatchesVersion(a Announcement, appVersion string) bool {
	if appVersion == "" {
		return true
	}
	if !appVersionPattern.MatchString(appVersion) {
		return false
	}
	if a.MinAppVersion != "" {
		if order, e := compareAppVersions(appVersion, a.MinAppVersion); e != nil || order < 0 {
			return false
		}
	}
	if a.MaxAppVersion != "" {
		if order, e := compareAppVersions(appVersion, a.MaxAppVersion); e != nil || order > 0 {
			return false
		}
	}
	return true
}

func sortAnnouncements(rows []Announcement) {
	rank := announcementLevels()
	sort.SliceStable(rows, func(i, j int) bool {
		if rank[rows[i].Level] != rank[rows[j].Level] {
			return rank[rows[i].Level] > rank[rows[j].Level]
		}
		return rows[i].Updated.After(rows[j].Updated)
	})
}

func (s *Store) listAnnouncements() ([]Announcement, error) {
	out := []Announcement{}
	e := s.db.View(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte("announcements"))
		if b == nil {
			return nil
		}
		return b.ForEach(func(_, v []byte) error {
			var a Announcement
			if e := json.Unmarshal(v, &a); e != nil {
				return e
			}
			out = append(out, a)
			return nil
		})
	})
	sortAnnouncements(out)
	return out, e
}

func (s *Store) getAnnouncement(id string) (Announcement, error) {
	var a Announcement
	e := s.get("announcements", id, &a)
	return a, e
}

func (s *Store) putAnnouncement(a Announcement) error {
	return s.put("announcements", a.ID, a)
}

func (s *Store) deleteAnnouncement(id string) error {
	return s.db.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte("announcements"))
		if b.Get([]byte(id)) == nil {
			return os.ErrNotExist
		}
		return b.Delete([]byte(id))
	})
}

func (s *Server) listPublicAnnouncements(w http.ResponseWriter, r *http.Request) {
	appVersion := strings.TrimSpace(r.URL.Query().Get("appVersion"))
	if appVersion != "" && !appVersionPattern.MatchString(appVersion) {
		failure(w, 400, errors.New("无效应用版本"))
		return
	}
	all, e := s.store.listAnnouncements()
	if e != nil {
		failure(w, 500, e)
		return
	}
	now := time.Now().UTC()
	out := []Announcement{}
	for _, a := range all {
		if announcementActive(a, now) && announcementMatchesVersion(a, appVersion) {
			out = append(out, publicAnnouncement(a))
		}
	}
	if len(out) > 20 {
		out = out[:20]
	}
	respond(w, 200, out)
}

func (s *Server) adminListAnnouncements(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireAdmin(w, r); !ok {
		return
	}
	all, e := s.store.listAnnouncements()
	if e != nil {
		failure(w, 500, e)
		return
	}
	respond(w, 200, all)
}

func (s *Server) adminCreateAnnouncement(w http.ResponseWriter, r *http.Request) {
	u, ok := s.requireAdmin(w, r)
	if !ok {
		return
	}
	var in announcementInput
	if e := s.input(w, r, &in); e != nil {
		failure(w, 400, e)
		return
	}
	value, e := normalizeAnnouncementInput(in)
	if e != nil {
		failure(w, 400, e)
		return
	}
	now := time.Now().UTC()
	value.ID = newID()
	value.Actor = u.Login
	value.Created = now
	value.Updated = now
	if e := s.store.putAnnouncement(value); e != nil {
		failure(w, 500, e)
		return
	}
	_ = s.store.audit(u.Login, "announcement.create", value.ID, value.Title)
	respond(w, 200, value)
}

func (s *Server) adminUpdateAnnouncement(w http.ResponseWriter, r *http.Request) {
	u, ok := s.requireAdmin(w, r)
	if !ok {
		return
	}
	id := r.PathValue("id")
	if len(id) != 48 {
		failure(w, 400, errors.New("无效公告编号"))
		return
	}
	old, e := s.store.getAnnouncement(id)
	if e != nil {
		failure(w, 404, errors.New("公告不存在"))
		return
	}
	var in announcementInput
	if e := s.input(w, r, &in); e != nil {
		failure(w, 400, e)
		return
	}
	value, e := normalizeAnnouncementInput(in)
	if e != nil {
		failure(w, 400, e)
		return
	}
	value.ID = old.ID
	value.Actor = u.Login
	value.Created = old.Created
	value.Updated = time.Now().UTC()
	if e := s.store.putAnnouncement(value); e != nil {
		failure(w, 500, e)
		return
	}
	_ = s.store.audit(u.Login, "announcement.update", value.ID, value.Title)
	respond(w, 200, value)
}

func (s *Server) adminAnnouncementAction(w http.ResponseWriter, r *http.Request) {
	u, ok := s.requireAdmin(w, r)
	if !ok {
		return
	}
	id := r.PathValue("id")
	action := r.PathValue("action")
	if len(id) != 48 {
		failure(w, 400, errors.New("无效公告编号"))
		return
	}
	var body struct{}
	if e := s.input(w, r, &body); e != nil {
		failure(w, 400, e)
		return
	}
	old, e := s.store.getAnnouncement(id)
	if e != nil {
		failure(w, 404, errors.New("公告不存在"))
		return
	}
	switch action {
	case "publish":
		if old.Published {
			failure(w, 409, errors.New("公告已发布"))
			return
		}
		old.Published = true
		old.Actor = u.Login
		old.Updated = time.Now().UTC()
		if e := s.store.putAnnouncement(old); e != nil {
			failure(w, 500, e)
			return
		}
		_ = s.store.audit(u.Login, "announcement.publish", id, old.Title)
		respond(w, 200, old)
	case "unpublish":
		if !old.Published {
			failure(w, 409, errors.New("公告未发布"))
			return
		}
		old.Published = false
		old.Actor = u.Login
		old.Updated = time.Now().UTC()
		if e := s.store.putAnnouncement(old); e != nil {
			failure(w, 500, e)
			return
		}
		_ = s.store.audit(u.Login, "announcement.unpublish", id, old.Title)
		respond(w, 200, old)
	case "delete":
		if e := s.store.deleteAnnouncement(id); e != nil {
			failure(w, 404, errors.New("公告不存在"))
			return
		}
		_ = s.store.audit(u.Login, "announcement.delete", id, old.Title)
		respond(w, 200, map[string]bool{"ok": true})
	default:
		failure(w, 404, errors.New("未知管理操作"))
	}
}
