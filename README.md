# Foxglove WebSocket Protocol

This repository provides a [protocol specification](docs/spec.md) and reference implementations enabling [Foxglove](https://foxglove.dev/) to ingest arbitrary “live” streamed data.

A Foxglove WebSocket server can provide multiple data streams, called _channels_. When a client subscribes to a channel, it begins receiving _messages_ on that channel. This protocol does not prescribe the messages' data format. Instead, the server specifies each channel's _encoding_, and the client uses this information to determine whether it can decode that channel's messages. Read the [Foxglove documentation](https://docs.foxglove.dev/docs/connecting-to-data/frameworks/custom/#live-connection) for more information on which encodings Foxglove supports.

Implementations are available in the following languages:

| Language              | Includes                                    | Package name                     | Version                                                                                                                      |
| --------------------- | ------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Python                | [server + examples](python)                 | `foxglove-websocket`             | [![](https://shields.io/pypi/v/foxglove-websocket)](https://pypi.org/project/foxglove-websocket/)                            |
| JavaScript/TypeScript | [server + client](typescript/ws-protocol)   | `@foxglove/ws-protocol`          | [![](https://shields.io/npm/v/@foxglove/ws-protocol)](https://www.npmjs.com/package/@foxglove/ws-protocol)                   |
| JavaScript/TypeScript | [examples](typescript/ws-protocol-examples) | `@foxglove/ws-protocol-examples` | [![](https://shields.io/npm/v/@foxglove/ws-protocol-examples)](https://www.npmjs.com/package/@foxglove/ws-protocol-examples) |
| C++                   | [server + examples](cpp)                    | `foxglove-websocket`             | [![](https://shields.io/conan/v/foxglove-websocket)](https://conan.io/center/foxglove-websocket)                             |

### Additional resources
- https://foxglove.github.io/ws-protocol - Connect to a ws-protocol compliant server and measure data throughput
- [eCAL Foxglove Bridge](https://github.com/eclipse-ecal/ecal-foxglove-bridge) – WebSocket bridge that allows users to connect eCAL systems to Foxglove for easy visualization and debugging

