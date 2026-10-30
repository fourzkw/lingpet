package main

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestCharacterMetadataRoundtrip(t *testing.T) {
	var pet Pet
	if err := json.Unmarshal([]byte(`{"id":"lingpet-chatgpt-dragon","character":{"id":"chatgpt","name":"ChatGPT","description":"龙姬角色"}}`), &pet); err != nil {
		t.Fatal(err)
	}
	if pet.Character == nil || pet.Character.ID != "chatgpt" || !validCharacter(pet.Character) {
		t.Fatal("lost character identity")
	}
	data, err := json.Marshal(pet)
	if err != nil || !strings.Contains(string(data), `"character":{"id":"chatgpt"`) {
		t.Fatal("lost character in market metadata", err)
	}
	if !validCharacter(nil) {
		t.Fatal("legacy packages must remain valid")
	}
	for _, c := range []*Character{{ID: "../bad", Name: "bad"}, {ID: "chatgpt", Name: ""}, {ID: "chatgpt", Name: "ChatGPT", Description: strings.Repeat("x", 2001)}} {
		if validCharacter(c) {
			t.Fatal("accepted invalid character", c)
		}
	}
}
