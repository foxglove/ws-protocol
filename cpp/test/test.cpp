#include <foxsocketpp/rosmsg.hpp>
#define CATCH_CONFIG_MAIN
#include <catch2/catch.hpp>

TEST_CASE("RosMsgStringStamped") {
  ros::StringStamped msg{};
  msg.header.stamp.secs = 1;
  msg.header.seq = 2;
  msg.header.frame_id = "frame";
  msg.data = "Hello, world!";

  const size_t msgSize = msg.size();
  CHECK(msgSize == 38);

  size_t length = 0;
  std::vector<uint8_t> output;
  output.resize(msgSize);

  msg.serialize(output, length);

  CHECK(length == msgSize);
}
