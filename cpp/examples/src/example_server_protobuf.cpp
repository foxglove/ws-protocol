#include <foxglove/websocket/base64.hpp>
#include <foxglove/websocket/server_factory.hpp>
#include <foxglove/websocket/websocket_notls.hpp>
#include <foxglove/websocket/websocket_server.hpp>

#include <google/protobuf/descriptor.pb.h>
#include <google/protobuf/util/time_util.h>

#include <atomic>
#include <chrono>
#include <cmath>
#include <csignal>
#include <iostream>
#include <memory>
#include <queue>
#include <thread>
#include <unordered_set>

#include "foxglove/SceneUpdate.pb.h"

std::atomic<bool> running = true;

static uint64_t nanosecondsSinceEpoch() {
  return uint64_t(std::chrono::duration_cast<std::chrono::nanoseconds>(
                    std::chrono::system_clock::now().time_since_epoch())
                    .count());
}

// Writes the FileDescriptor of this descriptor and all transitive dependencies
// to a string, for use as a channel schema.
static std::string SerializeFdSet(const google::protobuf::Descriptor* toplevelDescriptor) {
  google::protobuf::FileDescriptorSet fdSet;
  std::queue<const google::protobuf::FileDescriptor*> toAdd;
  toAdd.push(toplevelDescriptor->file());
  std::unordered_set<std::string> seenDependencies;
  while (!toAdd.empty()) {
    const google::protobuf::FileDescriptor* next = toAdd.front();
    toAdd.pop();
    next->CopyTo(fdSet.add_file());
    for (int i = 0; i < next->dependency_count(); ++i) {
      const auto& dep = next->dependency(i);
      if (seenDependencies.find(dep->name()) == seenDependencies.end()) {
        seenDependencies.insert(dep->name());
        toAdd.push(dep);
      }
    }
  }
  return fdSet.SerializeAsString();
}

// https://danceswithcode.net/engineeringnotes/quaternions/quaternions.html
static void setAxisAngle(foxglove::Quaternion* q, double x, double y, double z, double angle) {
  double s = std::sin(angle / 2);
  q->set_x(x * s);
  q->set_y(y * s);
  q->set_z(z * s);
  q->set_w(std::cos(angle / 2));
}

int main() {
  const auto logHandler = [](foxglove::WebSocketLogLevel, char const* msg) {
    std::cout << msg << std::endl;
  };
  foxglove::ServerOptions serverOptions;
  auto server = foxglove::ServerFactory::createServer<websocketpp::connection_hdl>(
    "C++ Protobuf example server", logHandler, serverOptions);

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

  const auto channelIds = server->addChannels({{
    .topic = "example_msg",
    .encoding = "protobuf",
    .schemaName = foxglove::SceneUpdate::descriptor()->full_name(),
    .schema = foxglove::base64Encode(SerializeFdSet(foxglove::SceneUpdate::descriptor())),
  }});
  const auto chanId = channelIds.front();

  std::signal(SIGINT, [](int sig) {
    std::cerr << "received signal " << sig << ", shutting down" << std::endl;
    running = false;
  });

  while (running) {
    const auto now = nanosecondsSinceEpoch();
    foxglove::SceneUpdate msg;
    auto* entity = msg.add_entities();
    *entity->mutable_timestamp() = google::protobuf::util::TimeUtil::NanosecondsToTimestamp(now);
    entity->set_frame_id("root");
    auto* cube = entity->add_cubes();
    auto* size = cube->mutable_size();
    size->set_x(1);
    size->set_y(1);
    size->set_z(1);
    auto* position = cube->mutable_pose()->mutable_position();
    position->set_x(2);
    position->set_y(0);
    position->set_z(0);
    auto* orientation = cube->mutable_pose()->mutable_orientation();
    setAxisAngle(orientation, 0, 0, 1, double(now) / 1e9 * 0.5);
    auto* color = cube->mutable_color();
    color->set_r(0.6);
    color->set_g(0.2);
    color->set_b(1);
    color->set_a(1);

    const auto serializedMsg = msg.SerializeAsString();
    server->broadcastMessage(chanId, now, reinterpret_cast<const uint8_t*>(serializedMsg.data()),
                             serializedMsg.size());

    std::this_thread::sleep_for(std::chrono::milliseconds(50));
  }

  server->removeChannels({chanId});
  server->stop();

  return 0;
}
