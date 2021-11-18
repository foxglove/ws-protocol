#pragma once

constexpr const char* MSGDEF_CameraInfo = R"(
Header header
uint32 height
uint32 width
string distortion_model
float64[] D
float64[9] K
float64[9] R
float64[12] P
uint32 binning_x
uint32 binning_y
RegionOfInterest roi

================================================================================
MSG: std_msgs/Header
uint32 seq
time stamp
string frame_id

================================================================================
MSG: sensor_msgs/RegionOfInterest
uint32 x_offset
uint32 y_offset
uint32 height
uint32 width
bool do_rectify
)";

constexpr const char* MSGDEF_CompressedImage = R"(
Header header
string format
uint8[] data

================================================================================
MSG: std_msgs/Header
uint32 seq
time stamp
string frame_id
)";

constexpr const char* MSGDEF_DiagnosticArray = R"(
Header header
DiagnosticStatus[] status

================================================================================
MSG: std_msgs/Header
uint32 seq
time stamp
string frame_id

================================================================================
MSG: diagnostic_msgs/DiagnosticStatus
byte OK=0
byte WARN=1
byte ERROR=2
byte STALE=3

byte level
string name
string message
string hardware_id
KeyValue[] values

================================================================================
MSG: diagnostic_msgs/KeyValue
string key
string value
)";

constexpr const char* MSGDEF_ImageMarker = R"(
uint8 CIRCLE=0
uint8 LINE_STRIP=1
uint8 LINE_LIST=2
uint8 POLYGON=3
uint8 POINTS=4
uint8 ADD=0
uint8 REMOVE=1

Header header
string ns
int32 id
int32 type
int32 action
geometry_msgs/Point position
float32 scale
std_msgs/ColorRGBA outline_color
uint8 filled
std_msgs/ColorRGBA fill_color
duration lifetime
geometry_msgs/Point[] points
std_msgs/ColorRGBA[] outline_colors

================================================================================
MSG: std_msgs/Header
uint32 seq
time stamp
string frame_id

================================================================================
MSG: geometry_msgs/Point
float64 x
float64 y
float64 z

================================================================================
MSG: std_msgs/ColorRGBA
float32 r
float32 g
float32 b
float32 a
)";

constexpr const char* MSGDEF_ImageMarkerArray = R"(
ImageMarker[] markers

================================================================================
MSG: visualization_msgs/ImageMarker
uint8 CIRCLE=0
uint8 LINE_STRIP=1
uint8 LINE_LIST=2
uint8 POLYGON=3
uint8 POINTS=4
uint8 ADD=0
uint8 REMOVE=1

Header header
string ns
int32 id
int32 type
int32 action
geometry_msgs/Point position
float32 scale
std_msgs/ColorRGBA outline_color
uint8 filled
std_msgs/ColorRGBA fill_color
duration lifetime
geometry_msgs/Point[] points
std_msgs/ColorRGBA[] outline_colors
string text
float32 thickness

================================================================================
MSG: std_msgs/Header
uint32 seq
time stamp
string frame_id

================================================================================
MSG: geometry_msgs/Point
float64 x
float64 y
float64 z

================================================================================
MSG: std_msgs/ColorRGBA
float32 r
float32 g
float32 b
float32 a
)";

constexpr const char* MSGDEF_StringStamped = R"(
Header header
string data

================================================================================
MSG: std_msgs/Header
uint32 seq
time stamp
string frame_id
)";

constexpr const char* MSGDEF_Log = R"(
byte DEBUG=1
byte INFO=2
byte WARN=4
byte ERROR=8
byte FATAL=16

Header header
byte level
string name
string msg
string file
string function
uint32 line
string[] topics

================================================================================
MSG: std_msgs/Header
uint32 seq
time stamp
string frame_id
)";

constexpr const char* MSGDEF_MarkerArray = R"(
Marker[] markers

