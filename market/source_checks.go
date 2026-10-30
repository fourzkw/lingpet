package main

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"os"
	"sort"
	"strings"
	"time"

	bolt "go.etcd.io/bbolt"
)

// Due checks share the validation worker. No timer starts a second download worker.
// Persisted timestamps prevent restarts from repeatedly scanning all sources.
type sourceCheck struct {
	At      time.Time `json:"at"`
	Missing int       `json:"missing"`
	Error   string    `json:"error,omitempty"`
}

type sourceTask struct {
	key, repo string
	record    *Record
	state     sourceCheck
}

func (s *Server) sourceTasks(all []Record) []sourceTask {
	tasks := []sourceTask{}
	repos := map[string]string{}
	for i := range all {
		a := &all[i]
		if a.Status != "approved" {
			continue
		}
		repos[strings.ToLower(a.Repository)] = a.Repository
		tasks = append(tasks, sourceTask{key: "source-check/" + a.ID, repo: a.Repository, record: a})
	}
	for key, repo := range repos {
		tasks = append(tasks, sourceTask{key: "repository-check/" + key, repo: repo})
	}
	due := tasks[:0]
	for _, t := range tasks {
		err := s.store.get("meta", t.key, &t.state)
		if err != nil {
			if !errors.Is(err, os.ErrNotExist) {
				log.Print(err)
				continue
			}
		}
		due = append(due, t)
	}
	sort.Slice(due, func(i, j int) bool {
		if due[i].state.At.Equal(due[j].state.At) {
			return due[i].key < due[j].key
		}
		return due[i].state.At.Before(due[j].state.At)
	})
	return due
}

func (s *Server) checkNextSource(ctx context.Context, all []Record, now time.Time) {
	tasks := s.sourceTasks(all)
	if len(tasks) == 0 || now.Sub(tasks[0].state.At) < s.cfg.SyncInterval {
		return
	}
	t := tasks[0]
	s.queueMu.Lock()
	s.activeCheck = t.key
	s.queueMu.Unlock()
	defer func() { s.queueMu.Lock(); s.activeCheck = ""; s.queueMu.Unlock() }()
	attempt, cancel := context.WithTimeout(ctx, 90*time.Second)
	defer cancel()
	var err error
	if t.record == nil {
		err = s.discoverUpdates(attempt, t.repo)
	} else {
		checker := s.github
		// Only authoritative GitHub responses may cause automatic removal.
		if g, ok := checker.(*githubClient); ok {
			direct := *g
			direct.routes = []string{"direct"}
			checker = &direct
		}
		var asset Asset
		asset, err = checker.Resolve(attempt, t.repo, t.record.Tag, t.record.AssetName)
		if err == nil && t.record.Source != nil && asset.RepoID != t.record.Source.RepoID {
			err = errSourceUnavailable
		}
	}
	if ctx.Err() != nil {
		return
	}
	t.state.At = now
	t.state.Error = ""
	if err == nil {
		t.state.Missing = 0
	} else {
		t.state.Error = err.Error()
		if t.record != nil && (errors.Is(err, errGitHubNotFound) || errors.Is(err, errSourceUnavailable)) {
			t.state.Missing++
		} else {
			t.state.Missing = 0
		}
	}
	if t.record != nil && t.state.Missing >= 3 {
		// review reads the current record transactionally, so it cannot overwrite an admin action.
		if err := s.store.review(t.record.ID, "system", "unpublish", "每日检查连续三次确认来源不可用："+t.state.Error); err != nil {
			log.Print(err)
		} else {
			_ = s.store.audit("system", "pet.auto-unpublish", t.record.ID, t.state.Error)
		}
	}
	if err := s.store.put("meta", t.key, t.state); err != nil {
		log.Print(err)
	}
}

func (s *Server) discoverUpdates(ctx context.Context, repo string) error {
	var works []RepositoryPet
	if g, ok := s.github.(interface {
		Discover(context.Context, string) ([]RepositoryPet, error)
	}); ok {
		var err error
		works, err = g.Discover(ctx, repo)
		if err != nil {
			return err
		}
	}
	if works == nil {
		a, err := s.github.Resolve(ctx, repo, "", "")
		if err != nil {
			return err
		}
		works = []RepositoryPet{{Tag: a.Tag, AssetName: a.Name}}
	} else {
		seen, assets := map[string]bool{}, map[string]bool{}
		for _, w := range works {
			if err := w.validate(); err != nil {
				return err
			}
			key, asset := w.ID+"/"+w.Version, w.Tag+"/"+w.AssetName
			if seen[key] || assets[asset] {
				return errors.New("仓库索引存在重复作品或附件")
			}
			seen[key], assets[asset] = true, true
		}
	}
	s.submitMu.Lock()
	defer s.submitMu.Unlock()
	all, err := s.store.records()
	if err != nil {
		return err
	}
	pending := 0
	for _, a := range all {
		if a.Status == "queued" || a.Status == "validating" || a.Status == "pending" {
			pending++
		}
	}
	return s.store.db.Update(func(tx *bolt.Tx) error {
		for _, w := range works {
			exists := false
			for _, a := range all {
				if !strings.EqualFold(a.Repository, repo) {
					continue
				}
				if w.ID != "" && a.Work != nil && a.Work.ID == w.ID && a.Work.Version == w.Version {
					exists = true
					break
				}
				if (a.Tag == w.Tag && a.AssetName == w.AssetName) || (w.ID != "" && a.Pet != nil && a.Pet.ID == w.ID && a.Pet.Version == w.Version) {
					exists = true
					break
				}
			}
			if exists {
				continue
			}
			// Reserve twenty queue slots for manual submissions.
			if pending >= 180 {
				return errors.New("自动更新队列已满，留待下次检查")
			}
			now := time.Now().UTC()
			a := Record{ID: newID(), Repository: repo, Tag: w.Tag, AssetName: w.AssetName, Submitter: "定时更新", Status: "queued", Created: now, Updated: now, Reviews: []Review{}}
			if w.ID != "" {
				work := w
				a.Work = &work
			}
			raw, err := json.Marshal(a)
			if err != nil {
				return err
			}
			if err = tx.Bucket([]byte("records")).Put([]byte(a.ID), raw); err != nil {
				return err
			}
			pending++
		}
		return nil
	})
}
