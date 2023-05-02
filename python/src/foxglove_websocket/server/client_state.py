from types import MappingProxyType
from typing import Optional, Set
from dataclasses import field
from websockets.server import WebSocketServerProtocol
from dataclasses import dataclass

from ..types import ChannelId, ClientChannel, ClientChannelId, SubscriptionId


@dataclass
class ClientState:
    """
    ClientState holds information about subscriptions from a given client, used by the server for
    bookkeeping. The `subscriptions` and `subscriptions_by_channel` are immutable, which makes them
    safe to use in concurrent (async) code without worrying that they will be mutated during
    iteration.
    """

    connection: WebSocketServerProtocol
    subscriptions: "MappingProxyType[SubscriptionId, ChannelId]" = field(
        default_factory=lambda: MappingProxyType({})
    )
    subscriptions_by_channel: "MappingProxyType[ChannelId, SubscriptionId]" = field(
        default_factory=lambda: MappingProxyType({})
    )
    advertisements_by_channel: "MappingProxyType[ClientChannelId, ClientChannel]" = (
        field(default_factory=lambda: MappingProxyType({}))
    )
    subscribed_params: Set[str] = field(default_factory=lambda: set([]))

    def remove_channel(self, removed_chan_id: ChannelId):
        sub_id = self.subscriptions_by_channel.get(removed_chan_id)
        if sub_id is not None:
            self.subscriptions = MappingProxyType(
                {
                    sub: chan
                    for sub, chan in self.subscriptions.items()
                    if chan != removed_chan_id
                }
            )
            self.subscriptions_by_channel = MappingProxyType(
                {
                    chan: subs
                    for chan, subs in self.subscriptions_by_channel.items()
                    if chan != removed_chan_id
                }
            )

    def add_subscription(self, sub_id: SubscriptionId, chan_id: ChannelId) -> bool:
        if chan_id in self.subscriptions_by_channel:
            return False

        self.subscriptions = MappingProxyType({**self.subscriptions, sub_id: chan_id})
        self.subscriptions_by_channel = MappingProxyType(
            {
                **self.subscriptions_by_channel,
                chan_id: sub_id,
            }
        )
        return True

    def remove_subscription(
        self, removed_sub_id: SubscriptionId
    ) -> Optional[ChannelId]:
        chan_id = self.subscriptions.get(removed_sub_id)
        if chan_id is None:
            return None
        self.subscriptions = MappingProxyType(
            {
                sub: chan
                for sub, chan in self.subscriptions.items()
                if sub != removed_sub_id
            }
        )
        new_subscriptions_by_channel = {
            chan: subs
            for chan, subs in self.subscriptions_by_channel.items()
            if chan != chan_id
        }
        self.subscriptions_by_channel = MappingProxyType(new_subscriptions_by_channel)

        return chan_id

    def add_client_channel(self, channel: ClientChannel) -> bool:
        if channel["id"] in self.advertisements_by_channel:
            return False

        self.advertisements_by_channel = MappingProxyType(
            {
                **self.advertisements_by_channel,
                channel["id"]: channel,
            }
        )
        return True

    def remove_client_channel(self, channel_id: ClientChannelId) -> bool:
        if channel_id not in self.advertisements_by_channel:
            return False

        self.advertisements_by_channel = MappingProxyType(
            {
                chan: subs
                for chan, subs in self.advertisements_by_channel.items()
                if chan != channel_id
            }
        )
        return True
