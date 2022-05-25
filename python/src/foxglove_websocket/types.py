from typing import Any, Dict, List, Literal, NewType, Optional, TypedDict, Union
from enum import Enum, IntEnum

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


class ClientChannel(TypedDict):
    topic: str
    schemaName: str


class ClientAdvertise(TypedDict):
    op: Literal["clientAdvertise"]
    channels: List[ClientChannel]


class ClientUnadvertise(TypedDict):
    op: Literal["clientUnadvertise"]
    topics: List[str]


class ClientData(TypedDict):
    op: Literal["clientData"]
    topic: str
    data: Dict[str, Any]
    timestamp: Optional[int]

ClientMessage = Union[Subscribe, Unsubscribe, ClientAdvertise, ClientUnadvertise, ClientData]


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

class ServerCapabilities(Enum):
    receiveClientData = "receiveClientData"
