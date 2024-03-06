# Foxglove WebSocket examples

This package provides example server and client implementations of the [Foxglove WebSocket protocol](https://github.com/foxglove/ws-protocol). The protocol enables [Foxglove](https://foxglove.dev/) to ingest arbitrary “live” streamed data.

To list all possible actions, run the following command:

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

Run the `mcap-play` example server, which plays back recorded data from a local [MCAP](https://mcap.dev) file:

```
$ npx @foxglove/ws-protocol-examples@latest mcap-play <file> [--rate 1.0] [--loop]
```

_Note:_ You must exit each server (<kbd>control</kbd> + <kbd>c</kbd>) before starting up another.

To see data from any server, open [Foxglove](https://app.foxglove.dev/~/view?ds=foxglove-websocket&ds.url=ws://localhost:8765/) with a Foxglove WebSocket connection to `ws://localhost:8765/`:

<img width="500" alt="Foxglove displaying memory and CPU usage from the system monitor example" src="https://user-images.githubusercontent.com/14237/145313065-85c05645-6b29-4eb2-a498-849c83f8792d.png">
<img width="500" alt="Foxglove displaying images from the image server example" src="https://user-images.githubusercontent.com/14237/146500927-4a1408c7-0725-49e7-8185-71b0280c0a8b.png">

## Example clients

Run a simple example client that subscribes to messages with the `protobuf` or `json` encoding:

```
$ npx @foxglove/ws-protocol-examples@latest simple-client ws://localhost:8765
```

Run a client that advertises the `/chatter` topic and publishes messages to it with `json` or `ros1` encoding:

```
$ npx @foxglove/ws-protocol-examples@latest publish-client -e json ws://localhost:8765
```

Connect to a server and record message data into an [MCAP](https://mcap.dev) file:

```
$ npx @foxglove/ws-protocol-examples@latest mcap-record ws://localhost:8765 -o <file.mcap>
```

## Development

This package lives inside a monorepo that uses [yarn workspaces](https://yarnpkg.com/features/workspaces), so most commands (other than `yarn install`) should be prefixed with `yarn workspace @foxglove/ws-protocol-examples ...`.

- `yarn install` – Install development dependencies
- `yarn workspace @foxglove/ws-protocol-examples version --patch` (or `--minor` or `--major`) – Increment the version number and create the appropriate git tag
- `yarn workspace @foxglove/ws-protocol-examples run-example --help` – Run the example scripts
