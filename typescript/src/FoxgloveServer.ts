import createDebug from "debug";
import { EventEmitter, EventNames, EventListener } from "eventemitter3";

import { ChannelId, StatusLevel } from ".";
import {
  Channel,
  ClientMessage,
  SubscriptionId,
  ServerMessage,
  BinaryOpcode,
  IWebSocket,
} from "./types";

type EventTypes = {
  subscribe: (channel: ChannelId) => void;
  unsubscribe: (channel: ChannelId) => void;
  error: (error: Error) => void;
};

type ClientInfo = {
  name: string;
  connection: IWebSocket;
  subscriptions: Map<SubscriptionId, ChannelId>;
  subscriptionsByChannel: Map<ChannelId, Set<SubscriptionId>>;
};

const log = createDebug("foxglove:server");

export default class FoxgloveServer {
  static SUPPORTED_SUBPROTOCOL = "foxglove.websocket.v1";

  readonly name: string;
  private emitter = new EventEmitter<EventTypes>();
  private clients = new Map<IWebSocket, ClientInfo>();
  private nextChannelId: ChannelId = 0;
  private channels = new Map<ChannelId, Channel>();

  constructor({ name }: { name: string }) {
    this.name = name;
  }

  on<E extends EventNames<EventTypes>>(name: E, listener: EventListener<EventTypes, E>): void {
    this.emitter.on(name, listener);
  }
  off<E extends EventNames<EventTypes>>(name: E, listener: EventListener<EventTypes, E>): void {
    this.emitter.off(name, listener);
  }

  /**
   * Select a sub-protocol to communicate with a new client.
   * @param protocols sub-protocols offered by the client in the connection header
   */
  handleProtocols(protocols: Iterable<string>): string | false {
    for (const protocol of protocols) {
      if (protocol === FoxgloveServer.SUPPORTED_SUBPROTOCOL) {
        return protocol;
      }
    }
    return false;
  }

  /**
   * Advertise a new channel and inform any connected clients.
   * @returns The id of the new channel
   */
  addChannel(channel: Omit<Channel, "id">): ChannelId {
    const newId = ++this.nextChannelId;
    const newChannel: Channel = { ...channel, id: newId };
    this.channels.set(newId, newChannel);
    for (const client of this.clients.values()) {
      this.send(client.connection, { op: "advertise", channels: [newChannel] });
    }
    return newId;
  }

  /**
   * Remove a previously advertised channel and inform any connected clients.
   */
  removeChannel(channelId: ChannelId): void {
    if (!this.channels.delete(channelId)) {
      throw new Error(`Channel ${channelId} does not exist`);
    }
    for (const client of this.clients.values()) {
      const subs = client.subscriptionsByChannel.get(channelId);
      if (subs) {
        for (const subId of subs) {
          client.subscriptions.delete(subId);
        }
        client.subscriptionsByChannel.delete(channelId);
      }
      this.send(client.connection, { op: "unadvertise", channelIds: [channelId] });
    }
  }

  /**
   * Emit a message payload to any clients subscribed to `chanId`.
   */
  sendMessage(chanId: ChannelId, timestamp: bigint, payload: BufferSource): void {
    for (const client of this.clients.values()) {
      const subs = client.subscriptionsByChannel.get(chanId);
      if (!subs) {
        continue;
      }
      for (const subId of subs) {
        this.sendMessageData(client.connection, subId, timestamp, payload);
      }
    }
  }

  /**
   * Track a new client connection.
   * @param connection WebSocket used to communicate with the client
   * @param name Human-readable name for the client in log messages
   */
  handleConnection(connection: IWebSocket, name: string): void {
    log("client %s connected", name);
    const client: ClientInfo = {
      name,
      connection,
      subscriptions: new Map(),
      subscriptionsByChannel: new Map(),
    };
    this.clients.set(connection, client);

    this.send(connection, { op: "serverInfo", name: this.name, capabilities: [] });
    this.send(connection, { op: "advertise", channels: Array.from(this.channels.values()) });

    connection.onclose = (event: CloseEvent) => {
      log(
        "client %s disconnected, code=%s reason=%s wasClean=%s",
        name,
        event.code,
        event.reason,
        event.wasClean,
      );
      const potentialUnsubscribes = client.subscriptionsByChannel.keys();
      this.clients.delete(connection);
      for (const channelId of potentialUnsubscribes) {
        if (!this.anySubscribed(channelId)) {
          this.emitter.emit("unsubscribe", channelId);
        }
      }
    };

    connection.onmessage = (event: MessageEvent<ArrayBuffer | string>) => {
      if (typeof event.data !== "string") {
        throw new Error(`Expected text message, got ${typeof event.data}`);
      }
      const message = JSON.parse(event.data) as unknown;
      if (typeof message !== "object" || message == undefined) {
        throw new Error(`Expected JSON object, got ${typeof message}`);
      }
      try {
        this.handleClientMessage(client, message as ClientMessage);
      } catch (error) {
        this.emitter.emit("error", error as Error);
      }
    };
  }

