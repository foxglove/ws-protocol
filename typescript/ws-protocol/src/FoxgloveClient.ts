import EventEmitter from "eventemitter3";

import { ChannelId, MessageData, ServerInfo, StatusMessage } from ".";
import { parseServerMessage } from "./parse";
import {
  BinaryOpcode,
  Channel,
  ClientBinaryOpcode,
  ClientChannel,
  ClientMessage,
  IWebSocket,
  Parameter,
  ParameterValues,
  ServerMessage,
  SubscriptionId,
  Time,
} from "./types";

type EventTypes = {
  open: () => void;
  error: (error: Error) => void;
  close: (event: CloseEvent) => void;

  serverInfo: (event: ServerInfo) => void;
  status: (event: StatusMessage) => void;
  message: (event: MessageData) => void;
  time: (event: Time) => void;
  advertise: (newChannels: Channel[]) => void;
  unadvertise: (removedChannels: ChannelId[]) => void;
  parameterValues: (event: ParameterValues) => void;
};

export default class FoxgloveClient {
  static SUPPORTED_SUBPROTOCOL = "foxglove.websocket.v1";

  private emitter = new EventEmitter<EventTypes>();
  private ws: IWebSocket;
  private nextSubscriptionId = 0;
  private nextAdvertisementId = 0;

  constructor({ ws }: { ws: IWebSocket }) {
    this.ws = ws;
    this.reconnect();
  }

  on<E extends EventEmitter.EventNames<EventTypes>>(
    name: E,
    listener: EventEmitter.EventListener<EventTypes, E>,
  ): void {
    this.emitter.on(name, listener);
  }
  off<E extends EventEmitter.EventNames<EventTypes>>(
    name: E,
    listener: EventEmitter.EventListener<EventTypes, E>,
  ): void {
    this.emitter.off(name, listener);
  }

  private reconnect() {
    this.ws.binaryType = "arraybuffer";
    this.ws.onerror = (event) => {
      this.emitter.emit("error", (event as unknown as { error: Error }).error);
    };
    this.ws.onopen = (_event) => {
      if (this.ws.protocol !== FoxgloveClient.SUPPORTED_SUBPROTOCOL) {
        throw new Error(
          `Expected subprotocol ${FoxgloveClient.SUPPORTED_SUBPROTOCOL}, got '${this.ws.protocol}'`,
        );
      }
      this.emitter.emit("open");
    };
    this.ws.onmessage = (event: MessageEvent<ArrayBuffer | string>) => {
      let message: ServerMessage;
      try {
        if (event.data instanceof ArrayBuffer) {
          message = parseServerMessage(event.data);
        } else {
          message = JSON.parse(event.data) as ServerMessage;
        }
      } catch (error) {
        this.emitter.emit("error", error as Error);
        return;
      }

      switch (message.op) {
        case "serverInfo":
          this.emitter.emit("serverInfo", message);
          return;

        case "status":
          this.emitter.emit("status", message);
          return;

        case "advertise":
          this.emitter.emit("advertise", message.channels);
          return;

        case "unadvertise":
          this.emitter.emit("unadvertise", message.channelIds);
          return;

        case "parameterValues":
          this.emitter.emit("parameterValues", message);
          return;

        case BinaryOpcode.MESSAGE_DATA:
          this.emitter.emit("message", message);
          return;

        case BinaryOpcode.TIME:
          this.emitter.emit("time", message);
          return;
      }
      this.emitter.emit(
        "error",
        new Error(`Unrecognized server opcode: ${(message as { op: number }).op}`),
      );
    };
    this.ws.onclose = (event: CloseEvent) => {
      this.emitter.emit("close", event);
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

  advertise(topic: string, encoding: string, schemaName: string): ChannelId {
    const id = ++this.nextAdvertisementId;
    const channels: ClientChannel[] = [{ id, topic, encoding, schemaName }];
    this.send({ op: "advertise", channels });
    return id;
  }

  unadvertise(channelId: ChannelId): void {
    this.send({ op: "unadvertise", channelIds: [channelId] });
  }

  getParameters(parameterNames: string[], id?: string): void {
    this.send({ op: "getParameters", parameterNames, id });
  }

  setParameters(parameters: Parameter[]): void {
    this.send({ op: "setParameters", parameters });
  }

  subscribeParameterUpdates(parameterNames: string[]): void {
    this.send({ op: "subscribeParameterUpdates", parameterNames });
  }

  unsubscribeParameterUpdates(parameterNames: string[]): void {
    this.send({ op: "unsubscribeParameterUpdates", parameterNames });
  }

  sendMessage(channelId: ChannelId, data: Uint8Array): void {
    const payload = new Uint8Array(5 + data.byteLength);
    const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    view.setUint8(0, ClientBinaryOpcode.MESSAGE_DATA);
    view.setUint32(1, channelId, true);
    payload.set(data, 5);
    this.ws.send(payload);
  }

  private send(message: ClientMessage) {
    this.ws.send(JSON.stringify(message));
  }
}
