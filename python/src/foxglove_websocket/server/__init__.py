from abc import ABC
import asyncio
import inspect
import json
import logging
from struct import Struct
from typing import (
    Any,
    Dict,
    List,
    Mapping,
    Optional,
    Set,
    Union,
    Tuple,
    cast,
    Coroutine,
)
from websockets.server import serve, WebSocketServer, WebSocketServerProtocol
from websockets.exceptions import ConnectionClosed
from websockets.typing import Data, Subprotocol

from .client_state import ClientState
from ..types import (
    BinaryOpcode,
    Channel,
    ChannelId,
    ChannelWithoutId,
    ClientBinaryOpcode,
    ClientChannel,
    ClientChannelId,
    ClientJsonMessage,
    Parameter,
    Service,
    ServiceId,
    ServiceWithoutId,
    SubscriptionId,
    ServerJsonMessage,
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
TimeDataHeader = Struct("<BQ")
ClientMessageHeader = Struct("<BI")
ServiceCallRequestHeader = Struct("<BIII")
ServiceCallResponseHeader = ServiceCallRequestHeader


class FoxgloveServerListener(ABC):
    def on_subscribe(
        self, server: "FoxgloveServer", channel_id: ChannelId
    ) -> Union[None, Coroutine[Any, Any, None]]:
        """
        Called when the first client subscribes to `channel_id`.
        """
        ...

    def on_unsubscribe(
        self, server: "FoxgloveServer", channel_id: ChannelId
    ) -> Union[None, Coroutine[Any, Any, None]]:
        """
        Called when the last subscribed client unsubscribes from `channel_id`.
        """
        ...

    async def on_client_advertise(
        self, server: "FoxgloveServer", channel: ClientChannel
    ):
        """
        Called when a new client channel is advertised.
        """
        ...

    async def on_client_unadvertise(
        self, server: "FoxgloveServer", channel_id: ClientChannelId
    ):
        """
        Called when a client channel is unadvertised.
        """
        ...

    async def on_client_message(
        self, server: "FoxgloveServer", channel_id: ClientChannelId, payload: bytes
    ):
        """
        Called when a client channel message is received.
        """
        ...

    async def on_service_request(
        self,
        server: "FoxgloveServer",
        service_id: ServiceId,
        call_id: str,
        encoding: str,
        payload: bytes,
    ) -> bytes:
        """
        Called when a service request is made.
        """
        ...

    async def on_get_parameters(
        self,
        server: "FoxgloveServer",
        param_names: List[str],
        request_id: Optional[str],
    ) -> List[Parameter]:
        """
        Called when parameter values are requested.
        """
        ...

    async def on_set_parameters(
        self,
        server: "FoxgloveServer",
        params: List[Parameter],
        request_id: Optional[str],
    ) -> List[Parameter]:
        """
        Called when parameteres are to be modified.
        """
        ...

    async def on_parameters_subscribe(
        self, server: "FoxgloveServer", param_name: List[str], subscribe: bool
    ):
        """
        Called when parameters are subscribed/unsubscribed.
        """
        ...


class FoxgloveServer:
    _clients: Tuple[ClientState, ...]
    _channels: Dict[ChannelId, Channel]
    _next_channel_id: ChannelId
    _services: Dict[ServiceId, Service]
    _next_service_id: ServiceId
    _subscribed_params: Set[str]
    _logger: logging.Logger
    _listener: Optional[FoxgloveServerListener]
    _opened: "asyncio.Future[WebSocketServer]"

    def __init__(
        self,
        host: str,
        port: Optional[int],
        name: str,
        *,
        capabilities: List[str] = [],
        supported_encodings: Optional[List[str]] = None,
        metadata: Optional[Mapping[str, str]] = None,
        session_id: Optional[str] = None,
        logger: logging.Logger = _get_default_logger(),
        server_kwargs: Dict[str, Any] = {"compression": None},
    ):
        self.host = host
        self.port = port
        self.name = name
        self.capabilities = capabilities
        self.supported_encodings = supported_encodings
        self.metadata = metadata
        self.session_id = session_id
        self._clients = ()
        self._channels = {}
        self._next_channel_id = ChannelId(0)
        self._services = {}
        self._next_service_id = ServiceId(0)
        self._subscribed_params = set([])
        self._logger = logger
        self._server_kwargs = server_kwargs
        self._listener = None
        self._opened = asyncio.get_running_loop().create_future()

    def set_listener(self, listener: FoxgloveServerListener):
        self._listener = listener

    def _any_subscribed(self, chan_id: ChannelId):
        return any(
            chan_id in client.subscriptions_by_channel for client in self._clients
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
                **self._server_kwargs,
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
        # Any clients added during await will already see the new channel.
        for client in self._clients:
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
        # Any clients added during await will not have received info about the new channel.
        for client in self._clients:
            client.remove_channel(chan_id)

            await self._send_json(
                client.connection,
                {
                    "op": "unadvertise",
                    "channelIds": [chan_id],
                },
            )

    async def add_service(self, service: ServiceWithoutId) -> ServiceId:
        if "request" not in service.keys() and "requestSchema" not in service.keys():
            raise ValueError(
                f"Invalid service definition: Either 'request' or 'requestSchema' must be defined"
            )
        if "response" not in service.keys() and "responseSchema" not in service.keys():
            raise ValueError(
                f"Invalid service definition: Either 'response' or 'responseSchema' must be defined"
            )

        new_id = self._next_service_id
        self._next_service_id = ServiceId(new_id + 1)
        new_service = Service(id=new_id, **service)
        self._services[new_id] = new_service
        # Any clients added during await will already see the new service.
        for client in self._clients:
            await self._send_json(
                client.connection,
                {
                    "op": "advertiseServices",
                    "services": [new_service],
                },
            )
        return new_id

    async def remove_service(self, service_id: ServiceId):
        del self._services[service_id]
        # Any clients added during await will not have received info about the new service.
        for client in self._clients:
            await self._send_json(
                client.connection,
                {
                    "op": "unadvertiseServices",
                    "serviceIds": [service_id],
                },
            )

    async def update_parameters(self, parameters: List[Parameter]):
        for client in self._clients:
            params_of_interest = [
                p for p in parameters if p["name"] in client.subscribed_params
            ]
            if len(params_of_interest):
                await self._send_json(
                    client.connection,
                    {
                        "op": "parameterValues",
                        "parameters": params_of_interest,
                        "id": None,
                    },
                )

    async def send_message(self, chan_id: ChannelId, timestamp: int, payload: bytes):
        for client in self._clients:
            sub_id = client.subscriptions_by_channel.get(chan_id, None)
            if sub_id is not None:
                await self._send_message_data(
                    client.connection,
                    subscription=sub_id,
                    timestamp=timestamp,
                    payload=payload,
                )

    async def reset_session_id(self, newSessionId: Optional[str] = None):
        """
        Reset session Id and send new server info to clients.
        """
        self.session_id = newSessionId
        for client in self._clients:
            await self._send_server_info(client.connection)

    async def broadcast_time(self, timestamp: int):
        msg = TimeDataHeader.pack(BinaryOpcode.TIME, timestamp)
        for client in self._clients:
            try:
                await client.connection.send(msg)
            except ConnectionClosed:
                pass

    async def send_status(self, level: StatusLevel, msg: str, id: Optional[str] = None):
        for client in self._clients:
            try:
                await self._send_status(client.connection, level, msg, id)
            except ConnectionClosed:
                pass

    async def remove_status(self, statusIds: List[str]):
        for client in self._clients:
            try:
                await self._remove_status(client.connection, statusIds)
            except ConnectionClosed:
                pass

    async def _send_json(
        self, connection: WebSocketServerProtocol, msg: ServerJsonMessage
    ):
        try:
            await connection.send(json.dumps(msg, separators=(",", ":")))
        except ConnectionClosed:
            pass

    async def _send_message_data(
        self,
        connection: WebSocketServerProtocol,
        *,
        subscription: SubscriptionId,
        timestamp: int,
        payload: bytes,
    ):
        try:
            header = MessageDataHeader.pack(
                BinaryOpcode.MESSAGE_DATA, subscription, timestamp
            )
            await connection.send([header, payload])
        except ConnectionClosed:
            pass

    async def _send_server_info(self, connection: WebSocketServerProtocol) -> None:
        await self._send_json(
            connection,
            {
                "op": "serverInfo",
                "name": self.name,
                "capabilities": self.capabilities,
                "supportedEncodings": self.supported_encodings,
                "metadata": self.metadata,
                "sessionId": self.session_id,
            },
        )

    async def _handle_connection(
        self, connection: WebSocketServerProtocol, path: str
    ) -> None:
        self._logger.info(
            "Connection to %s opened via %s", connection.remote_address, path
        )

        client = ClientState(connection=connection)
        self._clients += (client,)

        try:
            await self._send_server_info(connection)
            await self._send_json(
                connection,
                {
                    "op": "advertise",
                    "channels": list(self._channels.values()),
                },
            )
            if "services" in self.capabilities:
                await self._send_json(
                    connection,
                    {
                        "op": "advertiseServices",
                        "services": list(self._services.values()),
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
            self._clients = tuple(c for c in self._clients if c != client)
            if self._listener:
                for chan_id in potential_unsubscribes:
                    if not self._any_subscribed(chan_id):
                        result = self._listener.on_unsubscribe(self, chan_id)
                        if inspect.isawaitable(result):
                            await result

    async def _send_status(
        self,
        connection: WebSocketServerProtocol,
        level: StatusLevel,
        msg: str,
        id: Optional[str] = None,
    ) -> None:
        await self._send_json(
            connection,
            {
                "op": "status",
                "level": level,
                "message": msg,
                "id": id,
            },
        )

    async def _remove_status(
        self, connection: WebSocketServerProtocol, statusIds: List[str]
    ) -> None:
        await self._send_json(
            connection,
            {
                "op": "removeStatus",
                "statusIds": statusIds,
            },
        )

    async def _handle_raw_client_message(self, client: ClientState, raw_message: Data):
        try:
            if isinstance(raw_message, str):
                message = json.loads(raw_message)
                self._logger.debug("Got message: %s", message)
                if not isinstance(message, dict):
                    raise TypeError(f"Expected JSON object, got {type(message)}")
                await self._handle_client_text_message(
                    client, cast(ClientJsonMessage, message)
                )
            else:
                await self._handle_client_binary_message(client, raw_message)
        except ConnectionClosed:
            pass
        except Exception as exc:
            self._logger.exception("Error handling message %s", raw_message)
            await self._send_status(
                client.connection, StatusLevel.ERROR, f"{type(exc).__name__}: {exc}"
            )

    async def _handle_client_text_message(
        self, client: ClientState, message: ClientJsonMessage
    ):
        if message["op"] == "subscribe":
            for sub in message["subscriptions"]:
                chan_id = sub["channelId"]
                sub_id = sub["id"]
                if sub_id in client.subscriptions:
                    await self._send_status(
                        client.connection,
                        StatusLevel.ERROR,
                        f"Client subscription id {sub_id} was already used; ignoring subscription",
                    )
                    continue
                chan = self._channels.get(chan_id)
                if chan is None:
                    await self._send_status(
                        client.connection,
                        StatusLevel.WARNING,
                        f"Channel {chan_id} is not available; ignoring subscription",
                    )
                    continue
                first_subscription = not self._any_subscribed(chan_id)
                if client.add_subscription(sub_id, chan_id):
                    self._logger.debug(
                        "Client %s subscribed to channel %s",
                        client.connection.remote_address,
                        chan_id,
                    )
                    if self._listener and first_subscription:
                        result = self._listener.on_subscribe(self, chan_id)
                        if inspect.isawaitable(result):
                            await result
                else:
                    await self._send_status(
                        client.connection,
                        StatusLevel.WARNING,
                        f"Client is already subscribed to channel {chan_id}; ignoring subscription",
                    )
                    continue

        elif message["op"] == "unsubscribe":
            for sub_id in message["subscriptionIds"]:
                chan_id = client.remove_subscription(sub_id)
                if chan_id is None:
                    await self._send_status(
                        client.connection,
                        StatusLevel.WARNING,
                        f"Client subscription id {sub_id} did not exist; ignoring unsubscription",
                    )
                    continue
                self._logger.debug(
                    "Client %s unsubscribed from channel %s",
                    client.connection.remote_address,
                    chan_id,
                )
                if self._listener and not self._any_subscribed(chan_id):
                    result = self._listener.on_unsubscribe(self, chan_id)
                    if inspect.isawaitable(result):
                        await result
        elif message["op"] == "advertise":
            for channel in message["channels"]:
                if not client.add_client_channel(channel):
                    self._logger.error(f"Failed to add client channel {channel['id']}")
                    await self._send_status(
                        client.connection,
                        StatusLevel.WARNING,
                        f"Failed to add client channel {channel['id']}",
                    )
                    continue
                self._logger.debug(
                    "Client %s advertised channel %d (%s)",
                    client.connection.remote_address,
                    channel["id"],
                    channel["topic"],
                )
                if self._listener:
                    await self._listener.on_client_advertise(self, channel)
        elif message["op"] == "unadvertise":
            for channel_id in message["channelIds"]:
                if not client.remove_client_channel(channel_id):
                    self._logger.error(f"Failed to remove client channel {channel_id}")
                    await self._send_status(
                        client.connection,
                        StatusLevel.WARNING,
                        f"Failed to remove client channel {channel_id}",
                    )
                    continue
                self._logger.debug(
                    "Client %s unadvertised channel %d",
                    client.connection.remote_address,
                    channel_id,
                )
                if self._listener:
                    await self._listener.on_client_unadvertise(self, channel_id)
        elif message["op"] == "getParameters":
            if self._listener:
                request_id = message.get("id", None)
                params = await self._listener.on_get_parameters(
                    self, message["parameterNames"], request_id
                )
                await self._send_json(
                    client.connection,
                    {
                        "op": "parameterValues",
                        "parameters": params,
                        "id": request_id,
                    },
                )
        elif message["op"] == "setParameters":
            if self._listener:
                request_id = message.get("id", None)
                updated_params = await self._listener.on_set_parameters(
                    self, message["parameters"], request_id
                )
                if request_id is not None:
                    await self._send_json(
                        client.connection,
                        {
                            "op": "parameterValues",
                            "parameters": updated_params,
                            "id": request_id,
                        },
                    )
                await self.update_parameters(updated_params)
        elif message["op"] == "subscribeParameterUpdates":
            new_param_subscriptions = [
                name
                for name in message["parameterNames"]
                if name not in self._subscribed_params
            ]
            client.subscribed_params.update(message["parameterNames"])
            self._subscribed_params.update(new_param_subscriptions)
            if self._listener:
                await self._listener.on_parameters_subscribe(
                    self, new_param_subscriptions, True
                )
        elif message["op"] == "unsubscribeParameterUpdates":
            new_param_unsubscriptions = [
                name
                for name in message["parameterNames"]
                if name in self._subscribed_params
            ]
            client.subscribed_params -= set(message["parameterNames"])
            self._subscribed_params -= set(new_param_unsubscriptions)
            if self._listener:
                await self._listener.on_parameters_subscribe(
                    self, new_param_unsubscriptions, False
                )
        else:
            raise ValueError(f"Unrecognized client opcode: {message['op']}")

    async def _handle_client_binary_message(
        self, client: ClientState, message: bytes
    ) -> None:
        if len(message) < 5:
            msg = f"Received invalid binary message of size {len(message)}"
            self._logger.error(msg)
            await self._send_status(
                client.connection,
                StatusLevel.ERROR,
                msg,
            )
            return

        op = message[0]

        if op == ClientBinaryOpcode.MESSAGE_DATA:
            _, channel_id = ClientMessageHeader.unpack_from(message)
            payload = message[ClientMessageHeader.size :]

            if not channel_id in client.advertisements_by_channel:
                msg = f"Channel {channel_id} not registered by client {client.connection.remote_address}"
                self._logger.error(msg)
                await self._send_status(
                    client.connection,
                    StatusLevel.ERROR,
                    msg,
                )
                return

            if self._listener:
                await self._listener.on_client_message(self, channel_id, payload)
        elif op == ClientBinaryOpcode.SERVICE_CALL_REQUEST:
            (
                _,
                service_id,
                call_id,
                encoding_length,
            ) = ServiceCallRequestHeader.unpack_from(message)
            service = self._services.get(service_id)
            if service is None:
                msg = f"Unknown service {service_id}"
                self._logger.error(msg)
                await self._send_status(
                    client.connection,
                    StatusLevel.ERROR,
                    msg,
                )
                return

            offset = ServiceCallRequestHeader.size
            encoding = message[offset : offset + encoding_length]
            offset = ServiceCallRequestHeader.size + encoding_length
            payload = message[offset:]
            if self._listener:
                response = await self._listener.on_service_request(
                    self, service_id, call_id, encoding.decode(), payload
                )
                try:
                    header = ServiceCallResponseHeader.pack(
                        BinaryOpcode.SERVICE_CALL_RESPONSE,
                        service_id,
                        call_id,
                        encoding_length,
                    )
                    await client.connection.send([header, encoding, response])
                except ConnectionClosed:
                    pass

        else:
            msg = f"Received binary message with invalid operation {op}"
            self._logger.error(msg)
            await self._send_status(
                client.connection,
                StatusLevel.ERROR,
                msg,
            )
