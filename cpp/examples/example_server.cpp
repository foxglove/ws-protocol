#include <foxglove/websocket/server.hpp>

#include <nlohmann/json.hpp>

#include <atomic>
#include <chrono>
#include <iostream>
#include <thread>

using json = nlohmann::json;

static uint64_t nanosecondsSinceEpoch() {
  return uint64_t(std::chrono::duration_cast<std::chrono::nanoseconds>(
                    std::chrono::system_clock::now().time_since_epoch())
                    .count());
}

int main() {
  foxglove::websocket::Server server{8765, "example server"};

  const auto chanId = server.addChannel({
    .topic = "example_msg",
    .encoding = "json",
    .schemaName = "ExampleMsg",
    .schema =
      json{
        {"type", "object"},
        {
          "properties",
          {
            {"msg", {{"type", "string"}}},
            {"count", {{"type", "number"}}},
          },
        },
      }
        .dump(),
  });

  server.setSubscribeHandler([&](foxglove::websocket::ChannelId chanId) {
    std::cout << "first client subscribed to " << chanId << std::endl;
  });
  server.setUnsubscribeHandler([&](foxglove::websocket::ChannelId chanId) {
    std::cout << "last client unsubscribed from " << chanId << std::endl;
  });

  uint64_t i = 0;
  std::shared_ptr<asio::steady_timer> timer;
  std::function<void()> setTimer = [&] {
    timer = server.getEndpoint().set_timer(200, [&](std::error_code const& ec) {
      if (ec) {
        std::cerr << "timer error: " << ec.message() << std::endl;
        return;
      }
      server.sendMessage(chanId, nanosecondsSinceEpoch(),
                         json{{"msg", "Hello"}, {"count", i++}}.dump());
      setTimer();
    });
  };

  setTimer();

  asio::signal_set signals(server.getEndpoint().get_io_service(), SIGINT);

  signals.async_wait([&](std::error_code const& ec, int sig) {
    if (ec) {
      std::cerr << "signal error: " << ec.message() << std::endl;
      return;
    }
    std::cerr << "received signal " << sig << ", shutting down" << std::endl;
    server.stop();
    if (timer) {
      timer->cancel();
    }
  });

  server.run();

  return 0;
}
