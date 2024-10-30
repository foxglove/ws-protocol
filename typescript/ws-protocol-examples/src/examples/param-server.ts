import { FoxgloveServer, Parameter, ServerCapability } from "@foxglove/ws-protocol";
import { Command } from "commander";
import Debug from "debug";
import { WebSocketServer } from "ws";

import boxen from "../boxen";
import { setupSigintHandler } from "./util/setupSigintHandler";

const log = Debug("foxglove:param-server");
Debug.enable("foxglove:*");

async function main(): Promise<void> {
  const server = new FoxgloveServer({
    name: "param-server",
    capabilities: [ServerCapability.parameters, ServerCapability.parametersSubscribe],
  });
  const port = 8765;
  const ws = new WebSocketServer({
    port,
    handleProtocols: (protocols) => server.handleProtocols(protocols),
  });
  setupSigintHandler(log, ws);

  const paramStore = new Map<Parameter["name"], Parameter["value"]>([
    ["/foo/bool_param", true],
    ["/foo/int_param", 123],
    ["/foo/float_param", 4.56],
    ["/foo/string_param", "hello"],
    ["/foo/int_list_param", [1, 2, 3]],
  ]);

  ws.on("listening", () => {
    void boxen(
      `📡 Server listening on localhost:${port}. To see data, visit:\n` +
        `https://app.foxglove.dev/~/view?ds=foxglove-websocket&ds.url=ws://localhost:${port}/`,
      { borderStyle: "round", padding: 1 },
    ).then(log);
  });
  ws.on("connection", (conn, req) => {
    const name = `${req.socket.remoteAddress!}:${req.socket.remotePort!}`;
    log("connection from %s via %s", name, req.url);
    server.handleConnection(conn, name);
  });
  server.on("getParameters", ({ parameterNames, id }, clientConnection) => {
    if (parameterNames.length > 0) {
      log("Received a request to retrieve %d parameters.", parameterNames.length);
      const filteredParams = Array.from(paramStore.entries())
        .filter(([name]) => parameterNames.includes(name))
        .map(([name, value]) => ({ name, value }));
      server.publishParameterValues(filteredParams, id, clientConnection);
    } else {
      log("Received a request to retrieve all available parameters.");
      const allParams = Array.from(paramStore.entries()).map(([name, value]) => ({ name, value }));
      server.publishParameterValues(allParams, id, clientConnection);
    }
  });
  server.on("setParameters", ({ parameters, id }, clientConnection) => {
    log("Received a request to set %d parameters.", parameters.length);
    parameters.forEach((p) => paramStore.set(p.name, p.value));
    server.updateParameterValues(parameters);

    if (id) {
      // Send updated parameters to client
      const params = Array.from(paramStore.entries())
        .filter(([name]) => parameters.find((p) => p.name === name))
        .map(([name, value]) => ({ name, value }));
      server.publishParameterValues(params, id, clientConnection);
    }
  });
  server.on("error", (err) => {
    log("server error: %o", err);
  });
}

export default new Command("param-server")
  .description("holds a parameter store that can be queried and modified")
  .action(main);
