"""
This script demonstrates how to write a Foxglove WebSocket server that transmits Protobuf-encoded
data. You should examine the following files in the `proto` directory to understand how to adapt the
server for use with your own Protobuf data:

- `ExampleMsg.proto`: hand-written Protobuf schema that describes data the server will send.

- `ExampleMsg_pb2.py`: generated Python code from `protoc --python_out=. ExampleMsg.proto`. The
  example server uses this to serialize messages as binary data via SerializeToString().

- `ExampleMsg.bin`: generated FileDescriptorSet from `protoc --include_imports
  --descriptor_set_out=ExampleMsg.bin ExampleMsg.proto`. This binary blob gets passed to clients as
  the `schema`; Foxglove Studio uses this along with the `schemaName` to decode the message data. A
  FileDescriptorSet can represent multiple input .proto files (see the --include_imports option to
  protoc).
"""

import asyncio
import os
import sys
import time
from base64 import standard_b64encode
from traceback import print_exception
from foxglove_websocket import run_cancellable
from foxglove_websocket.server import FoxgloveServer, FoxgloveServerListener
from foxglove_websocket.types import ChannelId

sys.path.append(os.path.join(os.path.dirname(__file__), "proto"))
try:
    from foxglove_websocket.examples.proto import ExampleMsg_pb2
    from foxglove_websocket.examples.proto.foxglove.Grid_pb2 import Grid
except ImportError as err:
    print_exception(*sys.exc_info())
    print(
        "Unable to import protobuf definitions; did you forget to run `pip install foxglove-websocket[examples]`?",
    )
    sys.exit(1)

from google.protobuf.descriptor_pb2 import FileDescriptorSet
from google.protobuf.descriptor import Descriptor, FileDescriptor
from google.protobuf.timestamp_pb2 import Timestamp
def get_descriptor_set(desc: Descriptor) -> bytes:
    fds = FileDescriptorSet()
    seen_files = set()
    def add_deps(fd: FileDescriptor):
        for dep in fd.dependencies:
            if dep.name in seen_files:
                continue
            seen_files.add(dep.name)
            add_deps(dep)
        fd.CopyToProto(fds.file.add())
    add_deps(desc.file)
    return fds.SerializeToString()

async def main():
    class Listener(FoxgloveServerListener):
        def on_subscribe(self, server: FoxgloveServer, channel_id: ChannelId):
            print("First client subscribed to", channel_id)

        def on_unsubscribe(self, server: FoxgloveServer, channel_id: ChannelId):
            print("Last client unsubscribed from", channel_id)

    # Load the FileDescriptorSet, which was generated via `protoc --include_imports --descriptor_set_out`.
    with open(
        os.path.join(os.path.dirname(ExampleMsg_pb2.__file__), "ExampleMsg.bin"), "rb"
    ) as schema_bin:
        schema_base64 = standard_b64encode(schema_bin.read()).decode("ascii")

    schema_base64 = standard_b64encode(get_descriptor_set(Grid.DESCRIPTOR)).decode("ascii")
    async with FoxgloveServer("0.0.0.0", 8765, "example server") as server:
        server.set_listener(Listener())
        chan_id = await server.add_channel(
            {
                "topic": "example_msg",
                "encoding": "protobuf",
                "schemaName": Grid.DESCRIPTOR.full_name,
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
                # ExampleMsg_pb2.ExampleMsg(msg="Hello!", count=i).SerializeToString(),  # type: ignore
                Grid(timestamp=Timestamp(seconds=100,nanos=1000)).SerializeToString()
            )


if __name__ == "__main__":
    run_cancellable(main())
