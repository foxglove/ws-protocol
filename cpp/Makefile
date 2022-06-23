default: build

.PHONY: build
build:
	docker compose build

.PHONY: format-check
format-check:
	docker compose run --rm -v $(PWD):/src base python3 scripts/format.py /src

.PHONY: format-fix
format-fix:
	docker compose run --rm -v $(PWD):/src base python3 scripts/format.py --fix /src

.PHONY: example_server
example_server:
	docker compose run --service-ports example_server
