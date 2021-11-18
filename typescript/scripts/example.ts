import path from "path";
import protobufjs from "protobufjs";
import { FileDescriptorSet } from "protobufjs/ext/descriptor";
import WebSocket from "ws";

import FoxgloveClient from "../src/FoxgloveClient";

async function main() {
  const [, , host, topic] = process.argv;
  if (!host || !topic) {
    throw new Error(`Usage: ${path.basename(__filename)} [host] [topic]`);
  }
  const client = new FoxgloveClient({
    ws: new WebSocket(`ws://${host}:8765`, [FoxgloveClient.SUPPORTED_SUBPROTOCOL]),
    createDeserializer: (channel) => {
      if (channel.encoding !== "protobuf") {
        throw new Error(`Unsupported encoding ${channel.encoding}`);
      }
      const root = protobufjs.Root.fromDescriptor(FileDescriptorSet.decode(channel.schema));
      const type = root.lookupType(channel.schemaName);
      return (data) => type.decode(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
    },
  });
  client.on("message", console.log);
  client.subscribe(topic);
}

main().catch(console.error);
