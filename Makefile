# Hero and photo derivatives are generated from the originals in img-src/ and
# committed, because the GitHub Actions build runs Go only and has no ImageMagick.
HERO_SRC := img-src/ghibli.jpg
HERO_W   := 920

# delete static assets
clean:
	rm -rf static

# build static assets
build: clean
	go run cmd/build/main.go

# run dev server	
run: 
	go run cmd/serve/main.go

# regenerate web derivatives from img-src/ originals. needs `brew install imagemagick`.
# rerunnable: always encodes from the original, never from a previous derivative.
images:
	@command -v magick >/dev/null || { echo "make images needs ImageMagick: brew install imagemagick" >&2; exit 1; }
	magick $(HERO_SRC) -resize $(HERO_W)x -quality 60 -strip assets/img/ghibli.avif
	magick $(HERO_SRC) -resize $(HERO_W)x -quality 82 -sampling-factor 4:2:0 -strip -interlace JPEG assets/img/ghibli.jpg
	@ls -l assets/img/

all: clean run

.PHONY: clean build run images all
