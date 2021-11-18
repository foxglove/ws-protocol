#include <chrono>
#include <foxsocketpp.hpp>
#include <iostream>
#include <thread>

bool running = true;

void ReceiveSigInt(int sig) {
  (void)sig;
  running = false;
}

int main() {
  std::cout << "foxsocketpp " FOXSOCKETPP_VERSION_STRING "\n";
  foxsocketpp::FoxSocket server;
  server.start();

  signal(SIGINT, ReceiveSigInt);

  while (running) {
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
  }

  server.stop();
}
