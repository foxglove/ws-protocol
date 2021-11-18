#pragma once

#include <array>
#include <cstdint>
#include <string>
#include <vector>

namespace ros {

struct Time {
  uint32_t secs;
  uint32_t nsecs;

  Time() = default;
  Time(uint32_t s, uint32_t ns)
      : secs(s)
      , nsecs(ns) {}
  Time(double t) {
    constexpr uint64_t NS_PER_SEC = 1000000000LL;

    uint64_t totalNs = uint64_t(t * 1e+9);
    secs = uint32_t(totalNs / NS_PER_SEC);
    nsecs = uint32_t(totalNs % NS_PER_SEC);
  }
};

struct Duration : Time {};

struct RosMsg {
  virtual size_t size() const = 0;
  virtual void serialize(std::vector<uint8_t>& output, size_t& index) const = 0;
};

struct Header : RosMsg {
  uint32_t seq;
  Time stamp;
  std::string frame_id;

  size_t size() const override;
  void serialize(std::vector<uint8_t>& output, size_t& index) const override;
};

struct Point : RosMsg {
  double x;
  double y;
  double z;

  Point() = default;
  Point(double x_, double y_, double z_)
      : x(x_)
      , y(y_)
      , z(z_){};
  size_t size() const override;
  void serialize(std::vector<uint8_t>& output, size_t& index) const override;
};

struct Point32 : RosMsg {
  float x;
  float y;
  float z;

  Point32() = default;
  Point32(float x_, float y_, float z_)
      : x(x_)
      , y(y_)
      , z(z_){};
  size_t size() const override;
  void serialize(std::vector<uint8_t>& output, size_t& index) const override;
};

struct Vector3 : RosMsg {
  double x;
  double y;
  double z;

  Vector3() = default;
  Vector3(double x_, double y_, double z_)
      : x(x_)
      , y(y_)
      , z(z_){};
  size_t size() const override;
  void serialize(std::vector<uint8_t>& output, size_t& index) const override;
};

struct Quaternion : RosMsg {
  double x;
  double y;
  double z;
  double w;

  Quaternion()
      : x(0)
      , y(0)
      , z(0)
      , w(1){};
  Quaternion(double x_, double y_, double z_, double w_)
      : x(x_)
      , y(y_)
      , z(z_)
      , w(w_){};
  size_t size() const override;
  void serialize(std::vector<uint8_t>& output, size_t& index) const override;
};

struct Pose : RosMsg {
  Point position;
  Quaternion orientation;

  size_t size() const override;
  void serialize(std::vector<uint8_t>& output, size_t& index) const override;
};

struct ColorRGBA : RosMsg {
  float r;
  float g;
  float b;
  float a;

  ColorRGBA() = default;
  ColorRGBA(float r_, float g_, float b_, float a_)
      : r(r_)
      , g(g_)
      , b(b_)
      , a(a_){};
  size_t size() const override;
  void serialize(std::vector<uint8_t>& output, size_t& index) const override;
};

struct Transform : RosMsg {
  Vector3 translation;
  Quaternion rotation;

  size_t size() const override;
  void serialize(std::vector<uint8_t>& output, size_t& index) const override;
};

struct Clock : RosMsg {
  Time clock;

  size_t size() const override;
  void serialize(std::vector<uint8_t>& output, size_t& index) const override;
};

struct Polygon : RosMsg {
  std::vector<Point32> points;

  size_t size() const override;
  void serialize(std::vector<uint8_t>& output, size_t& index) const override;
};

struct PolygonStamped : RosMsg {
  Header header;
  Polygon polygon;

  size_t size() const override;
  void serialize(std::vector<uint8_t>& output, size_t& index) const override;
};

struct PoseStamped : RosMsg {
  Header header;
  Pose pose;

  size_t size() const override;
  void serialize(std::vector<uint8_t>& output, size_t& index) const override;
};

struct StringStamped : RosMsg {
  Header header;
  std::string data;

  size_t size() const override;
  void serialize(std::vector<uint8_t>& output, size_t& index) const override;
};

struct Log : RosMsg {
  Header header;
  uint8_t level;
  std::string name;
  std::string msg;
  std::string file;
  std::string function;
  uint32_t line;
  std::vector<std::string> topics;

  size_t size() const override;
  void serialize(std::vector<uint8_t>& output, size_t& index) const override;
};

struct MapMetaData : RosMsg {
  Time map_load_time;
  float resolution;
  uint32_t width;
  uint32_t height;
  Pose origin;

