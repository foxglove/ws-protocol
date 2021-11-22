# Whether to turn compiler warnings into errors
export WERROR ?= true
export BUILD_DIR ?= build

export CC=clang-10
export CXX=clang++-10

default: release

.PHONY: release
release:
	mkdir -p ./$(BUILD_DIR) && cd ./$(BUILD_DIR) && cmake ../ -DCMAKE_BUILD_TYPE=Release -DWERROR=$(WERROR) && VERBOSE=1 cmake --build .

.PHONY: debug
debug:
	mkdir -p ./$(BUILD_DIR) && cd ./$(BUILD_DIR) && cmake ../ -DCMAKE_BUILD_TYPE=Debug -DWERROR=$(WERROR) && VERBOSE=1 cmake --build .

.PHONY: test
test:
	@if [ -f ./$(BUILD_DIR)/bin/unit-tests ]; then ./$(BUILD_DIR)/bin/unit-tests; else echo "Please run 'make release' or 'make debug' first" && exit 1; fi

.PHONY: coverage
coverage:
	./scripts/coverage.sh

.PHONY: clean
clean:
	rm -rf ./$(BUILD_DIR)
	# remove remains from running 'make coverage'
	rm -f *.profraw
	rm -f *.profdata

.PHONY: format
format:
	./scripts/format.sh
