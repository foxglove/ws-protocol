import { MessageWriter as Ros1MessageWriter } from "@foxglove/rosmsg-serialization";
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

async function main(url: string, args: { encoding: "json" | "ros1" }) {
  const address = url.startsWith("ws://") || url.startsWith("wss://") ? url : `ws://${url}`;
  log(`Client connecting to ${address}`);
  const client = new FoxgloveClient({
    ws: new WebSocket(address, [FoxgloveClient.SUPPORTED_SUBPROTOCOL]),
  });
  client.on("error", (error) => {
    log("Error", error);
    throw error;
  });

  if (args.encoding === "json") {
    await sendJsonMessages(client);
  } else if (args.encoding === "ros1") {
    await sendRos1Messages(client);
  }

  client.close();
}

async function sendJsonMessages(client: FoxgloveClient) {
  const channelId = client.advertise("/chatter", "json", "std_msgs/String");
  while (running) {
    const data = `hello world ${Date.now()}`;
    const message = new Uint8Array(Buffer.from(JSON.stringify({ data })));
    client.sendMessage(channelId, message);
    await delay(1000);
  }
}

async function sendRos1Messages(client: FoxgloveClient) {
  const channelId = client.advertise("/chatter", "ros1", "std_msgs/String");
  const writer = new Ros1MessageWriter([{ definitions: [{ name: "data", type: "string" }] }]);
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
      .choices(["json", "ros1"])
      .default("json"),
  )
  .argument("[url]", "ws(s)://host:port", "ws://localhost:8765")
  .action(main);