  size_t size() const override;
  void serialize(std::vector<uint8_t>& output, size_t& index) const override;
};

struct Marker : RosMsg {
  Header header;
  std::string ns;
  int32_t id;
  int32_t type;
  int32_t action;
  Pose pose;
  Vector3 scale;
  ColorRGBA color;
  Duration lifetime;
  bool frame_locked;
  std::vector<Point> points;
  std::vector<ColorRGBA> colors;
  std::string text;
  std::string mesh_resource;
  bool mesh_use_embedded_materials;

  size_t size() const override;
  void serialize(std::vector<uint8_t>& output, size_t& index) const override;
};

struct MarkerArray : RosMsg {
  std::vector<Marker> markers;

  size_t size() const override;
  void serialize(std::vector<uint8_t>& output, size_t& index) const override;
};

struct RegionOfInterest : RosMsg {
  uint32_t x_offset;
  uint32_t y_offset;
  uint32_t height;
  uint32_t width;
  bool do_rectify;

  size_t size() const override;
  void serialize(std::vector<uint8_t>& output, size_t& index) const override;
};

struct KeyValue : RosMsg {
  std::string key;
  std::string value;

  KeyValue(const std::string& key_, const std::string& value_);
  size_t size() const override;
  void serialize(std::vector<uint8_t>& output, size_t& index) const override;
};

struct DiagnosticStatus : RosMsg {
  uint8_t level;
  std::string name;
  std::string message;
  std::string hardware_id;
  std::vector<KeyValue> values;

  size_t size() const override;
  void serialize(std::vector<uint8_t>& output, size_t& index) const override;
};

struct DiagnosticArray : RosMsg {
  Header header;
  std::vector<DiagnosticStatus> status;

  size_t size() const override;
  void serialize(std::vector<uint8_t>& output, size_t& index) const override;
};

struct CameraInfo : RosMsg {
  Header header;
  uint32_t height;
  uint32_t width;
  std::string distortion_model;
  std::vector<double> D;
  std::array<double, 9> K;
  std::array<double, 9> R;
  std::array<double, 12> P;
  uint32_t binning_x;
  uint32_t binning_y;
  RegionOfInterest roi;

  size_t size() const override;
  void serialize(std::vector<uint8_t>& output, size_t& index) const override;
};

struct CompressedImage : RosMsg {
  Header header;
  std::string format;
  std::vector<uint8_t> data;

  size_t size() const override;
  void serialize(std::vector<uint8_t>& output, size_t& index) const override;
};

struct ImageMarker : RosMsg {
  Header header;
  std::string ns;
  int32_t id;
  int32_t type;
  int32_t action;
  Point position;
  float scale;
  ColorRGBA outline_color;
  uint8_t filled;
  ColorRGBA fill_color;
  Duration lifetime;
  std::vector<Point> points;
  std::vector<ColorRGBA> outline_colors;
  std::string text;
  float thickness;

  size_t size() const override;
  void serialize(std::vector<uint8_t>& output, size_t& index) const override;
};

struct ImageMarkerArray : RosMsg {
  std::vector<ImageMarker> markers;

  size_t size() const override;
  void serialize(std::vector<uint8_t>& output, size_t& index) const override;
};

struct OccupancyGrid : RosMsg {
  Header header;
  MapMetaData info;
  std::vector<int8_t> data;

  size_t size() const override;
  void serialize(std::vector<uint8_t>& output, size_t& index) const override;
};

struct TransformStamped : RosMsg {
  Header header;
  std::string child_frame_id;
  Transform transform;

  size_t size() const override;
  void serialize(std::vector<uint8_t>& output, size_t& index) const override;
};

struct TFMessage : RosMsg {
  std::vector<TransformStamped> transforms;

  size_t size() const override;
  void serialize(std::vector<uint8_t>& output, size_t& index) const override;
};

enum class PointFieldType : uint8_t {
  INT8 = 1,
  UINT8 = 2,
  INT16 = 3,
  UINT16 = 4,
  INT32 = 5,
  UINT32 = 6,
  FLOAT32 = 7,
  FLOAT64 = 8,
};

struct PointField : RosMsg {
  PointField() {}
  PointField(const std::string& name_, uint32_t offset_, PointFieldType datatype_, uint32_t count_)
      : name(name_)
      , offset(offset_)
      , datatype(uint8_t(datatype_))
      , count(count_) {}

  std::string name;
  uint32_t offset;
  uint8_t datatype;
  uint32_t count;

  size_t size() const override;
  void serialize(std::vector<uint8_t>& output, size_t& index) const override;
};

struct PointCloud2 : RosMsg {
  Header header;
  uint32_t height;
  uint32_t width;
  std::vector<PointField> fields;
  bool is_bigendian;
  uint32_t point_step;
  uint32_t row_step;
  std::vector<uint8_t> data;
  bool is_dense;

  size_t size() const override;
  void serialize(std::vector<uint8_t>& output, size_t& index) const override;
};

}  // namespace ros
