import * as Zstd from "@foxglove/wasm-zstd";
import { FoxgloveClient } from "@foxglove/ws-protocol";
import { IWritable, McapWriter } from "@mcap/core";
import { Command } from "commander";
import Debug from "debug";
import fs, { FileHandle } from "fs/promises";
import path from "path";
import { WebSocket } from "ws";

const log = Debug("foxglove:mcap-record");
Debug.enable("foxglove:*");

type McapChannelId = number & { __brand: "McapChannelId" };
type WsChannelId = number & { __brand: "WsChannelId" };
type SubscriptionId = number & { __brand: "SubscriptionId" };

// Mcap IWritable interface for nodejs FileHandle
class FileHandleWritable implements IWritable {
  private handle: FileHandle;
  private totalBytesWritten = 0;

  constructor(handle: FileHandle) {
    this.handle = handle;
  }

  async write(buffer: Uint8Array): Promise<void> {
    const written = await this.handle.write(buffer);
    this.totalBytesWritten += written.bytesWritten;
  }

  position(): bigint {
    return BigInt(this.totalBytesWritten);
  }
}

// eslint-disable-next-line @typescript-eslint/promise-function-async
function delay(durationMs: number) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

async function waitForServer(
  address: string,
  signal: AbortSignal,
): Promise<FoxgloveClient | undefined> {
  log("connecting to %s", address);
  while (!signal.aborted) {
    const maybeClient = await new Promise<FoxgloveClient | undefined>((resolve) => {
      const ws = new WebSocket(address, [FoxgloveClient.SUPPORTED_SUBPROTOCOL]);
      const client = new FoxgloveClient({ ws });
      const onClose = (event: CloseEvent) => {
        log(
          "connection failed, code=%s reason=%s wasClean=%s",
          event.code,
          event.reason,
          event.wasClean,
        );
        resolve(undefined);
      };
      client.on("close", onClose);
      client.on("open", () => {
        client.off("close", onClose);
        signal.addEventListener("abort", () => {
          client.close();
        });
        resolve(client);
      });
    });
    if (maybeClient) {
      return maybeClient;
    }
    log("trying again in 5 seconds...");
    await delay(5000);
  }
  return undefined;
}

async function main(address: string, options: { output: string }): Promise<void> {
  await Zstd.isLoaded;
  await fs.mkdir(path.dirname(options.output), { recursive: true });
  const fileHandle = await fs.open(options.output, "w");
  const fileHandleWritable = new FileHandleWritable(fileHandle);
  const textEncoder = new TextEncoder();

  const writer = new McapWriter({
    writable: fileHandleWritable,
    compressChunk: (data) => ({
      compression: "zstd",
      compressedData: Zstd.compress(data, 19),
    }),
  });

  await writer.start({
    profile: "",
    library: "mcap-record",
  });

  const controller = new AbortController();
  process.on("SIGINT", () => {
    log("shutting down...");
    controller.abort();
  });

  try {
    const client = await waitForServer(address, controller.signal);
    if (!client) {
      return;
    }
    await new Promise<void>((resolve) => {
      const wsChannelsByMcapChannel = new Map<McapChannelId, WsChannelId>();
      const subscriptionsById = new Map<
        SubscriptionId,
        { messageCount: number; mcapChannelId: McapChannelId }
      >();

      client.on("serverInfo", (event) => {
        log(event);
      });
      client.on("status", (event) => {
        log(event);
      });
      client.on("error", (err) => {
        log("server error: %o", err);
      });

      client.on("advertise", (newChannels) => {
        void Promise.all(
          newChannels.map(async (channel) => {
            let schemaEncoding = channel.schemaEncoding;
            if (schemaEncoding == undefined) {
              schemaEncoding = {
                json: "jsonschema",
                protobuf: "protobuf",
                flatbuffer: "flatbuffer",
                ros1: "ros1msg",
                ros2: "ros2msg",
              }[channel.encoding];
              if (schemaEncoding == undefined) {
                log(
                  "unable to infer schema encoding from message encoding %s on topic %s, messages will be recorded without schema",
                  channel.encoding,
                  channel.topic,
                );
              }
            }
            let schemaData: Uint8Array | undefined;
            switch (schemaEncoding) {
              case "jsonschema":
              case "ros1msg":
              case "ros2msg":
                schemaData = textEncoder.encode(channel.schema);
                break;
              case "protobuf":
              case "flatbuffer":
                schemaData = Buffer.from(channel.schema, "base64");
                break;
              default:
                log(
                  "unknown schema encoding %s, messages will be recorded without schema",
                  schemaEncoding,
                );
                break;
              case undefined:
                break;
            }
            const schemaId =
              schemaData != undefined && schemaEncoding != undefined
                ? await writer.registerSchema({
                    name: channel.schemaName,
                    encoding: schemaEncoding,
                    data: schemaData,
                  })
                : 0;
            const mcapChannelId = (await writer.registerChannel({
              schemaId,
              topic: channel.topic,
              messageEncoding: channel.encoding,
              metadata: new Map(),
            })) as McapChannelId;
            wsChannelsByMcapChannel.set(mcapChannelId, channel.id as WsChannelId);

            log("subscribing to %s", channel.topic);
            const subscriptionId = client.subscribe(channel.id) as SubscriptionId;
            subscriptionsById.set(subscriptionId, { messageCount: 0, mcapChannelId });
          }),
        );
      });
      client.on("message", (event) => {
        const subscription = subscriptionsById.get(event.subscriptionId as SubscriptionId);
        if (subscription == undefined) {
          log("received message for unknown subscription %s", event.subscriptionId);
          return;
        }
        void writer.addMessage({
          channelId: subscription.mcapChannelId,
          sequence: subscription.messageCount++,
          logTime: BigInt(Date.now()) * 1_000_000n,
          publishTime: event.timestamp,
          data: new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength),
        });
      });

      client.on("close", (event) => {
        log(
          "server disconnected, code=%s reason=%s wasClean=%s",
          event.code,
          event.reason,
          event.wasClean,
        );
        resolve();
      });
    });
  } finally {
    await writer.end();
  }
}

export default new Command("mcap-record")
  .description("connect to a WebSocket server and record an MCAP file")
  .argument("<address>", "WebSocket address, e.g. ws://localhost:8765")
  .option("-o, --output <file>", "path to write MCAP file")
  .action(main);
