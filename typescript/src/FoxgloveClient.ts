import { EventEmitter, EventNames, EventListener } from "eventemitter3";

import { parseServerMessage } from "./parse";
import {
  Channel,
  ClientMessage,
  ClientOpcode,
  ClientSubscriptionId,
  ServerMessage,
  ServerOpcode,
  Subscribe,
} from "./types";

const log = {
  debug: console.debug.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

type Deserializer = (data: DataView) => unknown;
type ResolvedSubscription = {
  id: ClientSubscriptionId;
  channel: Channel;
  deserializer: Deserializer;
};

type EventTypes = {
  open: () => void;
  message: (event: {
    topic: string;
    timestamp: bigint;
    message: unknown;
    sizeInBytes: number;
  }) => void;
  error: (error: Error) => void;
  channelListUpdate: (channels: ReadonlyMap<string, Channel>) => void;
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
  static SUPPORTED_SUBPROTOCOL = "x-foxglove-1";

  private emitter = new EventEmitter<EventTypes>();
  private ws!: IWebSocket;
  // private url: string;
  private createDeserializer: (channel: Channel) => Deserializer;
  private nextSubscriptionId = 0;
  private channelsByTopic = new Map<string, Channel>();

  private unresolvedSubscriptions = new Set<string>();
  private resolvedSubscriptionsByTopic = new Map<string, ResolvedSubscription>();
  private resolvedSubscriptionsById = new Map<ClientSubscriptionId, ResolvedSubscription>();

  constructor({
    ws,
    createDeserializer,
  }: {
    ws: IWebSocket;
    createDeserializer: (channel: Channel) => Deserializer;
  }) {
    this.ws = ws;
    this.createDeserializer = createDeserializer;
    this.reconnect();
  }

  on<E extends EventNames<EventTypes>>(name: E, listener: EventListener<EventTypes, E>): void {
    this.emitter.on(name, listener);
  }
  off<E extends EventNames<EventTypes>>(name: E, listener: EventListener<EventTypes, E>): void {
    this.emitter.off(name, listener);
  }

  private reconnect() {
    // this.ws = new WebSocket(this.url, [FoxgloveClient.SUPPORTED_SUBPROTOCOL]);
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
        case ServerOpcode.SERVER_INFO:
          log.info("Received server info:", message);
          return;

        case ServerOpcode.STATUS_MESSAGE:
          log.info("Received status message:", message);
          return;

        case ServerOpcode.CHANNEL_LIST: {
          this.channelsByTopic.clear();
          for (const channel of message.channels) {
            if (this.channelsByTopic.has(channel.topic)) {
              log.error(
                `Duplicate channel for topic '${channel.topic}':`,
                this.channelsByTopic.get(channel.topic),
                channel,
              );
              throw new Error(`Duplicate channel for topic '${channel.topic}'`);
            }
            this.channelsByTopic.set(channel.topic, channel);
          }
          this.processUnresolvedSubscriptions();
          // TODO: what to do if a subscribed topic disappears and reappears with a different
          // schema?
          this.emitter.emit("channelListUpdate", this.channelsByTopic);
          return;
        }

        case ServerOpcode.MESSAGE_DATA: {
          const sub = this.resolvedSubscriptionsById.get(message.clientSubscriptionId);
          if (!sub) {
            log.warn(`Received message for unknown subscription ${message.clientSubscriptionId}`);
            return;
          }
          this.emitter.emit("message", {
            topic: sub.channel.topic,
            timestamp: message.timestamp,
            message: sub.deserializer(message.data),
            sizeInBytes: message.data.byteLength,
          });
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

  subscribe(topic: string): void {
    this.unresolvedSubscriptions.add(topic);
    this.processUnresolvedSubscriptions();
  }

  unsubscribe(topic: string): void {
    this.unresolvedSubscriptions.delete(topic);
    const sub = this.resolvedSubscriptionsByTopic.get(topic);
    if (sub) {
      this.ws.send(
        this.serialize({
          op: ClientOpcode.UNSUBSCRIBE,
          unsubscriptions: [sub.id],
        }),
      );
      this.resolvedSubscriptionsById.delete(sub.id);
      this.resolvedSubscriptionsByTopic.delete(topic);
    }
  }

  /** Resolve subscriptions for which channels are known to be available */
  private processUnresolvedSubscriptions() {
    const subscriptions: Subscribe["subscriptions"] = [];
    for (const topic of [...this.unresolvedSubscriptions]) {
      const channel = this.channelsByTopic.get(topic);
      if (!channel) {
        return;
      }
      const id = this.nextSubscriptionId++;
      subscriptions.push({ clientSubscriptionId: id, channel: channel.id });
      const resolved = {
        id,
        channel,
        deserializer: this.createDeserializer(channel),
      };
      this.resolvedSubscriptionsByTopic.set(topic, resolved);
      this.resolvedSubscriptionsById.set(id, resolved);
      this.unresolvedSubscriptions.delete(topic);
    }
    if (subscriptions.length > 0) {
      this.ws.send(this.serialize({ op: ClientOpcode.SUBSCRIBE, subscriptions }));
    }
  }

  private serialize(message: ClientMessage): string {
    return JSON.stringify(message);
  }
}
