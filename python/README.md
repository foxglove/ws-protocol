# Foxglove WebSocket server

This package provides an example server implementation of the [Foxglove WebSocket protocol](https://github.com/foxglove/ws-protocol), enabling [Foxglove Studio](https://github.com/foxglove/studio) to ingest arbitrary “live” streamed data.

## Installation

```
$ pip install foxglove-websocket
```

## Example servers

This package includes example servers demonstrating how to use JSON and Protobuf data. To install additional dependencies required for the examples, run:

```
$ pip install foxglove-websocket[examples]
```

Run a simple example server that publishes messages on a single `example_msg` topic

- using JSON to encode message data and [JSON Schema](https://json-schema.org/) to describe the message layout
- using Protobuf

```
python -m foxglove_websocket.examples.json_server
python -m foxglove_websocket.examples.protobuf_server
```

To see data from this server, open [Foxglove Studio](https://studio.foxglove.dev?ds=foxglove-websocket&ds.url=ws://localhost:8765/) with a Foxglove WebSocket connection to `ws://localhost:8765/`:

<img width="676" alt="Foxglove Studio displaying data from the example server" src="https://user-images.githubusercontent.com/14237/145260376-ddda98c5-7ed0-4239-9ce4-10778ee8240b.png">

## Server template

Copy this [JSON server template](https://github.com/foxglove/ws-protocol/blob/main/python/src/foxglove_websocket/examples/json_server.py) or [Protouf server template](https://github.com/foxglove/ws-protocol/blob/main/python/src/foxglove_websocket/examples/protobuf_server.py) into a file and run it (e.g. `python3 server.py`). Then, make the necessary adjustments to the file to customize this simple server to your desired specifications.

## Development

Use [pipenv](https://github.com/pypa/pipenv) to manage developer dependencies and `virtualenv` while developing.

- `pipenv install --dev` – Create a `virtualenv` and install development dependencies
- `pipenv shell` – Enter the `virtualenv`
