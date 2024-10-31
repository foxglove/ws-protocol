// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

/* eslint-disable no-undef */
/* eslint no-restricted-globals: 1 */
const send = self.postMessage;
const sendWithTransfer = self.postMessage;

let ws = undefined;

self.onmessage = (event) => {
  const { type, data } = event.data;
  switch (type) {
    case "open":
      try {
        ws = new WebSocket(data.wsUrl, data.protocols);
        ws.binaryType = "arraybuffer";
        ws.onerror = (wsEvent) => {
          send({
            type: "error",
            error: wsEvent.error,
          });
        };
        ws.onopen = (_event) => {
          send({
            type: "open",
            protocol: ws.protocol,
          });
        };
        ws.onclose = (wsEvent) => {
          send({
            type: "close",
            data: JSON.parse(JSON.stringify(wsEvent) ?? "{}"),
          });
        };
        ws.onmessage = (wsEvent) => {
          if (wsEvent.data instanceof ArrayBuffer) {
            sendWithTransfer(
              {
                type: "message",
                data: wsEvent.data,
              },
              [wsEvent.data],
            );
          } else {
            send({
              type: "message",
              data: wsEvent.data,
            });
          }
        };
      } catch (err) {
        // try-catch is needed to catch `Mixed Content` errors in Chrome, where the client
        // attempts to load `ws://` from `https://`. (Safari would catch these in `ws.onerror`
        // but with `undefined` as an error.)
        send({
          type: "error",
          error: err ?? { message: "Insecure WebSocket connection" },
        });
      }
      break;
    case "close":
      ws?.close();
      break;
    case "data":
      ws?.send(data);
      break;
  }
};
