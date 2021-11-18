from typing import List, Literal, NewType, TypedDict, Union
from enum import IntEnum

ChannelId = NewType("ChannelId", int)
ClientSubscriptionId = NewType("ClientSubscriptionId", int)


class ClientOpcode(IntEnum):
    # LIST_CHANNELS = 0x02
    SUBSCRIBE = 0x03
    UNSUBSCRIBE = 0x04


# class ListChannels(TypedDict):
#     op: Literal[ClientOpcode.LIST_CHANNELS]


class Subscription(TypedDict):
    channel: ChannelId
    clientSubscriptionId: ClientSubscriptionId


class Subscribe(TypedDict):
    op: Literal[ClientOpcode.SUBSCRIBE]
    subscriptions: List[Subscription]


class Unsubscribe(TypedDict):
    op: Literal[ClientOpcode.UNSUBSCRIBE]
    unsubscriptions: List[ClientSubscriptionId]


ClientMessage = Union[Subscribe, Unsubscribe]


class ServerOpcode(IntEnum):
    SERVER_INFO = 0x80
    STATUS_MESSAGE = 0x81
    CHANNEL_LIST = 0x82
    # SUBSCRIPTION_ACK = 0x83
    MESSAGE_DATA = 0x85


class ServerInfo(TypedDict):
    op: Literal[ServerOpcode.SERVER_INFO]
    name: str
    capabilities: List[str]


class StatusLevel(IntEnum):
    INFO = 0
    WARNING = 1
    ERROR = 2


class StatusMessage(TypedDict):
    op: Literal[ServerOpcode.STATUS_MESSAGE]
    level: StatusLevel
    message: str


class ChannelWithoutId(TypedDict):
    topic: str
    encoding: str
    schemaName: str
    schema: bytes


class Channel(ChannelWithoutId):
    id: ChannelId


class ChannelList(TypedDict):
    op: Literal[ServerOpcode.CHANNEL_LIST]
    channels: List[Channel]


ServerMessage = Union[ServerInfo, StatusMessage, ChannelList]
