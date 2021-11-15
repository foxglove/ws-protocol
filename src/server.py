import asyncio
import json
import logging
from struct import Struct
from typing import Any, cast
from websockets.server import serve, WebSocketServerProtocol
from websockets.exceptions import ConnectionClosed
from dataclasses import dataclass
from websockets.typing import Data, Subprotocol

from .types import (
    Channel,
    ChannelId,
    ChannelWithoutId,
    ClientMessage,
    ClientOpcode,
    ClientSubscriptionId,
    ServerMessage,
    ServerOpcode,
    StatusLevel,
)


def _get_default_logger():
    logger = logging.getLogger("FoxgloveServer")
    logger.setLevel(logging.DEBUG)
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s: [%(levelname)s] %(message)s"))
    logger.addHandler(handler)
    return logger


MessageDataHeader = Struct("<BIQ")


@dataclass
class Client:
    connection: WebSocketServerProtocol
    subscriptions: dict[ClientSubscriptionId, ChannelId]
    subscriptions_by_channel: dict[ChannelId, set[ClientSubscriptionId]]


class FoxgloveServer:
    _clients: dict[WebSocketServerProtocol, Client]
    _channels: dict[ChannelId, Channel]
    _next_channel_id: ChannelId
    _logger: logging.Logger

    def __init__(
        self,
        host: str,
        port: int,
        name: str,
        *,
        logger: logging.Logger = _get_default_logger(),
    ):
        self.host = host
        self.port = port
        self.name = name
        self._clients = {}
        self._channels = {}
        self._next_channel_id = ChannelId(0)
        self._logger = logger

    async def __aenter__(self):
        self.start()
        return self

    async def __aexit__(self, exc_type: Any, exc_val: Any, traceback: Any):
        self.close()
        await self.wait_closed()

    def start(self):
        self._task = asyncio.create_task(self._run())

    def close(self):
        self._logger.info("Shutting down...")
        self._task.cancel()

    async def wait_closed(self):
        await self._task

    async def _run(self):
        # TODO: guard against multiple run calls?
        self._logger.info("Starting server...")
        server = await serve(
            self._handle_connection,
            self.host,
            self.port,
            subprotocols=[Subprotocol("x-foxglove-1")],
        )
        for sock in server.sockets or []:
            self._logger.info("Server listening on %s", sock.getsockname())
        try:
            await server.wait_closed()
        except asyncio.CancelledError:
            server.close()
            await server.wait_closed()
            self._logger.info("Server closed")

    async def add_channel(self, channel: ChannelWithoutId):
        new_id = self._next_channel_id
        self._next_channel_id = ChannelId(new_id + 1)
        self._channels[new_id] = Channel(id=new_id, **channel)
        # TODO: notify clients of new channels
        return new_id

    async def remove_channel(self, chan_id: ChannelId):
        # TODO: notify clients of removed channel
        del self._channels[chan_id]
        for client in self._clients.values():
            subs = client.subscriptions_by_channel.get(chan_id)
            if subs is not None:
                # TODO: notify clients of expired subscriptions?
                for sub_id in subs:
                    del client.subscriptions[sub_id]
                del client.subscriptions_by_channel[chan_id]

    async def handle_message(self, chan_id: ChannelId, timestamp: int, payload: bytes):
        for client in self._clients.values():
            subs = client.subscriptions_by_channel.get(chan_id, set())
            for sub_id in subs:
                await self._send_message_data(
                    client.connection,
                    subscription=sub_id,
                    timestamp=timestamp,
                    payload=payload,
                )

    async def _send_json(self, connection: WebSocketServerProtocol, msg: ServerMessage):
        await connection.send(json.dumps(msg, separators=(",", ":")))

    async def _send_message_data(
        self,
        connection: WebSocketServerProtocol,
        *,
        subscription: ClientSubscriptionId,
        timestamp: int,
        payload: bytes,
    ):
        header = MessageDataHeader.pack(
            ServerOpcode.MESSAGE_DATA, subscription, timestamp
        )
        await connection.send([header, payload])

    async def _handle_connection(
        self, connection: WebSocketServerProtocol, path: str
    ) -> None:
        self._logger.info(
            "Connection to %s opened via %s", connection.remote_address, path
        )

        client = Client(
            connection=connection, subscriptions={}, subscriptions_by_channel={}
        )
        self._clients[connection] = client

        try:
            await self._send_json(
                connection,
                {
                    "op": ServerOpcode.SERVER_INFO,
                    "name": self.name,
                    "capabilities": [],
                },
            )
            await self._send_json(
                connection,
                {
                    "op": ServerOpcode.CHANNEL_LIST,
                    "channels": list(self._channels.values()),
                },
            )
            async for raw_message in connection:
                await self._handle_raw_client_message(client, raw_message)

        except ConnectionClosed as closed:
            self._logger.info(
                "Connection to %s closed: %s %r",
                connection.remote_address,
                closed.code,
                closed.reason,
            )

        except Exception:
            self._logger.exception(
                "Error handling client connection %s", connection.remote_address
            )
            await connection.close(1011)  # Internal Error

        finally:
            # TODO: invoke user unsubscribe callback
            del self._clients[connection]

    async def _handle_raw_client_message(self, client: Client, raw_message: Data):
        try:
            if not isinstance(raw_message, str):
                raise TypeError(
                    f"Expected text message, got {type(raw_message)} (first byte: {next(iter(raw_message), None)})"
                )
            message = json.loads(raw_message)
            self._logger.debug("Got message: %s", message)
            if not isinstance(message, dict):
                raise TypeError(f"Expected JSON object, got {type(message)}")
            await self._handle_client_message(client, cast(ClientMessage, message))

        except Exception as exc:
            self._logger.exception("Error handling message %s", raw_message)
            await self._send_json(
                client.connection,
                {
                    "op": ServerOpcode.STATUS_MESSAGE,
                    "level": StatusLevel.ERROR,
                    "message": f"{type(exc).__name__}: {exc}",
                },
            )

    async def _handle_client_message(self, client: Client, message: ClientMessage):
        if message["op"] == ClientOpcode.LIST_CHANNELS:
            await self._send_json(
                client.connection, {"op": ServerOpcode.CHANNEL_LIST, "channels": []}
            )
        elif message["op"] == ClientOpcode.SUBSCRIBE:
            for sub in message["subscriptions"]:
                chan_id = sub["channel"]
                sub_id = sub["clientSubscriptionId"]
                if sub_id in client.subscriptions:
                    await self._send_json(
                        client.connection,
                        {
                            "op": ServerOpcode.STATUS_MESSAGE,
                            "level": StatusLevel.ERROR,
                            "message": f"Client subscription id {sub['clientSubscriptionId']} was already used; ignoring subscription",
                        },
                    )
                    continue
                chan = self._channels.get(chan_id)
                if chan is None:
                    await self._send_json(
                        client.connection,
                        {
                            "op": ServerOpcode.STATUS_MESSAGE,
                            "level": StatusLevel.WARNING,
                            "message": f"Channel {sub['channel']} is not available; ignoring subscription",
                        },
                    )
                    continue
                self._logger.debug(
                    "Client %s subscribed to channel %s",
                    client.connection.remote_address,
                    chan_id,
                )
                # TODO: invoke user subscribe callback
                client.subscriptions[sub_id] = chan_id
                client.subscriptions_by_channel.setdefault(chan_id, set()).add(sub_id)

        elif message["op"] == ClientOpcode.UNSUBSCRIBE:
            for sub_id in message["unsubscriptions"]:
                chan_id = client.subscriptions.get(sub_id)
                if chan_id is None:
                    await self._send_json(
                        client.connection,
                        {
                            "op": ServerOpcode.STATUS_MESSAGE,
                            "level": StatusLevel.WARNING,
                            "message": f"Client subscription id {sub_id} did not exist; ignoring unsubscription",
                        },
                    )
                    continue
                self._logger.debug(
                    "Client %s unsubscribed from channel %s",
                    client.connection.remote_address,
                    chan_id,
                )
                # TODO: invoke user unsubscribe callback
                del client.subscriptions[sub_id]
                subs = client.subscriptions_by_channel.get(chan_id)
                if subs is not None:
                    subs.remove(sub_id)
                    if len(subs) == 0:
                        del client.subscriptions_by_channel[chan_id]
        else:
            raise ValueError(f"Unrecognized client opcode: {message['op']}")
