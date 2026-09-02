package main

import (
	"github.com/enahs/enahs.github.io/internal/build"
)

func main() {
	if err := build.Build(); err != nil {
		panic(err)
	}
}
