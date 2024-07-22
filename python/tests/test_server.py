import asyncio
import json
import logging
import pytest
from socket import AddressFamily
from struct import Struct
from typing import Dict, List, Tuple, Optional
from websockets.client import connect
from websockets.server import WebSocketServer

from foxglove_websocket.server import (
    FoxgloveServer,
    FoxgloveServerListener,
    MessageDataHeader,
)
from foxglove_websocket.types import (
    BinaryOpcode,
    ChannelId,
    ChannelWithoutId,
    ClientBinaryOpcode,
    Parameter,
    ServiceWithoutId,
    ServiceId,
)


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
    server = FoxgloveServer("127.0.0.1", None, "test server")
    server.start()
    server.close()
    await server.wait_closed()


@pytest.mark.asyncio
async def test_shutdown_during_startup():
    server = FoxgloveServer("127.0.0.1", None, "test server")
    server.start()
    await asyncio.sleep(0)
    server.close()
    await server.wait_closed()


@pytest.mark.asyncio
async def test_shutdown_after_startup():
    server = FoxgloveServer("127.0.0.1", None, "test server")
    server.start()
    await server.wait_opened()
    server.close()
    await server.wait_closed()


@pytest.mark.asyncio
async def test_warn_invalid_channel():
    async with FoxgloveServer("127.0.0.1", None, "test server") as server:
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
                "id": None,
            }


