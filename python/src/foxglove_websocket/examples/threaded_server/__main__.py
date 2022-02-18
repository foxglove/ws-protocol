import asyncio
import logging
import concurrent.futures
from typing import Any, Coroutine, Dict
from foxglove_websocket import run_cancellable
from foxglove_websocket.server import FoxgloveServer, FoxgloveServerListener
from foxglove_websocket.types import ChannelId, ChannelWithoutId

from .middleware import ExampleMiddlewareThread, MiddlewareChannelId


logger = logging.getLogger("threaded_server")
logger.setLevel(logging.DEBUG)
handler = logging.StreamHandler()
handler.setFormatter(
    logging.Formatter("%(asctime)s: [%(levelname)s] <%(name)s> %(message)s")
)
logger.addHandler(handler)


async def main():
    """
    This class illustrates how to make a Foxglove WebSocket server that interacts with a typical
    threaded pub/sub middleware in a thread-safe way.

    The FoxgloveServer class runs in an asyncio event loop, and it is *not* intrinsically
    thread-safe (meaning that its methods cannot be called from threads other than the thread which
    runs the event loop). However, many frameworks -- such as those that interact with multiprocess
    pub/sub systems, drivers, or external hardware -- require the use of multiple threads. Luckily,
    it is possible to use the FoxgloveServer safely in a multi-threaded program as long as some
    synchronization primitives are used. This example script demonstrates the use of
    `asyncio.run_coroutine_threadsafe()` to manage threads (and if you look under the hood of the
    ExampleMiddlewareThread, you'll also see examples of `threading.Lock` and `threading.Event`).

    In this example, we run the FoxgloveServer in the main thread (see `run_cancellable(main())`),
    and start up the example middleware in a separate thread (`ExampleMiddlewareThread`). When the
    middleware has new channels or message data available, it invokes our callback functions
    (on_add_channel, on_remove_channel, on_message) in its own thread. To inform the FoxgloveServer
    of these changes safely, we use `asyncio.run_coroutine_threadsafe()` to "hop" back over to the
    main thread before calling methods on the server object.
    """
    middleware = ExampleMiddlewareThread()
    loop = asyncio.get_event_loop()

    async with FoxgloveServer("0.0.0.0", 8765, "example server") as server:
        # Since the middleware may have its own notion of channels or topics, we need to keep track
        # of which middleware channels correspond to which FoxgloveServer channels, so that we can
        # forward message data from the middleware and subscribe/unsubscribe calls to the
        # middleware.
        id_map: Dict[MiddlewareChannelId, ChannelId] = {}
        reverse_id_map: Dict[ChannelId, MiddlewareChannelId] = {}

        # Configure callbacks that our middleware will call when channels are added or removed and
        # when messages are received.

        def run_coroutine_on_server_thread(coro: Coroutine[Any, Any, None]):
            """
            The `run_coroutine_threadsafe()` function used below by default ignores exceptions
            raised in the `handler()` coroutines. To log any errors to the console, we set an
            exception-logging function as a done callback on the Future object returned by
            `run_coroutine_threadsafe()`.
            """

            def log_exc(future: "concurrent.futures.Future[Any]"):
                exc = future.exception()
                if exc:
                    logger.error(
                        "Error in middleware handler:",
                        exc_info=(type(exc), exc, exc.__traceback__),
                    )

            asyncio.run_coroutine_threadsafe(coro, loop).add_done_callback(log_exc)

        def on_add_channel(id: MiddlewareChannelId, channel: ChannelWithoutId):
            """
            When the middleware notifies us a channel is added, add it to the WebSocket server.
            """

            async def handler():
                logger.info("Adding channel %d %s", id, channel["topic"])
                ws_id = await server.add_channel(channel)
                if id in id_map:
                    raise Exception(
                        f"Tried to add channel id {id} which already exists"
                    )
                id_map[id] = ws_id
                reverse_id_map[ws_id] = id

            run_coroutine_on_server_thread(handler())

        def on_remove_channel(id: MiddlewareChannelId):
            """
            When the middleware notifies us a channel is removed, remove it from the WebSocket server.
            """

            async def handler():
                logger.info("Removing channel %d", id)
                ws_id = id_map.pop(id)
                del reverse_id_map[ws_id]
                await server.remove_channel(ws_id)

            run_coroutine_on_server_thread(handler())

        def on_message(id: MiddlewareChannelId, timestamp: int, payload: bytes):
            """
            When a message is received from the middleware, send it to clients via the WebSocket server.
            """

            async def handler():
                logger.info("Sending message on channel %d %d", id, timestamp)
                await server.send_message(id_map[id], timestamp, payload)

            run_coroutine_on_server_thread(handler())

        middleware.on_add_channel = on_add_channel
        middleware.on_remove_channel = on_remove_channel
        middleware.on_message = on_message

        # Configure callbacks that the FoxgloveServer will call when its clients subscribe or
        # unsubscribe from our channels.
        class Listener(FoxgloveServerListener):
            def on_subscribe(self, server: FoxgloveServer, channel_id: ChannelId):
                """
                When a WebSocket client first subscribes to a channel, create a subscription in the middleware.
                """
                logger.info("First client subscribed to %d", channel_id)
                middleware.handle_subscribe_threadsafe(reverse_id_map[channel_id])

            def on_unsubscribe(self, server: FoxgloveServer, channel_id: ChannelId):
                """
                When the last WebSocket client unsubscribes from a channel, remove the subscription in the middleware.
                """
                logger.info("Last client unsubscribed from %d", channel_id)
                middleware.handle_unsubscribe_threadsafe(reverse_id_map[channel_id])

        server.set_listener(Listener())

        try:
            # Start the middleware thread so it can run concurrently with the server.
            # The middleware runs in its own, separate thread and calls our callbacks in that thread.
            middleware.start()

            # On the main thread, we simply sleep forever (until canceled). This looks like it does
            # nothing, but it actually yields control to the asyncio event loop so that it can
            # continue processing tasks, such as those created by our `run_coroutine_threadsafe()`
            # calls above, as well as internal tasks created by the FoxgloveServer, such as when
            # data is received on the WebSocket.
            #
            # An alternative implementation of this function could use `asyncio.to_thread(...)`
            # instead of the `threading.Thread` class to run the middleware thread, in which case we
            # wouldn't need this additional dummy future.
            await asyncio.Future()
        finally:
            # To shut down cleanly, we notify the middleware that the program is shutting down, and
            # then wait for the thread to terminate.
            middleware.stop_threadsafe()
            middleware.join()


if __name__ == "__main__":
    run_cancellable(main())
