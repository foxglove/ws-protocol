# Foxglove Studio WebSocket protocol

This package provides server and client implementations of the [Foxglove Studio WebSocket protocol](https://github.com/foxglove/ws-protocol), enabling [Foxglove Studio](https://github.com/foxglove/studio) to ingest arbitrary “live” streamed data.

The protocol is encoding-agnostic, i.e. it can support Protobuf messages, ROS 1 or 2 messages, etc. (as long as the desired encoding is supported by both client and server).

## Installation

```
$ npm install @foxglove/ws-protocol
```

This package does not require a specific WebSocket server or client implementation, so you will need to install your own. For Node.js, you can use the [ws](https://www.npmjs.com/package/ws) package:

```
$ npm install ws
```

## Example server

The following script provides a simple example server which publishes messages on a single topic called `example_msg`, using JSON to encode message data and [JSON Schema](https://json-schema.org) to describe the message layout.

To get started with the example server:

1. Copy the script below into a file named `server.js`.
2. Run `node server.js`.
3. In a browser, open up https://studio.foxglove.dev and initiate a Foxglove WebSocket connection to `ws://localhost:8765/`.

<img width="676" alt="Foxglove Studio displaying data from the example server" src="https://user-images.githubusercontent.com/14237/145260376-ddda98c5-7ed0-4239-9ce4-10778ee8240b.png">

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

## Example client

The following script provides a simple example client which subscribes to messages on all channels that use the `json` encoding. To get started with the example client:

1. Copy the script below into a file named `client.js`.
2. Run the [example server above](#example-server) or any other Foxglove WebSocket server.
3. In a separate terminal, run `node client.js`.

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

Note: This package lives inside a monorepo which uses [yarn workspaces](https://yarnpkg.com/features/workspaces), so most commands (other than `yarn install`) should be prefixed with `yarn workspace @foxglove/ws-protocol ...`.

- Run `yarn install` to install development dependencies.
- Run `yarn workspace @foxglove/ws-protocol example-server` to run the example server.
- Run `yarn workspace @foxglove/ws-protocol example-client [host] [topic]` to run the example client.
- Run `yarn workspace @foxglove/ws-protocol version --patch` (or `--minor` or `--major`) to increment the version number and create the appropriate git tag.
