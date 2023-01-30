import { MessageWriter as Ros1MessageWriter } from "@foxglove/rosmsg-serialization";
import { MessageWriter as Ros2MessageWriter } from "@foxglove/rosmsg2-serialization";
import { FoxgloveClient } from "@foxglove/ws-protocol";
import { Command, Option } from "commander";
import Debug from "debug";
import WebSocket from "ws";

const log = Debug("foxglove:service-client");
Debug.enable("foxglove:*");

async function main(url: string, args: { encoding: "json" | "ros1" | "cdr" }) {
  const address = url.startsWith("ws://") || url.startsWith("wss://") ? url : `ws://${url}`;
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
    if (!supportedEncodings.includes(args.encoding)) {
      log(
        "Error",
        "Chosen encoding is not supported by the server. Server only supports the following encodings: ",
        supportedEncodings,
      );
      client.close();
    }
  });
  client.on("advertiseServices", (services) => {
    const service = services.find((s) => /std_srvs(\/srv)?\/SetBool/.test(s.type));
    if (!service) {
      return;
    }

    let requestData: Uint8Array = new Uint8Array();
    if (args.encoding === "json") {
      requestData = new Uint8Array(Buffer.from(JSON.stringify({ data: true })));
    } else if (args.encoding === "ros1") {
      const writer = new Ros1MessageWriter([{ definitions: [{ name: "data", type: "bool" }] }]);
      requestData = writer.writeMessage({ data: true });
    } else if (args.encoding === "cdr") {
      const writer = new Ros2MessageWriter([{ definitions: [{ name: "data", type: "bool" }] }]);
      requestData = writer.writeMessage({ data: true });
    }

    client.sendServiceCallRequest({
      serviceId: service.id,
      callId: 123,
      encoding: args.encoding,
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
}

export default new Command("service-client")
  .description("connect to a server and call the first advertised SetBool service")
  .addOption(
    new Option("-e, --encoding <encoding>", "message encoding")
      .choices(["json", "ros1", "cdr"])
      .default("json"),
  )
  .argument("[url]", "ws(s)://host:port", "ws://localhost:8765")
  .action(main);
