package main

import (
	"flag"
	"fmt"
	"html/template"
	"log"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
)

func main() {
	if err := build(); err != nil {
		panic(err)
	}

	// local server
	shouldServe := flag.Bool("serve", false, "--serve=true")
	flag.Parse()
	if *shouldServe {
		fs := http.FileServer(HTMLDir{http.Dir("./static")})
		http.Handle("/", fs)

		log.Print("Listening on :3000...")
		err := http.ListenAndServe(":3000", nil)
		if err != nil {
			log.Fatal(err)
		}
	}
}

// reference pages locally without referring to .html in link
// https://stackoverflow.com/questions/57281010/remove-the-html-extension-from-every-file-in-a-simple-http-server
type HTMLDir struct {
	d http.Dir
}

func (d HTMLDir) Open(name string) (http.File, error) {
	f, err := d.d.Open(name + ".html")
	if os.IsNotExist(err) {
		// Not found, try again with name as supplied.
		if f, err := d.d.Open(name); err == nil {
			return f, nil
		}
	}
	return f, err
}

func build() error {
	// gather configuration from env
	email := os.Getenv("EMAIL")
	GAKey := os.Getenv("GA_KEY")

	// create a static directory
	if err := os.MkdirAll("./static", 0775); err != nil {
		return err
	}
	// copy static assets
	if err := os.CopyFS("static/assets", os.DirFS("assets")); err != nil {
		return err
	}
	layout := []string{
		"templates/layout.tmpl",
		"templates/nav.tmpl",
		"templates/head.tmpl",
	}
	// gather pages
	pages := []string{}
	if err := filepath.Walk("./pages", func(filename string, info os.FileInfo, err error) error {
		if path.Ext(filename) == ".html" {
			pages = append(pages, filename)
		}
		return nil
	}); err != nil {
		return err
	}

	// parse templates
	for _, pg := range pages {
		t, err := template.ParseFiles(append(layout, pg)...)
		if err != nil {
			return err
		}
		outputFilename := strings.Replace(pg, "pages/", "static/", 1)

		dir := filepath.Dir(outputFilename)
		if err := os.MkdirAll(dir, 0755); err != nil {
			return err
		}
		f, err := os.Create(outputFilename)
		if err != nil {
			return err
		}
		defer f.Close()
		data := map[string]string{
			"email": email,
			"GAKey": GAKey,
		}
		if pg == "pages/index.html" {
			data["name"] = "homepage"
		}
		if err := t.ExecuteTemplate(f, "layout", data); err != nil {
			return fmt.Errorf("creating template for page %s: %w", pg, err)
		}
	}
	return nil
}
