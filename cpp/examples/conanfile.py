from conan import ConanFile
from conan.tools.cmake import CMakeToolchain, CMake, cmake_layout


class FoxgloveWebSocketExamplesConan(ConanFile):
    name = "foxglove-websocket-example"
    version = "1.1.0"
    settings = "os", "compiler", "build_type", "arch"
    exports_sources = "CMakeLists.txt", "src/*", "proto/*"
    generators = "CMakeDeps"

    def requirements(self):
        self.requires("flatbuffers/23.5.26")
        self.requires("foxglove-schemas-protobuf/0.1.0")
        self.requires("foxglove-websocket/1.1.0")
        self.requires("zlib/1.2.13")
        self.requires("boost/1.83.0", transitive_headers=True)

    def layout(self):
        cmake_layout(self)

    def generate(self):
        tc = CMakeToolchain(self)
        tc.generate()

    def build(self):
        cmake = CMake(self)
        cmake.configure()
        cmake.build()
