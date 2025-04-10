clean:
	rm -rf static
run: 
	go run main.go

.phony: clean run