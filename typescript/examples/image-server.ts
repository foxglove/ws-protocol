#!/usr/bin/env node
import { fromNanoSec } from "@foxglove/rostime";
import Debug from "debug";
import * as PImage from "pureimage";
import { Writable } from "stream";
import { WebSocketServer } from "ws";

import FoxgloveServer from "../src/FoxgloveServer";

const log = Debug("foxglove:example-server");
Debug.enable("foxglove:*");

// eslint-disable-next-line @typescript-eslint/promise-function-async
function delay(durationMs: number) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

function drawImage(time: number) {
  const width = 200;
  const height = 150;
  const image = PImage.make(width, height, undefined);
  const ctx = image.getContext("2d");

  ctx.fillStyle = "#eeeeee";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#cc2222";
  ctx.beginPath();
  ctx.arc(width * (0.2 + 0.15 * Math.sin(time * 0.001)), 40, 30, 0, 2 * Math.PI, false);
  ctx.fill();

  ctx.save();
  ctx.fillStyle = "#3344ee";
  ctx.beginPath();
  ctx.translate(width * 0.5, height * 0.7);
  const w = Math.sin(time * 0.001) * 0.1 + 0.4;
  const h = Math.cos(time * 0.001) * 0.1 + 0.3;
  ctx.rect((-width * w) / 2, (-height * h) / 2, width * w, height * h);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.fillStyle = "#22cc44";
  ctx.translate(width * 0.6, height * 0.5);
  ctx.rotate(time * 0.0005);
  ctx.beginPath();
  ctx.moveTo(width * -0.1, height * 0.1);
  ctx.lineTo(width * 0.2, height * 0.2);
  ctx.lineTo(width * 0, height * -0.2);
  ctx.fill();
  ctx.restore();

  return image;
}

async function main() {
  const server = new FoxgloveServer({ name: "example-server" });
  const ws = new WebSocketServer({
    port: 8765,
    handleProtocols: (protocols) => server.handleProtocols(protocols),
  });
  ws.on("listening", () => {
    log("server listening on %s", ws.address());
  });
  ws.on("connection", (conn, req) => {
    const name = `${req.socket.remoteAddress!}:${req.socket.remotePort!}`;
    log("connection from %s via %s", name, req.url);
    server.handleConnection(conn, name);
  });
  server.on("subscribe", (chanId) => {
    log("first client subscribed to %d", chanId);
  });
  server.on("unsubscribe", (chanId) => {
    log("last client unsubscribed from %d", chanId);
  });
  server.on("error", (err) => {
    log("server error: %o", err);
  });

  const ch1 = server.addChannel({
    topic: "foo",
    encoding: "json",
    schemaName: "ros.sensor_msgs.CompressedImage",
    schema: JSON.stringify({
      type: "object",
      properties: {
        header: {
          type: "object",
          properties: {
            stamp: {
              type: "object",
              properties: {
                sec: { type: "integer" },
                nsec: { type: "integer" },
              },
            },
          },
        },
        encoding: { type: "string" },
        data: { type: "string", contentEncoding: "base64" },
      },
    }),
  });

  const textEncoder = new TextEncoder();
  for (;;) {
    await delay(50);
    const image = drawImage(Date.now());
    const chunks: Buffer[] = [];
    const writable = new Writable();
    // eslint-disable-next-line no-underscore-dangle
    writable._write = (chunk, _encoding, callback) => {
      chunks.push(chunk as Buffer);
      callback();
    };
    await PImage.encodeJPEGToStream(image, writable, 90);
    const now = BigInt(Date.now()) * 1_000_000n;
    server.sendMessage(
      ch1,
      now,
      textEncoder.encode(
        JSON.stringify({
          header: { stamp: fromNanoSec(now) },
          encoding: "jpeg",
          data: Buffer.concat(chunks).toString("base64"),
        }),
      ),
    );
  }
}

main().catch(console.error);
