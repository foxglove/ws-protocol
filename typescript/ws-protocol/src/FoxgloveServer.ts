import createDebug from "debug";
import EventEmitter from "eventemitter3";

import { ChannelId, StatusLevel } from ".";
import { parseClientMessage } from "./parse";
import {
  BinaryOpcode,
  Channel,
  ClientBinaryOpcode,
  ClientChannel,
  ClientChannelId,
  ClientMessage,
  ClientPublish,
  FetchAsset,
  FetchAssetResponse,
  FetchAssetStatus,
  IWebSocket,
  Parameter,
  ServerCapability,
  ServerMessage,
  Service,
  ServiceCallFailure,
  ServiceCallPayload,
  ServiceCallRequest,
  ServiceId,
  StatusMessage,
  SubscriptionId,
} from "./types";

type ClientInfo = {
  name: string;
  connection: IWebSocket;
  subscriptions: Map<SubscriptionId, ChannelId>;
  subscriptionsByChannel: Map<ChannelId, SubscriptionId>;
  advertisements: Map<ClientChannelId, ClientChannel>;
  parameterSubscriptions: Set<string>;
};

type SingleClient = { client: ClientInfo };

type EventTypes = {
  error: (error: Error) => void;

  /** The first subscription to this channel has been created. This channel should begin sending messages to subscribed clients. */
  subscribe: (channel: ChannelId) => void;
  /** The last subscription to this channel has been removed. This channel should stop sending messages. */
  unsubscribe: (channel: ChannelId) => void;
  /** A client-published message has been received. */
  message: (event: ClientPublish & SingleClient) => void;
  /** A client advertised a channel. */
  advertise: (channel: ClientChannel & SingleClient) => void;
  /** A client stopped advertising a channel. */
  unadvertise: (channel: { channelId: ChannelId } & SingleClient) => void;
  /** Request to retrieve parameter values has been received. */
  getParameters: (
    request: { parameterNames: string[]; id?: string },
    clientConnection: IWebSocket | undefined,
  ) => void;
  /** Request to set parameter values has been received. */
  setParameters: (
    request: { parameters: Parameter[]; id?: string },
    clientConnection: IWebSocket | undefined,
  ) => void;
  /** Request to subscribe to parameter value updates has been received. */
  subscribeParameterUpdates: (parameterNames: string[]) => void;
  /** Request to unsubscribe from parameter value updates has been received. */
  unsubscribeParameterUpdates: (parameterNames: string[]) => void;
  /** Service call request has been received. */
  serviceCallRequest: (request: ServiceCallRequest, clientConnection: IWebSocket) => void;
  /** Request to fetch an asset has been received. */
  fetchAsset: (request: FetchAsset, clientConnection: IWebSocket) => void;
};

const log = createDebug("foxglove:server");
const textEncoder = new TextEncoder();

const REQUIRED_CAPABILITY_BY_OPERATION: Record<
  ClientMessage["op"],
  keyof typeof ServerCapability | undefined
> = {
  subscribe: undefined,
  unsubscribe: undefined,
  advertise: ServerCapability.clientPublish,
  unadvertise: ServerCapability.clientPublish,
  [ClientBinaryOpcode.MESSAGE_DATA]: ServerCapability.clientPublish,
  getParameters: ServerCapability.parameters,
  setParameters: ServerCapability.parameters,
  subscribeParameterUpdates: ServerCapability.parametersSubscribe,
  unsubscribeParameterUpdates: ServerCapability.parametersSubscribe,
  [ClientBinaryOpcode.SERVICE_CALL_REQUEST]: ServerCapability.services,
  subscribeConnectionGraph: ServerCapability.connectionGraph,
  unsubscribeConnectionGraph: ServerCapability.connectionGraph,
  fetchAsset: ServerCapability.assets,
};

export default class FoxgloveServer {
  static SUPPORTED_SUBPROTOCOL = "foxglove.websocket.v1";

  readonly name: string;
  readonly capabilities: string[];
  readonly supportedEncodings?: string[];
  readonly metadata?: Record<string, string>;
  readonly sessionId?: string;
  #emitter = new EventEmitter<EventTypes>();
  #clients = new Map<IWebSocket, ClientInfo>();
  #nextChannelId: ChannelId = 0;
  #channels = new Map<ChannelId, Channel>();
  #nextServiceId: ServiceId = 0;
  #services = new Map<ServiceId, Service>();

