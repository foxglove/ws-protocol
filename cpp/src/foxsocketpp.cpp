#include "foxsocketpp.hpp"

#include <iostream>
#include <nlohmann/json.hpp>

using LockGuard = std::lock_guard<std::recursive_mutex>;
using json = nlohmann::json;

using websocketpp::lib::bind;
using websocketpp::lib::placeholders::_1;
using websocketpp::lib::placeholders::_2;

namespace foxsocketpp {

void info(const std::string_view msg) { std::cout << "[INFO] " << msg << "\n"; }

void error(const std::string_view msg) { std::cerr << "[ERROR] " << msg << "\n"; }

void fatal(const std::string_view msg) {
  std::cerr << "[FATAL] " << msg << "\n";
  std::exit(1);
}

void FoxSocket::start() {
  running_ = true;
  serverThread_ = std::thread([this]() { serverRunLoop(); });
}

void FoxSocket::stop() {
  running_ = false;

  std::error_code ec;
  server_.stop_listening(ec);

  // Iterate over all client connections and start the close connection handshake
  for (auto& [remoteEndpoint, hdl] : seenClients_) {
    auto con = server_.get_con_from_hdl(hdl, ec);
    if (con) {
      con->close(websocketpp::close::status::going_away, "server shutdown", ec);
    }
  }

  serverThread_.join();
}

void FoxSocket::serverRunLoop() {
  try {
    // Set logging settings
    server_.clear_access_channels(websocketpp::log::alevel::all);

    // Start the WebSocket server
    server_.init_asio();
    server_.set_message_handler(bind(&FoxSocket::onSocketMessage, this, ::_1, ::_2));
    server_.set_reuse_addr(true);
    server_.set_listen_backlog(128);
    server_.listen(8001);
    server_.start_accept();
    info("Listening on port 8001");
    server_.run();
  } catch (websocketpp::exception const& e) {
    fatal(e.what());
  } catch (...) {
    fatal("Failed to start a server on port 8001, unknown error");
  }
}

void FoxSocket::sendText(ConnHandle hdl, const std::string& payload) {
  try {
    server_.send(hdl, payload, OpCode::TEXT);
  } catch (websocketpp::exception const& e) {
    error(e.what());
  }
}

void FoxSocket::sendBinary(ConnHandle hdl, const std::vector<uint8_t>& payload) {
  const auto* data = reinterpret_cast<const uint8_t*>(payload.data());
  const size_t length = payload.size();

  try {
    server_.send(hdl, reinterpret_cast<void const*>(data), length, OpCode::BINARY);
  } catch (websocketpp::exception const& e) {
    error(e.what());
  }
}

void FoxSocket::onSocketMessage(ConnHandle hdl, MessagePtr msg) {
  (void)hdl;
  const auto& payloadStr = msg->get_payload();
  const auto payload = json::parse(payloadStr);
  const std::string& op = payload["op"].get<std::string>();

  std::error_code ec;
  auto con = server_.get_con_from_hdl(hdl, ec);
  if (!con) {
    error("get_con_from_hdl failed in onSocketMessage");
    return;
  }

  bool newConnection = false;
  const std::string remoteEndpoint = con->get_remote_endpoint();

  {
    LockGuard lock{mutex_};
    newConnection = (seenClients_.find(remoteEndpoint) == seenClients_.end());
    seenClients_[remoteEndpoint] = hdl;
  }

  if (op == "subscribe") {
    // handleSubscribe(hdl, remoteEndpoint, payload["topic"].get<std::string>());
  } else if (op == "unsubscribe") {
    // handleUnsubscribe(hdl, remoteEndpoint, payload["topic"].get<std::string>());
  } else {
    // sendError(hdl, "unknown op");
  }

  if (newConnection) {
    // Send one-time messages to the new client
  }
}

}  // namespace foxsocketpp
