package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"image"
	"image/draw"
	"os"
	"path/filepath"
	"strings"
	"time"

	bolt "go.etcd.io/bbolt"
)

func (s *Server) readPresentation(ctx context.Context, a Record) (Pet, []byte, error) {
	if a.Work != nil {
		reader, ok := s.github.(interface {
			PresentationAt(context.Context, string, string, string) (Pet, []byte, error)
		})
		if !ok {
			return Pet{}, nil, errors.New("当前仓库读取器不支持多作品目录")
		}
		return reader.PresentationAt(ctx, a.Repository, a.Tag, a.Work.Path)
	}
	return s.github.Presentation(ctx, a.Repository, a.Tag)
}

// Hash display metadata and decoded cover pixels, never attachment contents.
// PNG recompression and package-only compatibility fields do not trigger refreshes.
func presentationDigest(pet Pet, cover []byte) (string, error) {
	im, err := decodePNG(cover, true)
	if err != nil {
		return "", err
	}
	display := struct {
		ID, Version, Name, Author, License, Description string
		Character                                       *Character
	}{pet.ID, pet.Version, pet.Name, pet.Author, pet.License, pet.Description, pet.Character}
	raw, err := json.Marshal(display)
	if err != nil {
		return "", err
	}
	rgba := image.NewNRGBA(image.Rect(0, 0, im.Bounds().Dx(), im.Bounds().Dy()))
	draw.Draw(rgba, rgba.Bounds(), im, im.Bounds().Min, draw.Src)
	h := sha256.New()
	h.Write(raw)
	dimensions, _ := json.Marshal(rgba.Bounds())
	h.Write(dimensions)
	h.Write(rgba.Pix)
	return hex.EncodeToString(h.Sum(nil)), nil
}

func (s *Server) publishedPresentationDigest(a Record) (string, error) {
	if a.PresentationDigest != "" {
		return a.PresentationDigest, nil
	}
	if a.Pet == nil {
		return "", errors.New("缺少已上架资料")
	}
	key := a.PreviewKey
	if key == "" {
		key = a.ID
	}
	cover, err := os.ReadFile(filepath.Join(s.cfg.DataDir, "previews", key, "cover.png"))
	if err != nil {
		return "", err
	}
	return presentationDigest(*a.Pet, cover)
}

func refreshTarget(a Record, work *RepositoryPet) Record {
	if work != nil {
		copy := *work
		if work.ID != "" {
			a.Work = &copy
		}
		a.Tag = work.Tag
		a.AssetName = work.AssetName
	}
	return a
}

func matchingWork(all []Record, repo string, work RepositoryPet) *Record {
	for i := range all {
		a := &all[i]
		if a.RefreshOf != "" || !strings.EqualFold(a.Repository, repo) {
			continue
		}
		if (a.Tag == work.Tag && a.AssetName == work.AssetName) || (work.ID != "" && a.Work != nil && a.Work.ID == work.ID && a.Work.Version == work.Version) || (work.ID != "" && a.Pet != nil && a.Pet.ID == work.ID && a.Pet.Version == work.Version) {
			return a
		}
	}
	return nil
}

// The parent remains approved. Refresh candidates use the ordinary FIFO queue.
func (s *Server) queuePresentationRefresh(parent Record, work *RepositoryPet, origin string, automatic bool) (Record, bool, error) {
	var result Record
	created := false
	err := s.store.db.Update(func(tx *bolt.Tx) error {
		bucket := tx.Bucket([]byte("records"))
		raw := bucket.Get([]byte(parent.ID))
		if raw == nil {
			return os.ErrNotExist
		}
		if err := json.Unmarshal(raw, &parent); err != nil {
			return err
		}
		result = parent
		if parent.Status != "approved" || parent.RefreshOf != "" {
			return nil
		}
		pending := 0
		if err := bucket.ForEach(func(_, v []byte) error {
			var a Record
			if err := json.Unmarshal(v, &a); err != nil {
				return err
			}
			if a.Status == "queued" || a.Status == "validating" || a.Status == "pending" {
				pending++
				if a.RefreshOf == parent.ID {
					result = a
				}
			}
			return nil
		}); err != nil {
			return err
		}
		if result.RefreshOf == parent.ID {
			return nil
		}
		limit := 200
		if automatic {
			limit = 180
		}
		if pending >= limit {
			return errors.New("校验队列已满，请稍后重试")
		}
		target := refreshTarget(parent, work)
		now := time.Now().UTC()
		result = Record{ID: newID(), RefreshOf: parent.ID, Repository: parent.Repository, Tag: target.Tag, AssetName: target.AssetName, Work: target.Work, Submitter: origin, Status: "queued", Created: now, Updated: now, Reviews: []Review{}}
		raw, err := json.Marshal(result)
		if err != nil {
			return err
		}
		if err = bucket.Put([]byte(result.ID), raw); err != nil {
			return err
		}
		created = true
		return nil
	})
	return result, created, err
}

