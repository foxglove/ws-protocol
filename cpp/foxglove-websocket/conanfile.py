from conans import ConanFile, tools


class FoxgloveWebSocketConan(ConanFile):
    name = "foxglove-websocket"
    version = "0.0.1"
    url = "https://github.com/foxglove/ws-protocol"
    homepage = "https://github.com/foxglove/ws-protocol"
    description = "A C++ server implementation of the Foxglove WebSocket Protocol"
    license = "MIT"
    topics = ("foxglove", "websocket")

    settings = ("os", "compiler", "build_type", "arch")
    requires = ("nlohmann_json/[^3.10.4]", "websocketpp/[^0.8.2]")
    generators = "cmake"

    def validate(self):
        tools.check_min_cppstd(self, "17")

    def configure(self):
        self.options["websocketpp"].asio = "standalone"

    def package(self):
        self.copy(pattern="LICENSE", dst="licenses")
        self.copy("include/*")

    def package_id(self):
        self.info.header_only()
