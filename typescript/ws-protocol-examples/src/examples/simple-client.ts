import { FoxgloveClient, SubscriptionId } from "@foxglove/ws-protocol";
import { Command } from "commander";
import Debug from "debug";
import protobufjs from "protobufjs";
import { FileDescriptorSet } from "protobufjs/ext/descriptor";
import WebSocket from "ws";

const log = Debug("foxglove:simple-client");
Debug.enable("foxglove:*");

async function main(url: string) {
  const address = url.startsWith("ws://") || url.startsWith("wss://") ? url : `ws://${url}`;
  log(`Client connecting to ${address}`);
  const client = new FoxgloveClient({
    ws: new WebSocket(address, [FoxgloveClient.SUPPORTED_SUBPROTOCOL]),
  });
  const deserializers = new Map<SubscriptionId, (data: DataView) => unknown>();
  client.on("error", (error) => {
    log("Error", error);
    throw error;
  });
  client.on("advertise", (channels) => {
    for (const channel of channels) {
      if (channel.encoding === "json") {
        const textDecoder = new TextDecoder();
        const subId = client.subscribe(channel.id);
        deserializers.set(subId, (data) => JSON.parse(textDecoder.decode(data)) as unknown);
      } else if (channel.encoding === "protobuf") {
        const root = protobufjs.Root.fromDescriptor(
          FileDescriptorSet.decode(Buffer.from(channel.schema, "base64")),
        );
        const type = root.lookupType(channel.schemaName);

        const subId = client.subscribe(channel.id);
        deserializers.set(subId, (data) =>
          type.decode(new Uint8Array(data.buffer, data.byteOffset, data.byteLength)),
        );
      } else {
        console.warn(`Unsupported encoding ${channel.encoding}`);
      }
    }
  });
  client.on("message", ({ subscriptionId, timestamp, data }) => {
    console.log({
      subscriptionId,
      timestamp,
      data: deserializers.get(subscriptionId)!(data),
    });
  });
}

export default new Command("simple-client")
  .description("connect to a server and subscribe to all messages")
  .argument("[url]", "ws(s)://host:port", "ws://localhost:8765")
  .action(main);