  constructor({
    name,
    capabilities,
    supportedEncodings,
    metadata,
    sessionId,
  }: {
    name: string;
    capabilities?: string[];
    supportedEncodings?: string[];
    metadata?: Record<string, string>;
    sessionId?: string;
  }) {
    this.name = name;
    this.capabilities = capabilities ?? [];
    this.supportedEncodings = supportedEncodings;
    this.metadata = metadata;
    this.sessionId = sessionId ?? new Date().toUTCString();
  }

  on<E extends EventEmitter.EventNames<EventTypes>>(
    name: E,
    listener: EventEmitter.EventListener<EventTypes, E>,
  ): void {
    this.#emitter.on(name, listener);
  }
  off<E extends EventEmitter.EventNames<EventTypes>>(
    name: E,
    listener: EventEmitter.EventListener<EventTypes, E>,
  ): void {
    this.#emitter.off(name, listener);
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
    const newId = ++this.#nextChannelId;
    const newChannel: Channel = { ...channel, id: newId };
    this.#channels.set(newId, newChannel);
    for (const client of this.#clients.values()) {
      this.#send(client.connection, { op: "advertise", channels: [newChannel] });
    }
    return newId;
  }

  /**
   * Remove a previously advertised channel and inform any connected clients.
   */
  removeChannel(channelId: ChannelId): void {
    if (!this.#channels.delete(channelId)) {
      throw new Error(`Channel ${channelId} does not exist`);
    }
    for (const client of this.#clients.values()) {
      const subId = client.subscriptionsByChannel.get(channelId);
      if (subId != undefined) {
        client.subscriptions.delete(subId);
        client.subscriptionsByChannel.delete(channelId);
      }
      this.#send(client.connection, { op: "unadvertise", channelIds: [channelId] });
    }
  }

  /**
   * Advertise a new service and inform any connected clients.
   * @returns The id of the new service
   */
  addService(service: Omit<Service, "id">): ServiceId {
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    if (service.request == undefined && service.requestSchema == undefined) {
      throw new Error("Either 'request' or 'requestSchema' has to be given.");
    }
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    if (service.response == undefined && service.responseSchema == undefined) {
      throw new Error("Either 'response' or 'responseSchema' has to be given.");
    }

    const newId = ++this.#nextServiceId;
    const newService: Service = { ...service, id: newId };
    this.#services.set(newId, newService);
    for (const client of this.#clients.values()) {
      this.#send(client.connection, { op: "advertiseServices", services: [newService] });
    }
    return newId;
  }

  /**
   * Remove a previously advertised service and inform any connected clients.
   */
  removeService(serviceId: ServiceId): void {
    if (!this.#services.delete(serviceId)) {
      throw new Error(`Service ${serviceId} does not exist`);
    }
    for (const client of this.#clients.values()) {
      this.#send(client.connection, { op: "unadvertiseServices", serviceIds: [serviceId] });
    }
  }

  /**
   * Emit a message payload to any clients subscribed to `chanId`.
   */
  sendMessage(chanId: ChannelId, timestamp: bigint, payload: BufferSource): void {
    for (const client of this.#clients.values()) {
      const subId = client.subscriptionsByChannel.get(chanId);
      if (subId == undefined) {
        continue;
      }
      this.#sendMessageData(client.connection, subId, timestamp, payload);
    }
  }

  /**
   * Emit a time update to clients.
   */
  broadcastTime(timestamp: bigint): void {
    if (!this.capabilities.includes(ServerCapability.time)) {
      log(
        "Sending time data is only supported if the server has declared the '%s' capability.",
        ServerCapability.time,
      );
      return;
    }

    for (const client of this.#clients.values()) {
      this.#sendTimeData(client.connection, timestamp);
    }
  }