  private send(client: IWebSocket, message: ServerMessage): void {
    client.send(JSON.stringify(message));
  }

  private anySubscribed(chanId: ChannelId) {
    for (const client of this.clients.values()) {
      if (client.subscriptionsByChannel.has(chanId)) {
        return true;
      }
    }
    return false;
  }

  private handleClientMessage(client: ClientInfo, message: ClientMessage): void {
    switch (message.op) {
      case "subscribe":
        for (const { channelId, id: subId } of message.subscriptions) {
          if (client.subscriptions.has(subId)) {
            this.send(client.connection, {
              op: "status",
              level: StatusLevel.ERROR,
              message: `Client subscription id ${subId} was already used; ignoring subscription`,
            });
            continue;
          }
          const channel = this.channels.get(channelId);
          if (!channel) {
            this.send(client.connection, {
              op: "status",
              level: StatusLevel.WARNING,
              message: `Channel ${channelId} is not available; ignoring subscription",`,
            });
            continue;
          }
          log("client %s subscribed to channel %d", client.name, channelId);
          const firstSubscription = !this.anySubscribed(channelId);
          client.subscriptions.set(subId, channelId);
          let subs = client.subscriptionsByChannel.get(channelId);
          if (!subs) {
            subs = new Set();
            client.subscriptionsByChannel.set(channelId, subs);
          }
          subs.add(subId);
          if (firstSubscription) {
            this.emitter.emit("subscribe", channelId);
          }
        }
        break;

      case "unsubscribe":
        for (const subId of message.subscriptionIds) {
          const chanId = client.subscriptions.get(subId);
          if (chanId == undefined) {
            this.send(client.connection, {
              op: "status",
              level: StatusLevel.WARNING,
              message: `Client subscription id ${subId} did not exist; ignoring unsubscription`,
            });
            continue;
          }
          log("client %s unsubscribed from channel %d", client.name, chanId);
          client.subscriptions.delete(subId);
          const subs = client.subscriptionsByChannel.get(chanId);
          if (subs) {
            subs.delete(subId);
            if (subs.size === 0) {
              client.subscriptionsByChannel.delete(chanId);
            }
          }
          if (!this.anySubscribed(chanId)) {
            this.emitter.emit("unsubscribe", chanId);
          }
        }

        break;

      default:
        throw new Error(`Unrecognized client opcode: ${(message as { op: string }).op}`);
    }
  }

  private sendMessageData(
    connection: IWebSocket,
    subId: SubscriptionId,
    timestamp: bigint,
    payload: BufferSource,
  ): void {
    const header = new DataView(new ArrayBuffer(1 + 4 + 8));
    header.setUint8(0, BinaryOpcode.MESSAGE_DATA);
    header.setUint32(1, subId, true);
    header.setBigUint64(5, timestamp, true);

    // attempt to detect support for {fin: false}
    if (connection.send.length > 1) {
      connection.send(header.buffer, { fin: false });
      connection.send(payload, { fin: true });
    } else if (typeof Blob === "function") {
      connection.send(new Blob([header.buffer, payload]));
    } else {
      const buffer = new Uint8Array(header.buffer.byteLength + payload.byteLength);
      buffer.set(new Uint8Array(header.buffer), 0);
      buffer.set(
        ArrayBuffer.isView(payload)
          ? new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength)
          : new Uint8Array(payload),
        header.buffer.byteLength,
      );
      connection.send(buffer);
    }
  }
}
