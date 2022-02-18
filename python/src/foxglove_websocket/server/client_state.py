from types import MappingProxyType
from typing import Optional, Iterable
from dataclasses import field
from websockets.server import WebSocketServerProtocol
from dataclasses import dataclass

from ..types import ChannelId, SubscriptionId


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
    subscriptions_by_channel: "MappingProxyType[ChannelId, Iterable[SubscriptionId]]" = field(
        default_factory=lambda: MappingProxyType({})
    )

    def remove_channel(self, removed_chan_id: ChannelId):
        subs = self.subscriptions_by_channel.get(removed_chan_id)
        if subs is not None:
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

    def add_subscription(self, sub_id: SubscriptionId, chan_id: ChannelId):
        self.subscriptions = MappingProxyType({**self.subscriptions, sub_id: chan_id})
        self.subscriptions_by_channel = MappingProxyType(
            {
                **self.subscriptions_by_channel,
                chan_id: {*self.subscriptions_by_channel.get(chan_id, ()), sub_id},
            }
        )

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
        new_subs = {
            sub_id
            for sub_id in self.subscriptions_by_channel.get(chan_id, ())
            if sub_id != removed_sub_id
        }
        if new_subs:
            new_subscriptions_by_channel[chan_id] = new_subs
        self.subscriptions_by_channel = MappingProxyType(new_subscriptions_by_channel)

        return chan_id
