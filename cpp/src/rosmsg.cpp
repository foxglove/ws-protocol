#include "foxsocketpp/rosmsg.hpp"

#include <cstring>

using Buffer = std::vector<uint8_t>;

static void WriteUInt8(Buffer& buffer, size_t& index, uint8_t value) {
  buffer[index] = value;
  index += 1;
}

static void WriteBool(Buffer& buffer, size_t& index, bool value) {
  WriteUInt8(buffer, index, uint8_t(value));
}

// static void WriteInt16(Buffer& buffer, size_t& index, int16_t value) {
//   buffer[index + 0] = ((value >> 0) & 0xFF);
//   buffer[index + 1] = ((value >> 8) & 0xFF);
//   index += 2;
// }

// static void WriteUInt16(Buffer& buffer, size_t& index, uint16_t value) {
//   buffer[index + 0] = ((value >> 0) & 0xFF);
//   buffer[index + 1] = ((value >> 8) & 0xFF);
//   index += 2;
// }

static void WriteInt32(Buffer& buffer, size_t& index, int32_t value) {
  buffer[index + 0] = ((value >> 0) & 0xFF);
  buffer[index + 1] = ((value >> 8) & 0xFF);
  buffer[index + 2] = ((value >> 16) & 0xFF);
  buffer[index + 3] = ((value >> 24) & 0xFF);
  index += 4;
}

static void WriteUInt32(Buffer& buffer, size_t& index, uint32_t value) {
  buffer[index + 0] = ((value >> 0) & 0xFF);
  buffer[index + 1] = ((value >> 8) & 0xFF);
  buffer[index + 2] = ((value >> 16) & 0xFF);
  buffer[index + 3] = ((value >> 24) & 0xFF);
  index += 4;
}

// static void WriteUInt64(Buffer& buffer, size_t& index, uint64_t value) {
//   buffer[index + 0] = ((value >> 0) & 0xFF);
//   buffer[index + 1] = ((value >> 8) & 0xFF);
//   buffer[index + 2] = ((value >> 16) & 0xFF);
//   buffer[index + 3] = ((value >> 24) & 0xFF);
//   buffer[index + 4] = ((value >> 32) & 0xFF);
//   buffer[index + 5] = ((value >> 40) & 0xFF);
//   buffer[index + 6] = ((value >> 48) & 0xFF);
//   buffer[index + 7] = ((value >> 56) & 0xFF);
//   index += 8;
// }

static void WriteFloat(Buffer& buffer, size_t& index, float value) {
  const auto ptr = reinterpret_cast<uint8_t*>(&value);
  for (size_t i = 0; i < 4; ++i) {
    buffer[index + i] = ptr[i];
  }
  index += 4;
}

static void WriteDouble(Buffer& buffer, size_t& index, double value) {
  const auto ptr = reinterpret_cast<uint8_t*>(&value);
  for (size_t i = 0; i < 8; ++i) {
    buffer[index + i] = ptr[i];
  }
  index += 8;
}

static void WriteTime(Buffer& buffer, size_t& index, const ros::Time& value) {
  WriteUInt32(buffer, index, value.secs);
  WriteUInt32(buffer, index, value.nsecs);
}

static void WriteString(Buffer& buffer, size_t& index, const std::string& value) {
  WriteInt32(buffer, index, int32_t(value.size()));
  std::copy(std::begin(value), std::end(value), buffer.data() + index);
  index += value.size();
}

static void WriteVector(Buffer& buffer, size_t& index, const std::vector<uint8_t>& vec) {
  WriteUInt32(buffer, index, uint32_t(vec.size()));
  std::copy(std::begin(vec), std::end(vec), buffer.data() + index);
  index += vec.size();
}

static void WriteVector(Buffer& buffer, size_t& index, const std::vector<int8_t>& vec) {
  WriteUInt32(buffer, index, uint32_t(vec.size()));
  std::copy(std::begin(vec), std::end(vec), buffer.data() + index);
  index += vec.size();
}

static void WriteVector(Buffer& buffer, size_t& index, const std::vector<double>& vec) {
  WriteUInt32(buffer, index, uint32_t(vec.size()));
  for (const double x : vec) {
    WriteDouble(buffer, index, x);
  }
}

static void WriteVector(Buffer& buffer, size_t& index, const std::vector<std::string>& vec) {
  WriteUInt32(buffer, index, uint32_t(vec.size()));
  for (const auto& x : vec) {
    WriteString(buffer, index, x);
  }
}

template <typename T>
static void WriteVector(Buffer& buffer, size_t& index, const std::vector<T>& vec) {
  WriteUInt32(buffer, index, uint32_t(vec.size()));
  for (const auto& x : vec) {
    x.serialize(buffer, index);
  }
}

