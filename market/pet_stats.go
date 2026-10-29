package main

import (
	"context"
	"errors"
	"net/url"
	"sync"
	"time"
)

// Downloads counts this version's petpack asset; stars belongs to its repository.
type PetStats struct {
	Downloads int64 `json:"downloads"`
	Stars     int64 `json:"stars"`
}

type cachedPetStats struct {
	Stats     *PetStats `json:"stats"`
	CheckedAt time.Time `json:"checkedAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

func (g *githubClient) Stats(ctx context.Context, repo, tag, name string) (PetStats, error) {
	var repository struct {
		Private bool
		Stars   int64 `json:"stargazers_count"`
	}
	if _, err := parseRepository(repo); err != nil {
		return PetStats{}, err
	}
	if err := g.get(ctx, "/repos/"+repo, &repository); err != nil {
		return PetStats{}, err
	}
	if repository.Private {
		return PetStats{}, errors.New("仅支持公开仓库")
	}
	var release struct {
		Assets []struct {
			Name      string
			Downloads int64 `json:"download_count"`
		}
	}
	if err := g.get(ctx, "/repos/"+repo+"/releases/tags/"+url.PathEscape(tag), &release); err != nil {
		return PetStats{}, err
	}
	for _, asset := range release.Assets {
		if asset.Name == name && asset.Downloads >= 0 && repository.Stars >= 0 {
			return PetStats{Downloads: asset.Downloads, Stars: repository.Stars}, nil
		}
	}
	return PetStats{}, errors.New("Release 中未找到指定附件统计")
}

func (s *Server) petStats(ctx context.Context, record Record) *PetStats {
	provider, ok := s.github.(interface {
		Stats(context.Context, string, string, string) (PetStats, error)
	})
	if !ok {
		return nil
	}
	key := "pet-stats:" + record.ID
	s.statsMu.Lock()
	var cached cachedPetStats
	_ = s.store.get("meta", key, &cached)
	ttl := 15 * time.Minute
	if cached.UpdatedAt.Before(cached.CheckedAt) {
		ttl = time.Minute
	}
	if time.Since(cached.CheckedAt) < ttl || s.statsLoading[key] {
		s.statsMu.Unlock()
		return cached.Stats
	}
	if s.statsLoading == nil {
		s.statsLoading = make(map[string]bool)
	}
	s.statsLoading[key] = true
	s.statsMu.Unlock()
	defer func() { s.statsMu.Lock(); delete(s.statsLoading, key); s.statsMu.Unlock() }()
	stats, err := provider.Stats(ctx, record.Repository, record.Tag, record.AssetName)
	cached.CheckedAt = time.Now().UTC()
	if err == nil {
		cached.Stats = &stats
		cached.UpdatedAt = cached.CheckedAt
	}
	_ = s.store.put("meta", key, cached)
	return cached.Stats
}

// Limit both concurrency and the total wait so GitHub cannot hold up the market.
func (s *Server) populatePetStats(ctx context.Context, records []Record) {
	ctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	jobs := make(chan int)
	var workers sync.WaitGroup
	for i := 0; i < 4; i++ {
		workers.Add(1)
		go func() {
			defer workers.Done()
			for i := range jobs {
				records[i].Stats = s.petStats(ctx, records[i])
			}
		}()
	}
	for i := range records {
		jobs <- i
	}
	close(jobs)
	workers.Wait()
}
