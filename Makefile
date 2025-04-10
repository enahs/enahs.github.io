clean:
	rm -rf static
run: 
	go run main.go

all: clean run

.phony: clean run