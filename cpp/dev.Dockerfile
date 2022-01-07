FROM ubuntu:focal AS base

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
    python3-pip 


RUN echo "deb http://apt.llvm.org/focal/ llvm-toolchain-focal-13 main" >> /etc/apt/sources.list && \
    curl https://apt.llvm.org/llvm-snapshot.gpg.key | apt-key add -  &&\
    apt-get update && \
    apt-get install -y --no-install-recommends --no-install-suggests \
    clang-13 \
    clang-format-13 

RUN update-alternatives --install /usr/bin/clang-format clang-format /usr/bin/clang-format-13 100
RUN update-alternatives --install /usr/bin/git-clang-format git-clang-format /usr/bin/git-clang-format-13 100

ENV CC=clang-13
ENV CXX=clang++-13

WORKDIR /src

FROM base as build
RUN pip --no-cache-dir install conan

ENV CONAN_V2_MODE=1
RUN conan config init
RUN conan profile update settings.compiler.cppstd=17 default

FROM build as build_example_server
COPY ./examples /src/examples/
COPY ./foxglove-websocket /src/foxglove-websocket/
COPY ./.clang-format /src/
RUN conan editable add ./foxglove-websocket foxglove-websocket/0.0.1
RUN conan install examples --install-folder examples/build --build=openssl --build=zlib

FROM build_example_server AS example_server
COPY --from=build_example_server /src /src
COPY --from=build_example_server /src/examples/build/ /src/examples/build/
RUN conan build examples --build-folder examples/build
ENTRYPOINT ["examples/build/bin/example_server"]
