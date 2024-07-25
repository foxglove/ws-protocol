from typing import (
    List,
    Literal,
    Mapping,
    NewType,
    Optional,
    TypedDict,
    Union,
)
from enum import IntEnum

ChannelId = NewType("ChannelId", int)
SubscriptionId = NewType("SubscriptionId", int)
ClientChannelId = NewType("ClientChannelId", int)
ServiceId = NewType("ServiceId", int)


class Parameter(TypedDict):
    name: str
    value: Union[
        int,
        float,
        bool,
        str,
        List[int],
        List[float],
        List[bool],
        List[str],
    ]
    type: Optional[str]


class Subscription(TypedDict):
    id: SubscriptionId
    channelId: ChannelId


class ClientChannel(TypedDict):
    id: ClientChannelId
    topic: str
    encoding: str
    schemaName: str
    schema: Optional[str]
    schemaEncoding: Optional[str]


class Subscribe(TypedDict):
    op: Literal["subscribe"]
    subscriptions: List[Subscription]


class Unsubscribe(TypedDict):
    op: Literal["unsubscribe"]
    subscriptionIds: List[SubscriptionId]


class ClientAdvertise(TypedDict):
    op: Literal["advertise"]
    channels: List[ClientChannel]


class ClientUnadvertise(TypedDict):
    op: Literal["unadvertise"]
    channelIds: List[ClientChannelId]


class GetParameters(TypedDict):
    op: Literal["getParameters"]
    parameterNames: List[str]
    id: Optional[str]


class SetParameters(TypedDict):
    op: Literal["setParameters"]
    parameters: List[Parameter]
    id: Optional[str]


class SubscribeParameterUpdates(TypedDict):
    op: Literal["subscribeParameterUpdates"]
    parameterNames: List[str]


class UnsubscribeParameterUpdates(TypedDict):
    op: Literal["unsubscribeParameterUpdates"]
    parameterNames: List[str]


ClientJsonMessage = Union[
    Subscribe,
    Unsubscribe,
    ClientAdvertise,
    ClientUnadvertise,
    GetParameters,
    SetParameters,
    SubscribeParameterUpdates,
    UnsubscribeParameterUpdates,
]


class BinaryOpcode(IntEnum):
    MESSAGE_DATA = 1
    TIME = 2
    SERVICE_CALL_RESPONSE = 3


class ClientBinaryOpcode(IntEnum):
    MESSAGE_DATA = 1
    SERVICE_CALL_REQUEST = 2


class ServerInfo(TypedDict):
    op: Literal["serverInfo"]
    name: str
    capabilities: List[str]
    supportedEncodings: Optional[List[str]]
    metadata: Optional[Mapping[str, str]]
    sessionId: Optional[str]


class StatusLevel(IntEnum):
    INFO = 0
    WARNING = 1
    ERROR = 2


class StatusMessage(TypedDict):
    op: Literal["status"]
    level: StatusLevel
    message: str
    id: Optional[str]


class RemoveStatusMessages(TypedDict):
    op: Literal["removeStatus"]
    statusIds: List[str]


class ChannelWithoutId(TypedDict):
    topic: str
    encoding: str
    schemaName: str
    schema: str
    schemaEncoding: Optional[str]


class Channel(ChannelWithoutId):
    id: ChannelId


class ServiceRequestDefinition(TypedDict):
    encoding: str
    schemaName: str
    schemaEncoding: str
    schema: str


class ServiceResponseDefinition(ServiceRequestDefinition):
    pass


class ServiceWithoutId(TypedDict):
    name: str
    type: str
    request: Optional[ServiceRequestDefinition]
    response: Optional[ServiceResponseDefinition]
    requestSchema: Optional[str]  # Prefer request instead
    responseSchema: Optional[str]  # Prefer response instead


class Service(ServiceWithoutId):
    id: ServiceId


class Advertise(TypedDict):
    op: Literal["advertise"]
    channels: List[Channel]


class Unadvertise(TypedDict):
    op: Literal["unadvertise"]
    channelIds: List[ChannelId]


class AdvertiseServices(TypedDict):
    op: Literal["advertiseServices"]
    services: List[Service]


class UnadvertiseServices(TypedDict):
    op: Literal["unadvertiseServices"]
    serviceIds: List[ServiceId]


class ParameterValues(TypedDict):
    op: Literal["parameterValues"]
    parameters: List[Parameter]
    id: Optional[str]


ServerJsonMessage = Union[
    ServerInfo,
    StatusMessage,
    RemoveStatusMessages,
    Advertise,
    Unadvertise,
    AdvertiseServices,
    UnadvertiseServices,
    ParameterValues,
]
