#!/usr/bin/env node
import path from "path";
import protobufjs from "protobufjs";
import { FileDescriptorSet } from "protobufjs/ext/descriptor";
import WebSocket from "ws";

import { SubscriptionId } from "../src";
import FoxgloveClient from "../src/FoxgloveClient";

async function main() {
  const [, , host, topic] = process.argv;
  if (!host || !topic) {
    throw new Error(`Usage: ${path.basename(__filename)} [host] [topic]`);
  }
  const client = new FoxgloveClient({
    ws: new WebSocket(`ws://${host}:8765`, [FoxgloveClient.SUPPORTED_SUBPROTOCOL]),
  });
  const deserializers = new Map<SubscriptionId, (data: DataView) => unknown>();
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

main().catch(console.error);
