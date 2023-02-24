cmake_minimum_required(VERSION 3.15)
project(FoxgloveWebSocket CXX)

find_package(nlohmann_json REQUIRED)
find_package(websocketpp REQUIRED)

add_library(foxglove_websocket src/parameter.cpp src/serialization.cpp src/server_factory.cpp)
target_include_directories(foxglove_websocket PUBLIC include)
target_link_libraries(foxglove_websocket nlohmann_json::nlohmann_json websocketpp::websocketpp)

install(TARGETS foxglove_websocket)
INSTALL (DIRECTORY ${CMAKE_SOURCE_DIR}/include/
         DESTINATION include)
