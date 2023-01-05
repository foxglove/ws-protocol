import ConsumerQueue from "consumer-queue";
import { AddressInfo, Data, WebSocket, WebSocketServer } from "ws";

import { BinaryOpcode, ClientPublish, GetParameters, Parameter } from ".";
import FoxgloveServer, { SingleClient } from "./FoxgloveServer";

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
  server.on("advertise", (event) => eventQueue.push(["advertise", event]));
  server.on("unadvertise", (event) => eventQueue.push(["unadvertise", event]));
  server.on("message", (event) => eventQueue.push(["message", event]));
  server.on("getParameters", (event) => eventQueue.push(["getParameters", event]));
  server.on("setParameters", (event) => eventQueue.push(["setParameters", event]));
  server.on("subscribeParameterUpdates", (event) =>
    eventQueue.push(["subscribeParameterUpdates", event]),
  );
  server.on("unsubscribeParameterUpdates", (event) =>
    eventQueue.push(["unsubscribeParameterUpdates", event]),
  );

  const nextEvent = async () => await eventQueue.pop();

  const send = (data: Data) => ws.send(data);
  const close = () => {
    msgQueue.cancelWait(new Error("Server was closed"));
    void msgQueue.pop().then((_msg) => {
      throw new Error("Unexpected message on close");
    });
    eventQueue.cancelWait(new Error("Server was closed"));
    void eventQueue.pop().then((event) => {
      throw new Error(`Unexpected event on close: ${event[0] as string}`);
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
        capabilities: ["clientPublish", "time", "parameters", "parametersSubscribe"],
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
        capabilities: ["clientPublish", "time", "parameters", "parametersSubscribe"],
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
        capabilities: ["clientPublish", "time", "parameters", "parametersSubscribe"],
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
        capabilities: ["clientPublish", "time", "parameters", "parametersSubscribe"],
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
        capabilities: ["clientPublish", "time", "parameters", "parametersSubscribe"],
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

      await expect(nextEvent()).resolves.toMatchObject([
        "advertise",
        { id: 42, topic: "foo", encoding: "bar", schemaName: "baz" },
      ]);

      const expectedPayload = new Uint8Array([2, 3, 4]);
      const msgEvent = await nextEvent();
      expect(msgEvent).toMatchObject([
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

      await expect(nextEvent()).resolves.toMatchObject(["unadvertise", { channelId: 42 }]);
    } catch (ex) {
      close();
      throw ex;
    }
    close();
  });

  it("sends time messages to clients", async () => {
    const server = new FoxgloveServer({ name: "foo" });
    const { nextJsonMessage, nextBinaryMessage, close } = await setupServerAndClient(server);
    try {
      await expect(nextJsonMessage()).resolves.toEqual({
        op: "serverInfo",
        name: "foo",
        capabilities: ["clientPublish", "time", "parameters", "parametersSubscribe"],
      });

      server.broadcastTime(42n);

      await expect(nextBinaryMessage()).resolves.toEqual(
        new Uint8Array([BinaryOpcode.TIME, ...uint64LE(42n)]),
      );
    } finally {
      close();
    }
  });

  it("receives parameter set & get request from client", async () => {
    const server = new FoxgloveServer({ name: "foo" });
    const { send, nextJsonMessage, nextEvent, close } = await setupServerAndClient(server);

    try {
      await expect(nextJsonMessage()).resolves.toEqual({
        op: "serverInfo",
        name: "foo",
        capabilities: ["clientPublish", "time", "parameters", "parametersSubscribe"],
      });

      let paramStore: Parameter[] = [
        { name: "/foo/bool_param", value: true },
        { name: "/foo/int_param", value: 123 },
      ];

      // client set parameter request
      send(
        JSON.stringify({
          op: "setParameters",
          parameters: [{ name: "/foo/bool_param", value: false }],
        }),
      );

      const setParameters = await nextEvent();
      expect(setParameters).toMatchObject([
        "setParameters",
        [{ name: "/foo/bool_param", value: false }],
      ]);
      const parameters = setParameters[1] as Parameter[];
      paramStore = paramStore.map((p) => parameters.find((p2) => p2.name === p.name) ?? p);

      // client get parameter request
      const paramNames = paramStore.map((p) => p.name);
      send(
        JSON.stringify({
          op: "getParameters",
          parameterNames: paramNames,
          id: "req-456",
        }),
      );

      const getParameters = await nextEvent();
      expect(getParameters).toMatchObject([
        "getParameters",
        { parameterNames: paramNames, id: "req-456" },
      ]);
      const request = getParameters[1] as GetParameters & SingleClient;
      server.publishParameterValues(paramStore, "req-456", request.client.connection);

      await expect(nextJsonMessage()).resolves.toEqual({
        op: "parameterValues",
        parameters: [
          { name: "/foo/bool_param", value: false },
          { name: "/foo/int_param", value: 123 },
        ],
        id: "req-456",
      });
    } catch (ex) {
      close();
      throw ex;
    }
    close();
  });

  it("subscribes to parameter updates", async () => {
    const server = new FoxgloveServer({ name: "foo" });
    const { send, nextJsonMessage, nextEvent, close } = await setupServerAndClient(server);

    try {
      await expect(nextJsonMessage()).resolves.toEqual({
        op: "serverInfo",
        name: "foo",
        capabilities: ["clientPublish", "time", "parameters", "parametersSubscribe"],
      });

      // client subscribe parameter request
      send(
        JSON.stringify({
          op: "subscribeParameterUpdates",
          parameterNames: ["/foo/bool_param"],
        }),
      );

      await expect(nextEvent()).resolves.toMatchObject([
        "subscribeParameterUpdates",
        ["/foo/bool_param"],
      ]);

      // trigger parameter updates to be sent to clients
      server.updateParameterValues([
        { name: "/foo/bool_param", value: false },
        { name: "/foo/int_param", value: 123 },
      ]);

      // only expect the subscribed parameter to be communicated to the client
      await expect(nextJsonMessage()).resolves.toEqual({
        op: "parameterValues",
        parameters: [{ name: "/foo/bool_param", value: false }],
      });
    } catch (ex) {
      close();
      throw ex;
    }
    close();
  });
});
