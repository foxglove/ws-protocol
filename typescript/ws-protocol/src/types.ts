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

export type ClientChannel = {
  id: ClientChannelId;
  topic: string;
  encoding: string;
  schemaName: string;
};
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

export type ServiceCallRequest = {
  op: ClientBinaryOpcode.SERVICE_CALL_REQUEST;
  serviceId: ServiceId;
  callId: number;
  encoding: string;
  data: DataView;
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
  | ServiceCallRequest;

export type ServerInfo = {
  op: "serverInfo";
  name: string;
  capabilities: string[];
  supportedEncodings?: string[];
  metadata?: Record<string, string>;
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
export type ServiceCallResponse = {
  op: BinaryOpcode.SERVICE_CALL_RESPONSE;
  serviceId: ServiceId;
  callId: number;
  encoding: string;
  data: DataView;
};
export type ClientPublish = {
  channel: ClientChannel;
  data: DataView;
};
export type Parameter = {
  name: string;
  value: number | boolean | string | number[] | boolean[] | string[];
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
  | ParameterValues;

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
