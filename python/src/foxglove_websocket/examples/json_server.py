import asyncio
import json
import time
from foxglove_websocket import run_cancellable
from foxglove_websocket.server import FoxgloveServer, FoxgloveServerListener
from foxglove_websocket.types import (
    ChannelId,
    ClientChannel,
    ClientChannelId,
    ServiceId,
)


async def main():
    class Listener(FoxgloveServerListener):
        async def on_subscribe(self, server: FoxgloveServer, channel_id: ChannelId):
            print("First client subscribed to", channel_id)

        async def on_unsubscribe(self, server: FoxgloveServer, channel_id: ChannelId):
            print("Last client unsubscribed from", channel_id)

        async def on_client_advertise(
            self, server: FoxgloveServer, channel: ClientChannel
        ):
            print("Client advertise:", json.dumps(channel))

        async def on_client_unadvertise(
            self, server: FoxgloveServer, channel_id: ClientChannelId
        ):
            print("Client unadvertise:", channel_id)

        async def on_client_message(
            self, server: FoxgloveServer, channel_id: ClientChannelId, payload: bytes
        ):
            msg = json.loads(payload)
            print(f"Client message on channel {channel_id}: {msg}")

        async def on_service_request(
            self,
            server: FoxgloveServer,
            service_id: ServiceId,
            call_id: str,
            encoding: str,
            payload: bytes,
        ) -> bytes:
            if encoding != "json":
                return json.dumps(
                    {"success": False, "error": f"Invalid encoding {encoding}"}
                ).encode()

            request = json.loads(payload)
            if "data" not in request:
                return json.dumps(
                    {"success": False, "error": f"Missing key 'data'"}
                ).encode()

            print(f"Service request on service {service_id}: {request}")
            return json.dumps(
                {"success": True, "message": f"Received boolean: {request['data']}"}
            ).encode()

    async with FoxgloveServer(
        "0.0.0.0",
        8765,
        "example server",
        capabilities=["clientPublish", "services"],
        supported_encodings=["json"],
    ) as server:
        server.set_listener(Listener())
        chan_id = await server.add_channel(
            {
                "topic": "example_msg",
                "encoding": "json",
                "schemaName": "ExampleMsg",
                "schema": json.dumps(
                    {
                        "type": "object",
                        "properties": {
                            "msg": {"type": "string"},
                            "count": {"type": "number"},
                        },
                    }
                ),
                "schemaEncoding": "jsonschema",
            }
        )
        await server.add_service(
            {
                "name": "example_set_bool",
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
                                "message": {"type": "string"},
                            },
                        }
                    ),
                },
                "requestSchema": None,
                "responseSchema": None,
                "type": "example_set_bool",
            }
        )

        i = 0
        while True:
            i += 1
            await asyncio.sleep(0.2)
            await server.send_message(
                chan_id,
                time.time_ns(),
                json.dumps({"msg": "Hello!", "count": i}).encode("utf8"),
            )


if __name__ == "__main__":
    run_cancellable(main())
