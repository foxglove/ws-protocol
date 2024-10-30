import { FoxgloveServer } from "@foxglove/ws-protocol";
import { Command } from "commander";
import Debug from "debug";
import os from "os";
import { WebSocketServer } from "ws";

import boxen from "../boxen";
import { setupSigintHandler } from "./util/setupSigintHandler";

const log = Debug("foxglove:sysmon");
Debug.enable("foxglove:*");

// eslint-disable-next-line @typescript-eslint/promise-function-async
function delay(durationSec: number) {
  return new Promise((resolve) => setTimeout(resolve, durationSec * 1000));
}

type Stats = {
  hostname: string;
  platform: string;
  type: string;
  arch: string;
  version: string;
  release: string;
  endianness: string;
  uptime: number;
  freemem: number;
  totalmem: number;
  cpus: (os.CpuInfo & { usage: number })[];
  total_cpu_usage: number;
  loadavg: number[];
  networkInterfaces: (os.NetworkInterfaceInfo & { name: string })[];
};
function getStats(prevStats: Stats | undefined): Stats {
  let cpuTotal = 0;
  let idleTotal = 0;
  const cpus: Stats["cpus"] = [];
  os.cpus().forEach((cpu, i) => {
    const total = cpu.times.idle + cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.irq;
    let usage = 0;
    const prevTimes = prevStats?.cpus[i]?.times;
    if (prevTimes) {
      const prevTotal =
        prevTimes.idle + prevTimes.user + prevTimes.nice + prevTimes.sys + prevTimes.irq;
      cpuTotal += total - prevTotal;
      idleTotal += cpu.times.idle - prevTimes.idle;
      usage = 1 - (cpu.times.idle - prevTimes.idle) / (total - prevTotal);
    }
    cpus.push({ ...cpu, usage });
  });
  const networkInterfaces: Stats["networkInterfaces"] = [];
  for (const [name, ifaces] of Object.entries(os.networkInterfaces())) {
    if (ifaces) {
      networkInterfaces.push(...ifaces.map((iface) => ({ name, ...iface })));
    }
  }
  return {
    hostname: os.hostname(),
    platform: os.platform(),
    type: os.type(),
    arch: os.arch(),
    version: os.version(),
    release: os.release(),
    endianness: os.endianness(),
    uptime: os.uptime(),
    freemem: os.freemem(),
    totalmem: os.totalmem(),
    cpus,
    total_cpu_usage: 1 - idleTotal / cpuTotal,
    loadavg: os.loadavg(),
    networkInterfaces,
  };
}

async function main() {
  const server = new FoxgloveServer({ name: "sysmon" });
  const port = 8765;
  const ws = new WebSocketServer({
    port,
    handleProtocols: (protocols) => server.handleProtocols(protocols),
  });
  setupSigintHandler(log, ws);
  ws.on("listening", () => {
    void boxen(
      `📡 Server listening on localhost:${port}. To see data, visit:\n` +
        `https://app.foxglove.dev/~/view?ds=foxglove-websocket&ds.url=ws://localhost:${port}/`,
      { borderStyle: "round", padding: 1 },
    ).then(log);
  });
  ws.on("connection", (conn, req) => {
    const name = `${req.socket.remoteAddress!}:${req.socket.remotePort!}`;
    server.handleConnection(conn, name);
  });

  const ch1 = server.addChannel({
    topic: "system_stats",
    encoding: "json",
    schemaName: "Stats",
    schema: JSON.stringify({
      type: "object",
      properties: {
        hostname: { type: "string" },
        platform: { type: "string" },
        type: { type: "string" },
        arch: { type: "string" },
        version: { type: "string" },
        release: { type: "string" },
        endianness: { type: "string" },
        uptime: { type: "number" },
        freemem: { type: "number" },
        totalmem: { type: "number" },
        cpus: {
          type: "array",
          items: {
            type: "object",
            properties: {
              model: { type: "string" },
              speed: { type: "number" },
              usage: { type: "number" },
              times: {
                type: "object",
                properties: {
                  user: { type: "number" },
                  nice: { type: "number" },
                  sys: { type: "number" },
                  idle: { type: "number" },
                  irq: { type: "number" },
                },
              },
            },
          },
        },
        total_cpu_usage: { type: "number" },
        loadavg: { type: "array", items: { type: "number" } },
        networkInterfaces: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              family: { type: "string" },
              address: { type: "string" },
              netmask: { type: "string" },
              mac: { type: "string" },
              internal: { type: "boolean" },
              cidr: { type: "string" },
              scopeid: { type: "number" },
            },
          },
        },
      },
    }),
  });

  const textEncoder = new TextEncoder();
  const INTERVAL_SEC = 0.5;
  let controller: AbortController | undefined;

  server.on("subscribe", (_chanId) => {
    log("starting monitor");
    if (controller) {
      controller.abort();
      throw new Error("already running");
    }
    controller = new AbortController();
    void (async function (signal) {
      let lastStats: Stats | undefined;
      while (!signal.aborted) {
        const now = BigInt(Date.now()) * 1_000_000n;
        lastStats = getStats(lastStats);
        server.sendMessage(ch1, now, textEncoder.encode(JSON.stringify(lastStats)));
        await delay(INTERVAL_SEC);
      }
    })(controller.signal);
  });
  server.on("unsubscribe", (_chanId) => {
    log("stopping monitor");
    controller?.abort();
    controller = undefined;
  });
  server.on("error", (err) => {
    log("server error: %o", err);
  });
}

export default new Command("sysmon")
  .description("publish CPU, memory, and network info")
  .action(main);