@pytest.mark.asyncio
async def test_disconnect_during_send(caplog: pytest.LogCaptureFixture):
    async with FoxgloveServer("127.0.0.1", None, "test server") as server:
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
        async def on_subscribe(self, server: FoxgloveServer, channel_id: ChannelId):
            listener_calls.append(("subscribe", channel_id))

        async def on_unsubscribe(self, server: FoxgloveServer, channel_id: ChannelId):
            listener_calls.append(("unsubscribe", channel_id))

    async with FoxgloveServer("127.0.0.1", None, "test server") as server:
        server.set_listener(Listener())
        ws_server = await server.wait_opened()
        chan_id = await server.add_channel(
            {
                "topic": "t",
                "encoding": "e",
                "schemaName": "S",
                "schema": "s",
                "schemaEncoding": "s",
            }
        )
        async with connect(get_server_url(ws_server)) as ws:
            assert json.loads(await ws.recv()) == {
                "op": "serverInfo",
                "name": "test server",
                "capabilities": [],
                "metadata": None,
                "sessionId": None,
                "supportedEncodings": None,
            }
            assert json.loads(await ws.recv()) == {
                "channels": [
                    {
                        "encoding": "e",
                        "id": chan_id,
                        "schema": "s",
                        "schemaName": "S",
                        "topic": "t",
                        "schemaEncoding": "s",
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
    async with FoxgloveServer("127.0.0.1", None, "test server") as server:
        ws_server = await server.wait_opened()
        async with connect(get_server_url(ws_server)) as ws:
            assert json.loads(await ws.recv()) == {
                "op": "serverInfo",
                "name": "test server",
                "capabilities": [],
                "metadata": None,
                "sessionId": None,
                "supportedEncodings": None,
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
                    "schemaEncoding": "s",
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
                        "schemaEncoding": "s",
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
        async def on_subscribe(self, server: FoxgloveServer, channel_id: ChannelId):
            subscribed_event.set()

        async def on_unsubscribe(self, server: FoxgloveServer, channel_id: ChannelId):
            unsubscribed_event.set()

    async with FoxgloveServer("127.0.0.1", None, "test server") as server:
        server.set_listener(Listener())
        ws_server = await server.wait_opened()
        channel: ChannelWithoutId = {
            "topic": "t",
            "encoding": "e",
            "schemaName": "S",
            "schema": "s",
            "schemaEncoding": "s",
        }
        chan_id = await server.add_channel(channel)
        async with connect(get_server_url(ws_server)) as ws:
            assert json.loads(await ws.recv()) == {
                "op": "serverInfo",
                "name": "test server",
                "capabilities": [],
                "metadata": None,
                "sessionId": None,
                "supportedEncodings": None,
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


@pytest.mark.asyncio
async def test_service_call():
    class Listener(FoxgloveServerListener):
        async def on_service_request(
            self,
            server: FoxgloveServer,
            service_id: ServiceId,
            call_id: str,
            encoding: str,
            payload: bytes,
        ) -> bytes:
            assert encoding == "json"
            assert json.loads(payload) == {"data": True}
            return json.dumps({"success": True}).encode()

    async with FoxgloveServer(
        "127.0.0.1",
        None,
        "test server",
        capabilities=["services"],
        supported_encodings=["json"],
    ) as server:
        server.set_listener(Listener())
        ws_server = await server.wait_opened()

        service: ServiceWithoutId = {
            "name": "set_bool",
            "type": "set_bool",
            "request": {
                "encoding": "json",
                "schemaName": "requestSchema",
                "schemaEncoding": "jsonschema",
                "schema": json.dumps(
                    {
                        "type": "object",
                        "properties": {
                            "data": {"type": "boolean"},
                        },
                    }
                ),
            },
            "response": {
                "encoding": "json",
                "schemaName": "responseSchema",
                "schemaEncoding": "jsonschema",
                "schema": json.dumps(
                    {
                        "type": "object",
                        "properties": {
                            "success": {"type": "boolean"},
                        },
                    }
                ),
            },
            "requestSchema": None,
            "responseSchema": None,
        }
        service_id = await server.add_service(service)

        async with connect(get_server_url(ws_server)) as ws:
            assert json.loads(await ws.recv()) == {
                "op": "serverInfo",
                "name": "test server",
                "capabilities": ["services"],
                "supportedEncodings": ["json"],
                "metadata": None,
                "sessionId": None,
            }

            advertise_msg = json.loads(await ws.recv())
            assert advertise_msg["op"] == "advertise"

            assert json.loads(await ws.recv()) == {
                "services": [{**service, "id": service_id}],
                "op": "advertiseServices",
            }

            service_header = Struct("<BIII")
            call_id = 123
            encoding = "json"
            request_header = service_header.pack(
                ClientBinaryOpcode.SERVICE_CALL_REQUEST,
                service_id,
                call_id,
                len(encoding),
            )
            request_payload = json.dumps({"data": True})
            await ws.send([request_header, encoding.encode(), request_payload.encode()])

            response = await ws.recv()
            assert isinstance(response, bytes)
            (
                op,
                res_service_id,
                res_call_id,
                encoding_length,
            ) = service_header.unpack_from(response)
            assert op == BinaryOpcode.SERVICE_CALL_RESPONSE
            assert res_service_id == service_id
            assert res_call_id == call_id
            assert encoding_length == len(encoding)
            response_payload = response[service_header.size + encoding_length :]
            assert json.loads(response_payload) == {"success": True}


@pytest.mark.asyncio
async def test_param_get_set():
    class Listener(FoxgloveServerListener):
        def __init__(self) -> None:
            self._params: Dict[str, Parameter] = {
                "int_param": Parameter(name="int_param", value=123, type=None),
                "str_param": Parameter(name="str_param", value="foo", type=None),
            }

        async def on_get_parameters(
            self,
            server: FoxgloveServer,
            param_names: List[str],
            request_id: Optional[str],
        ) -> List[Parameter]:
            if len(param_names) == 0:
                return list(self._params.values())
            else:
                return [
                    param
                    for param in self._params.values()
                    if param["name"] in param_names
                ]

        async def on_set_parameters(
            self,
            server: FoxgloveServer,
            params: List[Parameter],
            request_id: Optional[str],
        ):
            for param in params:
                self._params[param["name"]] = param
            param_names = [param["name"] for param in params]
            return [
                param for param in self._params.values() if param["name"] in param_names
            ]

    async with FoxgloveServer(
        "127.0.0.1",
        None,
        "test server",
        capabilities=["parameters"],
    ) as server:
        server.set_listener(Listener())
        ws_server = await server.wait_opened()

        async with connect(get_server_url(ws_server)) as ws:
            assert json.loads(await ws.recv()) == {
                "op": "serverInfo",
                "name": "test server",
                "capabilities": ["parameters"],
                "metadata": None,
                "sessionId": None,
                "supportedEncodings": None,
            }

            advertise_msg = json.loads(await ws.recv())
            assert advertise_msg["op"] == "advertise"

            await ws.send(json.dumps({"op": "getParameters", "parameterNames": []}))
            assert json.loads(await ws.recv()) == {
                "op": "parameterValues",
                "parameters": [
                    {"name": "int_param", "value": 123, "type": None},
                    {"name": "str_param", "value": "foo", "type": None},
                ],
                "id": None,
            }

            await ws.send(
                json.dumps({"op": "getParameters", "parameterNames": ["str_param"]})
            )
            assert json.loads(await ws.recv()) == {
                "op": "parameterValues",
                "parameters": [
                    {"name": "str_param", "value": "foo", "type": None},
                ],
                "id": None,
            }

            await ws.send(
                json.dumps(
                    {
                        "op": "setParameters",
                        "id": "set-req",
                        "parameters": [
                            {"name": "str_param", "value": "bar", "type": None},
                        ],
                    }
                )
            )
            assert json.loads(await ws.recv()) == {
                "op": "parameterValues",
                "id": "set-req",
                "parameters": [
                    {"name": "str_param", "value": "bar", "type": None},
                ],
            }
