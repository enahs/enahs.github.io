package build

import (
	"fmt"
	"os"
	"path"
	"path/filepath"
	"strings"
	"text/template"
)

func Build() error {
	// gather configuration from env
	var (
		email    = os.Getenv("EMAIL")
		GAKey    = os.Getenv("GA_KEY")
		buildEnv = os.Getenv("BUILD_ENV")
	)
	// blow away existing static dir if any
	if err := os.RemoveAll("./static"); err != nil {
		return err
	}
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
			"email":    email,
			"GAKey":    GAKey,
			"buildEnv": buildEnv,
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
