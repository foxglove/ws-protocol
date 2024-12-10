from conan import ConanFile
from conan.tools.cmake import CMakeToolchain, CMake, cmake_layout
from conan.tools.build import check_min_cppstd


class FoxgloveWebSocketConan(ConanFile):
    name = "foxglove-websocket"
    version = "1.4.0"
    url = "https://github.com/foxglove/ws-protocol"
    homepage = "https://github.com/foxglove/ws-protocol"
    description = "A C++ server implementation of the Foxglove WebSocket Protocol"
    license = "MIT"
    topics = ("foxglove", "websocket")

    settings = ("os", "compiler", "build_type", "arch")
    generators = "CMakeDeps"
    exports_sources = "CMakeLists.txt", "LICENSE", "src/*", "include/*"
    options = {"asio": ["standalone", "boost"]}
    default_options = {"asio": "standalone"}

    def validate(self):
        check_min_cppstd(self, "17")

    def requirements(self):
        self.requires("nlohmann_json/3.10.5", transitive_headers=True)
        self.requires("websocketpp/0.8.2", transitive_headers=True)

    def configure(self):
        if self.options.asio == "standalone":
            self.options["websocketpp"].asio = "standalone"

    def layout(self):
        cmake_layout(self)

    def generate(self):
        tc = CMakeToolchain(self)
        tc.generate()

    def build(self):
        cmake = CMake(self)
        cmake.configure()
        cmake.build()

    def package(self):
        cmake = CMake(self)
        cmake.install()

    def package_info(self):
        self.cpp_info.libs = ["foxglove_websocket"]
