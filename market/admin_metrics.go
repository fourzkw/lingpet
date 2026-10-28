package main

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	bolt "go.etcd.io/bbolt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

type Metric struct {
	Count int64
	Bytes int64
}
type Audit struct {
	ID     string    `json:"id"`
	Actor  string    `json:"actor"`
	Action string    `json:"action"`
	Target string    `json:"target"`
	Detail string    `json:"detail"`
	At     time.Time `json:"at"`
}
type trackedResponse struct {
	http.ResponseWriter
	status int
	bytes  int64
}

func (w *trackedResponse) WriteHeader(status int) {
	if w.status == 0 {
		w.status = status
		w.ResponseWriter.WriteHeader(status)
	}
}
func (w *trackedResponse) Write(data []byte) (int, error) {
	if w.status == 0 {
		w.WriteHeader(200)
	}
	n, e := w.ResponseWriter.Write(data)
	w.bytes += int64(n)
	return n, e
}
func (w *trackedResponse) Unwrap() http.ResponseWriter { return w.ResponseWriter }

var statsZone = time.FixedZone("Asia/Shanghai", 8*60*60)

func (s *Store) metric(kind string, bytes int64) error {
	key := time.Now().In(statsZone).Format("2006-01-02") + "/" + kind
	return s.db.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte("metrics"))
		var value Metric
		if old := b.Get([]byte(key)); old != nil {
			if e := json.Unmarshal(old, &value); e != nil {
				return e
			}
		}
		value.Count++
		value.Bytes += bytes
		data, e := json.Marshal(value)
		if e != nil {
			return e
		}
		return b.Put([]byte(key), data)
	})
}
func appendAudit(tx *bolt.Tx, actor, action, target, detail string) error {
	value := Audit{ID: newID(), Actor: actor, Action: action, Target: target, Detail: detail, At: time.Now().UTC()}
	data, e := json.Marshal(value)
	if e != nil {
		return e
	}
	b := tx.Bucket([]byte("admin-audit"))
	key := value.At.Format("20060102T150405.000000000") + "/" + value.ID
	if e = b.Put([]byte(key), data); e != nil {
		return e
	}
	for b.Stats().KeyN > 1000 {
		cursor := b.Cursor()
		k, _ := cursor.First()
		if k == nil {
			break
		}
		if e = cursor.Delete(); e != nil {
			return e
		}
	}
	return nil
}
func (s *Store) audit(actor, action, target, detail string) error {
	return s.db.Update(func(tx *bolt.Tx) error { return appendAudit(tx, actor, action, target, detail) })
}
func (s *Server) adminAudit(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireAdmin(w, r); !ok {
		return
	}
	out := []Audit{}
	e := s.store.db.View(func(tx *bolt.Tx) error {
		c := tx.Bucket([]byte("admin-audit")).Cursor()
		for _, v := c.Last(); v != nil && len(out) < 100; _, v = c.Prev() {
			var a Audit
			if e := json.Unmarshal(v, &a); e != nil {
				return e
			}
			out = append(out, a)
		}
		return nil
	})
	if e != nil {
		failure(w, 500, e)
		return
	}
	respond(w, 200, out)
}
func (s *Server) stats(days int) (map[string]any, error) {
	s.releaseMu.Lock()
	defer s.releaseMu.Unlock()
	if e := s.importLegacyReleases(); e != nil {
		return nil, e
	}
	records, e := s.store.records()
	if e != nil {
		return nil, e
	}
	states := map[string]int{}
	for _, a := range records {
		states[a.Status]++
	}
	releases, e := s.releaseList()
	if e != nil {
		return nil, e
	}
	published := 0
	var storage int64
	for _, a := range releases {
		if a.Published {
			published++
		}
		if a.Available {
			storage += a.Size
		}
	}
	totals := map[string]Metric{}
	daily := map[string]map[string]Metric{}
	e = s.store.db.View(func(tx *bolt.Tx) error {
		return tx.Bucket([]byte("metrics")).ForEach(func(k, v []byte) error {
			parts := strings.SplitN(string(k), "/", 2)
			if len(parts) != 2 {
				return nil
			}
			var value Metric
			if e := json.Unmarshal(v, &value); e != nil {
				return e
			}
			total := totals[parts[1]]
			total.Count += value.Count
			total.Bytes += value.Bytes
			totals[parts[1]] = total
			if daily[parts[0]] == nil {
				daily[parts[0]] = map[string]Metric{}
			}
			daily[parts[0]][parts[1]] = value
			return nil
		})
	})
	if e != nil {
		return nil, e
	}
	rows := []map[string]any{}
	now := time.Now().In(statsZone)
	for i := days - 1; i >= 0; i-- {
		date := now.AddDate(0, 0, -i).Format("2006-01-02")
		values := daily[date]
		var downloadCount, downloadBytes int64
		for _, host := range []string{"dsh", "cursor", "codex"} {
			downloadCount += values["download."+host].Count
			downloadBytes += values["download."+host].Bytes
		}
		rows = append(rows, map[string]any{"date": date, "home": values["visit.home"].Count, "market": values["visit.market"].Count, "downloads": downloadCount, "bytes": downloadBytes})
	}
	return map[string]any{"version": strings.TrimSpace(marketVersion), "timezone": "Asia/Shanghai", "submissions": states, "submissionTotal": len(records), "releaseTotal": len(releases), "published": published, "packageBytes": storage, "totals": totals, "daily": rows, "uploadLimit": maxInstallerBytes}, nil
}
func statsDays(r *http.Request) int {
	v, _ := strconv.Atoi(r.URL.Query().Get("days"))
	if v == 7 || v == 30 || v == 90 {
		return v
	}
	return 14
}
func (s *Server) adminStats(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireAdmin(w, r); !ok {
		return
	}
	value, e := s.stats(statsDays(r))
	if e != nil {
		failure(w, 500, e)
		return
	}
	respond(w, 200, value)
}
func (s *Server) adminStatsCSV(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireAdmin(w, r); !ok {
		return
	}
	value, e := s.stats(statsDays(r))
	if e != nil {
		failure(w, 500, e)
		return
	}
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", "attachment; filename=lingpet-stats.csv")
	w.Header().Set("Cache-Control", "no-store")
	w.Write([]byte{0xef, 0xbb, 0xbf})
	writer := csv.NewWriter(w)
	writer.Write([]string{"日期(UTC+8)", "首页访问", "市场访问", "安装包下载请求", "服务发送字节"})
	for _, row := range value["daily"].([]map[string]any) {
		writer.Write([]string{fmt.Sprint(row["date"]), fmt.Sprint(row["home"]), fmt.Sprint(row["market"]), fmt.Sprint(row["downloads"]), fmt.Sprint(row["bytes"])})
	}
	writer.Flush()
}
