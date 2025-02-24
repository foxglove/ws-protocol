#pragma once

#define ASIO_STANDALONE
#define WEBSOCKETPP_NO_BOOST
#define WEBSOCKETPP_STRICT_NO_TLS 1

#include <websocketpp/common/connection_hdl.hpp>

#include <memory>
#include <string>

#include "common.hpp"
#include "server_interface.hpp"

namespace foxglove {

class ServerFactory {
public:
  template <typename ConnectionHandle>
  static std::unique_ptr<ServerInterface<ConnectionHandle>> createServer(
    const std::string& name, const std::function<void(WebSocketLogLevel, char const*)>& logHandler,
    const ServerOptions& options);
};

}  // namespace foxglove
