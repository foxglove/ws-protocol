FROM ubuntu:jammy AS base

# https://askubuntu.com/questions/909277/avoiding-user-interaction-with-tzdata-when-installing-certbot-in-a-docker-contai
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && \
    apt-get install -y --no-install-recommends --no-install-suggests \
    ca-certificates \
    curl \
    cmake \
    gnupg \
    make \
    perl \
    python3 \
    python3-pip \
    clang \
    clang-format

ENV CC=clang
ENV CXX=clang++

WORKDIR /src

FROM base as build
RUN pip --no-cache-dir install conan

RUN conan config init
RUN conan profile update settings.compiler.cppstd=17 default

FROM build as build_example_server
COPY ./examples/conanfile.py /src/examples/conanfile.py
COPY ./foxglove-websocket /src/foxglove-websocket/
COPY ./.clang-format /src/
RUN conan editable add ./foxglove-websocket foxglove-websocket/0.0.1
RUN conan install examples --install-folder examples/build --build=openssl --build=zlib --build=protobuf

FROM build_example_server AS example_server
COPY --from=build_example_server /src /src
COPY ./examples /src/examples
COPY --from=build_example_server /src/examples/build/ /src/examples/build/
RUN conan build examples --build-folder examples/build
ENTRYPOINT ["examples/build/bin/example_server"]
