package main

import "strings"

func repositoryOwner(a Record) string {
	if a.Source != nil && a.Source.Owner != "" {
		if _, err := parseRepository(a.Source.Owner + "/repository"); err == nil {
			return a.Source.Owner
		}
	}
	if repo, err := parseRepository(a.Repository); err == nil {
		return strings.SplitN(repo, "/", 2)[0]
	}
	return ""
}

// Apply the market's default author to a copy so historical metadata and the
// author's package remain unchanged. This also covers already-approved records.
func marketPresentation(a Record) Record {
	if a.Pet == nil {
		return a
	}
	if owner := repositoryOwner(a); owner != "" {
		pet := *a.Pet
		pet.Author = owner
		a.Pet = &pet
	}
	return a
}
