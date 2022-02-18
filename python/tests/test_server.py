import asyncio
import json
import logging
import pytest
from socket import AddressFamily
from typing import List, Tuple
from websockets.client import connect
from websockets.server import WebSocketServer

from foxglove_websocket.server import (
    FoxgloveServer,
    FoxgloveServerListener,
    MessageDataHeader,
)
from foxglove_websocket.types import BinaryOpcode, ChannelId, ChannelWithoutId


def get_server_url(server: WebSocketServer):
    """
    Return a url that can be used to connect to the test server.
    """
    assert server.sockets
    for sock in server.sockets:
        if sock.family == AddressFamily.AF_INET:
            return f"ws://{sock.getsockname()[0]}:{sock.getsockname()[1]}"
        elif sock.family == AddressFamily.AF_INET6:  # type: ignore
            return f"ws://[{sock.getsockname()[0]}]:{sock.getsockname()[1]}"
    raise RuntimeError("Expected IPv4 or IPv6 socket")


@pytest.mark.asyncio
async def test_shutdown_before_startup():
    server = FoxgloveServer("localhost", None, "test server")
    server.start()
    server.close()
    await server.wait_closed()


@pytest.mark.asyncio
async def test_shutdown_during_startup():
    server = FoxgloveServer("localhost", None, "test server")
    server.start()
    await asyncio.sleep(0)
    server.close()
    await server.wait_closed()


@pytest.mark.asyncio
async def test_shutdown_after_startup():
    server = FoxgloveServer("localhost", None, "test server")
    server.start()
    await server.wait_opened()
    server.close()
    await server.wait_closed()


@pytest.mark.asyncio
async def test_warn_invalid_channel():
    async with FoxgloveServer("localhost", None, "test server") as server:
        async with connect(get_server_url(await server.wait_opened())) as ws:
            assert json.loads(await ws.recv())["op"] == "serverInfo"
            assert json.loads(await ws.recv())["op"] == "advertise"
            await ws.send(
                json.dumps(
                    {
                        "op": "subscribe",
                        "subscriptions": [{"id": 42, "channelId": 999}],
                    }
                )
            )
            assert json.loads(await ws.recv()) == {
                "op": "status",
                "level": 1,
                "message": "Channel 999 is not available; ignoring subscription",
            }


@pytest.mark.asyncio
async def test_disconnect_during_send(caplog: pytest.LogCaptureFixture):
    async with FoxgloveServer("localhost", None, "test server") as server:
        async with connect(get_server_url(await server.wait_opened())) as ws:
            await ws.send(
                json.dumps(
                    {
                        "op": "subscribe",
                        "subscriptions": [{"id": 42, "channelId": 999}],
                    }
                )
            )

    for record in caplog.records:
        assert record.levelno < logging.ERROR, str(record)


@pytest.mark.asyncio
async def test_listener_callbacks():
    listener_calls: List[Tuple[str, ChannelId]] = []

    class Listener(FoxgloveServerListener):
        def on_subscribe(self, server: FoxgloveServer, channel_id: ChannelId):
            listener_calls.append(("subscribe", channel_id))

        def on_unsubscribe(self, server: FoxgloveServer, channel_id: ChannelId):
            listener_calls.append(("unsubscribe", channel_id))

    async with FoxgloveServer("localhost", None, "test server") as server:
        server.set_listener(Listener())
        ws_server = await server.wait_opened()
        chan_id = await server.add_channel(
            {
                "topic": "t",
                "encoding": "e",
                "schemaName": "S",
                "schema": "s",
            }
        )
        async with connect(get_server_url(ws_server)) as ws:
            assert json.loads(await ws.recv()) == {
                "op": "serverInfo",
                "name": "test server",
                "capabilities": [],
            }
            assert json.loads(await ws.recv()) == {
                "channels": [
                    {
                        "encoding": "e",
                        "id": chan_id,
                        "schema": "s",
                        "schemaName": "S",
                        "topic": "t",
                    }
                ],
                "op": "advertise",
            }
            await ws.send(
                json.dumps(
                    {
                        "op": "subscribe",
                        "subscriptions": [{"id": 42, "channelId": chan_id}],
                    }
                )
            )

    assert listener_calls == [("subscribe", chan_id), ("unsubscribe", chan_id)]


@pytest.mark.asyncio
async def test_update_channels():
    async with FoxgloveServer("localhost", None, "test server") as server:
        ws_server = await server.wait_opened()
        async with connect(get_server_url(ws_server)) as ws:
            assert json.loads(await ws.recv()) == {
                "op": "serverInfo",
                "name": "test server",
                "capabilities": [],
            }
            assert json.loads(await ws.recv()) == {
                "channels": [],
                "op": "advertise",
            }

            chan_id = await server.add_channel(
                {
                    "topic": "t",
                    "encoding": "e",
                    "schemaName": "S",
                    "schema": "s",
                }
            )
            assert json.loads(await ws.recv()) == {
                "channels": [
                    {
                        "encoding": "e",
                        "id": chan_id,
                        "schema": "s",
                        "schemaName": "S",
                        "topic": "t",
                    }
                ],
                "op": "advertise",
            }
            await server.remove_channel(chan_id)
            assert json.loads(await ws.recv()) == {
                "channelIds": [chan_id],
                "op": "unadvertise",
            }


@pytest.mark.asyncio
async def test_unsubscribe_during_send():
    subscribed_event = asyncio.Event()
    unsubscribed_event = asyncio.Event()

    class Listener(FoxgloveServerListener):
        def on_subscribe(self, server: FoxgloveServer, channel_id: ChannelId):
            subscribed_event.set()

        def on_unsubscribe(self, server: FoxgloveServer, channel_id: ChannelId):
            unsubscribed_event.set()

    async with FoxgloveServer("localhost", None, "test server") as server:
        server.set_listener(Listener())
        ws_server = await server.wait_opened()
        channel: ChannelWithoutId = {
            "topic": "t",
            "encoding": "e",
            "schemaName": "S",
            "schema": "s",
        }
        chan_id = await server.add_channel(channel)
        async with connect(get_server_url(ws_server)) as ws:
            assert json.loads(await ws.recv()) == {
                "op": "serverInfo",
                "name": "test server",
                "capabilities": [],
            }
            assert json.loads(await ws.recv()) == {
                "channels": [{**channel, "id": chan_id}],
                "op": "advertise",
            }

            await ws.send(
                json.dumps(
                    {
                        "op": "subscribe",
                        "subscriptions": [{"id": 42, "channelId": chan_id}],
                    }
                )
            )
            await subscribed_event.wait()

            # Force the server to yield during send_message() sending by starting a fragmented message
            assert len(ws_server.websockets) == 1
            client = next(iter(ws_server.websockets))
            fragment_future: "asyncio.Future[str]" = asyncio.Future()
            sent_first_fragment = asyncio.Event()

            async def fragments():
                yield "frag1"
                sent_first_fragment.set()
                yield await fragment_future

            pause_task = asyncio.create_task(client.send(fragments()))
            await sent_first_fragment.wait()

            payload = json.dumps({"hello": "world"}).encode()
            send_task = asyncio.create_task(server.send_message(chan_id, 100, payload))

            await ws.send(json.dumps({"op": "unsubscribe", "subscriptionIds": [42]}))
            await unsubscribed_event.wait()

            fragment_future.set_result("frag2")
            await pause_task
            await send_task

            assert await ws.recv() == "frag1frag2"
            assert (
                await ws.recv()
                == MessageDataHeader.pack(BinaryOpcode.MESSAGE_DATA, 42, 100) + payload
            )
