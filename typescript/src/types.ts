export enum ClientOpcode {
  // LIST_CHANNELS = 0x02,
  SUBSCRIBE = 0x03,
  UNSUBSCRIBE = 0x04,
}

export enum ServerOpcode {
  SERVER_INFO = 0x80,
  STATUS_MESSAGE = 0x81,
  CHANNEL_LIST = 0x82,
  // SUBSCRIPTION_ACK = 0x83,
  MESSAGE_DATA = 0x85,
}

export type ChannelId = number;
export type Channel = {
  id: ChannelId;
  topic: string;
  encoding: string;
  schemaName: string;
  schema: Uint8Array;
};
export type ClientSubscriptionId = number;

// export type ListChannels = {
//   op: ClientOpcode.LIST_CHANNELS;
// };
export type Subscribe = {
  op: ClientOpcode.SUBSCRIBE;
  subscriptions: Array<{
    clientSubscriptionId: ClientSubscriptionId;
    channel: ChannelId;
  }>;
};
export type Unsubscribe = {
  op: ClientOpcode.UNSUBSCRIBE;
  unsubscriptions: ClientSubscriptionId[];
};

export type ClientMessage = Subscribe | Unsubscribe;

export type ServerInfo = {
  op: ServerOpcode.SERVER_INFO;
  name: string;
  capabilities: string[];
};
export type StatusMessage = {
  op: ServerOpcode.STATUS_MESSAGE;
  level: 0 | 1 | 2;
  message: string;
};
export type ChannelList = {
  op: ServerOpcode.CHANNEL_LIST;
  channels: Channel[];
};
// export type SubscriptionAck = {
//   op: ServerOpcode.SUBSCRIPTION_ACK;
//   subscriptions: Array<{
//     clientSubscriptionId: number;
//     encoding: string;
//     schemaName: string;
//     schema: string;
//   }>;
// };
export type MessageData = {
  op: ServerOpcode.MESSAGE_DATA;
  clientSubscriptionId: number;
  timestamp: bigint;
  data: DataView;
};

export type ServerMessage =
  | ServerInfo
  | StatusMessage
  | ChannelList
  // | SubscriptionAck
  | MessageData;
