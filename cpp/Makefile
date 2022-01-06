default: build


.PHONY: build
build:
	docker compose build

.PHONY: format-check
format-check:
	docker compose run --rm -v .:/cpp base python3 scripts/format.py /cpp

.PHONY: format-fix
format-fix:
	docker compose run --rm -v .:/cpp base python3 scripts/format.py --fix /cpp

.PHONY: example_server
example_server:
	docker compose run example_server
