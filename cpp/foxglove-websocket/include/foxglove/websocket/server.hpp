#pragma once

#include <nlohmann/json.hpp>
#include <websocketpp/config/asio_no_tls.hpp>
#include <websocketpp/server.hpp>

#include <algorithm>
#include <cstdint>
#include <functional>
#include <map>
#include <memory>
#include <string_view>
#include <unordered_map>
#include <unordered_set>
#include <vector>

namespace foxglove::websocket {

using json = nlohmann::json;
using namespace std::placeholders;

using AsioServer = websocketpp::server<websocketpp::config::asio>;
using ConnHandle = websocketpp::connection_hdl;
using MessagePtr = AsioServer::message_ptr;
using OpCode = websocketpp::frame::opcode::value;

using ChannelId = uint32_t;
using SubscriptionId = uint32_t;

struct ChannelWithoutId {
  std::string topic;
  std::string encoding;
  std::string schemaName;
  std::string schema;

  bool operator==(const ChannelWithoutId& other) const {
    return topic == other.topic && encoding == other.encoding && schemaName == other.schemaName &&
           schema == other.schema;
  }
};

struct Channel : ChannelWithoutId {
  ChannelId id;

  explicit Channel(ChannelId id, ChannelWithoutId ch)
      : ChannelWithoutId(std::move(ch))
      , id(id) {}

  friend void to_json(json& j, const Channel& channel) {
    j = {
      {"id", channel.id},
      {"topic", channel.topic},
      {"encoding", channel.encoding},
      {"schemaName", channel.schemaName},
      {"schema", channel.schema},
    };
  }

  bool operator==(const Channel& other) const {
    return id == other.id && ChannelWithoutId::operator==(other);
  }
};

enum class BinaryOpcode : uint8_t {
  MESSAGE_DATA = 1,
};

enum class StatusLevel : uint8_t {
  INFO = 0,
  WARNING = 1,
  ERROR = 2,
};

class Server final {
public:
  static const std::string SUPPORTED_SUBPROTOCOL;

  explicit Server(uint16_t port, std::string name);
  ~Server();

  Server(const Server&) = delete;
  Server(Server&&) = delete;
  Server& operator=(const Server&) = delete;
  Server& operator=(Server&&) = delete;

  void run();
  void stop();

  ChannelId addChannel(ChannelWithoutId channel);
  void removeChannel(ChannelId chanId);

  void setSubscribeHandler(std::function<void(ChannelId)> handler);
  void setUnsubscribeHandler(std::function<void(ChannelId)> handler);

  void sendMessage(ChannelId chanId, uint64_t timestamp, std::string_view data);

  AsioServer::endpoint_type& getEndpoint() & {
    return _server;
  }

private:
  struct ClientInfo {
    std::string name;
    ConnHandle handle;
    std::unordered_map<SubscriptionId, ChannelId> subscriptions;
    std::unordered_map<ChannelId, std::unordered_set<SubscriptionId>> subscriptionsByChannel;

    ClientInfo(const ClientInfo&) = delete;
    ClientInfo& operator=(const ClientInfo&) = delete;

    ClientInfo(ClientInfo&&) = default;
    ClientInfo& operator=(ClientInfo&&) = default;
  };

  uint16_t _port;
  std::string _name;
  AsioServer _server;

  uint32_t _nextChannelId = 0;
  std::map<ConnHandle, ClientInfo, std::owner_less<>> _clients;
  std::unordered_map<ChannelId, Channel> _channels;
  std::function<void(ChannelId)> _subscribeHandler;
  std::function<void(ChannelId)> _unsubscribeHandler;

  bool validateConnection(ConnHandle hdl);
  void handleConnectionOpened(ConnHandle hdl);
  void handleConnectionClosed(ConnHandle hdl);
  void handleMessage(ConnHandle hdl, MessagePtr msg);

  void sendJson(ConnHandle hdl, json&& payload);
  void sendBinary(ConnHandle hdl, const std::vector<uint8_t>& payload);

