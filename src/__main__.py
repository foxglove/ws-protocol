import asyncio
from .server import FoxgloveServer
import time


async def main():
    server = FoxgloveServer("localhost", 8765, "example server")
    server.start()
    chan_id = await server.add_channel(
        {
            "topic": "/foo",
            "encoding": "protobuf",
            "schemaName": "Foo",
            "schema": 'syntax = "proto3"; message Foo { }',
        }
    )

    async def send_example_message():
        await asyncio.sleep(5)
        await server.handle_message(chan_id, time.time_ns(), b"hello world")

    await send_example_message()
    await server.wait_closed()


if __name__ == "__main__":
    asyncio.run(main())
