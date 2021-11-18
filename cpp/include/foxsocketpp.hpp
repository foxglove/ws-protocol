#pragma once

// The foxsocketpp namespace.
//
// foxsocketpp implements the Foxglove WebSocket protocol as a WebSocket server

#include <mutex>
#include <thread>
#include <unordered_map>
#include <unordered_set>
#include <vector>
#include <websocketpp/config/asio_no_tls.hpp>
#include <websocketpp/server.hpp>

#include "foxsocketpp/message_defs.hpp"
#include "foxsocketpp/rosmsg.hpp"
#include "foxsocketpp/version.hpp"

namespace foxsocketpp {

using WebSocketServer = websocketpp::server<websocketpp::config::asio>;
using ConnHandle = websocketpp::connection_hdl;
using MessagePtr = WebSocketServer::message_ptr;
using OpCode = websocketpp::frame::opcode::value;
using AddrToConnHandle = std::unordered_map<std::string, ConnHandle>;

struct TopicInfo {
  std::string message;
  const char* definition = nullptr;
  uint32_t seq = 0;

  TopicInfo() = default;
  TopicInfo(const std::string_view msg, const char* def)
      : message(msg)
      , definition(def) {}
};

class FoxSocket {
public:
  void start();
  void stop();

private:
  bool running_ = false;
  WebSocketServer server_;
  std::thread serverThread_;
  std::unordered_set<std::string> subscribedTopics_;
  std::unordered_map<std::string, TopicInfo> topics_;
  AddrToConnHandle seenClients_;
  std::unordered_map<std::string, AddrToConnHandle> subscribers_;
  mutable std::recursive_mutex mutex_;

  uint32_t nextSequenceId(const std::string& topic);
  void serializeRosMsg(double time, const std::string& topic, const ros::RosMsg& msg,
                       std::vector<uint8_t>& output);

  // WebSocket server methods
  void serverRunLoop();
  void sendText(ConnHandle hdl, const std::string& payload);
  void sendBinary(ConnHandle hdl, const std::vector<uint8_t>& payload);
  // void sendJson(ConnHandle hdl, const Hjson::Value& data);

  // WebSocket client message handlers
  void handleTopicsAndRawTypes(ConnHandle hdl, const std::string& id);
  void handleSubscribe(ConnHandle hdl, const std::string& remoteEndpoint, const std::string& topic,
                       double scale);
  void handleUnsubscribe(ConnHandle hdl, const std::string& remoteEndpoint,
                         const std::string& topic);
  void onSocketMessage(ConnHandle hdl, MessagePtr msg);
};

}  // namespace foxsocketpp
