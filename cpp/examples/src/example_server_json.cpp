#include <foxglove/websocket/base64.hpp>
#include <foxglove/websocket/server_factory.hpp>
#include <foxglove/websocket/websocket_notls.hpp>
#include <foxglove/websocket/websocket_server.hpp>

#include <nlohmann/json.hpp>

#include <atomic>
#include <chrono>
#include <cmath>
#include <csignal>
#include <iostream>
#include <memory>
#include <queue>
#include <thread>
#include <unordered_set>

std::atomic<bool> running = true;

static uint64_t nanosecondsSinceEpoch() {
  return uint64_t(std::chrono::duration_cast<std::chrono::nanoseconds>(
                    std::chrono::system_clock::now().time_since_epoch())
                    .count());
}

int main() {
  const auto logHandler = [](foxglove::WebSocketLogLevel, char const* msg) {
    std::cout << msg << std::endl;
  };
  foxglove::ServerOptions serverOptions;
  auto server = foxglove::ServerFactory::createServer<websocketpp::connection_hdl>(
    "C++ JSON example server", logHandler, serverOptions);

  foxglove::ServerHandlers<foxglove::ConnHandle> hdlrs;
  hdlrs.subscribeHandler = [&](foxglove::ChannelId chanId, foxglove::ConnHandle clientHandle) {
    const auto clientStr = server->remoteEndpointString(clientHandle);
    std::cout << "Client " << clientStr << " subscribed to " << chanId << std::endl;
  };
  hdlrs.unsubscribeHandler = [&](foxglove::ChannelId chanId, foxglove::ConnHandle clientHandle) {
    const auto clientStr = server->remoteEndpointString(clientHandle);
    std::cout << "Client " << clientStr << " unsubscribed from " << chanId << std::endl;
  };
  server->setHandlers(std::move(hdlrs));
  server->start("0.0.0.0", 8765);

  // Advertise two channels: One with schema and one without.
  const auto channelIds = server->addChannels({{
                                                 .topic = "example_msg",
                                                 .encoding = "json",
                                                 .schemaName = "some_schema",
                                                 .schema =
                                                   nlohmann::json{
                                                     {"type", "object"},
                                                     {"properties",
                                                      {
                                                        {"seq", {{"type", "number"}}},
                                                        {"x", {{"type", "number"}}},
                                                        {"y", {{"type", "number"}}},
                                                      }},
                                                   }
                                                     .dump(),
                                               },
                                               {
                                                 .topic = "example_msg_schemaless",
                                                 .encoding = "json",
                                                 .schemaName = "",
                                                 .schema = "",
                                               }});

  std::signal(SIGINT, [](int sig) {
    std::cerr << "received signal " << sig << ", shutting down" << std::endl;
    running = false;
  });

  int seq = 0;
  while (running) {
    const auto now = nanosecondsSinceEpoch();

    // We publish the same message on both channels.
    const auto serializedMsg = nlohmann::json({
                                                {"seq", ++seq},
                                                {"x", std::sin(seq / 10.0)},
                                                {"y", std::cos(seq / 10.0)},
                                              })
                                 .dump();

    for (const auto& chanId : channelIds) {
      server->broadcastMessage(chanId, now, reinterpret_cast<const uint8_t*>(serializedMsg.data()),
                               serializedMsg.size());
    }

    std::this_thread::sleep_for(std::chrono::milliseconds(50));
  }

  server->removeChannels(channelIds);
  server->stop();

  return 0;
}
