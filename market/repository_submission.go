package main

import (
	"encoding/json"
	"errors"
	bolt "go.etcd.io/bbolt"
	"net/http"
	"strings"
	"time"
)

type submissionReceipt struct {
	ID       string `json:"id"`
	Token    string `json:"token,omitempty"`
	Record   any    `json:"record"`
	Existing bool   `json:"existing"`
}

// One transaction creates all tasks; workers validate and publish each task independently.
func (s *Server) submitRepository(w http.ResponseWriter, r *http.Request, repo string, works []RepositoryPet) {
	if len(works) == 0 || len(works) > maxRepositoryPets {
		failure(w, 400, errors.New("每次投稿需要 1 至 20 个作品"))
		return
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
	pending, total := 0, 0
	for _, a := range all {
		if a.Status == "queued" || a.Status == "validating" || a.Status == "pending" {
			total++
			var secret SubmissionSecret
			if s.store.get("submission-secrets", a.ID, &secret) == nil && secret.IPHash == ipHash {
				pending++
			}
		}
	}
	receipts := []submissionReceipt{}
	created := []Record{}
	secrets := []SubmissionSecret{}
	seen := map[string]bool{}
	assets := map[string]bool{}
	for _, work := range works {
		// A structurally ambiguous index is rejected before creating any tasks.
		key := work.ID + "/" + work.Version
		if seen[key] {
			failure(w, 400, errors.New("仓库索引包含重复作品版本"))
			return
		}
		seen[key] = true
		assetKey := work.Tag + "/" + work.AssetName
		if assets[assetKey] {
			failure(w, 400, errors.New("仓库索引的多个作品引用了同一个附件"))
			return
		}
		assets[assetKey] = true
		var existing *Record
		for i := range all {
			a := &all[i]
			if strings.EqualFold(a.Repository, repo) && a.Tag == work.Tag && a.AssetName == work.AssetName && a.Status != "failed" {
				existing = a
				break
			}
		}
		if existing != nil {
			receipts = append(receipts, submissionReceipt{ID: existing.ID, Record: submissionStatus(*existing), Existing: true})
			continue
		}
		token := newID()
		a := Record{ID: newID(), Repository: repo, Tag: work.Tag, AssetName: work.AssetName, Work: &RepositoryPet{ID: work.ID, Version: work.Version, Path: work.Path, Tag: work.Tag, AssetName: work.AssetName, SHA256: work.SHA256}, Submitter: "匿名投稿（身份未验证）", Status: "queued", Reviews: []Review{}, Created: time.Now().UTC(), Updated: time.Now().UTC()}
		created = append(created, a)
		secrets = append(secrets, SubmissionSecret{TokenHash: sessionKey(token), IPHash: ipHash})
		receipts = append(receipts, submissionReceipt{ID: a.ID, Token: token, Record: submissionStatus(a)})
	}
	if pending+len(created) > 20 || total+len(created) > 200 {
		failure(w, 429, errors.New("待处理投稿已达上限，请稍后再试"))
		return
	}
	e = s.store.db.Update(func(tx *bolt.Tx) error {
		for i, a := range created {
			raw, err := json.Marshal(a)
			if err != nil {
				return err
			}
			secret, err := json.Marshal(secrets[i])
			if err != nil {
				return err
			}
			if err = tx.Bucket([]byte("records")).Put([]byte(a.ID), raw); err != nil {
				return err
			}
			if err = tx.Bucket([]byte("submission-secrets")).Put([]byte(a.ID), secret); err != nil {
				return err
			}
		}
		return nil
	})
	if e != nil {
		failure(w, 500, e)
		return
	}
	first := receipts[0]
	status := 202
	if len(created) == 0 {
		status = 200
	}
	response := map[string]any{"id": first.ID, "record": first.Record, "existing": len(created) == 0, "records": receipts, "created": len(created), "total": len(receipts)}
	if first.Token != "" {
		response["token"] = first.Token
	}
	respond(w, status, response)
}
