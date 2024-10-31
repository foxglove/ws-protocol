import { MessageWriter as Ros1MessageWriter } from "@foxglove/rosmsg-serialization";
import {
  FoxgloveServer,
  ServerCapability,
  Service,
  ServiceCallPayload,
} from "@foxglove/ws-protocol";
import { Command } from "commander";
import Debug from "debug";
import { WebSocketServer } from "ws";

import boxen from "../boxen";
import { setupSigintHandler } from "./util/setupSigintHandler";

const log = Debug("foxglove:service-server");
Debug.enable("foxglove:*");

async function main(): Promise<void> {
  const supportedEncodings = ["json", "ros1"];
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

  const serviceDefRos: Omit<Service, "id"> = {
    name: "/set_bool_ros",
    type: "std_srvs/SetBool",
    request: {
      encoding: "ros1",
      schemaName: "std_srvs/SetBool_Request",
      schemaEncoding: "ros1msg",
      schema: "bool data",
    },
    response: {
      encoding: "ros1",
      schemaName: "std_srvs/SetBool_Response",
      schemaEncoding: "ros1msg",
      schema: "bool success\nstring message",
    },
  };
  const serviceDefJson: Omit<Service, "id"> = {
    name: "/set_bool_json",
    type: "std_srvs/SetBool",
    request: {
      encoding: "json",
      schemaName: "SetBoolJsonRequest",
      schemaEncoding: "jsonschema",
      schema: JSON.stringify({
        $schema: "https://json-schema.org/draft/2019-09/schema",
        type: "object",
        properties: {
          data: { type: "boolean" },
        },
      }),
    },
    response: {
      encoding: "json",
      schemaName: "SetBoolJsonResponse",
      schemaEncoding: "jsonschema",
      schema: JSON.stringify({
        $schema: "https://json-schema.org/draft/2019-09/schema",
        type: "object",
        properties: {
          success: { type: "boolean" },
          message: { type: "string" },
        },
      }),
    },
  };

  const serviceById = new Map([
    [server.addService(serviceDefRos), serviceDefRos],
    [server.addService(serviceDefJson), serviceDefJson],
  ]);

  ws.on("listening", () => {
    void boxen(
      `📡 Server listening on localhost:${port}. To see data, visit:\n` +
        `https://app.foxglove.dev/~/view?ds=foxglove-websocket&ds.url=ws://localhost:${port}/`,
      { borderStyle: "round", padding: 1 },
    ).then(log);
  });
  ws.on("connection", (conn, req) => {
    const name = `${req.socket.remoteAddress!}:${req.socket.remotePort!}`;
    log("connection from %s via %s", name, req.url);
    server.handleConnection(conn, name);
  });
  server.on("serviceCallRequest", (request, clientConnection) => {
    const service = serviceById.get(request.serviceId);
    if (!service) {
      const err = new Error(`Received invalid serviceId: "${request.serviceId}"`);
      server.sendServiceCallFailure(
        {
          op: "serviceCallFailure",
          serviceId: request.serviceId,
          callId: request.callId,
          message: err.message,
        },
        clientConnection,
      );
      throw err;
    }
    if (service.request!.encoding !== request.encoding) {
      const err = new Error(
        `Service ${service.name} called with invalid message encoding. Expected ${
          service.request!.encoding
        }, got ${request.encoding}`,
      );
      server.sendServiceCallFailure(
        {
          op: "serviceCallFailure",
          serviceId: request.serviceId,
          callId: request.callId,
          message: err.message,
        },
        clientConnection,
      );
      throw err;
    }

    log("Received service call request with %d bytes", request.data.byteLength);

    const responseMsg = {
      success: true,
      message: `Service ${service.name} successfully called`,
    };
    let responseData = new Uint8Array();
    if (request.encoding === "json") {
      responseData = new Uint8Array(Buffer.from(JSON.stringify(responseMsg)));
    } else {
      const definitions = [
        { name: "success", type: "bool" },
        { name: "message", type: "string" },
      ];
      const writer = new Ros1MessageWriter([{ definitions }]);
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
  .description("advertises a ROS1 and JSON SetBool service that can be called")
  .action(main);
