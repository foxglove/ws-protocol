default: build

.PHONY: build
build:
	docker compose build --build-arg CPPSTD=17

.PHONY: build-cpp20
build-cpp20:
	docker compose build --build-arg CPPSTD=20

.PHONY: format-check
format-check:
	docker compose run --rm -v $(PWD):/src base python3 scripts/format.py /src

.PHONY: format-fix
format-fix:
	docker compose run --rm -v $(PWD):/src base python3 scripts/format.py --fix /src

.PHONY: example_server
example_server:
	docker compose run --service-ports example_server
