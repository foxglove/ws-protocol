import json
import random
import threading
import time
import logging
from typing import Callable, Dict, FrozenSet, NewType
from foxglove_websocket.types import ChannelWithoutId


logger = logging.getLogger("ExampleMiddlewareThread")
logger.setLevel(logging.DEBUG)
handler = logging.StreamHandler()
handler.setFormatter(
    logging.Formatter("%(asctime)s: [%(levelname)s] <%(name)s> %(message)s")
)
logger.addHandler(handler)


MiddlewareChannelId = NewType("MiddlewareChannelId", int)


class ExampleMiddlewareThread(threading.Thread):
    """
    This class simulates a pub/sub middleware that provides callbacks in a separate thread. The
    implementation details are not meant to be realistic, but just to simulate an environment where
    channels are appearing and disappearing and messages are arriving at random times.

    Calling code can provide callbacks which will be called from the middleware thread. To do so,
    set the `on_add_channel`, `on_remove_channel`, and `on_message` properties.

    This is a subclass of threading.Thread, so to launch the thread, use the `start()` method.
    """

    # The middleware will call these callbacks from the middleware thread.
    on_add_channel: Callable[[MiddlewareChannelId, ChannelWithoutId], None]
    on_remove_channel: Callable[[MiddlewareChannelId], None]
    on_message: Callable[[MiddlewareChannelId, int, bytes], None]

    # When the server subscribes to a channel, we'll get called in the server thread (the main
    # thread). This lock is used to manage the set of subscribed channels safely across multiple
    # threads.
    #
    # We use a frozenset to indicate that we won't mutate the data structure, we'll just replace it
    # when subscriptions change. This allows the thread's main loop to briefly acquire the lock,
    # grab a reference to the set of channels, and release the lock, knowing that the referenced set
    # is safe to use from the thread, even if another thread happens to replace it.
    _lock: threading.Lock
    _subscribed_channels: FrozenSet[MiddlewareChannelId]

    def __init__(self):
        super().__init__()
        self._stop_event = threading.Event()
        self._lock = threading.Lock()
        self._stopped = False
        self._subscribed_channels = frozenset()

    def handle_subscribe_threadsafe(self, chan: MiddlewareChannelId):
        """
        Handle an added subscription from a WebSocket client. This method is thread-safe because it
        uses a lock to access internal data structures. It will be called on the WebSocket server
        thread.
        """
        with self._lock:
            self._subscribed_channels = self._subscribed_channels | {chan}

    def handle_unsubscribe_threadsafe(self, chan: MiddlewareChannelId):
        """
        Handle a removed subscription from a WebSocket client. This method is thread-safe because it
        uses a lock to access internal data structures. It will be called on the WebSocket server
        thread.
        """
        with self._lock:
            self._subscribed_channels = self._subscribed_channels - {chan}

    def stop_threadsafe(self):
        """
        Inform the thread that it should finish any active work and stop running. This method is
        thread-safe because the threading.Event class is thread-safe.
        """
        self._stop_event.set()

    def run(self):
        """
        This function provides the main entry point which will be executed in a new thread. It
        periodically calls the on_add_channel, on_remove_channel, and on_message callbacks in the
        middleware thread, simulating an active pub/sub graph.
        """
        logger.info("Middleware thread started")

        # The lowest channel ID we'll use -- this illustrates mapping between native channels and
        # FoxgloveServer channels.
        start_id = MiddlewareChannelId(100)

        # Last value published on each channel
        active_channels: Dict[MiddlewareChannelId, int] = {}

        def next_channel_id() -> MiddlewareChannelId:
            """
            Choose an available channel ID for creating a new channel.
            """
            i = start_id
            while MiddlewareChannelId(i) in active_channels:
                i += 1
            return MiddlewareChannelId(i)

        # Simulate some random events happening until we're asked to stop.
        while not self._stop_event.wait(0.05):
            # Take a reference to the current set of subscribed channels. Because this internal
            # state may be accessed from multiple threads, we need to hold the lock while we access
            # it. Once we release the lock, we know it's safe to continue using the reference during
            # the rest of the loop because the set is never mutated by another thread -- it's only
            # ever replaced with a completely new set.
            with self._lock:
                subscribed_channels = self._subscribed_channels

            random_action = random.random()
            if random_action < 0.05 or len(active_channels) == 0:
                # Add a new channel
                id = next_channel_id()
                self.on_add_channel(
                    id,
                    {
                        "topic": f"topic_{id}",
                        "encoding": "json",
                        "schemaName": f"ExampleMsg{id}",
                        "schema": json.dumps(
                            {
                                "type": "object",
                                "properties": {
                                    "msg": {"type": "string"},
                                    "value": {"type": "number"},
                                },
                            }
                        ),
                    },
                )
                active_channels[id] = 0

            elif random_action < 0.1:
                # Remove a random channel
                channel_id = random.choice(list(active_channels.keys()))
                self.on_remove_channel(channel_id)
                del active_channels[channel_id]
                with self._lock:
                    # Remove the channel from subscribed_channels so we don't try to publish a message to it.
                    self._subscribed_channels = self._subscribed_channels - {channel_id}

            elif subscribed_channels:
                # Send a message on a random subscribed channel
                chan = random.choice(list(subscribed_channels))
                now = time.time_ns()
                value = active_channels[chan]
                active_channels[chan] += 1
                self.on_message(
                    chan,
                    now,
                    json.dumps({"msg": f"Hello channel {chan}", "value": value}).encode(
                        "utf8"
                    ),
                )

        # Clean up channels when shutting down
        for id in active_channels:
            self.on_remove_channel(id)
        logger.info("Middleware thread finished")
