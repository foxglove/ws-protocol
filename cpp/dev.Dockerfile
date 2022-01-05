FROM ubuntu:focal

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

ENV CC=clang-13
ENV CXX=clang++-13

RUN pip --no-cache-dir install conan

ENV CONAN_V2_MODE=1

RUN conan config init
RUN conan profile update settings.compiler.cppstd=17 default
# RUN conan profile update settings.compiler=clang default
# RUN conan profile update settings.compiler.version=13 default

# update-alternatives --install /usr/bin/clang-format clang-format /usr/bin/clang-format-10 100
WORKDIR /cpp

COPY ./conanfile.py ./conanfile.py
COPY ./examples/conanfile.py ./examples/conanfile.py
RUN conan editable add . foxglove_websocket/0.0.1
RUN cd examples && mkdir build && cd build && conan install .. --build=openssl --build=zlib

VOLUME /cpp
