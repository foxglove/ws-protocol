cmake_minimum_required(VERSION 3.8)
project(foxsocketpp LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED on)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

option(WERROR "Add -Werror flag to build (turns warnings into errors)" ON)

list(APPEND CMAKE_MODULE_PATH "${CMAKE_CURRENT_LIST_DIR}/cmake")

if(CONAN_EXPORTED) # in conan local cache
  include(${CMAKE_BINARY_DIR}/conanbuildinfo.cmake)
  conan_basic_setup()
else() # in user space
  include(${CMAKE_CURRENT_SOURCE_DIR}/cmake/conan.cmake)
  conan_cmake_run(CONANFILE conanfile.py
                  BASIC_SETUP
				  CMAKE_TARGETS
				  BUILD missing)
endif()

if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Debug)
endif()

if(CMAKE_BUILD_TYPE STREQUAL "Debug")
  set(OPTIMIZATION_FLAGS "-DDEBUG")
  if(NOT MSVC)
    set(OPTIMIZATION_FLAGS "${OPTIMIZATION_FLAGS} -O0")
  endif()
  message("-- Configuring debug build")
else()
  if(MSVC)
    set(OPTIMIZATION_FLAGS "-DNDEBUG -O2 -Zi")
  else()
    set(OPTIMIZATION_FLAGS "-DNDEBUG -g")
  endif()
  message("-- Configuring release build")
endif()

if(MSVC)
  set(DESIRED_WARNINGS "-WX")
else()
  set(DESIRED_WARNINGS "-Wall -Wextra -Wconversion -Wunreachable-code -Wuninitialized -pedantic-errors -Wold-style-cast -Wno-error=unused-variable -Wshadow -Wfloat-equal")
  if(CMAKE_CXX_COMPILER_ID MATCHES "Clang")
    set(DESIRED_WARNINGS "${DESIRED_WARNINGS} -Wmost")
  endif()
  if (WERROR)
    set(DESIRED_WARNINGS "${DESIRED_WARNINGS} -Werror")
  endif()
endif()

set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} ${OPTIMIZATION_FLAGS} ${DESIRED_WARNINGS}")

include_directories("${PROJECT_SOURCE_DIR}/include")

add_executable(foxsocketpp src/main.cpp src/foxsocketpp.cpp src/rosmsg.cpp)
target_link_libraries(foxsocketpp CONAN_PKG::nlohmann_json CONAN_PKG::websocketpp)

file(GLOB TEST_SOURCES test/*.cpp src/rosmsg.cpp)
add_executable(unit-tests ${TEST_SOURCES})
target_link_libraries(unit-tests CONAN_PKG::catch2)
