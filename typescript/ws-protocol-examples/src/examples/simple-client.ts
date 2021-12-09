import { FoxgloveClient, SubscriptionId } from "@foxglove/ws-protocol";
import { Command } from "commander";
import protobufjs from "protobufjs";
import { FileDescriptorSet } from "protobufjs/ext/descriptor";
import WebSocket from "ws";

async function main(host: string) {
  const client = new FoxgloveClient({
    ws: new WebSocket(`ws://${host}`, [FoxgloveClient.SUPPORTED_SUBPROTOCOL]),
  });
  const deserializers = new Map<SubscriptionId, (data: DataView) => unknown>();
  client.on("error", (error) => {
    throw error;
  });
  client.on("advertise", (channels) => {
    for (const channel of channels) {
      if (channel.encoding !== "protobuf") {
        console.warn(`Unsupported encoding ${channel.encoding}`);
      }
      const root = protobufjs.Root.fromDescriptor(
        FileDescriptorSet.decode(Buffer.from(channel.schema, "base64")),
      );
      const type = root.lookupType(channel.schemaName);

      const subId = client.subscribe(channel.id);
      deserializers.set(subId, (data) =>
        type.decode(new Uint8Array(data.buffer, data.byteOffset, data.byteLength)),
      );
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
  .argument("[host]", "host:port", "localhost:8765")
  .action(main);
