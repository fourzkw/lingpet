package main

import (
	"context"
	"embed"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"
)

//go:embed web/*
var frontend embed.FS

//go:embed VERSION
var marketVersion string

func webFiles() fs.FS {
	f, e := fs.Sub(frontend, "web")
	if e != nil {
		panic(e)
	}
	return f
}
func env(name, fallback string) string {
	if v := os.Getenv(name); v != "" {
		return v
	}
	return fallback
}
func main() {

	if len(os.Args) > 1 && (os.Args[1] == "--hash-password" || os.Args[1] == "--reset-admin-password") {
		b, e := io.ReadAll(io.LimitReader(os.Stdin, 258))
		if e != nil {
			log.Fatal(e)
		}
		password := strings.TrimSuffix(strings.TrimSuffix(string(b), "\n"), "\r")
		hash, e := hashPassword(password)
		if e != nil {
			log.Fatal(e)
		}
		if os.Args[1] == "--hash-password" {
			fmt.Println(hash)
			return
		}
		store, e := openStore(env("LINGPET_DATA_DIR", "./data"))
		if e != nil {
			log.Fatal(e)
		}
		defer store.db.Close()
		saved, e := store.adminCredential()
		if e != nil {
			log.Fatal("管理员尚未初始化，或数据目录不正确")
		}
		if _, e = store.changeAdminPassword(saved.Revision, hash); e != nil {
			log.Fatal(e)
		}
		fmt.Println("管理员密码已重置")
		return
	}
	cfg := Config{Addr: env("LINGPET_LISTEN", "127.0.0.1:9633"), PublicURL: strings.TrimSuffix(env("LINGPET_PUBLIC_URL", "https://lingpet.fourzkw.top"), "/"), DataDir: env("LINGPET_DATA_DIR", "./data"), DownloadDir: os.Getenv("LINGPET_DOWNLOAD_DIR"), GitHubToken: os.Getenv("GITHUB_TOKEN"), Dev: os.Getenv("LINGPET_DEV_MODE") == "true", AdminUser: env("LINGPET_ADMIN_USER", "admin"), AdminPasswordHash: os.Getenv("LINGPET_ADMIN_PASSWORD_HASH")}
	if e := validPublicURL(cfg.PublicURL, cfg.Dev); e != nil {
		log.Fatal(e)
	}
	host, _, e := net.SplitHostPort(cfg.Addr)
	if e != nil {
		log.Fatal(e)
	}
	if cfg.Dev && (host != "127.0.0.1" && host != "localhost") {
		log.Fatal("开发模式仅允许监听回环地址")
	}
	store, e := openStore(cfg.DataDir)
	if e != nil {
		log.Fatal(e)
	}
	defer store.db.Close()
	credential, e := store.initializeAdmin(cfg.AdminUser, cfg.AdminPasswordHash)
	if e != nil {
		log.Fatal(e)
	}
	if credential.MustChange {
		log.Printf("首次登录需修改密码；初始密码文件：%s", store.initialPasswordFile())
	}
	client := publicClient()
	routes, e := githubRoutes(env("LINGPET_GITHUB_ROUTES", "direct,gh-proxy,ghfast"))
	if e != nil {
		log.Fatal(e)
	}
	s := &Server{cfg: cfg, store: store, client: client, github: &githubClient{client: client, token: cfg.GitHubToken, routes: routes}}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	workerDone := make(chan struct{})
	go func() { defer close(workerDone); s.worker(ctx) }()
	httpServer := &http.Server{Addr: cfg.Addr, Handler: s.routes(), ReadHeaderTimeout: 10 * time.Second, ReadTimeout: 30 * time.Second, WriteTimeout: 40 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 16384}
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		httpServer.Shutdown(shutdown)
	}()
	log.Printf("LingPet market listening on %s, public URL %s", cfg.Addr, cfg.PublicURL)
	if e = httpServer.ListenAndServe(); e != nil && e != http.ErrServerClosed {
		stop()
		log.Print(e)
	}
	stop()
	<-workerDone
}
