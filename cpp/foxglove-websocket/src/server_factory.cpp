#define ASIO_STANDALONE
#define WEBSOCKETPP_NO_BOOST
#define WEBSOCKETPP_STRICT_NO_TLS 1

#include <foxglove/websocket/server_factory.hpp>
#include <foxglove/websocket/websocket_notls.hpp>
#include <foxglove/websocket/websocket_server.hpp>

#include <websocketpp/common/connection_hdl.hpp>

namespace foxglove {

template <>
std::unique_ptr<ServerInterface<websocketpp::connection_hdl>> ServerFactory::createServer(
  const std::string& name, const std::function<void(WebSocketLogLevel, char const*)>& logHandler,
  const ServerOptions& options) {
  return std::make_unique<foxglove::Server<foxglove::WebSocketNoTls>>(name, logHandler, options);
}

template <>
void Server<WebSocketNoTls>::setupTlsHandler() {
  _server.get_alog().write(APP, "Server running without TLS");
}

}  // namespace foxglove
