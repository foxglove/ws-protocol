"""
This script demonstrates how to write a Foxglove WebSocket server that transmits Protobuf-encoded
data. You should examine the following files in the `proto` directory to understand how to adapt the
server for use with your own Protobuf data:

- `ExampleMsg.proto`: hand-written Protobuf schema that describes data the server will send.

- `ExampleMsg_pb2.py`: generated Python code from `protoc --python_out=. ExampleMsg.proto`. The
  example server uses this to serialize messages as binary data via SerializeToString().

- `ExampleMsg.bin`: generated FileDescriptorSet from `protoc --descriptor_set_out=ExampleMsg.bin
  ExampleMsg.proto`. This binary blob gets passed to clients as the `schema`; Foxglove Studio uses
  this along with the `schemaName` to decode the message data. A FileDescriptorSet can represent
  multiple input .proto files (see the --include_imports option to protoc).
"""

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
                "schemaName": "ExampleMsg",  # Matches `message ExampleMsg` in ExampleMsg.proto
                "schema": schema_base64,  # Represents the parsed contents of ExampleMsg.proto
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
