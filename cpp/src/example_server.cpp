#include <foxglove_websocket/server.hpp>

#include <atomic>
#include <chrono>
#include <iostream>
#include <thread>

std::atomic<bool> running = true;

void ReceiveSigInt([[maybe_unused]] int sig) {
  running = false;
}

int main() {
  foxglove_websocket::Server server{"example server"};
  server.start(8765);

  signal(SIGINT, ReceiveSigInt);

  while (running) {
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
  }

  server.stop();

  return 0;
}
