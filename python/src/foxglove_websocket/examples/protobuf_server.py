import asyncio
import os
import sys
import time
from base64 import standard_b64encode
from foxglove_websocket import run_cancellable
from foxglove_websocket.server import FoxgloveServer, FoxgloveServerListener
from foxglove_websocket.types import ChannelId

try:
    from foxglove_websocket.examples.proto import ExampleMsg_pb2
except ImportError as err:
    print(
        "Unable to import protobuf definitions; did you forget to run `pip install foxglove-websocket[examples]`?",
    )
    print(err)
    sys.exit(1)


async def main():
    class Listener(FoxgloveServerListener):
        def on_subscribe(self, server: FoxgloveServer, channel_id: ChannelId):
            print("First client subscribed to", channel_id)

        def on_unsubscribe(self, server: FoxgloveServer, channel_id: ChannelId):
            print("Last client unsubscribed from", channel_id)

    # Load the FileDescriptorSet, which was generated via `protoc --descriptor_set_out`.
    with open(
        os.path.join(os.path.dirname(ExampleMsg_pb2.__file__), "ExampleMsg.bin"), "rb"
    ) as schema_bin:
        schema_base64 = standard_b64encode(schema_bin.read()).decode("ascii")

    async with FoxgloveServer("0.0.0.0", 8765, "example server") as server:
        server.set_listener(Listener())
        chan_id = await server.add_channel(
            {
                "topic": "example_msg",
                "encoding": "protobuf",
                "schemaName": "ExampleMsg",
                "schema": schema_base64,
            }
        )

        i = 0
        while True:
            i += 1
            await asyncio.sleep(0.2)
            await server.send_message(
                chan_id,
                time.time_ns(),
                ExampleMsg_pb2.ExampleMsg(msg="Hello!", count=i).SerializeToString(),  # type: ignore
            )


if __name__ == "__main__":
    run_cancellable(main())
