// cmd/serve/main.go
package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/enahs/enahs.github.io/internal/build"

	"github.com/fsnotify/fsnotify"
	"github.com/gorilla/websocket"
)

// HTMLDir is a custom http.FileSystem that allows serving static files
// without requiring the .html extension in the URL.
type HTMLDir struct {
	d http.Dir
}

// Open attempts to open a file. If the file with the given name is not found,
// it appends ".html" and tries again. This enables "clean URLs".
func (d HTMLDir) Open(name string) (http.File, error) {
	// Try to open the file directly first (e.g., for css, js, images)
	f, err := d.d.Open(name)
	if os.IsNotExist(err) {
		// If it doesn't exist, try opening it with an .html extension.
		if f, htmlErr := d.d.Open(name + ".html"); htmlErr == nil {
			return f, nil
		}
	}
	return f, err
}

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
}

func serveWs(ch chan bool) func(w http.ResponseWriter, r *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		log.Println("recived ws request")
		ws, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			if _, ok := err.(websocket.HandshakeError); !ok {
				log.Println(err)
			}
			return
		}
		ws.WriteMessage(websocket.TextMessage, []byte("connection successful"))
		go sendReloadSignal(ws, ch)
	}

}

func sendReloadSignal(ws *websocket.Conn, ch chan bool) {
	for {
		select {
		case <-ch:
			log.Println("writing to channel...")
			if err := ws.WriteMessage(websocket.TextMessage, []byte("reload")); err != nil {
				log.Printf("writing to ws: %v", err)
			}
			ws.Close()
			return
		}
	}
}
func main() {
	// --- Define paths relative to the project root ---
	// This structure assumes you run the go command from the project root, e.g.,
	// `go run ./cmd/serve/main.go` or build and run the binary from the root.
	staticDir := "./static"
	sourceDirs := []string{"./pages", "./assets", "./templates"}

	// --- 1. Perform initial build on startup ---
	log.Println("Performing initial build...")
	if err := build.Build(); err != nil {
		log.Fatalf("Initial build failed: %v", err)
	}
	log.Println("Initial build successful.")

	// --- 2. Set up the file watcher ---
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		log.Fatalf("Failed to create file watcher: %v", err)
	}
	defer watcher.Close()

	// Recursively watch the source directories.
	log.Println("Setting up file watcher...")
	for _, dir := range sourceDirs {
		if _, err := os.Stat(dir); os.IsNotExist(err) {
			log.Printf("WARNING: Source directory '%s' not found, skipping watch.", dir)
			continue
		}
		if err := watchRecursive(watcher, dir); err != nil {
			log.Fatalf("Failed to watch directory %s: %v", dir, err)
		}
	}
	reloadCh := make(chan bool)
	// --- 3. Set up and run the HTTP server ---
	// The server will serve the freshly built 'static' directory.
	fs := http.FileServer(HTMLDir{http.Dir(staticDir)})
	mux := http.NewServeMux()
	mux.HandleFunc("/ws", serveWs(reloadCh))
	mux.Handle("/", fs)

	srv := &http.Server{
		Addr:    ":3000",
		Handler: mux,
	}

	// Start the server in a separate goroutine so it doesn't block.
	go func() {
		log.Println("Listening on http://localhost:3000")
		if err := srv.ListenAndServe(); err != http.ErrServerClosed {
			log.Fatalf("HTTP server ListenAndServe: %v", err)
		}
	}()

	// --- 4. Handle graceful shutdown and file events ---
	// Create a channel to listen for OS signals.
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	log.Println("Ready. Waiting for file changes or interrupt signal...")

	for {
		select {
		// A file event was received.
		case event, ok := <-watcher.Events:
			if !ok {
				return
			}
			// We only care about create, write, remove, or rename events.
			if event.Has(fsnotify.Write) || event.Has(fsnotify.Create) || event.Has(fsnotify.Remove) || event.Has(fsnotify.Rename) {
				log.Printf("Change detected in '%s', rebuilding site...", event.Name)
				if err := build.Build(); err != nil {
					// Use log.Printf instead of log.Fatalf to keep the server running
					log.Printf("ERROR: Build failed after file change: %v", err)

				} else {
					log.Println("Build successful. Site is updated.")
					reloadCh <- true
				}
			}

		// An error occurred with the watcher.
		case err, ok := <-watcher.Errors:
			if !ok {
				return
			}
			log.Printf("Watcher error: %v", err)

		// An interrupt signal was received.
		case <-sigChan:
			log.Println("Interrupt signal received, shutting down gracefully...")

			// Create a context with a timeout to allow for existing connections to close.
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()

			if err := srv.Shutdown(ctx); err != nil {
				log.Fatalf("HTTP server shutdown error: %v", err)
			}

			log.Println("Server shut down successfully.")
			return // Exit the loop and the program.
		}
	}
}

// watchRecursive adds all subdirectories of a given path to the watcher.
func watchRecursive(watcher *fsnotify.Watcher, path string) error {
	return filepath.Walk(path, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() {
			err = watcher.Add(path)
			if err != nil {
				return err
			}
			log.Printf("Watching directory: %s", path)
		}
		return nil
	})
}
