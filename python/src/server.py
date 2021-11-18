import asyncio
import logging
from struct import Struct
from typing import Any, Dict, Set
from websockets.server import serve, WebSocketServerProtocol
from websockets.exceptions import ConnectionClosed
from dataclasses import dataclass
from websockets.typing import Data, Subprotocol

from .gen.proto import protocol_v1_pb2 as protocol_v1

from .types import (
    ChannelId,
    ChannelWithoutId,
    ClientSubscriptionId,
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
    subscriptions: Dict[ClientSubscriptionId, ChannelId]
    subscriptions_by_channel: Dict[ChannelId, Set[ClientSubscriptionId]]


class FoxgloveServer:
    _clients: Dict[WebSocketServerProtocol, Client]
    _channels: Dict[ChannelId, protocol_v1.Advertise.Channel]
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
            subprotocols=[Subprotocol("foxglove.websocket.v1")],
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
        self._channels[new_id] = protocol_v1.Advertise.Channel(
            id=new_id,
            topic=channel["topic"],
            schema_name=channel["schemaName"],
            schema=channel["schema"],
        )
        #  Channel(id=new_id, **channel)
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

    # async def _send_json(self, connection: WebSocketServerProtocol, msg: ServerMessage):
    #     await connection.send(json.dumps(msg, separators=(",", ":")))

    async def _send_message_data(
        self,
        connection: WebSocketServerProtocol,
        *,
        subscription: ClientSubscriptionId,
        timestamp: int,
        payload: bytes,
    ):
        # TODO: avoid double copy of payload bytes
        await connection.send(
            protocol_v1.ServerMessage(
                message_data=protocol_v1.MessageData(
                    subscription_id=subscription,
                    receive_timestamp=timestamp,
                    payload=payload,
                )
            ).SerializeToString()
        )

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
            await connection.send(
                protocol_v1.ServerMessage(
                    server_info=protocol_v1.ServerInfo(name=self.name, capabilities=[])
                ).SerializeToString(),
            )
            await connection.send(
                protocol_v1.ServerMessage(
                    advertise=protocol_v1.Advertise(
                        channels=list(self._channels.values())
                    )
                ).SerializeToString()
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
            if not isinstance(raw_message, bytes):
                raise TypeError(f"Expected binary message, got {raw_message}")
            message = protocol_v1.ClientMessage()
            used = message.ParseFromString(raw_message)
            if used != len(raw_message):
                raise ValueError(
                    f"Extraneous bytes in raw message (used {used} of {len(raw_message)}"
                )
            await self._handle_client_message(client, message)

        except Exception as exc:
            self._logger.exception("Error handling message %s", raw_message)
            await client.connection.send(
                protocol_v1.ServerMessage(
                    status_message=protocol_v1.StatusMessage(
                        level=protocol_v1.StatusMessage.LEVEL_ERROR,
                        message=f"{type(exc).__name__}: {exc}",
                    )
                ).SerializeToString()
            )

    async def _handle_client_message(
        self, client: Client, message: protocol_v1.ClientMessage
    ):
        # if message["op"] == ClientOpcode.LIST_CHANNELS:
        #     await self._send_json(
        #         client.connection, {"op": ServerOpcode.CHANNEL_LIST, "channels": []}
        #     )
        which = message.WhichOneof("message")
        if which == "subscribe":
            for sub in message.subscribe.subscriptions:
                chan_id = ChannelId(sub.channel_id)
                sub_id = ClientSubscriptionId(sub.id)
                if sub_id in client.subscriptions:
                    await client.connection.send(
                        protocol_v1.ServerMessage(
                            status_message=protocol_v1.StatusMessage(
                                level=protocol_v1.StatusMessage.LEVEL_ERROR,
                                message=f"Client subscription id {sub_id} was already used; ignoring subscription",
                            )
                        ).SerializeToString()
                    )
                    continue
                chan = self._channels.get(chan_id)
                if chan is None:
                    await client.connection.send(
                        protocol_v1.ServerMessage(
                            status_message=protocol_v1.StatusMessage(
                                level=protocol_v1.StatusMessage.LEVEL_WARNING,
                                message=f"Channel {chan_id} is not available; ignoring subscription",
                            )
                        ).SerializeToString()
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

        elif which == "unsubscribe":
            for sub_id in message.unsubscribe.subscription_ids:
                sub_id = ClientSubscriptionId(sub_id)
                chan_id = client.subscriptions.get(sub_id)
                if chan_id is None:
                    await client.connection.send(
                        protocol_v1.ServerMessage(
                            status_message=protocol_v1.StatusMessage(
                                level=protocol_v1.StatusMessage.LEVEL_WARNING,
                                message=f"Client subscription id {sub_id} did not exist; ignoring unsubscription",
                            )
                        ).SerializeToString()
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
            raise ValueError(f"Unrecognized client message: {message}")
