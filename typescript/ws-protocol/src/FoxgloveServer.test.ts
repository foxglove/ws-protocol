import ConsumerQueue from "consumer-queue";
import { AddressInfo, Data, WebSocket, WebSocketServer } from "ws";

import { BinaryOpcode, ClientPublish } from ".";
import FoxgloveServer from "./FoxgloveServer";

function uint32LE(n: number): Uint8Array {
  const result = new Uint8Array(4);
  new DataView(result.buffer).setUint32(0, n, true);
  return result;
}
function uint64LE(n: bigint): Uint8Array {
  const result = new Uint8Array(8);
  new DataView(result.buffer).setBigUint64(0, n, true);
  return result;
}

async function setupServerAndClient(server: FoxgloveServer) {
  const wss = new WebSocketServer({
    port: 0,
    handleProtocols: server.handleProtocols.bind(server),
  });
  wss.on("connection", (conn, req) => {
    server.handleConnection(conn, `${req.socket.remoteAddress!}:${req.socket.remotePort!}`);
  });
  await new Promise((resolve) => wss.on("listening", resolve));

  const msgQueue = new ConsumerQueue<Data>();
  const ws = new WebSocket(`ws://localhost:${(wss.address() as AddressInfo).port}`);
  ws.binaryType = "arraybuffer";
  ws.onmessage = (event) => msgQueue.push(event.data);

  const nextJsonMessage = async () => {
    const msg = await msgQueue.pop();
    if (typeof msg === "string") {
      return JSON.parse(msg) as unknown;
    }
    throw new Error("Expected string message");
  };
  const nextBinaryMessage = async () => {
    const msg = await msgQueue.pop();
    if (msg instanceof ArrayBuffer) {
      return new Uint8Array(msg);
    }
    throw new Error(`Expected binary message, got: ${typeof msg}`);
  };

  const eventQueue = new ConsumerQueue<unknown[]>();
  server.on("subscribe", (chanId) => eventQueue.push(["subscribe", chanId]));
  server.on("unsubscribe", (chanId) => eventQueue.push(["unsubscribe", chanId]));
  server.on("error", (err) => eventQueue.push(["error", err]));
  server.on("advertise", (channels) => eventQueue.push(["advertise", channels]));
  server.on("unadvertise", (channelIds) => eventQueue.push(["unadvertise", channelIds]));
  server.on("message", (event) => eventQueue.push(["message", event]));

  const nextEvent = async () => await eventQueue.pop();

  const send = (data: Data) => ws.send(data);
  const close = () => {
    msgQueue.cancelWait(new Error("Server was closed"));
    void msgQueue.pop().then((_msg) => {
      throw new Error("Unexpected message");
    });
    eventQueue.cancelWait(new Error("Server was closed"));
    void eventQueue.pop().then((event) => {
      throw new Error(`Unexpected event: ${event[0] as string}`);
    });
    ws.close();
    wss.close();
  };
  return { server, send, nextJsonMessage, nextBinaryMessage, nextEvent, close };
}

