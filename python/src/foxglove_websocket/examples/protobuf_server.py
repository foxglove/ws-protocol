"""
This script demonstrates how to write a Foxglove WebSocket server that transmits Protobuf-encoded
data. The included Protobuf schemas are generated from https://github.com/foxglove/schemas.
"""

import asyncio
import sys
import time
from base64 import b64encode
from traceback import print_exception
from typing import Set, Type
from foxglove_websocket import run_cancellable
from foxglove_websocket.server import FoxgloveServer, FoxgloveServerListener
from foxglove_websocket.types import ChannelId

try:
    from foxglove_schemas_protobuf.SceneUpdate_pb2 import SceneUpdate
    import google.protobuf.message
    from google.protobuf.descriptor_pb2 import FileDescriptorSet
    from google.protobuf.descriptor import FileDescriptor
    from pyquaternion import Quaternion
except ImportError as err:
    print_exception(*sys.exc_info())
    print(
        "Unable to import protobuf schemas; did you forget to run `pip install 'foxglove-websocket[examples]'`?",
    )
    sys.exit(1)


def build_file_descriptor_set(
    message_class: Type[google.protobuf.message.Message],
) -> FileDescriptorSet:
    """
    Build a FileDescriptorSet representing the message class and its dependencies.
    """
    file_descriptor_set = FileDescriptorSet()
    seen_dependencies: Set[str] = set()

    def append_file_descriptor(file_descriptor: FileDescriptor):
        for dep in file_descriptor.dependencies:
            if dep.name not in seen_dependencies:
                seen_dependencies.add(dep.name)
                append_file_descriptor(dep)
        file_descriptor.CopyToProto(file_descriptor_set.file.add())  # type: ignore

    append_file_descriptor(message_class.DESCRIPTOR.file)
    return file_descriptor_set


async def main():
    class Listener(FoxgloveServerListener):
        def on_subscribe(self, server: FoxgloveServer, channel_id: ChannelId):
            print("First client subscribed to", channel_id)

        def on_unsubscribe(self, server: FoxgloveServer, channel_id: ChannelId):
            print("Last client unsubscribed from", channel_id)

    async with FoxgloveServer("0.0.0.0", 8765, "example server") as server:
        server.set_listener(Listener())
        chan_id = await server.add_channel(
            {
                "topic": "example_msg",
                "encoding": "protobuf",
                "schemaName": SceneUpdate.DESCRIPTOR.full_name,
                "schema": b64encode(
                    build_file_descriptor_set(SceneUpdate).SerializeToString()
                ).decode("ascii"),
            }
        )

        i = 0
        while True:
            i += 1
            await asyncio.sleep(0.05)
            now = time.time_ns()

            scene_update = SceneUpdate()
            entity = scene_update.entities.add()
            entity.timestamp.FromNanoseconds(now)
            entity.frame_id = "root"
            cube = entity.cubes.add()
            cube.size.x = 1
            cube.size.y = 1
            cube.size.z = 1
            cube.pose.position.x = 2
            cube.pose.position.y = 0
            cube.pose.position.z = 0
            q = Quaternion(axis=[0, 0, 1], angle=i * 0.1)
            cube.pose.orientation.x = q.x
            cube.pose.orientation.y = q.y
            cube.pose.orientation.z = q.z
            cube.pose.orientation.w = q.w
            cube.color.r = 0.6
            cube.color.g = 0.2
            cube.color.b = 1
            cube.color.a = 1

            await server.send_message(chan_id, now, scene_update.SerializeToString())


if __name__ == "__main__":
    run_cancellable(main())
