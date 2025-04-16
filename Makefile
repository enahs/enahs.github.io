clean:
	rm -rf static

build:
	go run main.go
run: 
	go run main.go --serve=true

all: clean run

.phony: clean run