describe("FoxgloveServer", () => {
  it("sends server info upon connection", async () => {
    const server = new FoxgloveServer({ name: "foo" });
    const { nextJsonMessage, close } = await setupServerAndClient(server);
    try {
      await expect(nextJsonMessage()).resolves.toEqual({
        op: "serverInfo",
        name: "foo",
        capabilities: ["clientPublish"],
      });
    } finally {
      close();
    }
  });

  it("sends server info and existing channels upon connection", async () => {
    const server = new FoxgloveServer({ name: "foo" });
    const chan = {
      topic: "foo",
      encoding: "bar",
      schemaName: "Foo",
      schema: "some data",
    };
    const id = server.addChannel(chan);
    const { nextJsonMessage, close } = await setupServerAndClient(server);
    try {
      await expect(nextJsonMessage()).resolves.toEqual({
        op: "serverInfo",
        name: "foo",
        capabilities: ["clientPublish"],
      });
      await expect(nextJsonMessage()).resolves.toEqual({
        op: "advertise",
        channels: [{ ...chan, id }],
      });
    } finally {
      close();
    }
  });

  it("sends newly added channels to connected clients", async () => {
    const server = new FoxgloveServer({ name: "foo" });
    const { nextJsonMessage, close } = await setupServerAndClient(server);
    try {
      await expect(nextJsonMessage()).resolves.toEqual({
        op: "serverInfo",
        name: "foo",
        capabilities: ["clientPublish"],
      });

      const chan = {
        topic: "foo",
        encoding: "bar",
        schemaName: "Foo",
        schema: "some data",
      };
      const id = server.addChannel(chan);

      await expect(nextJsonMessage()).resolves.toEqual({
        op: "advertise",
        channels: [{ ...chan, id }],
      });
    } finally {
      close();
    }
  });

  it("handles client subscribe/unsubscribe and forwards messages", async () => {
    const server = new FoxgloveServer({ name: "foo" });
    const chan = {
      topic: "foo",
      encoding: "bar",
      schemaName: "Foo",
      schema: "some data",
    };
    const chanId = server.addChannel(chan);
    const { send, nextJsonMessage, nextBinaryMessage, nextEvent, close } =
      await setupServerAndClient(server);

    try {
      await expect(nextJsonMessage()).resolves.toEqual({
        op: "serverInfo",
        name: "foo",
        capabilities: ["clientPublish"],
      });
      await expect(nextJsonMessage()).resolves.toEqual({
        op: "advertise",
        channels: [{ ...chan, id: chanId }],
      });

      // message before subscribe is ignored
      server.sendMessage(chanId, 42n, new Uint8Array([1, 2, 3]));

      const subId = 1;
      send(JSON.stringify({ op: "subscribe", subscriptions: [{ id: subId, channelId: chanId }] }));

      await expect(nextEvent()).resolves.toEqual(["subscribe", chanId]);

      server.sendMessage(chanId, 42n, new Uint8Array([1, 2, 3]));

      await expect(nextBinaryMessage()).resolves.toEqual(
        new Uint8Array([BinaryOpcode.MESSAGE_DATA, ...uint32LE(subId), ...uint64LE(42n), 1, 2, 3]),
      );

      send(JSON.stringify({ op: "unsubscribe", subscriptionIds: [subId] }));
      await expect(nextEvent()).resolves.toEqual(["unsubscribe", chanId]);

      // message after unsubscribe is ignored
      server.sendMessage(chanId, 42n, new Uint8Array([1, 2, 3]));
    } finally {
      close();
    }
  });

  it("receives advertisements and messages from clients", async () => {
    const server = new FoxgloveServer({ name: "foo" });
    const { send, nextJsonMessage, nextEvent, close } = await setupServerAndClient(server);

    try {
      await expect(nextJsonMessage()).resolves.toEqual({
        op: "serverInfo",
        name: "foo",
        capabilities: ["clientPublish"],
      });

      // client message, this will be ignored since it is not preceded by an "advertise"
      const msg1 = new Uint8Array([1, 42, 0, 0, 0, 1, 2, 3]);
      send(msg1);

      // client advertisement
      send(
        JSON.stringify({
          op: "advertise",
          channels: [{ id: 42, topic: "foo", encoding: "bar", schemaName: "baz" }],
        }),
      );

      // client message
      const msg2 = new Uint8Array([1, 42, 0, 0, 0, 2, 3, 4]);
      send(msg2);

      // client unadvertisement
      send(JSON.stringify({ op: "unadvertise", channelIds: [1, 42] }));

      await expect(nextEvent()).resolves.toEqual([
        "error",
        new Error("Client sent message data for unknown channel 42"),
      ]);

      await expect(nextEvent()).resolves.toEqual([
        "advertise",
        { id: 42, topic: "foo", encoding: "bar", schemaName: "baz" },
      ]);

      const expectedPayload = new Uint8Array([2, 3, 4]);
      const msgEvent = await nextEvent();
      expect(msgEvent).toEqual([
        "message",
        {
          channel: { id: 42, topic: "foo", encoding: "bar", schemaName: "baz" },
          data: new DataView(expectedPayload.buffer),
        },
      ]);
      const msg = msgEvent[1] as ClientPublish;
      expect(msg.data.byteLength).toEqual(expectedPayload.byteLength);
      for (let i = 0; i < expectedPayload.byteLength; i++) {
        expect(msg.data.getUint8(i)).toEqual(expectedPayload[i]);
      }

      await expect(nextEvent()).resolves.toEqual(["unadvertise", 1]);
      await expect(nextEvent()).resolves.toEqual(["unadvertise", 42]);
    } finally {
      close();
    }
  });
});
