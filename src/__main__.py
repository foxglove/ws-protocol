#!/usr/bin/env python

import asyncio
import json
import logging
import signal
from enum import IntEnum
from struct import Struct
from typing import Literal, NewType, TypedDict, Union
from websockets.server import serve, WebSocketServerProtocol
from websockets.exceptions import ConnectionClosed
from collections import defaultdict
import time

from websockets.typing import Subprotocol

logger = logging.getLogger("example")
logger.setLevel(logging.DEBUG)
handler = logging.StreamHandler()
handler.setFormatter(logging.Formatter("%(asctime)s: [%(levelname)s] %(message)s"))
logger.addHandler(handler)

ChannelId = NewType("ChannelId", int)
ClientSubscriptionId = NewType("ClientSubscriptionId", int)


class ClientOpcode(IntEnum):
    LIST_CHANNELS = 0x02
    SUBSCRIBE = 0x03
    UNSUBSCRIBE = 0x04


class ListChannels(TypedDict):
    op: Literal[ClientOpcode.LIST_CHANNELS]


class Subscription(TypedDict):
    channel: ChannelId
    clientSubscriptionId: ClientSubscriptionId


class Subscribe(TypedDict):
    op: Literal[ClientOpcode.SUBSCRIBE]
    subscriptions: list[Subscription]


class Unsubscribe(TypedDict):
    op: Literal[ClientOpcode.UNSUBSCRIBE]
    unsubscriptions: list[ClientSubscriptionId]


ClientMessage = Union[ListChannels, Subscribe, Unsubscribe]


class ServerOpcode(IntEnum):
    SERVER_INFO = 0x80
    STATUS_MESSAGE = 0x81
    CHANNEL_LIST = 0x82
    # SUBSCRIPTION_ACK = 0x83
    MESSAGE_DATA = 0x85


class ServerInfo(TypedDict):
    op: Literal[ServerOpcode.SERVER_INFO]
    id: str
    capabilities: list[str]


class StatusLevel(IntEnum):
    INFO = 0
    WARNING = 1
    ERROR = 2


class StatusMessage(TypedDict):
    op: Literal[ServerOpcode.STATUS_MESSAGE]
    level: StatusLevel
    message: str


class Channel(TypedDict):
    id: ChannelId
    topic: str
    encoding: str
    schemaName: str
    schema: str


class ChannelList(TypedDict):
    op: Literal[ServerOpcode.CHANNEL_LIST]
    channels: list[Channel]


ServerMessage = Union[ServerInfo, StatusMessage, ChannelList]


# async def send_loop(ws):
#     for i in range(10):
#         await asyncio.sleep(1)
#         await ws.send(str(i))

SERVER_ID = "example server"

message_data_header = Struct("<BIQ")


async def handle_connection(connection: WebSocketServerProtocol, path: str) -> None:
    logger.info("Connection made to %s: %s", connection.remote_address, path)
    channels_by_id: dict[ChannelId, Channel] = {
        ChannelId(1): {
            "id": ChannelId(1),
            "topic": "/foo",
            "encoding": "protobuf",
            "schemaName": "Foo",
            "schema": "",
        }
    }
    subscriptions: dict[ClientSubscriptionId, ChannelId] = {}
    subscriptions_ids_by_channel: defaultdict[
        ChannelId, set[ClientSubscriptionId]
    ] = defaultdict(set)

    async def send(msg: ServerMessage):
        await connection.send(json.dumps(msg, separators=(",", ":")))

    async def send_message_data(
        *, subscription: ClientSubscriptionId, timestamp: int, payload: bytes
    ):
        buf = bytearray(message_data_header.size + len(payload))
        message_data_header.pack_into(
            buf, 0, ServerOpcode.MESSAGE_DATA, subscription, timestamp
        )
        buf[message_data_header.size :] = payload
        await connection.send(buf)

    async def handle_message(message: ClientMessage):
        op = message["op"]
        if op == ClientOpcode.LIST_CHANNELS:
            await send({"op": ServerOpcode.CHANNEL_LIST, "channels": []})
        elif op == ClientOpcode.SUBSCRIBE:
            for unsub in message["subscriptions"]:
                chan = channels_by_id[unsub["channel"]]
                subscriptions[unsub["clientSubscriptionId"]] = chan["id"]
                subscriptions_ids_by_channel[chan["id"]].add(
                    unsub["clientSubscriptionId"]
                )
        elif op == ClientOpcode.UNSUBSCRIBE:
            for clientSubscriptionId in message["unsubscriptions"]:
                chan = subscriptions[clientSubscriptionId]
                del subscriptions[clientSubscriptionId]
                subscriptions_ids_by_channel[chan].remove(clientSubscriptionId)
            await send(
                {
                    "op": ServerOpcode.STATUS_MESSAGE,
                    "level": StatusLevel.ERROR,
                    "message": "Not yet implemented",
                }
            )
        else:
            raise ValueError(f"Unrecognized client opcode: {op}")

    async def handle_raw_message(raw_message):
        try:
            if not isinstance(raw_message, str):
                raise TypeError(
                    f"Expected text message, got {type(raw_message)} (first byte: {next(iter(raw_message), None)})"
                )
            message = json.loads(raw_message)
            logger.debug("Got message: %s", message)
            if not isinstance(message, dict):
                raise TypeError(f"Expected JSON object, got {type(message)}")
            await handle_message(message)
        except Exception as exc:
            logger.exception("Error handling message %s", raw_message)
            await send(
                {
                    "op": ServerOpcode.STATUS_MESSAGE,
                    "level": StatusLevel.ERROR,
                    "message": f"{type(exc).__name__}: {exc}",
                }
            )

    channel_list: ChannelList = {
        "op": ServerOpcode.CHANNEL_LIST,
        "channels": [
            {
                "id": ChannelId(1),
                "topic": "/foo",
                "encoding": "protobuf",
                "schemaName": "Foo",
                "schema": "",
            }
        ],
    }

    await send({"op": ServerOpcode.SERVER_INFO, "id": SERVER_ID, "capabilities": []})
    await send(channel_list)

    async def send_msg():
        await asyncio.sleep(1)
        subscription = ClientSubscriptionId(1)
        timestamp = time.time_ns()
        await send_message_data(
            subscription=subscription, timestamp=timestamp, payload=b"hello world"
        )

    asyncio.create_task(send_msg())

    try:
        async for raw_message in connection:
            await handle_raw_message(raw_message)
    except ConnectionClosed as closed:
        logger.info(
            "Connection to %s closed: %s %r",
            connection.remote_address,
            closed.code,
            closed.reason,
        )

    # for t in asyncio.all_tasks():
    #     await t
    # send_fut = asyncio.create_task(send_loop(websocket))
    # async for message in websocket:
    #     pass
    # await send_fut


async def main():
    logger.info("Starting server")
    server = await serve(
        handle_connection, "localhost", 8765, subprotocols=[Subprotocol("x-foxglove-1")]
    )
    for sock in server.sockets or []:
        logger.info("Server listening on %s", sock.getsockname())

    def sigint_handler():
        logger.info("Closing server due to SIGINT")
        server.close()

    asyncio.get_event_loop().add_signal_handler(signal.SIGINT, sigint_handler)
    await server.wait_closed()
    logger.info("Server closed")


asyncio.run(main())
