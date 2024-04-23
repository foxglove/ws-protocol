import { MessageWriter as Ros1MessageWriter } from "@foxglove/rosmsg-serialization";
import { MessageWriter as Ros2MessageWriter } from "@foxglove/rosmsg2-serialization";
import { FoxgloveClient } from "@foxglove/ws-protocol";
import { Command } from "commander";
import Debug from "debug";
import WebSocket from "ws";

const log = Debug("foxglove:service-client");
Debug.enable("foxglove:*");

const SUPPORTED_MSG_ENCODINGS = ["json", "ros1", "cdr"];

async function main(url: string) {
  const address = url.startsWith("ws://") || url.startsWith("wss://") ? url : `ws://${url}`;
  let fallbackMsgEncoding: string | undefined;

  log(`Client connecting to ${address}`);
  const client = new FoxgloveClient({
    ws: new WebSocket(address, [FoxgloveClient.SUPPORTED_SUBPROTOCOL]),
  });
  client.on("error", (error) => {
    log("Error", error);
    throw error;
  });
  client.on("serverInfo", (serverInfo) => {
    const supportedEncodings = serverInfo.supportedEncodings ?? [];
    fallbackMsgEncoding = supportedEncodings.find((encoding) =>
      SUPPORTED_MSG_ENCODINGS.includes(encoding),
    );
  });
  client.on("advertiseServices", (services) => {
    const service = services.find((s) => /std_srvs(\/srv)?\/SetBool/.test(s.type));
    if (!service) {
      return;
    }

    const msgEncoding = service.request?.encoding ?? fallbackMsgEncoding;
    if (msgEncoding == undefined) {
      const supportedEndingsStr = SUPPORTED_MSG_ENCODINGS.join(", ");
      throw new Error(
        `Unable to call service ${service.name}: No supported message encoding found. Supported encodings: [${supportedEndingsStr}]`,
      );
    }

    let requestData: Uint8Array = new Uint8Array();
    if (msgEncoding === "json") {
      requestData = new Uint8Array(Buffer.from(JSON.stringify({ data: true })));
    } else if (msgEncoding === "ros1") {
      const writer = new Ros1MessageWriter([{ definitions: [{ name: "data", type: "bool" }] }]);
      requestData = writer.writeMessage({ data: true });
    } else {
      const writer = new Ros2MessageWriter([{ definitions: [{ name: "data", type: "bool" }] }]);
      requestData = writer.writeMessage({ data: true });
    }

    client.sendServiceCallRequest({
      serviceId: service.id,
      callId: 123,
      encoding: msgEncoding,
      data: new DataView(requestData.buffer),
    });
  });

  client.on("serviceCallResponse", (response) => {
    if (response.encoding === "json") {
      const responseData = new TextDecoder().decode(response.data);
      console.log(JSON.parse(responseData));
    } else if (response.encoding === "ros1") {
      console.log(response);
    } else if (response.encoding === "cdr") {
      console.log(response);
    }

    client.close();
  });

  client.on("serviceCallFailure", (event) => {
    console.error(`Failed to call service ${event.serviceId}: ${event.message}`);
    client.close();
  });
}

export default new Command("service-client")
  .description("connect to a server and call the first advertised SetBool service")
  .argument("[url]", "ws(s)://host:port", "ws://localhost:8765")
  .action(main);
