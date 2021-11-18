from conans import ConanFile, CMake, tools

PROJECT = "foxsocketpp"


class FoxSocketPpConan(ConanFile):
    name = PROJECT
    version = "1.0.0"
    url = f"https://github.com/jhurliman/{PROJECT}"
    homepage = f"https://github.com/jhurliman/{PROJECT}"
    description = "A C++ server implementation of the Foxglove WebSocket Protocol"
    license = ("MIT")
    topics = ("foxglove", "websocket")
    settings = "os", "compiler", "build_type", "arch"
    build_requires = "catch2/2.13.4"
    requires = "nlohmann_json/3.10.4", "websocketpp/0.8.2"
    generators = "cmake"

    def configure(self):
        self.options['websocketpp'].asio = "standalone"

    def source(self):
        self.run(f"git clone https://github.com/jhurliman/{PROJECT}.git")

    def build(self):
        cmake = CMake(self)
        cmake.configure(source_folder=PROJECT)
        cmake.build()

    def package(self):
        cmake = CMake(self)
        cmake.configure(source_folder=PROJECT)
        cmake.install()
        self.copy(pattern="LICENSE", dst="licenses")

    def package_info(self):
        self.cpp_info.names["cmake_find_package"] = PROJECT
        self.cpp_info.names["pkg_config"] = PROJECT
