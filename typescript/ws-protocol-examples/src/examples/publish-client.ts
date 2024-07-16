import { MessageWriter as Ros1MessageWriter } from "@foxglove/rosmsg-serialization";
import { MessageWriter as Ros2MessageWriter } from "@foxglove/rosmsg2-serialization";
import { FoxgloveClient } from "@foxglove/ws-protocol";
import { Command, Option } from "commander";
import Debug from "debug";
import WebSocket from "ws";

const log = Debug("foxglove:publish-client");
Debug.enable("foxglove:*");

let running = true;

process.on("SIGINT", () => {
  running = false;
});

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

  client.on("open", () => {
    (async () => {
      if (args.encoding === "json") {
        await sendJsonMessages(client);
      } else if (args.encoding === "ros1") {
        await sendRos1Messages(client);
      } else {
        await sendRos2Messages(client);
      }

      client.close();
    })().catch((error: unknown) => {
      console.error(error);
    });
  });
}

async function sendJsonMessages(client: FoxgloveClient) {
  const channelId = client.advertise({
    topic: "/chatter",
    encoding: "json",
    schemaName: "std_msgs/String",
  });
  while (running) {
    const data = `hello world ${Date.now()}`;
    const message = new Uint8Array(Buffer.from(JSON.stringify({ data })));
    client.sendMessage(channelId, message);
    await delay(1000);
  }
}

async function sendRos1Messages(client: FoxgloveClient) {
  const channelId = client.advertise({
    topic: "/chatter",
    encoding: "ros1",
    schemaName: "std_msgs/String",
  });
  const writer = new Ros1MessageWriter([{ definitions: [{ name: "data", type: "string" }] }]);
  while (running) {
    const data = `hello world ${Date.now()}`;
    const message = writer.writeMessage({ data });
    client.sendMessage(channelId, message);
    await delay(1000);
  }
}

async function sendRos2Messages(client: FoxgloveClient) {
  const channelId = client.advertise({
    topic: "/chatter",
    encoding: "cdr",
    schemaName: "std_msgs/msg/String",
  });
  const writer = new Ros2MessageWriter([{ definitions: [{ name: "data", type: "string" }] }]);
  while (running) {
    const data = `hello world ${Date.now()}`;
    const message = writer.writeMessage({ data });
    client.sendMessage(channelId, message);
    await delay(1000);
  }
}

// eslint-disable-next-line @typescript-eslint/promise-function-async
function delay(durationMs: number) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

export default new Command("publish-client")
  .description("connect to a server, advertise a channel, and publish to it")
  .addOption(
    new Option("-e, --encoding <encoding>", "message encoding")
      .choices(["json", "ros1", "cdr"])
      .default("json"),
  )
  .argument("[url]", "ws(s)://host:port", "ws://localhost:8765")
  .action(main);
