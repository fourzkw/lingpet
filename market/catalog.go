package main

import (
	"fmt"
	"sort"
	"strings"
)

func petIdentity(a Record) string {
	if a.Pet == nil {
		return "record/" + a.ID
	}
	if a.Source != nil && a.Source.RepoID > 0 {
		return fmt.Sprintf("%d/%s", a.Source.RepoID, a.Pet.ID)
	}
	return strings.ToLower(a.Repository) + "/" + a.Pet.ID
}
func newerPetVersion(a, b Record) bool {
	av, bv := strings.Split(a.Pet.Version, "."), strings.Split(b.Pet.Version, ".")
	if len(av) == 3 && len(bv) == 3 {
		for i := 0; i < 3; i++ {
			x, y := strings.TrimLeft(av[i], "0"), strings.TrimLeft(bv[i], "0")
			if len(x) != len(y) {
				return len(x) > len(y)
			}
			if x != y {
				return x > y
			}
		}
	}
	return a.Created.After(b.Created)
}
func latestPets(records []Record) []Record {
	out := []Record{}
	groups := map[string]Record{}
	for _, a := range records {
		if a.Status != "approved" || a.Pet == nil {
			continue
		}
		key := petIdentity(a)
		if old, ok := groups[key]; !ok || newerPetVersion(a, old) {
			groups[key] = a
		}
	}
	for _, a := range groups {
		out = append(out, a)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Created.Equal(out[j].Created) {
			return out[i].ID < out[j].ID
		}
		return out[i].Created.After(out[j].Created)
	})
	return out
}
