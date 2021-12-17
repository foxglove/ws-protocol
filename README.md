# Foxglove Studio WebSocket protocol libraries

This repository provides a protocol specification and reference implementations enabling [Foxglove Studio](https://github.com/foxglove/studio) to ingest arbitrary “live” streamed data.

The protocol is encoding-agnostic, i.e. it can support Protobuf messages, JSON messages, etc. (as long as the desired encoding is supported by both client and server).

The following implementations are provided in this repository and as installable packages:

| Language              | Includes         | Package name                     | Version                                                                                                                      |
| --------------------- | ---------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Python                | server           | `foxglove-websocket`             | [![](https://shields.io/pypi/v/foxglove-websocket)](https://pypi.org/project/foxglove-websocket/)                            |
| JavaScript/TypeScript | server + client  | `@foxglove/ws-protocol`          | [![](https://shields.io/npm/v/@foxglove/ws-protocol)](https://www.npmjs.com/package/@foxglove/ws-protocol)                   |
| JavaScript/TypeScript | examples         | `@foxglove/ws-protocol-examples` | [![](https://shields.io/npm/v/@foxglove/ws-protocol-examples)](https://www.npmjs.com/package/@foxglove/ws-protocol-examples) |
| C++                   | _in development_ |

## Documentation

- [Protocol specification](docs/spec.md)
- [Python package README](python)
- [JavaScript/TypeScript package README](typescript/ws-protocol)

## Development

### Virtualenv usage

```
pipenv install --dev
pipenv shell
```

### Run example servers

```
python -m foxglove_websocket.examples.json_server
npx @foxglove/ws-protocol-examples@latest sysmon
```

### Run example client

```
npx @foxglove/ws-protocol-examples@latest simple-client localhost:8765
```
