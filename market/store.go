package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	bolt "go.etcd.io/bbolt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type Pet struct {
	FormatVersion int    `json:"formatVersion"`
	ID            string `json:"id"`
	Name          string `json:"name"`
	Version       string `json:"version"`
	Author        string `json:"author"`
	License       string `json:"license"`
	Description   string `json:"description"`
	MinAppVersion string `json:"minAppVersion"`
}
type Clip struct {
	File         string `json:"file"`
	SourceFrames int    `json:"sourceFrames"`
	Frames       []int  `json:"frames"`
	Durations    []int  `json:"durations"`
	Loop         bool   `json:"loop"`
	LoopFrom     int    `json:"loopFrom"`
}
type Original struct {
	TileSize  int    `json:"tileSize"`
	Directory string `json:"directory"`
}
type Manifest struct {
	SchemaVersion int             `json:"schemaVersion"`
	Character     string          `json:"character"`
	TileSize      int             `json:"tileSize"`
	Columns       int             `json:"columns"`
	Variants      []string        `json:"variants"`
	Original      *Original       `json:"original,omitempty"`
	Clips         map[string]Clip `json:"clips"`
}
type Asset struct {
	RepoID    int64  `json:"repoId"`
	ReleaseID int64  `json:"releaseId"`
	AssetID   int64  `json:"assetId"`
	Owner     string `json:"owner"`
	Repo      string `json:"repo"`
	Tag       string `json:"tag"`
	Name      string `json:"name"`
	URL       string `json:"url"`
	Size      int64  `json:"size"`
	Immutable bool   `json:"immutable"`
}
type Review struct {
	Actor  string    `json:"actor"`
	Action string    `json:"action"`
	Reason string    `json:"reason"`
	At     time.Time `json:"at"`
}
type Record struct {
	Stats      *PetStats `json:"stats"`
	ID         string    `json:"id"`
	Repository string    `json:"repository"`
	Tag        string    `json:"tag"`
	AssetName  string    `json:"assetName"`
	Submitter  string    `json:"submitter"`
	Status     string    `json:"status"`
	Error      string    `json:"error,omitempty"`
	Pet        *Pet      `json:"pet,omitempty"`
	Source     *Asset    `json:"source,omitempty"`
	SHA256     string    `json:"sha256,omitempty"`
	Size       int64     `json:"size"`
	Preview    *Manifest `json:"preview,omitempty"`
	Reviews    []Review  `json:"reviews"`
	Created    time.Time `json:"createdAt"`
	Updated    time.Time `json:"updatedAt"`
}
type Session struct {
	AuthKey string    `json:"authKey,omitempty"`
	Login   string    `json:"login"`
	UserID  int64     `json:"userId"`
	Expires time.Time `json:"expires"`
}
type Store struct{ db *bolt.DB }

