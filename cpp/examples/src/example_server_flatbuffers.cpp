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
#include "base64.hpp"
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

  const auto channelIds = server->addChannels({{
    .topic = "example_msg",
    .encoding = "flatbuffer",
    .schemaName = "foxglove.SceneUpdate",
    .schema = Base64Encode(getFileContents(sceneUpdateBfbsPath)),
  }});
  const auto chanId = channelIds.front();

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

    auto pose = foxglove::CreatePose(
      builder, foxglove::CreateVector3(builder, 2, 0, 0),
      createQuaternionFromAxisAngle(builder, 0, 0, 1, double(now) / 1e9 * 0.5));
    auto size = foxglove::CreateVector3(builder, 1, 1, 1);
    auto color = foxglove::CreateColor(builder, 0.6, 0.2, 1, 1);
    auto cubeBuilder = foxglove::CubePrimitiveBuilder(builder);
    cubeBuilder.add_pose(pose);
    cubeBuilder.add_size(size);
    cubeBuilder.add_color(color);
    const auto cube = cubeBuilder.Finish();

    auto frameId = builder.CreateString("root");
    auto cubes = builder.CreateVector({cube});
    auto entityBuilder = foxglove::SceneEntityBuilder(builder);
    entityBuilder.add_timestamp(&timestamp);
    entityBuilder.add_frame_id(frameId);
    entityBuilder.add_cubes(cubes);
    const auto entity = entityBuilder.Finish();

    auto entities = builder.CreateVector({entity});
    auto updateBuilder = foxglove::SceneUpdateBuilder(builder);
    updateBuilder.add_entities(entities);
    const auto update = updateBuilder.Finish();
    builder.Finish(update);

    auto verifier = flatbuffers::Verifier(builder.GetBufferPointer(), builder.GetSize());
    if (!foxglove::VerifySceneUpdateBuffer(verifier)) {
      std::cerr << "Flatbuffer verification failed" << std::endl;
      return 1;
    }

    server->broadcastMessage(chanId, now, builder.GetBufferPointer(), builder.GetSize());

    std::this_thread::sleep_for(std::chrono::milliseconds(50));
  }

  server->removeChannels({chanId});
  server->stop();

  return 0;
}
