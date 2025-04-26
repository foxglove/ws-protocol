cmake_minimum_required(VERSION 3.15)
project(FoxgloveWebSocket VERSION 0.1.0 LANGUAGES CXX)

find_package(nlohmann_json REQUIRED)
find_package(websocketpp REQUIRED)

add_library(foxglove_websocket src/base64.cpp src/parameter.cpp src/serialization.cpp src/server_factory.cpp)
target_include_directories(foxglove_websocket
    PUBLIC
        $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
        $<INSTALL_INTERFACE:include>
    PRIVATE SYSTEM
        ${nlohmann_json_INCLUDE_DIRS}
        ${websocketpp_INCLUDE_DIRS}
)
target_link_libraries(foxglove_websocket nlohmann_json::nlohmann_json websocketpp::websocketpp)
set_target_properties(foxglove_websocket PROPERTIES
    CXX_STANDARD 17
    CXX_STANDARD_REQUIRED ON
    VERSION ${PROJECT_VERSION}
    SOVERSION ${PROJECT_VERSION_MAJOR}
)

if (MSVC)
  target_compile_options(foxglove_websocket PRIVATE /W4)
else()
  target_compile_options(foxglove_websocket PRIVATE -Wall -Wextra -Wpedantic -Wold-style-cast -Wfloat-equal)
endif()

include(GNUInstallDirs)
include(CMakePackageConfigHelpers)

# Install the library targets
install(TARGETS foxglove_websocket
        EXPORT foxglove-websocketTargets
        LIBRARY DESTINATION ${CMAKE_INSTALL_LIBDIR}
        ARCHIVE DESTINATION ${CMAKE_INSTALL_LIBDIR}
        RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR}
        INCLUDES DESTINATION ${CMAKE_INSTALL_INCLUDEDIR})

# Install header files
install(DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}/include/
        DESTINATION ${CMAKE_INSTALL_INCLUDEDIR})

# Install license
install(FILES ${CMAKE_CURRENT_SOURCE_DIR}/LICENSE
        DESTINATION ${CMAKE_INSTALL_DATADIR}/licenses/foxglove-websocket/)

# Generate and install pkg-config file
configure_file(
    ${CMAKE_CURRENT_SOURCE_DIR}/cmake/foxglove-websocket.pc.in
    ${CMAKE_CURRENT_BINARY_DIR}/foxglove-websocket.pc
    @ONLY
)
install(FILES ${CMAKE_CURRENT_BINARY_DIR}/foxglove-websocket.pc
        DESTINATION ${CMAKE_INSTALL_LIBDIR}/pkgconfig)

# Install CMake targets file
install(EXPORT foxglove-websocketTargets
        FILE foxglove-websocketTargets.cmake
        NAMESPACE foxglove::
        DESTINATION ${CMAKE_INSTALL_LIBDIR}/cmake/foxglove-websocket)

# Create CMake config file
configure_package_config_file(
    ${CMAKE_CURRENT_SOURCE_DIR}/cmake/foxglove-websocketConfig.cmake.in
    ${CMAKE_CURRENT_BINARY_DIR}/foxglove-websocketConfig.cmake
    INSTALL_DESTINATION ${CMAKE_INSTALL_LIBDIR}/cmake/foxglove-websocket
)

# Create version file
write_basic_package_version_file(
    ${CMAKE_CURRENT_BINARY_DIR}/foxglove-websocketConfigVersion.cmake
    VERSION ${PROJECT_VERSION}
    COMPATIBILITY SameMajorVersion
)

# Install CMake config files
install(FILES
    ${CMAKE_CURRENT_BINARY_DIR}/foxglove-websocketConfig.cmake
    ${CMAKE_CURRENT_BINARY_DIR}/foxglove-websocketConfigVersion.cmake
    DESTINATION ${CMAKE_INSTALL_LIBDIR}/cmake/foxglove-websocket
)