  /**
   * Send a service call response to the client
   * @param response Response to send to the client
   * @param connection Connection of the client that called the service
   */
  sendServiceCallResponse(response: ServiceCallPayload, connection: IWebSocket): void {
    const encoding = textEncoder.encode(response.encoding);
    const payload = new Uint8Array(1 + 4 + 4 + 4 + encoding.length + response.data.byteLength);
    const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    let offset = 0;
    view.setUint8(offset, BinaryOpcode.SERVICE_CALL_RESPONSE);
    offset += 1;
    view.setUint32(offset, response.serviceId, true);
    offset += 4;
    view.setUint32(offset, response.callId, true);
    offset += 4;
    view.setUint32(offset, response.encoding.length, true);
    offset += 4;
    payload.set(encoding, offset);
    offset += encoding.length;
    payload.set(
      new Uint8Array(response.data.buffer, response.data.byteOffset, response.data.byteLength),
      offset,
    );
    connection.send(payload);
  }

  /**
   * Send a service call failure response to the client
   * @param response Response to send to the client
   * @param connection Connection of the client that called the service
   */
  sendServiceCallFailure(response: ServiceCallFailure, connection: IWebSocket): void {
    this.#send(connection, response);
  }

  /**
   * Publish parameter values.
   * @param parameters Parameter values
   * @param id Optional request ID coming from a "getParameters" request
   * @param connection Optional connection when parameter values are to be sent to a single client
   */
  publishParameterValues(parameters: Parameter[], id?: string, connection?: IWebSocket): void {
    if (!this.capabilities.includes(ServerCapability.parameters)) {
      log(
        "Publishing parameter values is only supported if the server has declared the '%s' capability.",
        ServerCapability.parameters,
      );
      return;
    }

    if (connection) {
      this.#send(connection, { op: "parameterValues", parameters, id });
    } else {
      for (const client of this.#clients.values()) {
        this.#send(client.connection, { op: "parameterValues", parameters, id });
      }
    }
  }

  /**
   * Inform clients about parameter value changes.
   * @param parameters Parameter values
   */
  updateParameterValues(parameters: Parameter[]): void {
    if (!this.capabilities.includes(ServerCapability.parametersSubscribe)) {
      log(
        "Publishing parameter value updates is only supported if the server has declared the '%s' capability.",
        ServerCapability.parametersSubscribe,
      );
      return;
    }

    for (const client of this.#clients.values()) {
      const parametersOfInterest = parameters.filter((p) =>
        client.parameterSubscriptions.has(p.name),
      );
      this.#send(client.connection, { op: "parameterValues", parameters: parametersOfInterest });
    }
  }

