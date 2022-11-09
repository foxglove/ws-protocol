cmake_minimum_required(VERSION 3.1)
project(FoxgloveWebSocketExamples CXX)

include(${CMAKE_BINARY_DIR}/conanbuildinfo.cmake)
conan_basic_setup()

file(GLOB PROTO_SRCS ${CMAKE_CURRENT_SOURCE_DIR}/proto/foxglove/*.pb.cc)

add_executable(example_server example_server.cpp ${PROTO_SRCS})
target_include_directories(example_server PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/proto)
target_link_libraries(example_server ${CONAN_LIBS})
