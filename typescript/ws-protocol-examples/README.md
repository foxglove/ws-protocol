# Foxglove WebSocket examples

This package provides example server and client implementation of the [Foxglove WebSocket protocol](https://github.com/foxglove/ws-protocol).

For all possible actions, run the following command:

```
$ npx @foxglove/ws-protocol-examples@latest --help
```

## Example servers

Run the `sysmon` example server, which uses JSON-encoded data to transmit system monitoring information like memory and CPU usage:

```
$ npx @foxglove/ws-protocol-examples@latest sysmon
```

Run the `image-server` example server, which uses JSON-encoded data to transmit images:

```
$ npx @foxglove/ws-protocol-examples@latest image-server
```

You must close out each server (`control` + `c`) before starting up the other.

To see data from either server, open [Foxglove Studio](https://studio.foxglove.dev?ds=foxglove-websocket&ds.url=ws://localhost:8765/) with a Foxglove WebSocket connection to `ws://localhost:8765/`:

<img width="500" alt="Foxglove Studio displaying memory and CPU usage from the system monitor example" src="https://user-images.githubusercontent.com/14237/145313065-85c05645-6b29-4eb2-a498-849c83f8792d.png">

## Example client

Run a simple example client that subscribes to messages with the `protobuf` encoding:

```
$ npx @foxglove/ws-protocol-examples@latest simple-client localhost:8765
```

## Development

This package lives inside a monorepo that uses [yarn workspaces](https://yarnpkg.com/features/workspaces), so most commands (other than `yarn install`) should be prefixed with `yarn workspace @foxglove/ws-protocol-examples ...`.

- `yarn install` – Install development dependencies
- `yarn workspace @foxglove/ws-protocol-examples version --patch` (or `--minor` or `--major`) – Increment the version number and create the appropriate git tag
- `yarn workspace @foxglove/ws-protocol-examples run-example --help` – Run the example scripts