template <size_t N>
static void WriteArray(Buffer& buffer, size_t& index, const std::array<double, N>& arr) {
  for (const double x : arr) {
    WriteDouble(buffer, index, x);
  }
}

////////////////////////////////////////////////////////////////////////////////

namespace ros {

size_t Header::size() const {
  size_t size = 0;
  size += 4;                    // seq
  size += 8;                    // stamp
  size += 4 + frame_id.size();  // frame_id
  return size;
}

void Header::serialize(Buffer& output, size_t& index) const {
  WriteUInt32(output, index, seq);       // seq
  WriteTime(output, index, stamp);       // stamp
  WriteString(output, index, frame_id);  // frame_id
}

size_t Point::size() const { return 24; }

void Point::serialize(std::vector<uint8_t>& output, size_t& index) const {
  WriteDouble(output, index, x);
  WriteDouble(output, index, y);
  WriteDouble(output, index, z);
}

size_t Point32::size() const { return 12; }

void Point32::serialize(std::vector<uint8_t>& output, size_t& index) const {
  WriteFloat(output, index, x);
  WriteFloat(output, index, y);
  WriteFloat(output, index, z);
}

size_t Vector3::size() const { return 24; }

void Vector3::serialize(std::vector<uint8_t>& output, size_t& index) const {
  WriteDouble(output, index, x);
  WriteDouble(output, index, y);
  WriteDouble(output, index, z);
}

size_t Quaternion::size() const { return 32; }

void Quaternion::serialize(std::vector<uint8_t>& output, size_t& index) const {
  WriteDouble(output, index, x);
  WriteDouble(output, index, y);
  WriteDouble(output, index, z);
  WriteDouble(output, index, w);
}

size_t Pose::size() const { return position.size() + orientation.size(); }

void Pose::serialize(std::vector<uint8_t>& output, size_t& index) const {
  position.serialize(output, index);
  orientation.serialize(output, index);
}

size_t ColorRGBA::size() const { return 16; }

void ColorRGBA::serialize(std::vector<uint8_t>& output, size_t& index) const {
  WriteFloat(output, index, r);
  WriteFloat(output, index, g);
  WriteFloat(output, index, b);
  WriteFloat(output, index, a);
}

size_t Transform::size() const { return translation.size() + rotation.size(); }

void Transform::serialize(std::vector<uint8_t>& output, size_t& index) const {
  translation.serialize(output, index);
  rotation.serialize(output, index);
}

size_t Clock::size() const {
  return 8;  // clock
}

void Clock::serialize(std::vector<uint8_t>& output, size_t& index) const {
  WriteTime(output, index, clock);  // clock
}

size_t Polygon::size() const { return 4 + points.size() * 12; }

void Polygon::serialize(std::vector<uint8_t>& output, size_t& index) const {
  WriteVector(output, index, points);
}

size_t PolygonStamped::size() const { return header.size() + polygon.size(); }

void PolygonStamped::serialize(std::vector<uint8_t>& output, size_t& index) const {
  header.serialize(output, index);
  polygon.serialize(output, index);
}

size_t PoseStamped::size() const { return header.size() + pose.size(); }

void PoseStamped::serialize(std::vector<uint8_t>& output, size_t& index) const {
  header.serialize(output, index);
  pose.serialize(output, index);
}

size_t StringStamped::size() const { return header.size() + 4 + data.size(); }

void StringStamped::serialize(std::vector<uint8_t>& output, size_t& index) const {
  header.serialize(output, index);
  WriteString(output, index, data);
}

size_t Log::size() const {
  size_t size = 0;
  size += header.size();          // header
  size += 1;                      // level
  size += 4 + name.size();        // name
  size += 4 + msg.size();         // msg
  size += 4 + file.size();        // file
  size += 4 + function.size();    // function
  size += 4;                      // line
  size += 4;                      // topics.size()
  for (const auto& t : topics) {  // topics
    size += 4 + t.size();
  }
  return size;
}

void Log::serialize(std::vector<uint8_t>& output, size_t& index) const {
  header.serialize(output, index);
  WriteUInt8(output, index, level);
  WriteString(output, index, name);
  WriteString(output, index, msg);
  WriteString(output, index, file);
  WriteString(output, index, function);
  WriteUInt32(output, index, line);
  WriteVector(output, index, topics);
}

size_t MapMetaData::size() const {
  size_t size = 0;
  size += 8;              // map_load_time
  size += 4;              // resolution
  size += 4;              // width
  size += 4;              // height
  size += origin.size();  // origin
  return size;
}

void MapMetaData::serialize(std::vector<uint8_t>& output, size_t& index) const {
  WriteTime(output, index, map_load_time);
  WriteFloat(output, index, resolution);
  WriteUInt32(output, index, width);
  WriteUInt32(output, index, height);
  origin.serialize(output, index);
}

size_t Marker::size() const {
  size_t size = 0;
  size += header.size();             // header
  size += 4 + ns.size();             // ns
  size += 4;                         // id
  size += 4;                         // type
  size += 4;                         // action
  size += pose.size();               // pose
  size += scale.size();              // scale
  size += color.size();              // color
  size += 8;                         // lifetime
  size += 1;                         // frame_locked
  size += 4 + points.size() * 24;    // points
  size += 4 + colors.size() * 16;    // colors
  size += 4 + text.size();           // text
  size += 4 + mesh_resource.size();  // mesh_resource
  size += 1;                         // mesh_use_embedded_materials
  return size;
}

void Marker::serialize(std::vector<uint8_t>& output, size_t& index) const {
  header.serialize(output, index);
  WriteString(output, index, ns);
  WriteInt32(output, index, id);
  WriteInt32(output, index, type);
  WriteInt32(output, index, action);
  pose.serialize(output, index);
  scale.serialize(output, index);
  color.serialize(output, index);
  WriteTime(output, index, lifetime);
  WriteBool(output, index, frame_locked);
  WriteVector(output, index, points);
  WriteVector(output, index, colors);
  WriteString(output, index, text);
  WriteString(output, index, mesh_resource);
  WriteBool(output, index, mesh_use_embedded_materials);
}

size_t MarkerArray::size() const {
  size_t size = 4;
  for (const auto& m : markers) {
    size += m.size();
  }
  return size;
}

void MarkerArray::serialize(std::vector<uint8_t>& output, size_t& index) const {
  WriteVector(output, index, markers);
}

size_t RegionOfInterest::size() const {
  size_t size = 0;
  size += 4;  // x_offset
  size += 4;  // y_offset
  size += 4;  // height
  size += 4;  // width
  size += 1;  // do_rectify
  return size;
}

void RegionOfInterest::serialize(std::vector<uint8_t>& output, size_t& index) const {
  WriteUInt32(output, index, x_offset);
  WriteUInt32(output, index, y_offset);
  WriteUInt32(output, index, height);
  WriteUInt32(output, index, width);
  WriteBool(output, index, do_rectify);
}

KeyValue::KeyValue(const std::string& key_, const std::string& value_)
    : key(key_)
    , value(value_) {}

size_t KeyValue::size() const { return 4 + key.size() + 4 + value.size(); }

void KeyValue::serialize(std::vector<uint8_t>& output, size_t& index) const {
  WriteString(output, index, key);
  WriteString(output, index, value);
}

size_t DiagnosticStatus::size() const {
  size_t size = 0;
  size += 1;                       // level
  size += 4 + name.size();         // name
  size += 4 + message.size();      // message
  size += 4 + hardware_id.size();  // hardware_id
  size += 4;                       // values.size()
  for (const auto& v : values) {   // values
    size += v.size();
  }
  return size;
}

void DiagnosticStatus::serialize(std::vector<uint8_t>& output, size_t& index) const {
  WriteUInt8(output, index, level);
  WriteString(output, index, name);
  WriteString(output, index, message);
  WriteString(output, index, hardware_id);
  WriteVector(output, index, values);
}

size_t DiagnosticArray::size() const {
  size_t size = 0;
  size += header.size();          // header
  size += 4;                      // status.size();
  for (const auto& s : status) {  // status
    size += s.size();
  }
  return size;
}

void DiagnosticArray::serialize(std::vector<uint8_t>& output, size_t& index) const {
  header.serialize(output, index);
  WriteVector(output, index, status);
}

size_t CameraInfo::size() const {
  size_t size = 0;
  size += header.size();                // header
  size += 4;                            // height
  size += 4;                            // width
  size += 4 + distortion_model.size();  // distortion_model
  size += 4 + D.size() * 8;             // D
  size += 9 * 8;                        // K
  size += 9 * 8;                        // R
  size += 12 * 8;                       // P
  size += 4;                            // binning_x
  size += 4;                            // binning_y
  size += roi.size();                   // roi
  return size;
}

void CameraInfo::serialize(std::vector<uint8_t>& output, size_t& index) const {
  header.serialize(output, index);
  WriteUInt32(output, index, height);
  WriteUInt32(output, index, width);
  WriteString(output, index, distortion_model);
  WriteVector(output, index, D);
  WriteArray(output, index, K);
  WriteArray(output, index, R);
  WriteArray(output, index, P);
  WriteUInt32(output, index, binning_x);
  WriteUInt32(output, index, binning_y);
  roi.serialize(output, index);
}

size_t CompressedImage::size() const {
  size_t size = 0;
  size += header.size();        // header
  size += 4 + format.size();    // format
  size += 4 + data.size() * 1;  // data
  return size;
}

void CompressedImage::serialize(std::vector<uint8_t>& output, size_t& index) const {
  header.serialize(output, index);
  WriteString(output, index, format);
  WriteVector(output, index, data);
}

size_t ImageMarker::size() const {
  size_t size = 0;
  size += header.size();                   // header
  size += 4 + ns.size();                   // ns
  size += 4;                               // id
  size += 4;                               // type
  size += 4;                               // action
  size += position.size();                 // position
  size += 4;                               // scale
  size += outline_color.size();            // outline_color
  size += 1;                               // filled
  size += fill_color.size();               // fill_color
  size += 8;                               // lifetime
  size += 4 + points.size() * 24;          // points
  size += 4 + outline_colors.size() * 16;  // outline_colors
  size += 4 + text.size();                 // text
  size += 4;                               // thickness
  return size;
}

void ImageMarker::serialize(std::vector<uint8_t>& output, size_t& index) const {
  header.serialize(output, index);
  WriteString(output, index, ns);
  WriteInt32(output, index, id);
  WriteInt32(output, index, type);
  WriteInt32(output, index, action);
  position.serialize(output, index);
  WriteFloat(output, index, scale);
  outline_color.serialize(output, index);
  WriteBool(output, index, filled);
  fill_color.serialize(output, index);
  WriteTime(output, index, lifetime);
  WriteVector(output, index, points);
  WriteVector(output, index, outline_colors);
  WriteString(output, index, text);
  WriteFloat(output, index, thickness);
}

size_t ImageMarkerArray::size() const {
  size_t size = 4;
  for (const auto& m : markers) {
    size += m.size();
  }
  return size;
}

void ImageMarkerArray::serialize(std::vector<uint8_t>& output, size_t& index) const {
  WriteVector(output, index, markers);
}

size_t OccupancyGrid::size() const {
  size_t size = 0;
  size += header.size();        // header
  size += info.size();          // info
  size += 4 + data.size() * 1;  // data
  return size;
}
void OccupancyGrid::serialize(std::vector<uint8_t>& output, size_t& index) const {
  header.serialize(output, index);
  info.serialize(output, index);
  WriteVector(output, index, data);
}

size_t TransformStamped::size() const {
  return header.size() + 4 + child_frame_id.size() + transform.size();
}

void TransformStamped::serialize(std::vector<uint8_t>& output, size_t& index) const {
  header.serialize(output, index);
  WriteString(output, index, child_frame_id);
  transform.serialize(output, index);
}

size_t TFMessage::size() const {
  size_t size = 0;
  size += 4;                           // transforms.size()
  for (const auto& tf : transforms) {  // transforms
    size += tf.size();
  }
  return size;
}

void TFMessage::serialize(std::vector<uint8_t>& output, size_t& index) const {
  WriteVector(output, index, transforms);
}

size_t PointField::size() const {
  size_t size = 0;
  size += 4 + name.size();  // name
  size += 4;                // offset
  size += 1;                // datatype
  size += 4;                // count
  return size;
}

void PointField::serialize(std::vector<uint8_t>& output, size_t& index) const {
  WriteString(output, index, name);
  WriteUInt32(output, index, offset);
  WriteUInt8(output, index, datatype);
  WriteUInt32(output, index, count);
}

size_t PointCloud2::size() const {
  size_t size = 0;
  size += header.size();          // header
  size += 4;                      // height
  size += 4;                      // width
  size += 4;                      // fields.size()
  for (const auto& f : fields) {  // fields
    size += f.size();
  }
  size += 1;                // is_bigendian
  size += 4;                // point_step
  size += 4;                // row_step
  size += 4 + data.size();  // data
  size += 1;                // is_dense
  return size;
}

void PointCloud2::serialize(std::vector<uint8_t>& output, size_t& index) const {
  header.serialize(output, index);
  WriteUInt32(output, index, height);
  WriteUInt32(output, index, width);
  WriteVector(output, index, fields);
  WriteBool(output, index, is_bigendian);
  WriteUInt32(output, index, point_step);
  WriteUInt32(output, index, row_step);
  WriteVector(output, index, data);
  WriteBool(output, index, is_dense);
}

}  // namespace ros