func openStore(dir string) (*Store, error) {
	if err := os.MkdirAll(dir, 0700); err != nil {
		return nil, err
	}
	db, err := bolt.Open(filepath.Join(dir, "market.db"), 0600, &bolt.Options{Timeout: time.Second})
	if err != nil {
		return nil, err
	}
	s := &Store{db}
	err = db.Update(func(tx *bolt.Tx) error {
		for _, name := range []string{"records", "sessions", "oauth", "submission-secrets", "meta", "releases", "release-channels", "admin-audit", "metrics"} {
			if _, e := tx.CreateBucketIfNotExists([]byte(name)); e != nil {
				return e
			}
		}
		return nil
	})
	return s, err
}
func (s *Store) put(bucket, key string, value any) error {
	b, e := json.Marshal(value)
	if e != nil {
		return e
	}
	return s.db.Update(func(tx *bolt.Tx) error { return tx.Bucket([]byte(bucket)).Put([]byte(key), b) })
}
func (s *Store) get(bucket, key string, value any) error {
	return s.db.View(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte(bucket)).Get([]byte(key))
		if b == nil {
			return os.ErrNotExist
		}
		return json.Unmarshal(b, value)
	})
}
func (s *Store) consume(bucket, key string, value any) error {
	return s.db.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte(bucket))
		v := b.Get([]byte(key))
		if v == nil {
			return os.ErrNotExist
		}
		if e := json.Unmarshal(v, value); e != nil {
			return e
		}
		return b.Delete([]byte(key))
	})
}
func (s *Store) records() ([]Record, error) {
	out := []Record{}
	e := s.db.View(func(tx *bolt.Tx) error {
		return tx.Bucket([]byte("records")).ForEach(func(k, v []byte) error {
			var r Record
			if e := json.Unmarshal(v, &r); e != nil {
				return e
			}
			out = append(out, r)
			return nil
		})
	})
	sort.Slice(out, func(i, j int) bool { return out[i].Created.After(out[j].Created) })
	return out, e
}
func (s *Store) review(id, actor, action, reason string) error {
	return s.db.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte("records"))
		v := b.Get([]byte(id))
		if v == nil {
			return os.ErrNotExist
		}
		var r Record
		if e := json.Unmarshal(v, &r); e != nil {
			return e
		}
		if action == "approve" {
			if r.Status != "pending" {
				return errors.New("仅待审核版本可以通过")
			}
			r.Status = "approved"
		} else if action == "retry" {
			if r.Status != "failed" {
				return errors.New("仅校验失败的投稿可以重试")
			}
			r.Status = "queued"
			r.Error = ""
		} else if action == "reject" {
			if r.Status != "pending" || strings.TrimSpace(reason) == "" {
				return errors.New("驳回需要待审核版本和原因")
			}
			r.Status = "rejected"
		} else if action == "unpublish" {
			if r.Status != "approved" || strings.TrimSpace(reason) == "" {
				return errors.New("下架需要已上架版本和原因")
			}
			r.Status = "unpublished"
		} else {
			return errors.New("未知审核操作")
		}
		r.Updated = time.Now().UTC()
		r.Reviews = append(r.Reviews, Review{actor, action, reason, r.Updated})
		p, e := json.Marshal(r)
		if e != nil {
			return e
		}
		return b.Put([]byte(id), p)
	})
}
func newID() string {
	b := make([]byte, 24)
	if _, e := rand.Read(b); e != nil {
		panic(e)
	}
	return hex.EncodeToString(b)
}

func (s *Store) cleanExpired() error {
	return s.db.Update(func(tx *bolt.Tx) error {
		for _, bucket := range []string{"sessions", "oauth"} {
			c := tx.Bucket([]byte(bucket)).Cursor()
			for k, v := c.First(); k != nil; k, v = c.Next() {
				var value struct{ Expires time.Time }
				if json.Unmarshal(v, &value) == nil && time.Now().After(value.Expires) {
					if e := c.Delete(); e != nil {
						return e
					}
				}
			}
		}
		return nil
	})
}

type SubmissionSecret struct {
	TokenHash string
	IPHash    string
}

func (s *Store) submissionSalt() (string, error) {
	var salt string
	e := s.db.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte("meta"))
		v := b.Get([]byte("submission-salt"))
		if len(v) > 0 {
			salt = string(v)
			return nil
		}
		salt = newID()
		return b.Put([]byte("submission-salt"), []byte(salt))
	})
	return salt, e
}
func (s *Store) createSubmission(a Record, secret SubmissionSecret) error {
	p, e := json.Marshal(a)
	if e != nil {
		return e
	}
	q, e := json.Marshal(secret)
	if e != nil {
		return e
	}
	return s.db.Update(func(tx *bolt.Tx) error {
		if e := tx.Bucket([]byte("submission-secrets")).Put([]byte(a.ID), q); e != nil {
			return e
		}
		return tx.Bucket([]byte("records")).Put([]byte(a.ID), p)
	})
}
