cmake_minimum_required(VERSION 3.1)
project(FoxgloveWebSocketExamples CXX)

include(${CMAKE_BINARY_DIR}/conanbuildinfo.cmake)
conan_basic_setup()

add_executable(example_server example_server.cpp)
target_link_libraries(example_server ${CONAN_LIBS})
