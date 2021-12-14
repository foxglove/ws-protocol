# Foxglove WebSocket protocol in TypeScript

The Foxglove WebSocket protocol is encoding-agnostic, as long as the desired encoding is supported by both client and server. It currently supports Protobuf and JSON messages.

## Installation

Install the `ws-protocol` `npm` package:

```
$ npm install @foxglove/ws-protocol
```

You'll also need to install your own WebSocket server or client implementation. For Node.js, you can use the [ws](https://www.npmjs.com/package/ws) package:

```
$ npm install ws
```

Use the custom template provided [here](typescript/ws-protocol#server-template) to write your own custom JavaScript/TypeScript server.

To see the data transmitted by your server, open [studio.foxglove.dev](https://studio.foxglove.dev) in a browser, and initiate a Foxglove WebSocket connection to your WebSocket URL.

<img width="500" alt="Foxglove Studio displaying memory and CPU usage from the system monitor example" src="https://user-images.githubusercontent.com/14237/145313065-85c05645-6b29-4eb2-a498-849c83f8792d.png">

## Server template

The example server template below publishes messages on a single topic called `example_msg`, using JSON to encode message data and [JSON Schema](https://json-schema.org) to describe the message layout. 

Copy the script below into a file (e.g. `server.js`) and run it (e.g. `node server.js`). Then, make the necessary adjustments to build a custom server.

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

## Client template

The example client template below subscribes to messages on all channels that use the `json` encoding. 

Copy the script below into a file (e.g. `client.js`), run a [Foxglove Websocket server](#server-template), and then run the client code (e.g. `node client.js`). Then, make the necessary adjustments to build a custom client.

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

## Development

The `ws-protocol` package lives inside a monorepo that uses [yarn workspaces](https://yarnpkg.com/features/workspaces), so most commands (other than `yarn install`) should be prefixed with `yarn workspace @foxglove/ws-protocol...`.

- `yarn install` – Install development dependencies
- `yarn workspace @foxglove/ws-protocol version --patch` (or `--minor` or `--major`) – Increment the version number and create the appropriate git tag
