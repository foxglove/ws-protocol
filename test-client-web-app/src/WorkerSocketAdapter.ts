// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { IWebSocket } from "@foxglove/ws-protocol";

export type ToWorkerMessage =
  | { type: "open"; data: { wsUrl: string; protocols?: string[] | string } }
  | { type: "close"; data: undefined }
  | { type: "data"; data: string | ArrayBuffer | ArrayBufferView };

export type FromWorkerMessage =
  | { type: "open"; protocol: string }
  | { type: "close"; data: unknown }
  | { type: "error"; error: unknown }
  | { type: "message"; data: unknown };

export default class WorkerSocketAdapter implements IWebSocket {
  #worker: Worker;
  #connectionClosed = false;
  public binaryType = "";
  public protocol = "";
  public onerror: ((event: unknown) => void) | undefined = undefined;
  public onopen: ((event: unknown) => void) | undefined = undefined;
  public onclose: ((event: unknown) => void) | undefined = undefined;
  public onmessage: ((event: unknown) => void) | undefined = undefined;

  public constructor(wsUrl: string, protocols?: string[] | string) {
    this.#worker = new Worker(new URL("./worker.js", import.meta.url));
    this.#sendToWorker({ type: "open", data: { wsUrl, protocols } });

    this.#worker.onerror = (ev) => {
      if (this.onerror) {
        this.onerror(ev);
      }
    };

    this.#worker.onmessage = (event: MessageEvent<FromWorkerMessage>) => {
      switch (event.data.type) {
        case "open":
          if (this.onopen) {
            this.protocol = event.data.protocol;
            this.onopen(event.data);
          }
          break;
        case "close":
          // websocket connection got closed, we can terminate the worker
          this.#connectionClosed = true;
          this.#worker.terminate();

          if (this.onclose) {
            this.onclose(event.data);
          }
          break;
        case "error":
          if (this.onerror) {
            this.onerror(event.data);
          }
          break;
        case "message":
          if (this.onmessage) {
            this.onmessage(event.data);
          }
          break;
      }
    };
  }

  public close(): void {
    if (!this.#connectionClosed) {
      this.#sendToWorker({
        type: "close",
        data: undefined,
      });
    }
  }

  public send(data: string | ArrayBuffer | ArrayBufferView): void {
    this.#sendToWorker({ type: "data", data });
  }

  #sendToWorker(msg: ToWorkerMessage): void {
    if (this.#connectionClosed) {
      throw Error("Can't send message over closed websocket connection");
    }
    this.#worker.postMessage(msg);
  }
}
