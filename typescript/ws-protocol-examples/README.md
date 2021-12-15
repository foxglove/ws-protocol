# Foxglove Studio WebSocket protocol examples

This package provides example server and client scripts using the [Foxglove Studio WebSocket protocol](https://github.com/foxglove/ws-protocol).

## Usage

```
$ npx @foxglove/ws-protocol-examples@latest --help
$ npx @foxglove/ws-protocol-examples@latest image-server
$ npx @foxglove/ws-protocol-examples@latest sysmon
$ npx @foxglove/ws-protocol-examples@latest simple-client [host]
```

To see data from the example servers, open up https://studio.foxglove.dev and initiate a Foxglove WebSocket connection to `ws://localhost:8765/`.

## Development

Note: This package lives inside a monorepo which uses [yarn workspaces](https://yarnpkg.com/features/workspaces), so most commands (other than `yarn install`) should be prefixed with `yarn workspace @foxglove/ws-protocol-examples ...`.

- Run `yarn install` to install development dependencies.
- Run `yarn workspace @foxglove/ws-protocol-examples run-example --help` to run the example scripts.
- Run `yarn workspace @foxglove/ws-protocol-examples version --patch` (or `--minor` or `--major`) to increment the version number and create the appropriate git tag.
