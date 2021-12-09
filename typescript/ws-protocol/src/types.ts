export enum BinaryOpcode {
  MESSAGE_DATA = 1,
}
export enum StatusLevel {
  INFO = 0,
  WARNING = 1,
  ERROR = 2,
}

export type ChannelId = number;
export type Channel = {
  id: ChannelId;
  topic: string;
  encoding: string;
  schemaName: string;
  schema: string;
};
export type SubscriptionId = number;

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

export type ClientMessage = Subscribe | Unsubscribe;

export type ServerInfo = {
  op: "serverInfo";
  name: string;
  capabilities: string[];
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
export type MessageData = {
  op: BinaryOpcode.MESSAGE_DATA;
  subscriptionId: SubscriptionId;
  timestamp: bigint;
  data: DataView;
};

export type ServerMessage = ServerInfo | StatusMessage | Advertise | Unadvertise | MessageData;

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
    data: string | ArrayBuffer | Blob | ArrayBufferView,
    /** Options available in Node "ws" library */
    options?: { fin?: boolean },
  ): void;
}
