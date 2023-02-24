#include <websocketpp/common/connection_hdl.hpp>

#include <foxglove/websocket/server_factory.hpp>
#include <foxglove/websocket/websocket_server.hpp>

namespace foxglove {

template <>
std::unique_ptr<ServerInterface<websocketpp::connection_hdl>> ServerFactory::createServer(
  const std::string& name, const std::function<void(WebSocketLogLevel, char const*)>& logHandler,
  const ServerOptions& options) {
  if (options.useTls) {
    return std::make_unique<foxglove::Server<foxglove::WebSocketTls>>(name, logHandler, options);
  } else {
    return std::make_unique<foxglove::Server<foxglove::WebSocketNoTls>>(name, logHandler, options);
  }
}

}  // namespace foxglove
