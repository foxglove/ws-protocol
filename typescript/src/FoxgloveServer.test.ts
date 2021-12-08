import ConsumerQueue from "consumer-queue";
import { AddressInfo, Data, WebSocket, WebSocketServer } from "ws";

import FoxgloveServer from "./FoxgloveServer";

describe("FoxgloveServer", () => {
  it("connects and sends server info", async () => {
    const server = new FoxgloveServer({ name: "foo" });
    const wss = new WebSocketServer({
      port: 0,
      handleProtocols: server.handleProtocols.bind(server),
    });
    wss.on("connection", (conn, req) => {
      server.handleConnection(conn, `${req.socket.remoteAddress!}:${req.socket.remotePort!}`);
    });
    await new Promise((resolve) => wss.on("listening", resolve));

    const ws = new WebSocket(`ws://localhost:${(wss.address() as AddressInfo).port}`);
    const queue = new ConsumerQueue<Data>();
    const nextTextMessage = async () =>
      (await (queue.pop() as Promise<string>).then(JSON.parse)) as unknown;
    ws.onmessage = (event) => queue.push(event.data);

    try {
      await expect(nextTextMessage()).resolves.toEqual({
        op: "serverInfo",
        name: "foo",
        capabilities: [],
      });
      void queue.pop().then(() => {
        throw new Error("Unexpected message");
      });
    } finally {
      ws.close();
      wss.close();
    }
  });
});
