#pragma once

#include <nlohmann/json_fwd.hpp>
#include <websocketpp/config/asio_no_tls.hpp>
#include <websocketpp/server.hpp>

#include <cstdint>
#include <functional>
#include <map>
#include <memory>
#include <unordered_map>
#include <unordered_set>
#include <vector>

namespace foxglove_websocket {

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
};
struct Channel : ChannelWithoutId {
  ChannelId id;

  explicit Channel(ChannelId id, ChannelWithoutId&& ch)
      : ChannelWithoutId(std::move(ch))
      , id(id) {}
};

enum class BinaryOpcode : uint8_t {
  MESSAGE_DATA = 1,
};

enum class StatusLevel : uint8_t {
  INFO = 0,
  WARNING = 1,
  ERROR = 2,
};

struct ClientInfo {
  std::string name;
  ConnHandle handle;
  std::unordered_map<SubscriptionId, ChannelId> subscriptions;
  std::unordered_map<ChannelId, std::unordered_set<SubscriptionId>> subscriptionsByChannel;
};

void to_json(nlohmann::json& j, const Channel& channel);

class Server final {
public:
  static const std::string SUPPORTED_SUBPROTOCOL;

  explicit Server(uint16_t port, std::string name);
  ~Server();

  void run();
  void stop();

  ChannelId addChannel(ChannelWithoutId&& channel);
  void removeChannel(ChannelId chanId);

  void setSubscribeHandler(std::function<void(ChannelId)> handler);
  void setUnsubscribeHandler(std::function<void(ChannelId)> handler);

  void sendMessage(ChannelId chanId, uint64_t timestamp,
                   std::string_view data /*FIXME: std::span replacement?*/);

  AsioServer::endpoint_type& getEndpoint() & {
    return _server;
  }

private:
  uint16_t _port;
  std::string _name;

  uint32_t _nextChannelId = 0;
  std::map<ConnHandle, ClientInfo, std::owner_less<>> _clients;
  std::unordered_map<ChannelId, Channel> _channels;
  std::function<void(ChannelId)> _subscribeHandler;
  std::function<void(ChannelId)> _unsubscribeHandler;
  AsioServer _server;

  bool validateConnection(ConnHandle hdl);
  void handleConnectionOpened(ConnHandle hdl);
  void handleConnectionClosed(ConnHandle hdl);
  void handleMessage(ConnHandle hdl, MessagePtr msg);

  void sendJson(ConnHandle hdl, nlohmann::json&& payload);
  void sendBinary(ConnHandle hdl, const std::vector<uint8_t>& payload);

  // WebSocket client message handlers
  void handleSubscribe(ConnHandle hdl, const std::string& remoteEndpoint, const std::string& topic,
                       double scale);
  void handleUnsubscribe(ConnHandle hdl, const std::string& remoteEndpoint,
                         const std::string& topic);

  bool anySubscribed(ChannelId chanId) const;
};

}  // namespace foxglove_websocket
