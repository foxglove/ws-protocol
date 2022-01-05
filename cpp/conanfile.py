from conans import ConanFile, CMake, tools


class FoxgloveWebSocketConan(ConanFile):
    name = "foxglove_websocket"
    version = "0.0.1"
    url = "https://github.com/foxglove/ws-protocol"
    homepage = "https://github.com/foxglove/ws-protocol"
    description = "A C++ server implementation of the Foxglove WebSocket Protocol"
    license = "MIT"
    topics = ("foxglove", "websocket")

    settings = ("os", "compiler", "build_type", "arch")
    requires = ("nlohmann_json/3.10.4", "websocketpp/0.8.2")
    generators = "cmake"

    exports_sources = (
        "include/*",
        "LICENSE",
    )

    def configure(self):
        self.options["websocketpp"].asio = "standalone"

    # def source(self):
    #     git = tools.Git(folder="ws-protocol")
    #     git.clone("https://github.com/foxglove/ws-protocol.git", shallow=True)

    # def build(self):
    #     """
    #     Build and run unit tests during packaging.
    #     """
    #     cmake = CMake(self)
    #     cmake.configure()
    #     cmake.build()
    #     cmake.test()

    def package(self):
        self.copy(pattern="LICENSE", dst="licenses")
        self.copy("*.h")

    def package_id(self):
        """
        Since this is a single-header package, we only need one unique package id regardless of
        configuration and dependencies.
        https://docs.conan.io/en/1.36/howtos/header_only.html#header-only
        """
        self.info.header_only()
