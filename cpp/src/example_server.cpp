#include <foxglove_websocket/server.hpp>

#include <nlohmann/json.hpp>

#include <atomic>
#include <chrono>
#include <iostream>
#include <thread>

using json = nlohmann::json;

int main() {
  foxglove_websocket::Server server{"example server"};

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

  uint64_t i = 0;
  static foxglove_websocket::WebSocketServer::timer_ptr timerHandle;
  std::function<void()> setTimer = [&] {
    timerHandle = server.getEndpoint().set_timer(200, [&](std::error_code const& ec) {
      if (ec) {
        std::cerr << "timer error: " << ec.message() << std::endl;
        return;
      }
      auto timeNs = uint64_t(std::chrono::duration_cast<std::chrono::nanoseconds>(
                               std::chrono::system_clock::now().time_since_epoch())
                               .count());
      server.sendMessage(chanId, timeNs, json{{{"msg", "Hello"}, {"count", i++}}}.dump());
      setTimer();
    });
  };

  setTimer();

  server.start(8765);

  static std::atomic<bool> running = true;

  signal(SIGINT, []([[maybe_unused]] int sig) {
    running = false;
    if (timerHandle) timerHandle->cancel();
  });

  while (running) {
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
  }

  server.stop();

  return 0;
}
