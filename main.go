package main

import (
	"html/template"
	"os"
	"path"
	"path/filepath"
	"strings"
)

func main() {
	// create a static directory
	if err := os.MkdirAll("./static", 0775); err != nil {
		panic(err)
	}
	// copy static assets
	if err := os.CopyFS("static/assets", os.DirFS("assets")); err != nil {
		panic(err)
	}
	layout := []string{
		"layout/layout.tmpl",
		"templates/nav.tmpl",
		"templates/head.tmpl",
	}
	// gather pages
	pages := []string{}
	filepath.Walk("./pages", func(filename string, info os.FileInfo, err error) error {
		if path.Ext(filename) == ".html" {
			pages = append(pages, filename)
		}
		return nil
	})

	// parse templates

	for _, pg := range pages {
		t, err := template.ParseFiles(append(layout, pg)...)
		if err != nil {
			panic(err)
		}
		outputFilename := strings.Replace(pg, "pages/", "static/", 1)

		dir := filepath.Dir(outputFilename)
		if err := os.MkdirAll(dir, 0755); err != nil {
			panic(err)
		}
		f, err := os.Create(outputFilename)
		if err != nil {
			panic(err)
		}
		defer f.Close()

		if err := t.ExecuteTemplate(f, "layout", map[string]string{"email": "shane@skada.io"}); err != nil {
			panic(err)
		}
	}

}
