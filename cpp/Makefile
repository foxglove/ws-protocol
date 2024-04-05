default: build

.PHONY: build
build:
	docker compose build --build-arg CPPSTD=17

.PHONY: build-boost-asio
build-boost-asio:
	docker compose build --build-arg CPPSTD=17 --build-arg ASIO=boost

.PHONY: build-cpp20
build-cpp20:
	docker compose build --build-arg CPPSTD=20

.PHONY: format-check
format-check:
	docker compose run --rm -v $(PWD):/src base python3 scripts/format.py /src

.PHONY: format-fix
format-fix:
	docker compose run --rm -v $(PWD):/src base python3 scripts/format.py --fix /src

.PHONY: example_server_protobuf
example_server_protobuf:
	docker compose run --service-ports example_server_protobuf

.PHONY: example_server_flatbuffers
example_server_flatbuffers:
	docker compose run --service-ports example_server_flatbuffers

.PHONY: example_server_json
example_server_json:
	docker compose run --service-ports example_server_json

.PHONY: example_server_perf_test
example_server_perf_test:
	docker compose run --service-ports example_server_perf_test

.PHONY: example_client_perf_test
example_client_perf_test:
	docker compose run example_client_perf_test
