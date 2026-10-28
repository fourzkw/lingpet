package main

import (
	"encoding/json"
	"errors"
	bolt "go.etcd.io/bbolt"
	"os"
	"path/filepath"
	"strings"
	"time"
	"unicode"
)

const adminCredentialKey = "admin-credentials"

type AdminCredential struct {
	Username     string
	PasswordHash string
	MustChange   bool
	Revision     string
	Updated      time.Time
}

func validAdminUsername(username string) bool {
	if !field(username, 64) {
		return false
	}
	for _, r := range username {
		if unicode.IsSpace(r) || unicode.IsControl(r) {
			return false
		}
	}
	return true
}
func (s *Store) changeAdminUsername(revision, username string) (AdminCredential, error) {
	var a AdminCredential
	if !validAdminUsername(username) {
		return a, errors.New("用户名需为1至64个字符，不能包含空白或控制字符")
	}
	e := s.db.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte("meta"))
		saved := b.Get([]byte(adminCredentialKey))
		if saved == nil {
			return os.ErrNotExist
		}
		if e := json.Unmarshal(saved, &a); e != nil {
			return e
		}
		if a.Revision != revision {
			return errors.New("登录状态已变化，请重新登录")
		}
		if a.MustChange {
			return errors.New("请先修改初始管理员密码")
		}
		if a.Username == username {
			return errors.New("新用户名与当前用户名相同")
		}
		a.Username = username
		a.Revision = newID()
		a.Updated = time.Now().UTC()
		data, e := json.Marshal(a)
		if e != nil {
			return e
		}
		return b.Put([]byte(adminCredentialKey), data)
	})
	return a, e
}

func (s *Store) initialPasswordFile() string {
	return filepath.Join(filepath.Dir(s.db.Path()), "initial-admin-password.txt")
}
func (s *Store) adminCredential() (AdminCredential, error) {
	var a AdminCredential
	e := s.get("meta", adminCredentialKey, &a)
	return a, e
}
func (s *Store) initializeAdmin(username, seedHash string) (AdminCredential, error) {
	var a AdminCredential
	e := s.db.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte("meta"))
		if saved := b.Get([]byte(adminCredentialKey)); saved != nil {
			if e := json.Unmarshal(saved, &a); e != nil {
				return e
			}
			if !field(a.Username, 64) || a.Revision == "" {
				return errors.New("管理员数据无效，请从备份恢复")
			}
			_, _, e := passwordParts(a.PasswordHash)
			return e
		}
		if !field(username, 64) {
			return errors.New("无效的管理员账号")
		}
		mustChange := seedHash == ""
		if mustChange {
			// A private, unique bootstrap password replaces a shared default password.
			// Retain the file before committing the hash so interrupted first starts can resume.
			password := newID()
			file, e := os.OpenFile(s.initialPasswordFile(), os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
			if errors.Is(e, os.ErrExist) {
				if e = os.Chmod(s.initialPasswordFile(), 0600); e != nil {
					return e
				}
				data, e := os.ReadFile(s.initialPasswordFile())
				if e != nil {
					return e
				}
				password = strings.TrimSpace(string(data))
				if len(password) != 48 {
					return errors.New("初始密码文件不完整，请移走该文件后重新启动首次初始化")
				}
			} else if e != nil {
				return e
			} else {
				_, writeError := file.WriteString(password + "\n")
				if writeError == nil {
					writeError = file.Sync()
				}
				closeError := file.Close()
				if writeError != nil {
					return writeError
				}
				if closeError != nil {
					return closeError
				}
			}
			seedHash, e = hashPassword(password)
			if e != nil {
				return e
			}
		} else if _, _, e := passwordParts(seedHash); e != nil {
			return e
		}
		a = AdminCredential{Username: username, PasswordHash: seedHash, MustChange: mustChange, Revision: newID(), Updated: time.Now().UTC()}
		data, e := json.Marshal(a)
		if e != nil {
			return e
		}
		return b.Put([]byte(adminCredentialKey), data)
	})
	if e == nil && !a.MustChange {
		_ = os.Remove(s.initialPasswordFile())
	}
	return a, e
}
func (s *Store) changeAdminPassword(revision, hash string) (AdminCredential, error) {
	var a AdminCredential
	e := s.db.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte("meta"))
		saved := b.Get([]byte(adminCredentialKey))
		if saved == nil {
			return os.ErrNotExist
		}
		if e := json.Unmarshal(saved, &a); e != nil {
			return e
		}
		if a.Revision != revision {
			return errors.New("登录状态已变化，请重新登录")
		}
		if _, _, e := passwordParts(hash); e != nil {
			return e
		}
		a.PasswordHash = hash
		a.MustChange = false
		a.Revision = newID()
		a.Updated = time.Now().UTC()
		data, e := json.Marshal(a)
		if e != nil {
			return e
		}
		return b.Put([]byte(adminCredentialKey), data)
	})
	if e == nil {
		_ = os.Remove(s.initialPasswordFile())
	}
	return a, e
}
