#include <foxglove_websocket/server.hpp>

#include <nlohmann/json.hpp>

#include <algorithm>
#include <iostream>

using json = nlohmann::json;

using websocketpp::lib::bind;
using websocketpp::lib::placeholders::_1;
using websocketpp::lib::placeholders::_2;

namespace foxglove_websocket {

template <typename... Args>
void info(Args&&... args) {
  ((std::cout << "[INFO] ") << ... << std::forward<Args>(args)) << "\n";
}

template <typename... Args>
void error(Args&&... args) {
  ((std::cerr << "[ERROR] ") << ... << std::forward<Args>(args)) << "\n";
}

template <typename... Args>
void fatal(Args&&... args) {
  ((std::cerr << "[FATAL] ") << ... << std::forward<Args>(args)) << "\n";
  std::exit(1);
}

const std::string Server::SUPPORTED_SUBPROTOCOL = "foxglove.websocket.v1";

void to_json(json& j, const Channel& channel) {
  j = json{
    {"id", channel.id},
    {"topic", channel.topic},
    {"encoding", channel.encoding},
    {"schemaName", channel.schemaName},
    {"schema", channel.schema},
  };
}

Server::Server(std::string name)
    : _name(name) {
  // Start the WebSocket server
  server_.init_asio();
}

Server::~Server() {}

void Server::start(uint16_t port) {
  running_ = true;
  serverThread_ = std::thread([this, port]() {
    serverRunLoop(port);
  });
}

void Server::stop() {
  running_ = false;

  std::error_code ec;
  server_.stop_listening(ec);

  // Iterate over all client connections and start the close connection handshake
  // for (auto& [remoteEndpoint, hdl] : seenClients_) {
  //   auto con = server_.get_con_from_hdl(hdl, ec);
  //   if (con) {
  //     con->close(websocketpp::close::status::going_away, "server shutdown", ec);
  //   }
  // }

  serverThread_.join();
}

void Server::serverRunLoop(uint16_t port) {
  try {
    // Set logging settings
    server_.clear_access_channels(websocketpp::log::alevel::all);

    // FIXME:moved, ok?
    // // Start the WebSocket server
    // server_.init_asio();

    server_.set_validate_handler([&](ConnHandle hdl) {
      auto con = server_.get_con_from_hdl(hdl);

      const auto& subprotocols = con->get_requested_subprotocols();
      if (std::find(subprotocols.begin(), subprotocols.end(), SUPPORTED_SUBPROTOCOL) !=
          subprotocols.end()) {
        con->select_subprotocol(SUPPORTED_SUBPROTOCOL);
        return true;
      }
      info("Rejecting client ", con->get_remote_endpoint(),
           " which did not declare support for subprotocol ", SUPPORTED_SUBPROTOCOL);
      return false;
    });

    server_.set_open_handler([&](ConnHandle hdl) {
      auto con = server_.get_con_from_hdl(hdl);
      info("Client ", con->get_remote_endpoint(), " connected via ", con->get_resource());

      con->send(json({
                       {"op", "serverInfo"},
                       {"name", _name},
                       {"capabilities", json::array()},
                     })
                  .dump());

      con->send(json({
                       {"op", "advertise"},
                       {"channels", _channels},
                     })
                  .dump());
    });

    server_.set_message_handler(bind(&Server::onSocketMessage, this, ::_1, ::_2));
    server_.set_reuse_addr(true);
    server_.set_listen_backlog(128);
    server_.listen(port);
    server_.start_accept();
    info("Server listening on port ", port);
    server_.run();
  } catch (std::exception const& e) {
    fatal(e.what());
  } catch (...) {
    fatal("Failed to start a server on port ", port, ", unknown error");
  }
}

void Server::sendText(ConnHandle hdl, const std::string& payload) {
  try {
    server_.send(hdl, payload, OpCode::TEXT);
  } catch (websocketpp::exception const& e) {
    error(e.what());
  }
}

void Server::sendBinary(ConnHandle hdl, const std::vector<uint8_t>& payload) {
  const auto* data = reinterpret_cast<const uint8_t*>(payload.data());
  const size_t length = payload.size();

  try {
    server_.send(hdl, reinterpret_cast<void const*>(data), length, OpCode::BINARY);
  } catch (websocketpp::exception const& e) {
    error(e.what());
  }
}

void Server::onSocketMessage([[maybe_unused]] ConnHandle hdl, MessagePtr msg) {
  const auto& payloadStr = msg->get_payload();
  const auto payload = json::parse(payloadStr);
  const std::string& op = payload["op"].get<std::string>();

  std::error_code ec;
  auto con = server_.get_con_from_hdl(hdl, ec);
  if (!con) {
    error("get_con_from_hdl failed in onSocketMessage");
    return;
  }

  const std::string remoteEndpoint = con->get_remote_endpoint();

  info("Got message from ", remoteEndpoint, ": ", payloadStr);
  if (op == "subscribe") {
    // handleSubscribe(hdl, remoteEndpoint, payload["topic"].get<std::string>());
  } else if (op == "unsubscribe") {
    // handleUnsubscribe(hdl, remoteEndpoint, payload["topic"].get<std::string>());
  } else {
    // sendError(hdl, "unknown op");
  }
}

ChannelId Server::addChannel([[maybe_unused]] ChannelWithoutId&& channel) {
  return 0;
}

void Server::sendMessage([[maybe_unused]] ChannelId chanId, [[maybe_unused]] uint64_t timestamp,
                         [[maybe_unused]] std::string_view data /*FIXME: std::span replacement?*/) {
}

}  // namespace foxglove_websocket
