from typing import cast
from foxglove_websocket.types import ChannelId, SubscriptionId
from websockets.server import WebSocketServerProtocol
from foxglove_websocket.server.client_state import ClientState


def test_add_subscription():
    state = ClientState(connection=cast(WebSocketServerProtocol, None))
    assert state.subscriptions == {}
    assert state.subscriptions_by_channel == {}

    state.add_subscription(SubscriptionId(0), ChannelId(100))
    assert state.subscriptions == {0: 100}
    assert state.subscriptions_by_channel == {100: 0}

    state.add_subscription(SubscriptionId(1), ChannelId(101))
    assert state.subscriptions == {0: 100, 1: 101}
    assert state.subscriptions_by_channel == {100: 0, 101: 1}

    state.add_subscription(SubscriptionId(2), ChannelId(101))
    assert state.subscriptions == {0: 100, 1: 101}
    assert state.subscriptions_by_channel == {100: 0, 101: 1}


def test_remove_subscription():
    state = ClientState(connection=cast(WebSocketServerProtocol, None))
    assert state.subscriptions == {}
    assert state.subscriptions_by_channel == {}

    state.add_subscription(SubscriptionId(0), ChannelId(100))
    state.add_subscription(SubscriptionId(1), ChannelId(101))
    state.add_subscription(SubscriptionId(2), ChannelId(102))
    assert state.subscriptions == {0: 100, 1: 101, 2: 102}
    assert state.subscriptions_by_channel == {100: 0, 101: 1, 102: 2}

    assert state.remove_subscription(SubscriptionId(99)) is None

    assert state.remove_subscription(SubscriptionId(1)) == 101
    assert state.subscriptions == {0: 100, 2: 102}
    assert state.subscriptions_by_channel == {100: 0, 102: 2}

    assert state.remove_subscription(SubscriptionId(0)) == 100
    assert state.subscriptions == {2: 102}
    assert state.subscriptions_by_channel == {102: 2}

    assert state.remove_subscription(SubscriptionId(2)) == 102
    assert state.subscriptions == {}
    assert state.subscriptions_by_channel == {}

    assert state.remove_subscription(SubscriptionId(2)) is None


def test_remove_channel():
    state = ClientState(connection=cast(WebSocketServerProtocol, None))
    assert state.subscriptions == {}
    assert state.subscriptions_by_channel == {}

    state.add_subscription(SubscriptionId(0), ChannelId(100))
    state.add_subscription(SubscriptionId(1), ChannelId(101))

    assert state.subscriptions == {0: 100, 1: 101}
    assert state.subscriptions_by_channel == {100: 0, 101: 1}

    state.remove_channel(ChannelId(999))
    assert state.subscriptions == {0: 100, 1: 101}
    assert state.subscriptions_by_channel == {100: 0, 101: 1}

    state.remove_channel(ChannelId(100))
    assert state.subscriptions == {1: 101}
    assert state.subscriptions_by_channel == {101: 1}

    state.remove_channel(ChannelId(101))
    assert state.subscriptions == {}
    assert state.subscriptions_by_channel == {}
