#include <foxglove/websocket/websocket_notls.hpp>
#include <foxglove/websocket/websocket_server.hpp>

#include <atomic>
#include <chrono>
#include <cmath>
#include <fstream>
#include <iostream>
#include <memory>
#include <queue>
#include <thread>
#include <unordered_set>

#include "SceneUpdate_generated.h"
#include "flatbuffers/flatbuffers.h"

namespace foxglove {
template <>
void Server<WebSocketNoTls>::setupTlsHandler() {}
}  // namespace foxglove

static uint64_t nanosecondsSinceEpoch() {
  return uint64_t(std::chrono::duration_cast<std::chrono::nanoseconds>(
                    std::chrono::system_clock::now().time_since_epoch())
                    .count());
}

// Adapted from:
// https://gist.github.com/tomykaira/f0fd86b6c73063283afe550bc5d77594
// https://github.com/protocolbuffers/protobuf/blob/01fe22219a0312b178a265e75fe35422ea6afbb1/src/google/protobuf/compiler/csharp/csharp_helpers.cc#L346
static std::string Base64Encode(std::string_view input) {
  constexpr const char ALPHABET[] =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  std::string result;
  // Every 3 bytes of data yields 4 bytes of output
  result.reserve((input.size() + (3 - 1 /* round up */)) / 3 * 4);

  // Unsigned values are required for bit-shifts below to work properly
  const unsigned char* data = reinterpret_cast<const unsigned char*>(input.data());

  size_t i = 0;
  for (; i + 2 < input.size(); i += 3) {
    result.push_back(ALPHABET[data[i] >> 2]);
    result.push_back(ALPHABET[((data[i] & 0b11) << 4) | (data[i + 1] >> 4)]);
    result.push_back(ALPHABET[((data[i + 1] & 0b1111) << 2) | (data[i + 2] >> 6)]);
    result.push_back(ALPHABET[data[i + 2] & 0b111111]);
  }
  switch (input.size() - i) {
    case 2:
      result.push_back(ALPHABET[data[i] >> 2]);
      result.push_back(ALPHABET[((data[i] & 0b11) << 4) | (data[i + 1] >> 4)]);
      result.push_back(ALPHABET[(data[i + 1] & 0b1111) << 2]);
      result.push_back('=');
      break;
    case 1:
      result.push_back(ALPHABET[data[i] >> 2]);
      result.push_back(ALPHABET[(data[i] & 0b11) << 4]);
      result.push_back('=');
      result.push_back('=');
      break;
  }

  return result;
}

// https://danceswithcode.net/engineeringnotes/quaternions/quaternions.html
static auto createQuaternionFromAxisAngle(flatbuffers::FlatBufferBuilder& builder, double x,
                                          double y, double z, double angle) {
  double s = std::sin(angle / 2);
  return foxglove::CreateQuaternion(builder, x * s, y * s, z * s, std::cos(angle / 2));
}

// Adapted from https://flatbuffers.dev/flatbuffers_guide_use_cpp.html
static std::string getFileContents(std::string_view path) {
  std::ifstream infile;
  infile.open(path.data(), std::ios::binary | std::ios::in);
  if (!infile) {
    throw std::runtime_error("Could not open file " + std::string(path));
  }
  infile.seekg(0, std::ios::end);
  int length = infile.tellg();
  infile.seekg(0, std::ios::beg);
  std::string result(length, '\0');
  infile.read(result.data(), length);
  infile.close();
  return result;
}

int main(int argc, char** argv) {
  std::vector<std::string> args(argv, argv + argc);
  if (args.size() < 2) {
    std::cerr << "Usage: example_server_flatbuffers /path/to/SceneUpdate.bfbs" << std::endl;
    return 1;
  }
  const auto& sceneUpdateBfbsPath = args[1];

  const auto logHandler = [](foxglove::WebSocketLogLevel, char const* msg) {
    std::cout << msg << std::endl;
  };
  foxglove::ServerOptions serverOptions;
  auto server = std::make_unique<foxglove::Server<foxglove::WebSocketNoTls>>(
    "C++ FlatBuffers example server", logHandler, serverOptions);

  foxglove::ServerHandlers<foxglove::ConnHandle> hdlrs;
  hdlrs.subscribeHandler = [&](foxglove::ChannelId chanId, foxglove::ConnHandle) {
    std::cout << "first client subscribed to " << chanId << std::endl;
  };
  hdlrs.unsubscribeHandler = [&](foxglove::ChannelId chanId, foxglove::ConnHandle) {
    std::cout << "last client unsubscribed from " << chanId << std::endl;
  };
  server->setHandlers(std::move(hdlrs));
  server->start("0.0.0.0", 8765);

  const auto chanelIds = server->addChannels({{
    .topic = "example_msg",
    .encoding = "flatbuffer",
    .schemaName = "foxglove.SceneUpdate",
    .schema = Base64Encode(getFileContents(sceneUpdateBfbsPath)),
  }});
  const auto chanId = chanelIds.front();

  bool running = true;

  asio::signal_set signals(server->getEndpoint().get_io_service(), SIGINT);
  signals.async_wait([&](std::error_code const& ec, int sig) {
    if (ec) {
      std::cerr << "signal error: " << ec.message() << std::endl;
      return;
    }
    std::cerr << "received signal " << sig << ", shutting down" << std::endl;
    running = false;
  });

  flatbuffers::FlatBufferBuilder builder;
  builder.ForceDefaults(true);
  while (running) {
    builder.Clear();

    const auto now = nanosecondsSinceEpoch();
    auto timestamp = foxglove::Time(now / 1'000'000'000, now % 1'000'000'000);

    auto cubeBuilder = foxglove::CubePrimitiveBuilder(builder);
    cubeBuilder.add_size(foxglove::CreateVector3(builder, 1, 1, 1));
    cubeBuilder.add_pose(foxglove::CreatePose(
      builder, foxglove::CreateVector3(builder, 2, 0, 0),
      createQuaternionFromAxisAngle(builder, 0, 0, 1, double(now) / 1e9 * 0.5)));
    cubeBuilder.add_color(foxglove::CreateColor(builder, 0.6, 0.2, 1, 1));
    const auto cube = cubeBuilder.Finish();

    auto entityBuilder = foxglove::SceneEntityBuilder(builder);
    entityBuilder.add_timestamp(&timestamp);
    entityBuilder.add_frame_id(builder.CreateString("root"));
    entityBuilder.add_cubes(builder.CreateVector({cube}));
    const auto entity = entityBuilder.Finish();

    auto updateBuilder = foxglove::SceneUpdateBuilder(builder);
    updateBuilder.add_entities(builder.CreateVector({entity}));
    const auto update = updateBuilder.Finish();

    builder.Finish(update);

    server->broadcastMessage(chanId, now, builder.GetBufferPointer(), builder.GetSize());

    std::this_thread::sleep_for(std::chrono::milliseconds(50));
  }

  server->removeChannels({chanId});
  server->stop();

  return 0;
}