  /**
   * Track a new client connection.
   * @param connection WebSocket used to communicate with the client
   * @param name Human-readable name for the client in log messages
   */
  handleConnection(connection: IWebSocket, name: string): void {
    log("client %s connected", name);
    connection.binaryType = "arraybuffer";

    const client: ClientInfo = {
      name,
      connection,
      subscriptions: new Map(),
      subscriptionsByChannel: new Map(),
      advertisements: new Map(),
      parameterSubscriptions: new Set<string>(),
    };
    this.#clients.set(connection, client);

    this.#send(connection, {
      op: "serverInfo",
      name: this.name,
      capabilities: this.capabilities,
      supportedEncodings: this.supportedEncodings,
      metadata: this.metadata,
      sessionId: this.sessionId,
    });
    if (this.#channels.size > 0) {
      this.#send(connection, { op: "advertise", channels: Array.from(this.#channels.values()) });
    }
    if (this.#services.size > 0) {
      this.#send(connection, {
        op: "advertiseServices",
        services: Array.from(this.#services.values()),
      });
    }

    connection.onclose = (event: CloseEvent) => {
      log(
        "client %s disconnected, code=%s reason=%s wasClean=%s",
        name,
        event.code,
        event.reason,
        event.wasClean,
      );
      const potentialUnsubscribes = client.subscriptionsByChannel.keys();
      this.#clients.delete(connection);
      for (const channelId of potentialUnsubscribes) {
        if (!this.#anySubscribed(channelId)) {
          this.#emitter.emit("unsubscribe", channelId);
        }
      }
    };

    connection.onmessage = (event: MessageEvent<ArrayBuffer | string>) => {
      let message: ClientMessage;
      try {
        if (event.data instanceof ArrayBuffer || ArrayBuffer.isView(event.data)) {
          message = parseClientMessage(event.data);
        } else {
          message = JSON.parse(event.data) as ClientMessage;
        }

        this.#handleClientMessage(client, message);
      } catch (error) {
        this.#emitter.emit("error", error as Error);
        return;
      }
    };
  }

  #send(client: IWebSocket, message: ServerMessage): void {
    client.send(JSON.stringify(message));
  }

  #anySubscribed(chanId: ChannelId) {
    for (const client of this.#clients.values()) {
      if (client.subscriptionsByChannel.has(chanId)) {
        return true;
      }
    }
    return false;
  }

  #handleClientMessage(client: ClientInfo, message: ClientMessage): void {
    const requiredCapability = REQUIRED_CAPABILITY_BY_OPERATION[message.op];
    if (requiredCapability && !this.capabilities.includes(requiredCapability)) {
      log(
        "Operation '%s' is not supported, as the server has not declared the capability '%s'.",
        message.op,
        requiredCapability,
      );
      return;
    }

    switch (message.op) {
      case "subscribe":
        for (const { channelId, id: subId } of message.subscriptions) {
          if (client.subscriptions.has(subId)) {
            this.#send(client.connection, {
              op: "status",
              level: StatusLevel.ERROR,
              message: `Client subscription id ${subId} was already used; ignoring subscription`,
            });
            continue;
          }
          if (client.subscriptionsByChannel.has(channelId)) {
            this.#send(client.connection, {
              op: "status",
              level: StatusLevel.WARNING,
              message: `Client already subscribed to channel ${channelId}; ignoring subscription`,
            });
            continue;
          }
          const channel = this.#channels.get(channelId);
          if (!channel) {
            this.#send(client.connection, {
              op: "status",
              level: StatusLevel.WARNING,
              message: `Channel ${channelId} is not available; ignoring subscription",`,
            });
            continue;
          }
          log("client %s subscribed to channel %d", client.name, channelId);
          const firstSubscription = !this.#anySubscribed(channelId);
          client.subscriptions.set(subId, channelId);
          client.subscriptionsByChannel.set(channelId, subId);
          if (firstSubscription) {
            this.#emitter.emit("subscribe", channelId);
          }
        }
        break;

      case "unsubscribe":
        for (const subId of message.subscriptionIds) {
          const chanId = client.subscriptions.get(subId);
          if (chanId == undefined) {
            this.#send(client.connection, {
              op: "status",
              level: StatusLevel.WARNING,
              message: `Client subscription id ${subId} did not exist; ignoring unsubscription`,
            });
            continue;
          }
          log("client %s unsubscribed from channel %d", client.name, chanId);
          client.subscriptions.delete(subId);
          if (client.subscriptionsByChannel.has(chanId)) {
            client.subscriptionsByChannel.delete(chanId);
          }
          if (!this.#anySubscribed(chanId)) {
            this.#emitter.emit("unsubscribe", chanId);
          }
        }

        break;

      case "advertise":
        for (const channel of message.channels) {
          if (client.advertisements.has(channel.id)) {
            log(
              "client %s tried to advertise channel %d, but it was already advertised",
              client.name,
              channel.id,
            );
            this.#send(client.connection, {
              op: "status",
              level: StatusLevel.ERROR,
              message: `Channel id ${channel.id} was already advertised; ignoring advertisement`,
            });
            continue;
          }

          client.advertisements.set(channel.id, channel);
          this.#emitter.emit("advertise", { client, ...channel });
        }

        break;

      case "unadvertise":
        for (const channelId of message.channelIds) {
          if (client.advertisements.has(channelId)) {
            client.advertisements.delete(channelId);
            this.#emitter.emit("unadvertise", { client, channelId });
          } else {
            log("client %s unadvertised unknown channel %d", client.name, channelId);
          }
        }

        break;

      case "getParameters":
        this.#emitter.emit("getParameters", { ...message }, client.connection);
        break;

      case "setParameters":
        this.#emitter.emit("setParameters", { ...message }, client.connection);
        break;

      case "subscribeParameterUpdates":
        {
          const alreadySubscribedParameters = Array.from(this.#clients.values()).reduce(
            (acc, c) => new Set<string>([...acc, ...c.parameterSubscriptions]),
            new Set<string>(),
          );
          const parametersToSubscribe = message.parameterNames.filter(
            (p) => !alreadySubscribedParameters.has(p),
          );

          message.parameterNames.forEach((p) => client.parameterSubscriptions.add(p));

          if (parametersToSubscribe.length > 0) {
            this.#emitter.emit("subscribeParameterUpdates", parametersToSubscribe);
          }
        }
        break;

      case "unsubscribeParameterUpdates":
        {
          message.parameterNames.forEach((p) => client.parameterSubscriptions.delete(p));
          const subscribedParameters = Array.from(this.#clients.values()).reduce(
            (acc, c) => new Set<string>([...acc, ...c.parameterSubscriptions]),
            new Set<string>(),
          );
          const parametersToUnsubscribe = message.parameterNames.filter(
            (p) => !subscribedParameters.has(p),
          );

          if (parametersToUnsubscribe.length > 0) {
            this.#emitter.emit("unsubscribeParameterUpdates", parametersToUnsubscribe);
          }
        }
        break;

      case "fetchAsset":
        this.#emitter.emit("fetchAsset", { ...message }, client.connection);
        break;

      case ClientBinaryOpcode.MESSAGE_DATA: {
        const channel = client.advertisements.get(message.channelId);
        if (!channel) {
          throw new Error(`Client sent message data for unknown channel ${message.channelId}`);
        }
        const data = message.data;
        this.#emitter.emit("message", { client, channel, data });
        break;
      }

      case ClientBinaryOpcode.SERVICE_CALL_REQUEST: {
        const service = this.#services.get(message.serviceId);
        if (!service) {
          throw new Error(
            `Client sent service call request for unknown service ${message.serviceId}`,
          );
        }
        this.#emitter.emit("serviceCallRequest", message, client.connection);
        break;
      }

      case "subscribeConnectionGraph":
      case "unsubscribeConnectionGraph":
      default:
        throw new Error(`Unrecognized client opcode: ${(message as { op: string }).op}`);
    }
  }

  #sendMessageData(
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

  #sendTimeData(connection: IWebSocket, timestamp: bigint): void {
    const msg = new DataView(new ArrayBuffer(1 + 8));
    msg.setUint8(0, BinaryOpcode.TIME);
    msg.setBigUint64(1, timestamp, true);

    connection.send(msg);
  }

  /**
   * Send a response to a fetchAsset request
   * @param response The response to send
   * @param connection Connection of the client that called the service
   */
  sendFetchAssetResponse(response: FetchAssetResponse, connection: IWebSocket): void {
    const isSuccess = response.status === FetchAssetStatus.SUCCESS;
    const errorMsg = textEncoder.encode(isSuccess ? "" : response.error);
    const dataLength = isSuccess ? response.data.byteLength : 0;
    const msg = new Uint8Array(1 + 4 + 1 + 4 + errorMsg.length + dataLength);
    const view = new DataView(msg.buffer, msg.byteOffset, msg.byteLength);
    let offset = 0;
    view.setUint8(offset, BinaryOpcode.FETCH_ASSET_RESPONSE);
    offset += 1;
    view.setUint32(offset, response.requestId, true);
    offset += 4;
    view.setUint8(offset, response.status);
    offset += 1;
    view.setUint32(offset, errorMsg.length, true);
    offset += 4;
    msg.set(errorMsg, offset);
    offset += errorMsg.length;

    if (isSuccess) {
      msg.set(
        new Uint8Array(response.data.buffer, response.data.byteOffset, response.data.byteLength),
        offset,
      );
    }

    connection.send(msg);
  }

  /**
   * Send a status message to one or all clients.
   *
   * @param status Status message
   * @param connection Optional connection. If undefined, the status message will be sent to all clients.
   */
  sendStatus(status: Omit<StatusMessage, "op">, connection?: IWebSocket): void {
    if (connection) {
      // Send the status to a single client.
      this.#send(connection, { op: "status", ...status });
      return;
    }

    // Send status message to all clients.
    for (const client of this.#clients.values()) {
      this.sendStatus(status, client.connection);
    }
  }

  /**
   * Remove status message(s) for one or for all clients.

   * @param statusIds Status ids to be removed.
   * @param connection Optional connection. If undefined, the status will be removed for all clients.
   */
  removeStatus(statusIds: string[], connection?: IWebSocket): void {
    if (connection) {
      // Remove status for a single client.
      this.#send(connection, { op: "removeStatus", statusIds });
      return;
    }

    // Remove status for all clients.
    for (const client of this.#clients.values()) {
      this.#send(client.connection, { op: "removeStatus", statusIds });
    }
  }
}