  bool anySubscribed(ChannelId chanId) const;
};

inline const std::string Server::SUPPORTED_SUBPROTOCOL = "foxglove.websocket.v1";

inline Server::Server(uint16_t port, std::string name)
    : _port(port)
    , _name(std::move(name)) {
  _server.init_asio();
  _server.clear_access_channels(websocketpp::log::alevel::all);
  _server.set_access_channels(websocketpp::log::alevel::app);
  _server.set_validate_handler(std::bind(&Server::validateConnection, this, _1));
  _server.set_open_handler(std::bind(&Server::handleConnectionOpened, this, _1));
  _server.set_close_handler(std::bind(&Server::handleConnectionClosed, this, _1));
  _server.set_message_handler(std::bind(&Server::handleMessage, this, _1, _2));
  _server.set_reuse_addr(true);
  _server.set_listen_backlog(128);
  _server.listen(_port);
  _server.start_accept();
}

inline Server::~Server() {}

inline bool Server::validateConnection(ConnHandle hdl) {
  auto con = _server.get_con_from_hdl(hdl);

  const auto& subprotocols = con->get_requested_subprotocols();
  if (std::find(subprotocols.begin(), subprotocols.end(), SUPPORTED_SUBPROTOCOL) !=
      subprotocols.end()) {
    con->select_subprotocol(SUPPORTED_SUBPROTOCOL);
    return true;
  }
  _server.get_alog().write(websocketpp::log::alevel::app,
                           "Rejecting client " + con->get_remote_endpoint() +
                             " which did not declare support for subprotocol " +
                             SUPPORTED_SUBPROTOCOL);
  return false;
}

inline void Server::handleConnectionOpened(ConnHandle hdl) {
  auto con = _server.get_con_from_hdl(hdl);
  _server.get_alog().write(
    websocketpp::log::alevel::app,
    "Client " + con->get_remote_endpoint() + " connected via " + con->get_resource());
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
  sendJson(hdl, {
                  {"op", "advertise"},
                  {"channels", std::move(channels)},
                });
}

inline void Server::handleConnectionClosed(ConnHandle hdl) {
  const auto& client = _clients.find(hdl);
  if (client == _clients.end()) {
    _server.get_elog().write(websocketpp::log::elevel::rerror,
                             "Client " + _server.get_con_from_hdl(hdl)->get_remote_endpoint() +
                               " disconnected but not found in _clients");
    return;
  }

  _server.get_alog().write(websocketpp::log::alevel::app,
                           "Client " + client->second.name + " disconnected");

  const auto oldSubscriptionsByChannel = std::move(client->second.subscriptionsByChannel);
  _clients.erase(client);
  for (const auto& [chanId, subs] : oldSubscriptionsByChannel) {
    if (!anySubscribed(chanId) && _unsubscribeHandler) {
      _unsubscribeHandler(chanId);
    }
  }
}

inline void Server::setSubscribeHandler(std::function<void(ChannelId)> handler) {
  _subscribeHandler = std::move(handler);
}
inline void Server::setUnsubscribeHandler(std::function<void(ChannelId)> handler) {
  _unsubscribeHandler = std::move(handler);
}

inline void Server::stop() {
  std::error_code ec;
  _server.stop_listening(ec);

  // Iterate over all client connections and start the close connection handshake
  for (const auto& [hdl, clientInfo] : _clients) {
    if (auto con = _server.get_con_from_hdl(hdl, ec)) {
      con->close(websocketpp::close::status::going_away, "server shutdown", ec);
    }
  }
}

inline void Server::run() {
  _server.get_alog().write(websocketpp::log::alevel::app,
                           "Server listening on port " + std::to_string(_port));
  _server.run();
}

inline void Server::sendJson(ConnHandle hdl, json&& payload) {
  try {
    _server.send(hdl, std::move(payload).dump(), OpCode::TEXT);
  } catch (std::exception const& e) {
    _server.get_elog().write(websocketpp::log::elevel::rerror, e.what());
  }
}

inline void Server::sendBinary(ConnHandle hdl, const std::vector<uint8_t>& payload) {
  try {
    _server.send(hdl, payload.data(), payload.size(), OpCode::BINARY);
  } catch (std::exception const& e) {
    _server.get_elog().write(websocketpp::log::elevel::rerror, e.what());
  }
}

inline void Server::handleMessage(ConnHandle hdl, MessagePtr msg) {
  std::error_code ec;
  auto con = _server.get_con_from_hdl(hdl, ec);
  if (!con) {
    _server.get_elog().write(websocketpp::log::elevel::rerror,
                             "get_con_from_hdl failed in handleMessage");
    return;
  }

  const std::string remoteEndpoint = con->get_remote_endpoint();

  try {
    auto& clientInfo = _clients.at(hdl);

    const auto& payloadStr = msg->get_payload();
    const json payload = json::parse(payloadStr);
    const std::string& op = payload.at("op").get<std::string>();

    if (op == "subscribe") {
      for (const auto& sub : payload.at("subscriptions")) {
        SubscriptionId subId = sub.at("id");
        ChannelId channelId = sub.at("channelId");
        if (clientInfo.subscriptions.find(subId) != clientInfo.subscriptions.end()) {
          sendJson(hdl, json{
                          {"op", "status"},
                          {"level", StatusLevel::ERROR},
                          {"message", "Client subscription id " + std::to_string(subId) +
                                        " was already used; ignoring subscription"},
                        });
          continue;
        }
        const auto& channelIt = _channels.find(channelId);
        if (channelIt == _channels.end()) {
          sendJson(hdl, json{
                          {"op", "status"},
                          {"level", StatusLevel::WARNING},
                          {"message", "Channel " + std::to_string(channelId) +
                                        " is not available; ignoring subscription"},
                        });
          continue;
        }
        _server.get_alog().write(
          websocketpp::log::alevel::app,
          "Client " + remoteEndpoint + " subscribed to channel " + std::to_string(channelId));
        bool firstSubscription = !anySubscribed(channelId);
        clientInfo.subscriptions.emplace(subId, channelId);
        clientInfo.subscriptionsByChannel[channelId].insert(subId);
        if (firstSubscription && _subscribeHandler) {
          _subscribeHandler(channelId);
        }
      }
    } else if (op == "unsubscribe") {
      for (const auto& subIdJson : payload.at("subscriptionIds")) {
        SubscriptionId subId = subIdJson;
        const auto& sub = clientInfo.subscriptions.find(subId);
        if (sub == clientInfo.subscriptions.end()) {
          sendJson(hdl, json{
                          {"op", "status"},
                          {"level", StatusLevel::WARNING},
                          {"message", "Client subscription id " + std::to_string(subId) +
                                        " did not exist; ignoring unsubscription"},
                        });
          continue;
        }
        ChannelId chanId = sub->second;
        _server.get_alog().write(
          websocketpp::log::alevel::app,
          "Client " + clientInfo.name + " unsubscribed from channel " + std::to_string(chanId));
        clientInfo.subscriptions.erase(sub);
        if (const auto& subs = clientInfo.subscriptionsByChannel.find(chanId);
            subs != clientInfo.subscriptionsByChannel.end()) {
          subs->second.erase(subId);
          if (subs->second.empty()) {
            clientInfo.subscriptionsByChannel.erase(subs);
          }
        }
        if (!anySubscribed(chanId) && _unsubscribeHandler) {
          _unsubscribeHandler(chanId);
        }
      }

    } else {
      _server.get_elog().write(websocketpp::log::elevel::rerror,
                               "Unrecognized client opcode: " + op);
      sendJson(hdl, {
                      {"op", "status"},
                      {"level", StatusLevel::ERROR},
                      {"message", "Unrecognized opcode " + op},
                    });
    }
  } catch (std::exception const& ex) {
    _server.get_elog().write(websocketpp::log::elevel::rerror,
                             "Error parsing message from " + remoteEndpoint + ": " + ex.what());
    return;
  }
}

inline ChannelId Server::addChannel(ChannelWithoutId channel) {
  const auto newId = ++_nextChannelId;
  Channel newChannel{newId, std::move(channel)};

  for (const auto& [hdl, clientInfo] : _clients) {
    sendJson(hdl, {
                    {"op", "advertise"},
                    {"channels", {newChannel}},
                  });
  }

  _channels.emplace(newId, std::move(newChannel));
  return newId;
}

inline void Server::removeChannel(ChannelId chanId) {
  _channels.erase(chanId);
  for (auto& [hdl, clientInfo] : _clients) {
    if (const auto it = clientInfo.subscriptionsByChannel.find(chanId);
        it != clientInfo.subscriptionsByChannel.end()) {
      for (const auto& subId : it->second) {
        clientInfo.subscriptions.erase(subId);
      }
      clientInfo.subscriptionsByChannel.erase(it);
    }
    sendJson(hdl, {{"op", "unadvertise"}, {"channelIds", {chanId}}});
  }
}

inline void Server::sendMessage(ChannelId chanId, uint64_t timestamp, std::string_view data) {
  std::vector<uint8_t> message;
  for (const auto& [hdl, client] : _clients) {
    const auto& subs = client.subscriptionsByChannel.find(chanId);
    if (subs == client.subscriptionsByChannel.end()) {
      continue;
    }
    for (const auto subId : subs->second) {
      if (message.empty()) {
        message.resize(1 + 4 + 8 + data.size());
        message[0] = uint8_t(BinaryOpcode::MESSAGE_DATA);
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

inline bool Server::anySubscribed(ChannelId chanId) const {
  for (const auto& [hdl, client] : _clients) {
    if (client.subscriptionsByChannel.find(chanId) != client.subscriptionsByChannel.end()) {
      return true;
    }
  }
  return false;
}

}  // namespace foxglove::websocket