================================================================================
MSG: visualization_msgs/Marker
uint8 ARROW=0
uint8 CUBE=1
uint8 SPHERE=2
uint8 CYLINDER=3
uint8 LINE_STRIP=4
uint8 LINE_LIST=5
uint8 CUBE_LIST=6
uint8 SPHERE_LIST=7
uint8 POINTS=8
uint8 TEXT_VIEW_FACING=9
uint8 MESH_RESOURCE=10
uint8 TRIANGLE_LIST=11
uint8 ADD=0
uint8 MODIFY=0
uint8 DELETE=2
uint8 DELETEALL=3

Header header
string ns
int32 id
int32 type
int32 action
geometry_msgs/Pose pose
geometry_msgs/Vector3 scale
std_msgs/ColorRGBA color
duration lifetime
bool frame_locked
geometry_msgs/Point[] points
std_msgs/ColorRGBA[] colors
string text
string mesh_resource
bool mesh_use_embedded_materials

================================================================================
MSG: std_msgs/Header
uint32 seq
time stamp
string frame_id

================================================================================
MSG: geometry_msgs/Pose
Point position
Quaternion orientation

================================================================================
MSG: geometry_msgs/Point
float64 x
float64 y
float64 z

================================================================================
MSG: geometry_msgs/Quaternion
float64 x
float64 y
float64 z
float64 w

================================================================================
MSG: geometry_msgs/Vector3
float64 x
float64 y
float64 z

================================================================================
MSG: std_msgs/ColorRGBA
float32 r
float32 g
float32 b
float32 a
)";

constexpr const char* MSGDEF_OccupancyGrid = R"(
Header header
MapMetaData info
int8[] data

================================================================================
MSG: std_msgs/Header
uint32 seq
time stamp
string frame_id

================================================================================
MSG: nav_msgs/MapMetaData
time map_load_time
float32 resolution
uint32 width
uint32 height
geometry_msgs/Pose origin

================================================================================
MSG: geometry_msgs/Pose
Point position
Quaternion orientation

================================================================================
MSG: geometry_msgs/Point
float64 x
float64 y
float64 z

================================================================================
MSG: geometry_msgs/Quaternion
float64 x
float64 y
float64 z
float64 w
)";

constexpr const char* MSGDEF_PolygonStamped = R"(
Header header
Polygon polygon

================================================================================
MSG: std_msgs/Header
uint32 seq
time stamp
string frame_id

================================================================================
MSG: geometry_msgs/Polygon
Point32[] points

================================================================================
MSG: geometry_msgs/Point32
float32 x
float32 y
float32 z
)";

constexpr const char* MSGDEF_PoseStamped = R"(
Header header
Pose pose

================================================================================
MSG: std_msgs/Header
uint32 seq
time stamp
string frame_id

================================================================================
MSG: geometry_msgs/Pose
Point position
Quaternion orientation

================================================================================
MSG: geometry_msgs/Point
float64 x
float64 y
float64 z

================================================================================
MSG: geometry_msgs/Quaternion
float64 x
float64 y
float64 z
float64 w
)";

constexpr const char* MSGDEF_TFMessage = R"(
geometry_msgs/TransformStamped[] transforms

================================================================================
MSG: geometry_msgs/TransformStamped
Header header
string child_frame_id
Transform transform

================================================================================
MSG: std_msgs/Header
uint32 seq
time stamp
string frame_id

================================================================================
MSG: geometry_msgs/Transform
Vector3 translation
Quaternion rotation

================================================================================
MSG: geometry_msgs/Vector3
float64 x
float64 y
float64 z

================================================================================
MSG: geometry_msgs/Quaternion
float64 x
float64 y
float64 z
float64 w
)";

constexpr const char* MSGDEF_Clock = R"(
time clock
)";

constexpr const char* MSGDEF_PointCloud2 = R"(
Header header
uint32 height
uint32 width
PointField[] fields
bool is_bigendian
uint32 point_step
uint32 row_step
uint8[] data
bool is_dense

================================================================================
MSG: std_msgs/Header
uint32 seq
time stamp
string frame_id

================================================================================
MSG: sensor_msgs/PointField
uint8 INT8=1
uint8 UINT8=2
uint8 INT16=3
uint8 UINT16=4
uint8 INT32=5
uint8 UINT32=6
uint8 FLOAT32=7
uint8 FLOAT64=8

string name
uint32 offset
uint8 datatype
uint32 count
)";
