# Foxglove Studio WebSocket protocol libraries

This repository provides a protocol specification and reference implementations enabling [Foxglove Studio](https://github.com/foxglove/studio) to ingest arbitrary “live” streamed data.

The protocol is encoding-agnostic, i.e. it can support Protobuf messages, ROS 1 or 2 messages, etc. (as long as the desired encoding is supported by both client and server).

The following implementations are provided in this repository and as installable packages:

| Language              | Includes         | Package name            | Version                                                                                                    |
| --------------------- | ---------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------- |
| Python                | server           | `foxglove-websocket`    | [![](https://shields.io/pypi/v/foxglove-websocket)](https://pypi.org/project/foxglove-websocket/)          |
| JavaScript/TypeScript | server + client  | `@foxglove/ws-protocol` | [![](https://shields.io/npm/v/@foxglove/ws-protocol)](https://www.npmjs.com/package/@foxglove/ws-protocol) |
| C++                   | _in development_ |

## Documentation

- [Protocol specification](docs/spec.md)
- [Python package README](python)
- [JavaScript/TypeScript package README](typescript)

## Development

### Virtualenv usage

```
pipenv install --dev
pipenv shell
```

### Run example servers

```
python -m foxglove_websocket.examples.simple_server
yarn workspace @foxglove/ws-protocol example-server
```

### Run example client

```
yarn workspace @foxglove/ws-protocol example-client [host] [topic]
```
