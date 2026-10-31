package main

import (
	"context"
	"errors"
	"net/url"
	"strings"
	"sync"
	"time"
)

// Downloads sums distinct published petpack assets; stars belongs to the repository.
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
	all, err := s.store.records()
	if err != nil {
		return nil
	}
	return s.petStatsWithHistory(ctx, record, all)
}

func (s *Server) petStatsWithHistory(ctx context.Context, record Record, all []Record) *PetStats {
	current := s.assetStats(ctx, record)
	if current == nil {
		return nil
	}
	total := *current
	assetKey := func(a Record) string {
		return strings.ToLower(a.Repository) + "\x00" + a.Tag + "\x00" + a.AssetName
	}
	seen := map[string]bool{assetKey(record): true}
	for _, version := range all {
		if version.Status != "approved" || version.Pet == nil || petIdentity(version) != petIdentity(record) || seen[assetKey(version)] {
			continue
		}
		seen[assetKey(version)] = true
		stats := s.assetStats(ctx, version)
		if stats == nil {
			// Never present an incomplete sum as the total download count.
			return nil
		}
		total.Downloads += stats.Downloads
	}
	return &total
}

// Keep per-attachment caches so new versions can reuse historical statistics.
func (s *Server) assetStats(ctx context.Context, record Record) *PetStats {
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
	all, err := s.store.records()
	if err != nil {
		return
	}
	ctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	jobs := make(chan int)
	var workers sync.WaitGroup
	for i := 0; i < 4; i++ {
		workers.Add(1)
		go func() {
			defer workers.Done()
			for i := range jobs {
				records[i].Stats = s.petStatsWithHistory(ctx, records[i], all)
			}
		}()
	}
	for i := range records {
		jobs <- i
	}
	close(jobs)
	workers.Wait()
}
