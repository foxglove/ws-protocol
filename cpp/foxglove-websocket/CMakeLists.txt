cmake_minimum_required(VERSION 3.15)
project(FoxgloveWebSocket CXX)

find_package(nlohmann_json REQUIRED)
find_package(websocketpp REQUIRED)

add_library(foxglove_websocket src/base64.cpp src/parameter.cpp src/serialization.cpp src/server_factory.cpp)
target_include_directories(foxglove_websocket PUBLIC include)
target_link_libraries(foxglove_websocket nlohmann_json::nlohmann_json websocketpp::websocketpp)
set_target_properties(foxglove_websocket PROPERTIES CXX_STANDARD 17 CXX_STANDARD_REQUIRED ON)

install(TARGETS foxglove_websocket)
INSTALL (DIRECTORY ${CMAKE_SOURCE_DIR}/include/
         DESTINATION include)
install(FILES ${CMAKE_SOURCE_DIR}/LICENSE DESTINATION ${CMAKE_INSTALL_PREFIX}/licenses/)
