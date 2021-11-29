from typing import List, Literal, NewType, TypedDict, Union
from enum import IntEnum

ChannelId = NewType("ChannelId", int)
SubscriptionId = NewType("SubscriptionId", int)


class Subscription(TypedDict):
    id: SubscriptionId
    channelId: ChannelId


class Subscribe(TypedDict):
    op: Literal["subscribe"]
    subscriptions: List[Subscription]


class Unsubscribe(TypedDict):
    op: Literal["unsubscribe"]
    subscriptionIds: List[SubscriptionId]


ClientMessage = Union[Subscribe, Unsubscribe]


class BinaryOpcode(IntEnum):
    MESSAGE_DATA = 1


class ServerInfo(TypedDict):
    op: Literal["serverInfo"]
    name: str
    capabilities: List[str]


class StatusLevel(IntEnum):
    INFO = 0
    WARNING = 1
    ERROR = 2


class StatusMessage(TypedDict):
    op: Literal["status"]
    level: StatusLevel
    message: str


class ChannelWithoutId(TypedDict):
    topic: str
    encoding: str
    schemaName: str
    schema: str


class Channel(ChannelWithoutId):
    id: ChannelId


class Advertise(TypedDict):
    op: Literal["advertise"]
    channels: List[Channel]


class Unadvertise(TypedDict):
    op: Literal["unadvertise"]
    channelIds: List[ChannelId]


ServerMessage = Union[ServerInfo, StatusMessage, Advertise, Unadvertise]
