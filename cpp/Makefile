# Whether to turn compiler warnings into errors
export WERROR ?= true
export BUILD_DIR ?= build

default: release

release:
	mkdir -p ./$(BUILD_DIR) && cd ./$(BUILD_DIR) && cmake ../ -DCMAKE_BUILD_TYPE=Release -DWERROR=$(WERROR) && VERBOSE=1 cmake --build .

debug:
	mkdir -p ./$(BUILD_DIR) && cd ./$(BUILD_DIR) && cmake ../ -DCMAKE_BUILD_TYPE=Debug -DWERROR=$(WERROR) && VERBOSE=1 cmake --build .

test:
	@if [ -f ./$(BUILD_DIR)/bin/unit-tests ]; then ./$(BUILD_DIR)/bin/unit-tests; else echo "Please run 'make release' or 'make debug' first" && exit 1; fi

coverage:
	./scripts/coverage.sh

clean:
	rm -rf ./$(BUILD_DIR)
	# remove remains from running 'make coverage'
	rm -f *.profraw
	rm -f *.profdata

format:
	./scripts/format.sh

.PHONY: test
