from conans import ConanFile, CMake


class FoxgloveWebSocketExamplesConan(ConanFile):
    settings = "os", "compiler", "build_type", "arch"
    generators = "cmake"
    requires = "foxglove-websocket/0.0.1", "protobuf/3.21.4"

    def build(self):
        cmake = CMake(self)
        cmake.configure()
        cmake.build()
