export enum BinaryOpcode {
  MESSAGE_DATA = 1,
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
  level: 0 | 1 | 2;
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
  clientSubscriptionId: SubscriptionId;
  timestamp: bigint;
  data: DataView;
};

export type ServerMessage = ServerInfo | StatusMessage | Advertise | Unadvertise | MessageData;
