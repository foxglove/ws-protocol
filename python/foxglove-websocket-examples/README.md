# Foxglove Studio WebSocket server

This package provides a server implementation of the [Foxglove Studio WebSocket protocol](https://github.com/foxglove/ws-protocol), enabling [Foxglove Studio](https://github.com/foxglove/studio) to ingest arbitrary “live” streamed data.

The protocol is encoding-agnostic, i.e. it can support Protobuf messages, JSON messages, etc. (as long as the desired encoding is supported by both client and server).

## Installation

```
$ pip install foxglove-websocket-examples
```

## Example server

```
$ python -m foxglove_websocket.examples.simple_server
```

## Development

When developing or maintaining the foxglove-websocket package, it is recommended to use [pipenv](https://github.com/pypa/pipenv) to manage development dependencies and virtualenv.

- Run `pipenv install --dev` to create a virtualenv and install development dependencies.
- Run `pipenv shell` to enter the virtualenv.
