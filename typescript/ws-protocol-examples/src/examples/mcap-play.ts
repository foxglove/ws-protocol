import decompressLZ4 from "@foxglove/wasm-lz4";
import * as Zstd from "@foxglove/wasm-zstd";
import { FoxgloveServer } from "@foxglove/ws-protocol";
import { McapIndexedReader, McapTypes } from "@mcap/core";
import { Command } from "commander";
import Debug from "debug";
import fs from "fs/promises";
import { WebSocketServer } from "ws";

import { setupSigintHandler } from "./util/setupSigintHandler";
import boxen from "../boxen";

const log = Debug("foxglove:mcap-play");
Debug.enable("foxglove:*");

// eslint-disable-next-line @typescript-eslint/promise-function-async
function delay(durationMs: number) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

let cachedDecompressHandlers: McapTypes.DecompressHandlers | undefined;
async function getDecompressHandlers(): Promise<McapTypes.DecompressHandlers> {
  if (cachedDecompressHandlers) {
    return cachedDecompressHandlers;
  }

  await decompressLZ4.isLoaded;
  await Zstd.isLoaded;

  cachedDecompressHandlers = {
    lz4: (buffer, decompressedSize) => decompressLZ4(buffer, Number(decompressedSize)),
    zstd: (buffer, decompressedSize) => Zstd.decompress(buffer, Number(decompressedSize)),
  };
  return cachedDecompressHandlers;
}

function readableFromFileHandle(handle: fs.FileHandle): McapTypes.IReadable {
  let buffer = new ArrayBuffer(4096);
  return {
    async size() {
      return BigInt((await handle.stat()).size);
    },
    async read(offset, length) {
      if (offset > Number.MAX_SAFE_INTEGER || length > Number.MAX_SAFE_INTEGER) {
        throw new Error(`Read too large: offset ${offset}, length ${length}`);
      }
      if (length > buffer.byteLength) {
        buffer = new ArrayBuffer(Number(length * 2n));
      }
      const result = await handle.read({
        buffer: new DataView(buffer, 0, Number(length)),
        position: Number(offset),
      });
      if (result.bytesRead !== Number(length)) {
        throw new Error(
          `Read only ${result.bytesRead} bytes from offset ${offset}, expected ${length}`,
        );
      }
      return new Uint8Array(result.buffer.buffer, result.buffer.byteOffset, result.bytesRead);
    },
  };
}

async function* readMcapFile(filePath: string): AsyncIterable<McapTypes.TypedMcapRecord> {
  const decompressHandlers = await getDecompressHandlers();
  const handle = await fs.open(filePath, "r");
  try {
    const reader = await McapIndexedReader.Initialize({
      readable: readableFromFileHandle(handle),
      decompressHandlers,
    });
    for (const schema of reader.schemasById.values()) {
      yield schema;
    }
    for (const channel of reader.channelsById.values()) {
      yield channel;
    }
    for await (const message of reader.readMessages()) {
      yield message;
    }
  } catch (err) {
    throw new Error(`Unable to read file as indexed: ${(err as Error).toString()}`);
  } finally {
    await handle.close();
  }
}

type McapChannelId = number & { __brand: "McapChannelId" };
type WsChannelId = number & { __brand: "WsChannelId" };

async function main(file: string, options: { loop: boolean; rate: number }): Promise<void> {
  const server = new FoxgloveServer({ name: file });
  const port = 8765;
  const ws = new WebSocketServer({
    port,
    handleProtocols: (protocols) => server.handleProtocols(protocols),
  });
  const signal = setupSigintHandler(log, ws);

  const schemasById = new Map<number, McapTypes.Schema>();
  const mcapChannelsByWsChannel = new Map<WsChannelId, McapChannelId>();
  const wsChannelsByMcapChannel = new Map<McapChannelId, WsChannelId>();
  const subscribedChannels = new Set<WsChannelId>();

  let running = false;
  const runLoop = async () => {
    let firstIteration = true;
    outer: do {
      log("starting playback");
      let currentTime: bigint | undefined;
      for await (const record of readMcapFile(file)) {
        if (!running || signal.aborted) {
          break outer;
        }
        switch (record.type) {
          case "Schema":
            if (!firstIteration) {
              break;
            }
            schemasById.set(record.id, record);
            break;
          case "Channel": {
            if (!firstIteration) {
              break;
            }
            const schema = schemasById.get(record.schemaId);
            if (!schema) {
              log("Channel %d has unknown schema %d", record.id, record.schemaId);
              break;
            }
            const wsChannelId = server.addChannel({
              topic: record.topic,
              schemaName: schema.name,
              encoding: record.messageEncoding,
              schema:
                schema.encoding === "protobuf"
                  ? Buffer.from(schema.data).toString("base64")
                  : new TextDecoder().decode(schema.data),
            }) as WsChannelId;
            mcapChannelsByWsChannel.set(wsChannelId, record.id as McapChannelId);
            wsChannelsByMcapChannel.set(record.id as McapChannelId, wsChannelId);
            break;
          }
          case "Message": {
            const wsChannelId = wsChannelsByMcapChannel.get(record.channelId as McapChannelId);
            if (wsChannelId == undefined) {
              log("Message on unknown channel %d", record.channelId);
              break;
            }
            if (currentTime != undefined) {
              const msToWait = Number(record.logTime - currentTime) / 1_000_000 / options.rate;
              if (msToWait > 1) {
                await delay(msToWait);
              }
            }
            currentTime = record.logTime;
            if (subscribedChannels.has(wsChannelId)) {
              server.sendMessage(wsChannelId, record.logTime, record.data);
            }
            break;
          }

          default:
            log("Unexpected record type %s", record.type);
            break;
        }
      }
      firstIteration = false;
    } while (options.loop);

    log("done!");
    process.exit(0);
  };

  ws.on("listening", () => {
    void boxen(
      `📡 Server listening on localhost:${port}. To see data, visit:\n` +
        `https://studio.foxglove.dev/?ds=foxglove-websocket&ds.url=ws://localhost:${port}/`,
      { borderStyle: "round", padding: 1 },
    )
      .then(log)
      .then(() => {
        log("Waiting for client connection...");
      });
  });
  ws.on("connection", (conn, req) => {
    const name = `${req.socket.remoteAddress!}:${req.socket.remotePort!}`;
    log("connection from %s via %s", name, req.url);
    server.handleConnection(conn, name);
    if (!running) {
      running = true;
      void runLoop();
    }
    conn.on("close", () => {
      log("client %s disconnected");
    });
  });
  server.on("subscribe", (chanId) => {
    subscribedChannels.add(chanId as WsChannelId);
  });
  server.on("unsubscribe", (chanId) => {
    subscribedChannels.delete(chanId as WsChannelId);
  });
  server.on("error", (err) => {
    log("server error: %o", err);
  });
}

export default new Command("mcap-play")
  .description("play an MCAP file over a WebSocket client in real time")
  .argument("<file>", "path to MCAP file")
  .option("--loop", "automatically restart playback from the beginning", false)
  .option(
    "--rate <rate>",
    "playback rate as a multiple of realtime",
    (val) => {
      const result = parseFloat(val);
      if (result <= 0 || !isFinite(result)) {
        throw new Error(`Invalid rate: ${val}`);
      }
      return result;
    },
    1,
  )
  .action(main);
