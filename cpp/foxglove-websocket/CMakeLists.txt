cmake_minimum_required(VERSION 3.15)
project(FoxgloveWebSocket CXX)

find_package(ament_cmake QUIET)
set(COMPILING_FOR_ROS2 OFF)
if(${ament_cmake_FOUND})
  set(COMPILING_FOR_ROS2 ON)
  message(STATUS "Compiling for ROS2")
endif()

find_package(nlohmann_json REQUIRED)
find_package(websocketpp REQUIRED)

add_library(foxglove_websocket src/base64.cpp src/parameter.cpp src/serialization.cpp src/server_factory.cpp)
target_include_directories(foxglove_websocket
  PUBLIC
    $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
    $<INSTALL_INTERFACE:include>
    ${nlohmann_json_INCLUDE_DIRS}
    ${websocketpp_INCLUDE_DIRS}
)
target_link_libraries(foxglove_websocket nlohmann_json::nlohmann_json websocketpp::websocketpp)
set_target_properties(foxglove_websocket PROPERTIES CXX_STANDARD 17 CXX_STANDARD_REQUIRED ON)

if (MSVC)
  target_compile_options(foxglove_websocket PRIVATE /W4)
else()
  target_compile_options(foxglove_websocket PRIVATE -Wall -Wextra -Wpedantic -Wold-style-cast -Wfloat-equal)
endif()

install(TARGETS foxglove_websocket)
install(
  TARGETS foxglove_websocket
  EXPORT FoxgloveWebSocketTargets
  LIBRARY DESTINATION lib
  ARCHIVE DESTINATION lib
  RUNTIME DESTINATION bin
  INCLUDES DESTINATION include
)
INSTALL (DIRECTORY include/
         DESTINATION include)
install(FILES ${CMAKE_SOURCE_DIR}/LICENSE DESTINATION ${CMAKE_INSTALL_PREFIX}/licenses/)

if(COMPILING_FOR_ROS2)
  ament_target_dependencies(foxglove_websocket nlohmann_json websocketpp)

  ament_export_targets(FoxgloveWebSocketTargets HAS_LIBRARY_TARGET)
  ament_export_dependencies(nlohmann_json websocketpp)
  ament_export_include_directories(include)
  ament_export_libraries(foxglove_websocket)
  ament_package()
endif()
