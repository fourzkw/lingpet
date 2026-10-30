package main

import (
	"errors"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"
)

func validateBrowse(q url.Values) error {
	for key, allowed := range map[string]string{"sort": "|updated|downloads|stars|name|size", "style": "|original|pixel|both", "interaction": "|any|click|pet|both", "recent": "|7|30|90"} {
		valid := false
		for _, value := range strings.Split(allowed, "|") {
			if q.Get(key) == value {
				valid = true
				break
			}
		}
		if !valid {
			return errors.New("无效的市场排序或筛选条件")
		}
	}
	return nil
}

func publicationTime(a Record) time.Time {
	if !a.Updated.IsZero() {
		return a.Updated
	}
	return a.Created
}

func filterPets(all []Record, q url.Values, now time.Time) []Record {
	out := []Record{}
	search := strings.ToLower(strings.TrimSpace(q.Get("q")))
	days, _ := strconv.Atoi(q.Get("recent"))
	for _, a := range latestPets(all) {
		declaredAuthor := a.Pet.Author
		a = marketPresentation(a)
		p := a.Pet
		haystack := p.ID + " " + p.Name + " " + p.Description + " " + p.Author + " " + declaredAuthor + " " + a.Repository
		if p.Character != nil {
			haystack += " " + p.Character.ID + " " + p.Character.Name + " " + p.Character.Description
		}
		if search != "" && !strings.Contains(strings.ToLower(haystack), search) {
			continue
		}
		if days > 0 && publicationTime(a).Before(now.Add(-time.Duration(days)*24*time.Hour)) {
			continue
		}
		original, pixel, click, pet := false, false, false, false
		if a.Preview != nil {
			for _, v := range a.Preview.Variants {
				original = original || v == "original"
				pixel = pixel || v == "pixel"
			}
			_, click = a.Preview.Clips["click"]
			_, pet = a.Preview.Clips["pet"]
		}
		switch q.Get("style") {
		case "original":
			if !original {
				continue
			}
		case "pixel":
			if !pixel {
				continue
			}
		case "both":
			if !original || !pixel {
				continue
			}
		}
		switch q.Get("interaction") {
		case "any":
			if !click && !pet {
				continue
			}
		case "click":
			if !click {
				continue
			}
		case "pet":
			if !pet {
				continue
			}
		case "both":
			if !click || !pet {
				continue
			}
		}
		out = append(out, a)
	}
	return out
}

func sortPets(rows []Record, order string) {
	sort.SliceStable(rows, func(i, j int) bool {
		a, b := rows[i], rows[j]
		switch order {
		case "downloads", "stars":
			if (a.Stats == nil) != (b.Stats == nil) {
				return a.Stats != nil
			}
			if a.Stats != nil && b.Stats != nil {
				av, bv := a.Stats.Downloads, b.Stats.Downloads
				if order == "stars" {
					av, bv = a.Stats.Stars, b.Stats.Stars
				}
				if av != bv {
					return av > bv
				}
			}
		case "name":
			av, bv := strings.ToLower(a.Pet.Name), strings.ToLower(b.Pet.Name)
			if av != bv {
				return av < bv
			}
		case "size":
			if (a.Size > 0) != (b.Size > 0) {
				return a.Size > 0
			}
			if a.Size != b.Size {
				return a.Size < b.Size
			}
		}
		at, bt := publicationTime(a), publicationTime(b)
		if !at.Equal(bt) {
			return at.After(bt)
		}
		return a.ID < b.ID
	})
}
