import { EventEmitter, EventNames, EventListener } from "eventemitter3";

import { ChannelId } from ".";
import { parseServerMessage } from "./parse";
import { Channel, ClientMessage, SubscriptionId, ServerMessage, BinaryOpcode } from "./types";

const log = {
  debug: console.debug.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

type EventTypes = {
  open: () => void;
  message: (event: { subscriptionId: SubscriptionId; timestamp: bigint; data: DataView }) => void;
  error: (error: Error) => void;
  advertise: (newChannels: Channel[]) => void;
  unadvertise: (removedChannels: ChannelId[]) => void;
};

/**
 * Abstraction that supports both browser and Node WebSockets.
 */
interface IWebSocket {
  binaryType: string;
  protocol: string;
  onerror: ((event: any) => void) | null | undefined; // eslint-disable-line @typescript-eslint/no-explicit-any
  onopen: ((event: any) => void) | null | undefined; // eslint-disable-line @typescript-eslint/no-explicit-any
  onclose: ((event: any) => void) | null | undefined; // eslint-disable-line @typescript-eslint/no-explicit-any
  onmessage: ((event: any) => void) | null | undefined; // eslint-disable-line @typescript-eslint/no-explicit-any
  close(): void;
  send(data: string | ArrayBuffer | Blob | ArrayBufferView): void;
}

export default class FoxgloveClient {
  static SUPPORTED_SUBPROTOCOL = "foxglove.websocket.v1";

  private emitter = new EventEmitter<EventTypes>();
  private ws: IWebSocket;
  private nextSubscriptionId = 0;

  constructor({ ws }: { ws: IWebSocket }) {
    this.ws = ws;
    this.reconnect();
  }

  on<E extends EventNames<EventTypes>>(name: E, listener: EventListener<EventTypes, E>): void {
    this.emitter.on(name, listener);
  }
  off<E extends EventNames<EventTypes>>(name: E, listener: EventListener<EventTypes, E>): void {
    this.emitter.off(name, listener);
  }

  private reconnect() {
    this.ws.binaryType = "arraybuffer";
    this.ws.onerror = (event) => {
      log.debug("onerror", (event as unknown as { error: Error }).error);
      this.emitter.emit("error", (event as unknown as { error: Error }).error);
    };
    this.ws.onopen = (_event) => {
      log.debug("onopen");
      if (this.ws.protocol !== FoxgloveClient.SUPPORTED_SUBPROTOCOL) {
        throw new Error(
          `Expected subprotocol ${FoxgloveClient.SUPPORTED_SUBPROTOCOL}, got '${this.ws.protocol}'`,
        );
      }
      this.emitter.emit("open");
    };
    this.ws.onmessage = (event: MessageEvent<ArrayBuffer | string>) => {
      let message: ServerMessage;
      if (event.data instanceof ArrayBuffer) {
        message = parseServerMessage(event.data);
      } else {
        message = JSON.parse(event.data) as ServerMessage;
      }
      log.debug("onmessage", message);

      switch (message.op) {
        case "serverInfo":
          log.info("Received server info:", message);
          return;

        case "status":
          log.info("Received status message:", message);
          return;

        case "advertise": {
          this.emitter.emit("advertise", message.channels);
          return;
        }

        case "unadvertise": {
          this.emitter.emit("unadvertise", message.channelIds);
          return;
        }

        case BinaryOpcode.MESSAGE_DATA: {
          this.emitter.emit("message", message);
          return;
        }
      }
      throw new Error(`Unrecognized server opcode: ${(message as { op: number }).op}`);
    };
    this.ws.onclose = (event: CloseEvent) => {
      log.error("onclose", {
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
      });
    };
  }

  close(): void {
    this.ws.close();
  }

  subscribe(channelId: ChannelId): SubscriptionId {
    const id = this.nextSubscriptionId++;
    const subscriptions = [{ id, channelId }];
    this.send({ op: "subscribe", subscriptions });
    return id;
  }

  unsubscribe(subscriptionId: SubscriptionId): void {
    this.send({ op: "unsubscribe", subscriptionIds: [subscriptionId] });
  }

  private send(message: ClientMessage) {
    this.ws.send(JSON.stringify(message));
  }
}
