# Foxglove Studio WebSocket server

This package provides a server implementation of the [Foxglove Studio WebSocket protocol](https://github.com/foxglove/ws-protocol), enabling [Foxglove Studio](https://github.com/foxglove/studio) to ingest arbitrary “live” streamed data.

The protocol is encoding-agnostic, i.e. it can support Protobuf messages, JSON messages, etc. (as long as the desired encoding is supported by both client and server).

## Installation

```
$ pip install foxglove-websocket
```

## Example servers

This package includes example servers demonstrating how to use JSON and Protobuf data. To install additional dependencies required for the examples, run:

```
$ pip install foxglove-websocket[examples]
```

The following script provides a simple example server which publishes messages on a single topic called `example_msg`, using JSON to encode message data and [JSON Schema](https://json-schema.org) to describe the message layout.

To get started with the example server:

1. Run `python -m foxglove_websocket.examples.json_server`.  
   **or:** Run `python -m foxglove_websocket.examples.protobuf_server`.

2. In a browser, open up https://studio.foxglove.dev and initiate a Foxglove WebSocket connection to `ws://localhost:8765/`.

<img width="676" alt="Foxglove Studio displaying data from the example server" src="https://user-images.githubusercontent.com/14237/145260376-ddda98c5-7ed0-4239-9ce4-10778ee8240b.png">

## Development

When developing or maintaining the foxglove-websocket package, it is recommended to use [pipenv](https://github.com/pypa/pipenv) to manage development dependencies and virtualenv.

- Run `pipenv install --dev` to create a virtualenv and install development dependencies.
- Run `pipenv shell` to enter the virtualenv.
