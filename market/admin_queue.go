package main

import (
	"net/http"
	"time"
)

type queueEntry struct {
	ID         string     `json:"id"`
	Position   int        `json:"position"`
	Kind       string     `json:"kind"`
	Name       string     `json:"name"`
	Repository string     `json:"repository"`
	Version    string     `json:"version,omitempty"`
	Origin     string     `json:"origin,omitempty"`
	Status     string     `json:"status"`
	Created    *time.Time `json:"createdAt,omitempty"`
	LastCheck  *time.Time `json:"lastCheck,omitempty"`
	NextCheck  *time.Time `json:"nextCheck,omitempty"`
	Missing    int        `json:"missing"`
	Error      string     `json:"error,omitempty"`
}

func (s *Server) adminQueue(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireAdmin(w, r); !ok {
		return
	}
	all, err := s.store.records()
	if err != nil {
		failure(w, 500, err)
		return
	}
	validations, checks := []queueEntry{}, []queueEntry{}
	position := 0
	for i := len(all) - 1; i >= 0; i-- {
		a := all[i]
		if a.Status != "queued" && a.Status != "validating" && a.Status != "pending" {
			continue
		}
		entry := queueEntry{ID: a.ID, Kind: "validation", Name: a.AssetName, Repository: a.Repository, Origin: a.Submitter, Status: a.Status, Created: &a.Created}
		if a.Pet != nil {
			entry.Name = a.Pet.Name
			entry.Version = a.Pet.Version
		} else if a.Work != nil {
			entry.Name = a.Work.ID
			entry.Version = a.Work.Version
		}
		if a.Status != "validating" {
			position++
			entry.Position = position
		}
		validations = append(validations, entry)
	}
	s.queueMu.RLock()
	active := s.activeCheck
	s.queueMu.RUnlock()
	now := time.Now().UTC()
	checkPosition := 0
	for _, t := range s.sourceTasks(all) {
		entry := queueEntry{ID: t.key, Kind: "discovery", Name: "发现新版本", Repository: t.repo, Status: "disabled", Missing: t.state.Missing, Error: t.state.Error}
		if t.record != nil {
			entry.Kind = "source"
			entry.Name = t.record.AssetName
			if t.record.Pet != nil {
				entry.Name = t.record.Pet.Name
				entry.Version = t.record.Pet.Version
			}
		}
		if !t.state.At.IsZero() {
			at := t.state.At
			entry.LastCheck = &at
		}
		if s.cfg.SyncInterval > 0 {
			entry.Status = "scheduled"
			if !t.state.At.IsZero() {
				next := t.state.At.Add(s.cfg.SyncInterval)
				entry.NextCheck = &next
			}
			if now.Sub(t.state.At) >= s.cfg.SyncInterval {
				checkPosition++
				entry.Position = checkPosition
				entry.Status = "due"
			}
			if t.key == active {
				if entry.Status == "due" {
					checkPosition--
				}
				entry.Status = "running"
				entry.Position = 0
			}
		}
		checks = append(checks, entry)
	}
	respond(w, 200, map[string]any{"validations": validations, "checks": checks, "intervalSeconds": int64(s.cfg.SyncInterval / time.Second), "cooldownSeconds": 10, "updatedAt": now})
}
