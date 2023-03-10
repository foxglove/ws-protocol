cmake_minimum_required(VERSION 3.15)
project(FoxgloveWebSocket CXX)

find_package(nlohmann_json REQUIRED)
find_package(websocketpp REQUIRED)
find_package(asio REQUIRED)

add_library(foxglove_websocket src/parameter.cpp src/serialization.cpp)
target_include_directories(foxglove_websocket PUBLIC include)
target_link_libraries(foxglove_websocket nlohmann_json::nlohmann_json websocketpp::websocketpp asio::asio)
set_target_properties(foxglove_websocket PROPERTIES CXX_STANDARD 17 CXX_STANDARD_REQUIRED ON)

install(TARGETS foxglove_websocket)
INSTALL (DIRECTORY ${CMAKE_SOURCE_DIR}/include/
         DESTINATION include)
install(FILES ${CMAKE_SOURCE_DIR}/LICENSE DESTINATION ${CMAKE_INSTALL_PREFIX}/licenses/)
