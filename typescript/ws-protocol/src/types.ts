export enum BinaryOpcode {
  MESSAGE_DATA = 1,
  TIME = 2,
  SERVICE_CALL_RESPONSE = 3,
}
export enum ClientBinaryOpcode {
  MESSAGE_DATA = 1,
  SERVICE_CALL_REQUEST = 2,
}
export enum StatusLevel {
  INFO = 0,
  WARNING = 1,
  ERROR = 2,
}
export enum ServerCapability {
  clientPublish = "clientPublish",
  time = "time",
  parameters = "parameters",
  parametersSubscribe = "parametersSubscribe",
  services = "services",
  connectionGraph = "connectionGraph",
}

export type ChannelId = number;
export type ClientChannelId = number;
export type SubscriptionId = number;
export type ServiceId = number;

export type Channel = {
  id: ChannelId;
  topic: string;
  encoding: string;
  schemaName: string;
  schema: string;
  schemaEncoding?: string;
};
export type Service = {
  id: number;
  name: string;
  type: string;
  requestSchema: string;
  responseSchema: string;
};

export type Subscribe = {
  op: "subscribe";
  subscriptions: Array<{
    id: SubscriptionId;
    channelId: ChannelId;
  }>;
};
export type Unsubscribe = {
  op: "unsubscribe";
  subscriptionIds: SubscriptionId[];
};
type ClientChannelSchemaInfo =
  | { schema: string; schemaEncoding: string }
  | { schema?: undefined; schemaEncoding?: undefined };
type ClientChannelBase = {
  id: ClientChannelId;
  topic: string;
  encoding: string;
  schemaName: string;
};
export type ClientChannel = ClientChannelBase & ClientChannelSchemaInfo;
export type ClientChannelWithoutId = Omit<ClientChannelBase, "id"> & ClientChannelSchemaInfo;
export type ClientAdvertise = {
  op: "advertise";
  channels: ClientChannel[];
};
export type ClientUnadvertise = {
  op: "unadvertise";
  channelIds: ClientChannelId[];
};

export type ClientMessageData = {
  op: ClientBinaryOpcode.MESSAGE_DATA;
  channelId: ClientChannelId;
  data: DataView;
};

export type ServiceCallPayload = {
  serviceId: ServiceId;
  callId: number;
  encoding: string;
  data: DataView;
};

export type ServiceCallRequest = ServiceCallPayload & {
  op: ClientBinaryOpcode.SERVICE_CALL_REQUEST;
};

export type ClientMessage =
  | Subscribe
  | Unsubscribe
  | ClientAdvertise
  | ClientUnadvertise
  | GetParameters
  | SetParameters
  | SubscribeParameterUpdates
  | UnsubscribeParameterUpdates
  | ClientMessageData
  | ServiceCallRequest
  | SubscribeConnectionGraph
  | UnsubscribeConnectionGraph;

export type ServerInfo = {
  op: "serverInfo";
  name: string;
  capabilities: string[];
  supportedEncodings?: string[];
  metadata?: Record<string, string>;
  sessionId?: string;
};
export type StatusMessage = {
  op: "status";
  level: StatusLevel;
  message: string;
};
export type Advertise = {
  op: "advertise";
  channels: Channel[];
};
export type Unadvertise = {
  op: "unadvertise";
  channelIds: ChannelId[];
};
export type ParameterValues = {
  op: "parameterValues";
  parameters: Parameter[];
  id?: string;
};
export type GetParameters = {
  op: "getParameters";
  parameterNames: string[];
  id?: string;
};
export type SetParameters = {
  op: "setParameters";
  parameters: Parameter[];
  id?: string;
};
export type SubscribeParameterUpdates = {
  op: "subscribeParameterUpdates";
  parameterNames: string[];
};
export type UnsubscribeParameterUpdates = {
  op: "unsubscribeParameterUpdates";
  parameterNames: string[];
};
export type AdvertiseServices = {
  op: "advertiseServices";
  services: Service[];
};
export type UnadvertiseServices = {
  op: "unadvertiseServices";
  serviceIds: ServiceId[];
};
export type SubscribeConnectionGraph = {
  op: "subscribeConnectionGraph";
};
export type UnsubscribeConnectionGraph = {
  op: "unsubscribeConnectionGraph";
};
export type ConnectionGraphUpdate = {
  op: "connectionGraphUpdate";
  publishedTopics: {
    name: string;
    publisherIds: string[];
  }[];
  subscribedTopics: {
    name: string;
    subscriberIds: string[];
  }[];
  advertisedServices: {
    name: string;
    providerIds: string[];
  }[];
  removedTopics: string[];
  removedServices: string[];
};
export type MessageData = {
  op: BinaryOpcode.MESSAGE_DATA;
  subscriptionId: SubscriptionId;
  timestamp: bigint;
  data: DataView;
};
export type Time = {
  op: BinaryOpcode.TIME;
  timestamp: bigint;
};
export type ServiceCallResponse = ServiceCallPayload & {
  op: BinaryOpcode.SERVICE_CALL_RESPONSE;
};
export type ClientPublish = {
  channel: ClientChannel;
  data: DataView;
};
export type ParameterValue =
  | undefined
  | number
  | boolean
  | string
  | { [key: string]: ParameterValue }
  | ParameterValue[];
export type Parameter = {
  name: string;
  value: ParameterValue;
  type?: "byte_array";
};

export type ServerMessage =
  | ServerInfo
  | StatusMessage
  | Advertise
  | Unadvertise
  | AdvertiseServices
  | UnadvertiseServices
  | MessageData
  | Time
  | ServiceCallResponse
  | ParameterValues
  | ConnectionGraphUpdate;

/**
 * Abstraction that supports both browser and Node WebSocket clients.
 */
export interface IWebSocket {
  binaryType: string;
  protocol: string;
  onerror: ((event: any) => void) | null | undefined; // eslint-disable-line @typescript-eslint/no-explicit-any
  onopen: ((event: any) => void) | null | undefined; // eslint-disable-line @typescript-eslint/no-explicit-any
  onclose: ((event: any) => void) | null | undefined; // eslint-disable-line @typescript-eslint/no-explicit-any
  onmessage: ((event: any) => void) | null | undefined; // eslint-disable-line @typescript-eslint/no-explicit-any
  close(): void;
  send(
    data: string | ArrayBuffer | ArrayBufferView,
    /** Options available in Node "ws" library */
    options?: { fin?: boolean },
  ): void;
}
