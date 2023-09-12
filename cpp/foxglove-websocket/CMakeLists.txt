# General Info
cmake_minimum_required(VERSION 3.15)
execute_process(COMMAND bash -c "cat conanfile.py | grep -oP '(?<=version = \").*(?=\")'"
    OUTPUT_VARIABLE CMD_OUT
    RESULT_VARIABLE CMD_RES
    OUTPUT_STRIP_TRAILING_WHITESPACE
)

if(${CMD_RES} GREATER "0")
    message(FATAL "Version not discovered in conanfile.py")
else()
    message("Configuring foxglove_websocket/${CMD_OUT}")
endif()

project(foxglove_websocket
    VERSION ${CMD_OUT}
    LANGUAGES CXX
)

# Dependencies
find_package(nlohmann_json REQUIRED)
find_package(websocketpp REQUIRED)

# Create library
add_library(${PROJECT_NAME} 
    src/base64.cpp
    src/parameter.cpp
    src/serialization.cpp
)

target_include_directories(${PROJECT_NAME} PUBLIC
    $<INSTALL_INTERFACE:include>
    $<BUILD_INTERFACE:${PROJECT_SOURCE_DIR}/include>
)

target_link_libraries(${PROJECT_NAME}
    nlohmann_json::nlohmann_json
    websocketpp::websocketpp
)

set_target_properties(${PROJECT_NAME} PROPERTIES
    CXX_STANDARD 17
    CXX_STANDARD_REQUIRED ON
)

# Install
include(GNUInstallDirs)
include(CMakePackageConfigHelpers)

set(PACKAGE_INCLUDE_DIR ${CMAKE_INSTALL_FULL_INCLUDEDIR})
set(PACKAGE_LIBRARY_DIR ${CMAKE_INSTALL_FULL_LIBDIR})

install(DIRECTORY ${CMAKE_SOURCE_DIR}/include/
    DESTINATION ${PACKAGE_INCLUDE_DIR}/
)
install(FILES ${CMAKE_SOURCE_DIR}/LICENSE 
    DESTINATION ${CMAKE_INSTALL_PREFIX}/licenses/
)
install(TARGETS ${PROJECT_NAME}
    EXPORT ${PROJECT_NAME}-targets
    LIBRARY DESTINATION ${PACKAGE_LIBRARY_DIR}
)
configure_package_config_file(
    ${CMAKE_CURRENT_SOURCE_DIR}/cmake/config.cmake.in
    ${CMAKE_CURRENT_BINARY_DIR}/${PROJECT_NAME}-config.cmake
    INSTALL_DESTINATION lib/cmake/${PROJECT_NAME}
    NO_SET_AND_CHECK_MACRO
    NO_CHECK_REQUIRED_COMPONENTS_MACRO
)
write_basic_package_version_file(
    ${CMAKE_CURRENT_BINARY_DIR}/${PROJECT_NAME}-config-version.cmake
    VERSION "${CMAKE_PROJECT_VERSION_MAJOR}.${CMAKE_PROJECT_VERSION_MINOR}"
    COMPATIBILITY AnyNewerVersion
)
install(EXPORT ${PROJECT_NAME}-targets
    NAMESPACE "${PROJECT_NAME}::"
    FILE ${PROJECT_NAME}-targets.cmake
    DESTINATION lib/cmake/${PROJECT_NAME}
)
install(
    FILES
    ${CMAKE_CURRENT_BINARY_DIR}/${PROJECT_NAME}-config.cmake
    ${CMAKE_CURRENT_BINARY_DIR}/${PROJECT_NAME}-config-version.cmake
    DESTINATION lib/cmake/${PROJECT_NAME}
)
