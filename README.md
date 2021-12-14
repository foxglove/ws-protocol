# Foxglove WebSocket Protocol

This repository provides a [protocol specification](docs/spec.md) and reference implementations enabling [Foxglove Studio](https://github.com/foxglove/studio) to ingest arbitrary “live” streamed data.

The protocol is encoding-agnostic, as long as the desired encoding is supported by both client and server. It currently supports Protobuf and JSON messages.

The following implementations are available as installable packages:

| Language              | Includes         | Package name                     | Version                                                                                                                      |
| --------------------- | ---------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Python                | [server](python)            | `foxglove_websocket`             | [![](https://shields.io/pypi/v/foxglove-websocket)](https://pypi.org/project/foxglove-websocket/)                            |
| JavaScript/TypeScript | [server + client](typescript/ws-protocol)  | `@foxglove/ws-protocol`          | [![](https://shields.io/npm/v/@foxglove/ws-protocol)](https://www.npmjs.com/package/@foxglove/ws-protocol)                   |
|   | [examples](typescript/ws-protocol-examples)         | `@foxglove/ws-protocol-examples` | [![](https://shields.io/npm/v/@foxglove/ws-protocol-examples)](https://www.npmjs.com/package/@foxglove/ws-protocol-examples) |
| C++                   | _in development_ |

## Python server

Install the `foxglove_websocket` Python package:

```
$ pip install foxglove_websocket
```

Run a simple example server which publishes messages on a single `example_msg` topic, using JSON to encode message data and [JSON Schema](https://json-schema.org/) to describe the message layout.

```
python -m foxglove_websocket.examples.simple_server
```

To see data transmitted by your server, open [studio.foxglove.dev](https://studio.foxglove.dev) in a browser and initiate a Foxglove WebSocket connection to your WebSocket URL (`ws://localhost:8765/`).

<img width="676" alt="Foxglove Studio displaying data from the example server" src="https://user-images.githubusercontent.com/14237/145260376-ddda98c5-7ed0-4239-9ce4-10778ee8240b.png">

To write your own custom Python server, use the custom template provided [here](python#server-template).

## JavaScript/TypeScript server

Install the `ws-protocol-examples` `npm` package:

```
$ npm install @foxglove/ws-protocol-examples
```

Run example servers `sysmon` and `image-server` using the following commands:

```
$ npx @foxglove/ws-protocol-examples sysmon
$ npx @foxglove/ws-protocol-examples image-server
```

To see the data transmitted by one of these servers, open [studio.foxglove.dev](https://studio.foxglove.dev) in a browser, and initiate a Foxglove WebSocket connection to the respective WebSocket URL.

<img width="500" alt="Foxglove Studio displaying memory and CPU usage from the system monitor example" src="https://user-images.githubusercontent.com/14237/145313065-85c05645-6b29-4eb2-a498-849c83f8792d.png">

To write your own custom JavaScript/TypeScript server, use the custom template provided [here](typescript/ws-protocol#server-template).

## JavaScript/TypeScript client

Install the `ws-protocol-examples` `npm` package, and run a simple example client that subscribes to messages on all channels with the `json` encoding.

```
$ npm install @foxglove/ws-protocol-examples
$ npx @foxglove/ws-protocol-examples simple-client localhost:8765
```

To write your own custom JavaScript/TypeScript client, use the custom template provided [here](typescript/ws-protocol#client-template).