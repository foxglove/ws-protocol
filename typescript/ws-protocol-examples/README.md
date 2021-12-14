# Foxglove WebSocket examples in TypeScript

The Foxglove WebSocket protocol is encoding-agnostic, as long as the desired encoding is supported by both client and server. It currently supports Protobuf and JSON messages.

## Installation

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

You can also run a simple example client that subscribes to messages on all channels with the `json` encoding.

```
$ npx @foxglove/ws-protocol-examples simple-client localhost:8765
```

## Development

The `ws-protocol-examples` package lives inside a monorepo that uses [yarn workspaces](https://yarnpkg.com/features/workspaces), so most commands (other than `yarn install`) should be prefixed with `yarn workspace @foxglove/ws-protocol-examples...`.

- `yarn install` – Install development dependencies
- `yarn workspace @foxglove/ws-protocol-examples version --patch` (or `--minor` or `--major`) – Increment the version number and create the appropriate git tag
- `yarn workspace @foxglove/ws-protocol-examples run-example --help` – Run the example scripts
