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
RUN conan profile detect --force

FROM build as build_example_server
COPY ./foxglove-websocket/conanfile.py /src/foxglove-websocket/conanfile.py
RUN conan install foxglove-websocket -s compiler.cppstd=17 --build=missing
COPY ./foxglove-websocket /src/foxglove-websocket/
RUN conan create foxglove-websocket -s compiler.cppstd=17
COPY ./examples/conanfile.py /src/examples/conanfile.py
RUN conan install examples --output-folder examples/build --build=missing -s compiler.cppstd=17

FROM build_example_server AS example_server
COPY --from=build_example_server /src /src
COPY ./examples /src/examples
COPY --from=build_example_server /src/examples/build/ /src/examples/build/
RUN conan build examples --output-folder examples/ -s compiler.cppstd=17
CMD ["examples/build/Release/example_server"]
