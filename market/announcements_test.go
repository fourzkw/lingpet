package main

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"
)

func TestAnnouncementLifecycleAndPublicFilter(t *testing.T) {
	_, ts, c := fixtureServer(t)
	status, _ := call(t, c, ts.URL, "GET", "/api/admin/announcements", nil)
	if status != 403 {
		t.Fatalf("admin list without login %d", status)
	}
	status, body := call(t, http.DefaultClient, ts.URL, "GET", "/api/announcements", nil)
	if status != 200 {
		t.Fatalf("public list %d %s", status, body)
	}
	var empty []Announcement
	if e := json.Unmarshal(body, &empty); e != nil || len(empty) != 0 {
		t.Fatalf("expected empty public list: %s", body)
	}

	loginAs(t, c, ts.URL, "admin")
	status, body = call(t, c, ts.URL, "POST", "/api/admin/announcements", map[string]any{
		"title": "维护通知", "body": "今晚将短暂维护市场服务。", "level": "important", "forceShow": true,
		"minAppVersion": "0.7.0", "maxAppVersion": "0.8.0", "link": "https://lingpet.fourzkw.top", "linkLabel": "查看官网",
		"published": false,
	})
	if status != 200 {
		t.Fatalf("create %d %s", status, body)
	}
	var created Announcement
	if e := json.Unmarshal(body, &created); e != nil || created.ID == "" || created.Published || created.Actor != "admin" {
		t.Fatalf("created payload %s", body)
	}

	status, body = call(t, http.DefaultClient, ts.URL, "GET", "/api/announcements?appVersion=0.7.32", nil)
	if status != 200 {
		t.Fatalf("public unpublished %d %s", status, body)
	}
	if e := json.Unmarshal(body, &empty); e != nil || len(empty) != 0 {
		t.Fatalf("unpublished should stay hidden: %s", body)
	}

	status, body = call(t, c, ts.URL, "POST", "/api/admin/announcements/"+created.ID+"/publish", map[string]any{})
	if status != 200 {
		t.Fatalf("publish %d %s", status, body)
	}
	status, body = call(t, http.DefaultClient, ts.URL, "GET", "/api/announcements?appVersion=0.7.32", nil)
	if status != 200 {
		t.Fatalf("public after publish %d %s", status, body)
	}
	var visible []Announcement
	if e := json.Unmarshal(body, &visible); e != nil || len(visible) != 1 || visible[0].ID != created.ID || visible[0].Actor != "" || !visible[0].ForceShow {
		t.Fatalf("expected one public announcement: %s", body)
	}
	status, body = call(t, http.DefaultClient, ts.URL, "GET", "/api/announcements?appVersion=0.6.0", nil)
	if status != 200 {
		t.Fatalf("filtered list %d %s", status, body)
	}
	if e := json.Unmarshal(body, &empty); e != nil || len(empty) != 0 {
		t.Fatalf("version filter failed: %s", body)
	}

	status, body = call(t, c, ts.URL, "POST", "/api/admin/announcements/"+created.ID, map[string]any{
		"title": "维护已结束", "body": "服务已恢复。", "level": "info", "published": true,
	})
	if status != 200 {
		t.Fatalf("update %d %s", status, body)
	}
	var updated Announcement
	if e := json.Unmarshal(body, &updated); e != nil || updated.Title != "维护已结束" || updated.Level != "info" || updated.ForceShow {
		t.Fatalf("updated payload %s", body)
	}

	status, body = call(t, c, ts.URL, "POST", "/api/admin/announcements/"+created.ID+"/unpublish", map[string]any{})
	if status != 200 {
		t.Fatalf("unpublish %d %s", status, body)
	}
	status, body = call(t, c, ts.URL, "POST", "/api/admin/announcements/"+created.ID+"/delete", map[string]any{})
	if status != 200 {
		t.Fatalf("delete %d %s", status, body)
	}
	status, _ = call(t, c, ts.URL, "GET", "/api/admin/announcements", nil)
	if status != 200 {
		t.Fatalf("admin list after delete %d", status)
	}
	status, body = call(t, c, ts.URL, "GET", "/api/admin/audit", nil)
	if status != 200 {
		t.Fatalf("audit %d %s", status, body)
	}
	if !containsAll(string(body), []string{"announcement.create", "announcement.publish", "announcement.update", "announcement.unpublish", "announcement.delete"}) {
		t.Fatalf("missing announcement audit entries: %s", body)
	}
}

func TestAnnouncementScheduleAndValidation(t *testing.T) {
	_, ts, c := fixtureServer(t)
	loginAs(t, c, ts.URL, "admin")
	future := time.Now().UTC().Add(2 * time.Hour).Format(time.RFC3339)
	status, body := call(t, c, ts.URL, "POST", "/api/admin/announcements", map[string]any{
		"title": "预约公告", "body": "尚未开始", "level": "info", "published": true, "startsAt": future,
	})
	if status != 200 {
		t.Fatalf("create scheduled %d %s", status, body)
	}
	status, body = call(t, http.DefaultClient, ts.URL, "GET", "/api/announcements", nil)
	if status != 200 {
		t.Fatalf("public scheduled %d %s", status, body)
	}
	var rows []Announcement
	if e := json.Unmarshal(body, &rows); e != nil || len(rows) != 0 {
		t.Fatalf("future announcement should hide: %s", body)
	}
	for _, bad := range []map[string]any{
		{"title": "", "body": "x", "level": "info"},
		{"title": "x", "body": "y", "level": "urgent"},
		{"title": "x", "body": "y", "level": "info", "link": "javascript:alert(1)"},
		{"title": "x", "body": "y", "level": "info", "minAppVersion": "1.2"},
		{"title": "x", "body": "y", "level": "info", "minAppVersion": "0.8.0", "maxAppVersion": "0.7.0"},
	} {
		status, body = call(t, c, ts.URL, "POST", "/api/admin/announcements", bad)
		if status != 400 {
			t.Fatalf("expected validation failure for %#v got %d %s", bad, status, body)
		}
	}
}

func containsAll(raw string, parts []string) bool {
	for _, part := range parts {
		if !strings.Contains(raw, part) {
			return false
		}
	}
	return true
}
