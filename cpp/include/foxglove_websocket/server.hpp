#pragma once

#include <nlohmann/json_fwd.hpp>
#include <websocketpp/config/asio_no_tls.hpp>
#include <websocketpp/server.hpp>

#include <mutex>
#include <thread>
#include <unordered_map>
#include <unordered_set>
#include <vector>

namespace foxglove_websocket {

using WebSocketServer = websocketpp::server<websocketpp::config::asio>;
using ConnHandle = websocketpp::connection_hdl;
using MessagePtr = WebSocketServer::message_ptr;
using OpCode = websocketpp::frame::opcode::value;
using AddrToConnHandle = std::unordered_map<std::string, ConnHandle>;

using ChannelId = uint32_t;

struct ChannelWithoutId {
  std::string topic;
  std::string encoding;
  std::string schemaName;
  std::string schema;
};
struct Channel : ChannelWithoutId {
  ChannelId id;
};

void to_json(nlohmann::json& j, const Channel& channel);

class Server final {
public:
  explicit Server(std::string name);
  ~Server();
  void start(uint16_t port);
  void stop();

  static const std::string SUPPORTED_SUBPROTOCOL;

  ChannelId addChannel(ChannelWithoutId&& channel);
  void removeChannel(ChannelId chanId);
  void sendMessage(ChannelId chanId, uint64_t timestamp,
                   std::string_view data /*FIXME: std::span replacement?*/);

  // TODO: maybe just expose set_timer?
  WebSocketServer& getEndpoint() & {
    return server_;
  }

private:
  std::string _name;
  std::vector<Channel> _channels;
  bool running_ = false;
  WebSocketServer server_;
  std::thread serverThread_;

  // WebSocket server methods
  void serverRunLoop(uint16_t port);
  void sendText(ConnHandle hdl, const std::string& payload);
  void sendBinary(ConnHandle hdl, const std::vector<uint8_t>& payload);
  // void sendJson(ConnHandle hdl, const Hjson::Value& data);

  // WebSocket client message handlers
  void handleSubscribe(ConnHandle hdl, const std::string& remoteEndpoint, const std::string& topic,
                       double scale);
  void handleUnsubscribe(ConnHandle hdl, const std::string& remoteEndpoint,
                         const std::string& topic);
  void onSocketMessage(ConnHandle hdl, MessagePtr msg);
};

}  // namespace foxglove_websocket
