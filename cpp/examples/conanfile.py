from conan import ConanFile
from conan.tools.cmake import CMakeToolchain, CMake, cmake_layout

class FoxgloveWebSocketExamplesConan(ConanFile):
    name = "foxglove-websocket-example"
    version = "1.0.0"
    settings = "os", "compiler", "build_type", "arch"
    exports_sources = "CMakeLists.txt", "src/*", "proto/*"
    generators = "CMakeDeps"

    def requirements(self):
        self.requires("foxglove-websocket/1.0.0")
        self.requires("protobuf/3.21.4")
        self.requires("zlib/1.2.13")

    def layout(self):
        cmake_layout(self)

    def generate(self):
        tc = CMakeToolchain(self)
        tc.generate()

    def build(self):
        cmake = CMake(self)
        cmake.configure()
        cmake.build()
