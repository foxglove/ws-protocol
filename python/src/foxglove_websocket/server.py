from abc import ABC, abstractmethod
import asyncio
import json
import logging
from struct import Struct
from typing import Any, Dict, Optional, Set, cast
from websockets.server import serve, WebSocketServer, WebSocketServerProtocol
from websockets.exceptions import ConnectionClosed
from dataclasses import dataclass
from websockets.typing import Data, Subprotocol

from .types import (
    BinaryOpcode,
    Channel,
    ChannelId,
    ChannelWithoutId,
    ClientMessage,
    SubscriptionId,
    ServerMessage,
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
    subscriptions: Dict[SubscriptionId, ChannelId]
    subscriptions_by_channel: Dict[ChannelId, Set[SubscriptionId]]


class FoxgloveServerListener(ABC):
    @abstractmethod
    def on_subscribe(self, server: "FoxgloveServer", channel_id: ChannelId):
        """
        Called when the first client subscribes to `channel_id`.
        """
        ...

    @abstractmethod
    def on_unsubscribe(self, server: "FoxgloveServer", channel_id: ChannelId):
        """
        Called when the last subscribed client unsubscribes from `channel_id`.
        """
        ...


class FoxgloveServer:
    _clients: Dict[WebSocketServerProtocol, Client]
    _channels: Dict[ChannelId, Channel]
    _next_channel_id: ChannelId
    _logger: logging.Logger
    _listener: Optional[FoxgloveServerListener]
    _opened: "asyncio.Future[WebSocketServer]"

    def __init__(
        self,
        host: str,
        port: Optional[int],
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
        self._listener = None
        self._opened = asyncio.get_running_loop().create_future()

    def set_listener(self, listener: FoxgloveServerListener):
        self._listener = listener

    def _any_subscribed(self, chan_id: ChannelId):
        return any(
            chan_id in client.subscriptions_by_channel
            for client in self._clients.values()
        )

    async def __aenter__(self):
        self.start()
        return self

    async def __aexit__(self, exc_type: Any, exc_val: Any, traceback: Any):
        self.close()
        await self.wait_closed()

    async def wait_opened(self):
        return await self._opened

    def start(self):
        self._task = asyncio.create_task(self._run())

    def close(self):
        self._logger.info("Shutting down...")
        self._task.cancel()

    async def wait_closed(self):
        try:
            await self._task
        except asyncio.CancelledError:
            pass

    async def _run(self):
        # TODO: guard against multiple run calls?
        self._logger.info("Starting server...")
        try:
            server = await serve(
                self._handle_connection,
                self.host,
                self.port,
                subprotocols=[Subprotocol("foxglove.websocket.v1")],
            )
            self._opened.set_result(server)
        except asyncio.CancelledError:
            self._logger.info("Canceled during server startup")
            return

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
        new_channel = Channel(id=new_id, **channel)
        self._channels[new_id] = new_channel
        for client in self._clients.values():
            await self._send_json(
                client.connection,
                {
                    "op": "advertise",
                    "channels": [new_channel],
                },
            )
        return new_id

    async def remove_channel(self, chan_id: ChannelId):
        del self._channels[chan_id]
        for client in self._clients.values():
            subs = client.subscriptions_by_channel.get(chan_id)
            if subs is not None:
                for sub_id in subs:
                    del client.subscriptions[sub_id]
                del client.subscriptions_by_channel[chan_id]

            await self._send_json(
                client.connection,
                {
                    "op": "unadvertise",
                    "channelIds": [chan_id],
                },
            )

    async def send_message(self, chan_id: ChannelId, timestamp: int, payload: bytes):
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
        subscription: SubscriptionId,
        timestamp: int,
        payload: bytes,
    ):
        header = MessageDataHeader.pack(
            BinaryOpcode.MESSAGE_DATA, subscription, timestamp
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
                    "op": "serverInfo",
                    "name": self.name,
                    "capabilities": [],
                },
            )
            await self._send_json(
                connection,
                {
                    "op": "advertise",
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
            potential_unsubscribes = client.subscriptions_by_channel.keys()
            del self._clients[connection]
            if self._listener:
                for chan_id in potential_unsubscribes:
                    if not self._any_subscribed(chan_id):
                        self._listener.on_unsubscribe(self, chan_id)

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
        except ConnectionClosed:
            self._logger.debug(
                "Client connection closed while handling message %s", raw_message
            )
        except Exception as exc:
            self._logger.exception("Error handling message %s", raw_message)
            await self._send_json(
                client.connection,
                {
                    "op": "status",
                    "level": StatusLevel.ERROR,
                    "message": f"{type(exc).__name__}: {exc}",
                },
            )

    async def _handle_client_message(self, client: Client, message: ClientMessage):
        if message["op"] == "subscribe":
            for sub in message["subscriptions"]:
                chan_id = sub["channelId"]
                sub_id = sub["id"]
                if sub_id in client.subscriptions:
                    await self._send_json(
                        client.connection,
                        {
                            "op": "status",
                            "level": StatusLevel.ERROR,
                            "message": f"Client subscription id {sub_id} was already used; ignoring subscription",
                        },
                    )
                    continue
                chan = self._channels.get(chan_id)
                if chan is None:
                    await self._send_json(
                        client.connection,
                        {
                            "op": "status",
                            "level": StatusLevel.WARNING,
                            "message": f"Channel {chan_id} is not available; ignoring subscription",
                        },
                    )
                    continue
                self._logger.debug(
                    "Client %s subscribed to channel %s",
                    client.connection.remote_address,
                    chan_id,
                )
                first_subscription = not self._any_subscribed(chan_id)
                client.subscriptions[sub_id] = chan_id
                client.subscriptions_by_channel.setdefault(chan_id, set()).add(sub_id)
                if self._listener and first_subscription:
                    self._listener.on_subscribe(self, chan_id)

        elif message["op"] == "unsubscribe":
            for sub_id in message["subscriptionIds"]:
                chan_id = client.subscriptions.get(sub_id)
                if chan_id is None:
                    await self._send_json(
                        client.connection,
                        {
                            "op": "status",
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
                del client.subscriptions[sub_id]
                subs = client.subscriptions_by_channel.get(chan_id)
                if subs is not None:
                    subs.remove(sub_id)
                    if len(subs) == 0:
                        del client.subscriptions_by_channel[chan_id]
                if self._listener and not self._any_subscribed(chan_id):
                    self._listener.on_unsubscribe(self, chan_id)
        else:
            raise ValueError(f"Unrecognized client opcode: {message['op']}")
