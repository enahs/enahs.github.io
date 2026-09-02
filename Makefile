# delete static assets
clean:
	rm -rf static

# build static assets
build: clean
	go run cmd/build/main.go

# run dev server	
run: 
	go run cmd/serve/main.go

all: clean run

.phony: clean run