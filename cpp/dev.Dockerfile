FROM conanio/clang13-ubuntu16.04 AS base

WORKDIR /src

FROM base as build
RUN conan config init
RUN conan profile update settings.compiler.cppstd=17 default

FROM build as build_example_server
COPY ./examples/conanfile.py /src/examples/conanfile.py
COPY ./foxglove-websocket /src/foxglove-websocket/
COPY ./.clang-format /src/
RUN conan editable add ./foxglove-websocket foxglove-websocket/0.0.1
RUN conan install examples --install-folder examples_build --build=protobuf

FROM build_example_server AS example_server
COPY --from=build_example_server /src /src
COPY ./examples /src/examples
COPY --from=build_example_server /src/examples_build/ /src/examples_build/
RUN conan build examples --build-folder examples_build
ENTRYPOINT ["examples_build/bin/example_server"]
