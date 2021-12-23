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
  for (const auto& [hdl, clientInfo] : _clients) {
    if (auto con = server_.get_con_from_hdl(hdl, ec)) {
      con->close(websocketpp::close::status::going_away, "server shutdown", ec);
    }
  }

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
      _clients.emplace(hdl, ClientInfo{
                              .name = con->get_remote_endpoint(),
                              .handle = hdl,
                            });

      con->send(json({
                       {"op", "serverInfo"},
                       {"name", _name},
                       {"capabilities", json::array()},
                     })
                  .dump());

      json channels;
      for (const auto& [id, channel] : _channels) {
        channels.push_back(channel);
      }
      con->send(json{
        {"op", "advertise"},
        {"channels", std::move(channels)},
      }
                  .dump());
    });
    server_.set_close_handler([&](ConnHandle hdl) {
      _clients.erase(hdl);

      auto con = server_.get_con_from_hdl(hdl);
      info("Client ", con->get_remote_endpoint(), " disconnected");
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
  try {
    server_.send(hdl, payload.data(), payload.size(), OpCode::BINARY);
  } catch (websocketpp::exception const& e) {
    error(e.what());
  }
}

void Server::onSocketMessage([[maybe_unused]] ConnHandle hdl, MessagePtr msg) {
  const auto& payloadStr = msg->get_payload();
  const auto payload = json::parse(payloadStr);
  // FIXME: handle missing "op" key
  const std::string& op = payload["op"].get<std::string>();

  std::error_code ec;
  auto con = server_.get_con_from_hdl(hdl, ec);
  if (!con) {
    error("get_con_from_hdl failed in onSocketMessage");
    return;
  }

  const std::string remoteEndpoint = con->get_remote_endpoint();

  auto& clientInfo = _clients.at(hdl);

  info("Got message from ", remoteEndpoint, ": ", payloadStr);
  if (op == "subscribe") {
    // FIXME: validation throughout?
    for (const auto& sub : payload["subscriptions"]) {
      SubscriptionId subId = sub["id"];
      ChannelId channelId = sub["channelId"];
      if (clientInfo.subscriptions.find(subId) != clientInfo.subscriptions.end()) {
        //     this.send(client.connection, {
        //       op: "status",
        //       level: StatusLevel.ERROR,
        //       message: `Client subscription id ${subId} was already used; ignoring subscription`,
        //     });
        error("Sub id ", subId, " already used; ignoring");
        continue;
      }
      const auto& channelIt = _channels.find(channelId);
      if (channelIt == _channels.end()) {
        //     this.send(client.connection, {
        //       op: "status",
        //       level: StatusLevel.WARNING,
        //       message: `Channel ${channelId} is not available; ignoring subscription",`,
        //     });
        //     continue;
        error("Subscription to unknown channel ", channelId, "; ignoring");
        continue;
      }
      info("client ", clientInfo.name, " subscribed to channel ", channelId);
      //   const firstSubscription = !this.anySubscribed(channelId);
      clientInfo.subscriptions.emplace(subId, channelId);
      clientInfo.subscriptionsByChannel[channelId].insert(subId);
      //   if (firstSubscription) {
      //     this.emitter.emit("subscribe", channelId);
      //   }
    }
  } else if (op == "unsubscribe") {
    // handleUnsubscribe(hdl, remoteEndpoint, payload["topic"].get<std::string>());
  } else {
    // sendError(hdl, "unknown op");
  }
}

ChannelId Server::addChannel([[maybe_unused]] ChannelWithoutId&& channel) {
  const auto newId = ++_nextChannelId;
  Channel newChannel{newId, std::move(channel)};

  for (const auto& [hdl, clientInfo] : _clients) {
    sendText(hdl,
             json{
               {"op", "advertise"},
               {"channels", {newChannel}},
             }
               .dump());
  }

  _channels.emplace(newId, std::move(newChannel));
  return newId;
}

void Server::sendMessage(ChannelId chanId, uint64_t timestamp,
                         std::string_view data /*FIXME: std::span replacement?*/) {
  std::vector<uint8_t> message;
  for (const auto& [hdl, client] : _clients) {
    const auto& subs = client.subscriptionsByChannel.find(chanId);
    if (subs == client.subscriptionsByChannel.end()) {
      continue;
    }
    for (const auto subId : subs->second) {
      if (message.empty()) {
        message.resize(1 + 4 + 8 + data.size());
        message[0] = 1;  // TODO: enum
        message[5] = (timestamp >> 0) & 0xff;
        message[6] = (timestamp >> 8) & 0xff;
        message[7] = (timestamp >> 16) & 0xff;
        message[8] = (timestamp >> 24) & 0xff;
        message[9] = (timestamp >> 32) & 0xff;
        message[10] = (timestamp >> 40) & 0xff;
        message[11] = (timestamp >> 48) & 0xff;
        message[12] = (timestamp >> 56) & 0xff;
        std::copy(data.begin(), data.end(), message.data() + 1 + 4 + 8);
      }
      message[1] = (subId >> 0) & 0xff;
      message[2] = (subId >> 8) & 0xff;
      message[3] = (subId >> 16) & 0xff;
      message[4] = (subId >> 24) & 0xff;
      sendBinary(hdl, message);
    }
  }
}

}  // namespace foxglove_websocket
