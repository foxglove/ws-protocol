import { MessageWriter as Ros1MessageWriter } from "@foxglove/rosmsg-serialization";
import { MessageWriter as Ros2MessageWriter } from "@foxglove/rosmsg2-serialization";
import { FoxgloveServer, ServerCapability, ServiceCallPayload } from "@foxglove/ws-protocol";
import { Command } from "commander";
import Debug from "debug";
import { WebSocketServer } from "ws";

import { setupSigintHandler } from "./util/setupSigintHandler";
import boxen from "../boxen";

const log = Debug("foxglove:service-server");
Debug.enable("foxglove:*");

async function main(): Promise<void> {
  const supportedEncodings = ["json", "ros1", "cdr"];
  const server = new FoxgloveServer({
    name: "service-server",
    capabilities: [ServerCapability.services],
    supportedEncodings,
  });
  const port = 8765;
  const ws = new WebSocketServer({
    port,
    handleProtocols: (protocols) => server.handleProtocols(protocols),
  });
  setupSigintHandler(log, ws);

  const service = {
    name: "/set_bool",
    requestSchema: "bool data",
    responseSchema: "bool success\nstring message",
    type: "std_srvs/SetBool",
  };
  const serviceId = server.addService(service);

  ws.on("listening", () => {
    void boxen(
      `📡 Server listening on localhost:${port}. To see data, visit:\n` +
        `https://studio.foxglove.dev/?ds=foxglove-websocket&ds.url=ws://localhost:${port}/`,
      { borderStyle: "round", padding: 1 },
    ).then(log);
  });
  ws.on("connection", (conn, req) => {
    const name = `${req.socket.remoteAddress!}:${req.socket.remotePort!}`;
    log("connection from %s via %s", name, req.url);
    server.handleConnection(conn, name);
  });
  server.on("serviceCallRequest", (request, clientConnection) => {
    if (request.serviceId !== serviceId) {
      throw new Error(`Received invalid serviceId: "${request.serviceId}"`);
    }
    if (!supportedEncodings.includes(request.encoding)) {
      throw new Error(`Received invalid encoding: "${request.encoding}"`);
    }

    log("Received service call request with %d bytes", request.data.byteLength);

    const responseMsg = {
      success: true,
      message: `Hello back`,
    };

    let responseData = new Uint8Array();
    if (request.encoding === "json") {
      responseData = new Uint8Array(Buffer.from(JSON.stringify(responseMsg)));
    } else if (request.encoding === "ros1" || request.encoding === "cdr") {
      const definitions = [
        { name: "success", type: "bool" },
        { name: "message", type: "string" },
      ];
      const writer =
        request.encoding === "ros1"
          ? new Ros1MessageWriter([{ definitions }])
          : new Ros2MessageWriter([{ definitions }]);
      responseData = writer.writeMessage(responseMsg);
    }

    const response: ServiceCallPayload = {
      ...request,
      data: new DataView(responseData.buffer),
    };
    server.sendServiceCallResponse(response, clientConnection);
  });
  server.on("error", (err) => {
    log("server error: %o", err);
  });
}

export default new Command("service-server")
  .description("advertises a SetBool service that can be called")
  .action(main);
