import { Debugger } from "debug";
import { WebSocketServer, WebSocket } from "ws";

/**
 * Helper to set up a SIGINT handler that shuts down the server. It also closes each of the server's
 * open clients, because if we don't, the server keeps running until active clients disconnect.
 */
export function setupSigintHandler(log: Debugger, ws: WebSocketServer): AbortSignal {
  const controller = new AbortController();
  const clientNames = new WeakMap<WebSocket, string>();
  ws.on("connection", (conn, req) => {
    const name = `${req.socket.remoteAddress!}:${req.socket.remotePort!}`;
    clientNames.set(conn, name);
  });
  process.on("SIGINT", () => {
    log("shutting down...");
    controller.abort();

    ws.close((err) => {
      if (err) {
        log("error shutting down", err);
      } else {
        log("server stopped");
      }
    });

    for (const client of ws.clients) {
      log("closing", clientNames.get(client) ?? "unknown");
      client.close();
    }
  });
  return controller.signal;
}
