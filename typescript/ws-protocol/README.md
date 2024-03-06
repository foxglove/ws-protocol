# Foxglove WebSocket server and client

This package provides a server implementation of the [Foxglove WebSocket protocol](https://github.com/foxglove/ws-protocol). This protocol enables [Foxglove](https://foxglove.dev/) to ingest arbitrary “live” streamed data.

## Installation

```
$ npm install @foxglove/ws-protocol
```

This package does not require a specific WebSocket server or client implementation, so you will need to install your own. For Node.js, you can use the [ws](https://www.npmjs.com/package/ws) package:

```
$ npm install ws
```

## Examples

Run these [example scripts](https://github.com/foxglove/ws-protocol/tree/main/typescript/ws-protocol-examples), implemented in TypeScript, to get started.

## Server template

The template below publishes messages on a single topic called `example_msg`, using JSON to encode message data and [JSON Schema](https://json-schema.org) to describe the message layout.

```js
const { FoxgloveServer } = require("@foxglove/ws-protocol");
const { WebSocketServer } = require("ws");

function delay(durationSec) {
  return new Promise((resolve) => setTimeout(resolve, durationSec * 1000));
}

async function main() {
  const server = new FoxgloveServer({ name: "example-server" });
  const ws = new WebSocketServer({
    port: 8765,
    handleProtocols: (protocols) => server.handleProtocols(protocols),
  });
  ws.on("listening", () => {
    console.log("server listening on %s", ws.address());
  });
  ws.on("connection", (conn, req) => {
    const name = `${req.socket.remoteAddress}:${req.socket.remotePort}`;
    console.log("connection from %s via %s", name, req.url);
    server.handleConnection(conn, name);
  });
  server.on("subscribe", (chanId) => {
    console.log("first client subscribed to %d", chanId);
  });
  server.on("unsubscribe", (chanId) => {
    console.log("last client unsubscribed from %d", chanId);
  });
  server.on("error", (err) => {
    console.error("server error: %o", err);
  });

  const ch1 = server.addChannel({
    topic: "example_msg",
    encoding: "json",
    schemaName: "ExampleMsg",
    schema: JSON.stringify({
      type: "object",
      properties: {
        msg: { type: "string" },
        count: { type: "number" },
      },
    }),
  });

  const textEncoder = new TextEncoder();
  let i = 0;
  while (true) {
    await delay(0.2);
    server.sendMessage(
      ch1,
      BigInt(Date.now()) * 1_000_000n,
      textEncoder.encode(JSON.stringify({ msg: "Hello!", count: ++i })),
    );
  }
}

main().catch(console.error);
```

Copy the template code into a file and run it (e.g. `node server.js`). Then, make the necessary adjustments to the file to customize this simple server to your desired specifications.

## Client template

The template below subscribes to messages on all channels that use the `json` encoding. See [`@foxglove/ws-protocol-examples`](https://github.com/foxglove/ws-protocol/tree/main/typescript/ws-protocol-examples#example-client) for an example client that subscribes to messages with the `protobuf` encoding.

```js
const { FoxgloveClient } = require("@foxglove/ws-protocol");
const { WebSocket } = require("ws");

async function main() {
  const client = new FoxgloveClient({
    ws: new WebSocket(`ws://localhost:8765`, [FoxgloveClient.SUPPORTED_SUBPROTOCOL]),
  });
  const deserializers = new Map();
  client.on("advertise", (channels) => {
    for (const channel of channels) {
      if (channel.encoding !== "json") {
        console.warn(`Unsupported encoding ${channel.encoding}`);
        continue;
      }
      const subId = client.subscribe(channel.id);
      const textDecoder = new TextDecoder();
      deserializers.set(subId, (data) => JSON.parse(textDecoder.decode(data)));
    }
  });
  client.on("message", ({ subscriptionId, timestamp, data }) => {
    console.log({
      subscriptionId,
      timestamp,
      data: deserializers.get(subscriptionId)(data),
    });
  });
}

main().catch(console.error);
```

Copy the template code into a file (e.g. `client.js`) and start up a [Foxglove Websocket server](#server-template). In a separate terminal window, run the client code (e.g. `node client.js`).

You should see the following output if both your server and client are running correctly:

```
$ node client.js
{
  subscriptionId: 0,
  timestamp: 1638999307183000000n,
  data: { msg: 'Hello!', count: 2849 }
}
{
  subscriptionId: 0,
  timestamp: 1638999307384000000n,
  data: { msg: 'Hello!', count: 2850 }
}
...
```

Make the necessary adjustments to the file to customize this simple client.

## Development

This package lives inside a monorepo that uses [yarn workspaces](https://yarnpkg.com/features/workspaces), so most commands (other than `yarn install`) should be prefixed with `yarn workspace @foxglove/ws-protocol ...`.

- `yarn install` – Install development dependencies
- `yarn workspace @foxglove/ws-protocol version --patch` (or `--minor` or `--major`) – Increment the version number and create the appropriate git tag
