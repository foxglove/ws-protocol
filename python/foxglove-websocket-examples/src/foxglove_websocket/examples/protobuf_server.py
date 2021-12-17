import asyncio
import json
import os
import time
from base64 import standard_b64encode
from foxglove_websocket.util import run_cancellable
from foxglove_websocket.server import FoxgloveServer, FoxgloveServerListener
from foxglove_websocket.types import ChannelId

from .proto.ros.visualization_msgs import MarkerArray_pb2


async def main():
    class Listener(FoxgloveServerListener):
        def on_subscribe(self, server: FoxgloveServer, channel_id: ChannelId):
            print("First client subscribed to", channel_id)

        def on_unsubscribe(self, server: FoxgloveServer, channel_id: ChannelId):
            print("Last client unsubscribed from", channel_id)

    with open(
        os.path.join(MarkerArray_pb2.__file__, "..", "MarkerArray.bin")
    ) as schema_bin:
        print("Got schema:", schema_bin)

    async with FoxgloveServer("0.0.0.0", 8765, "example server") as server:
        server.set_listener(Listener())
        chan_id = await server.add_channel(
            {
                "topic": "example_msg",
                "encoding": "json",
                "schemaName": "ExampleMsg",
                "schema": standard_b64encode(b"").decode("utf8"),
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