func (s *Server) detectPresentationRefresh(ctx context.Context, parent Record, work *RepositoryPet) error {
	if parent.Status != "approved" || parent.Pet == nil || parent.RefreshOf != "" {
		return nil
	}
	target := refreshTarget(parent, work)
	pet, cover, err := s.readPresentation(ctx, target)
	if err != nil {
		return err
	}
	if strings.TrimSpace(pet.Author) == "" {
		pet.Author = repositoryOwner(parent)
	}
	next, err := presentationDigest(pet, cover)
	if err != nil {
		return err
	}
	previous, _ := s.publishedPresentationDigest(parent)
	// A changed release reference must also be validated before replacing install URLs.
	sameTarget := target.Tag == parent.Tag && target.AssetName == parent.AssetName && ((target.Work == nil && parent.Work == nil) || (target.Work != nil && parent.Work != nil && target.Work.Path == parent.Work.Path))
	if next == previous && sameTarget {
		return nil
	}
	_, _, err = s.queuePresentationRefresh(parent, work, "定时资料刷新", true)
	return err
}

func (s *Server) validatePresentationRefresh(ctx context.Context, a Record) {
	var parent Record
	if err := s.store.get("records", a.RefreshOf, &parent); err != nil || parent.Status != "approved" {
		a.Status = "failed"
		a.Error = "原作品已下架或不存在，取消资料刷新"
		a.Updated = time.Now().UTC()
		_ = s.store.put("records", a.ID, a)
		return
	}
	a.Status = "validating"
	a.Updated = time.Now().UTC()
	if s.store.put("records", a.ID, a) != nil {
		return
	}
	pet, cover, err := s.readPresentation(ctx, a)
	if strings.TrimSpace(pet.Author) == "" {
		pet.Author = repositoryOwner(parent)
	}
	var digest string
	if err == nil {
		digest, err = presentationDigest(pet, cover)
	}
	old, _ := s.publishedPresentationDigest(parent)
	sameTarget := a.Tag == parent.Tag && a.AssetName == parent.AssetName && ((a.Work == nil && parent.Work == nil) || (a.Work != nil && parent.Work != nil && a.Work.Path == parent.Work.Path))
	unchanged := err == nil && digest == old && sameTarget
	if err == nil && !unchanged {
		err = s.validateInner(ctx, &a)
	}
	now := time.Now().UTC()
	// Publish metadata and the new preview directory pointer together. Never alter
	// the old preview directory before the refreshed snapshot is committed.
	saveErr := s.store.db.Update(func(tx *bolt.Tx) error {
		bucket := tx.Bucket([]byte("records"))
		raw := bucket.Get([]byte(parent.ID))
		if raw == nil {
			return os.ErrNotExist
		}
		var current Record
		if e := json.Unmarshal(raw, &current); e != nil {
			return e
		}
		if ctx.Err() != nil {
			a.Status = "queued"
			a.Error = ""
		} else if current.Status != "approved" {
			a.Status = "failed"
			a.Error = "原作品已下架，未应用资料刷新"
		} else if err != nil {
			a.Status = "failed"
			a.Error = err.Error()
		} else {
			a.Status = "refreshed"
			a.Error = ""
			reason := "资料无变化，保留原上架内容"
			if !unchanged {
				if a.Source == nil || current.Source != nil && a.Source.RepoID != current.Source.RepoID || a.Pet == nil || current.Pet == nil || a.Pet.ID != current.Pet.ID || a.Pet.Version != current.Pet.Version {
					return errors.New("刷新目标身份不符")
				}
				current.Pet = a.Pet
				current.Source = a.Source
				current.Tag = a.Tag
				current.AssetName = a.AssetName
				current.Work = a.Work
				current.SHA256 = a.SHA256
				current.Size = a.Size
				current.Preview = a.Preview
				current.PreviewKey = a.ID
				current.PresentationDigest = a.PresentationDigest
				current.Updated = now
				reason = "同版本资料校验通过，已刷新市场展示"
				current.Reviews = append(current.Reviews, Review{Actor: "system", Action: "refresh", Reason: reason, At: now})
				raw, e := json.Marshal(current)
				if e != nil {
					return e
				}
				if e = bucket.Put([]byte(current.ID), raw); e != nil {
					return e
				}
			}
			a.Reviews = append(a.Reviews, Review{Actor: "system", Action: "refresh", Reason: reason, At: now})
		}
		a.Updated = now
		raw, e := json.Marshal(a)
		if e != nil {
			return e
		}
		return bucket.Put([]byte(a.ID), raw)
	})
	if saveErr != nil {
		a.Status = "failed"
		a.Error = saveErr.Error()
		a.Updated = now
		_ = s.store.put("records", a.ID, a)
	}
}

func previewKey(a Record) string {
	if a.PreviewKey != "" {
		return a.PreviewKey
	}
	return a.ID
}
func boolCount(b bool) int {
	if b {
		return 1
	}
	return 0
}
