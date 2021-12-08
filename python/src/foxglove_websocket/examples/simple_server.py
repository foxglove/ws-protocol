import asyncio
import json
import time
from foxglove_websocket import run_cancellable
from foxglove_websocket.server import FoxgloveServer


async def main():
    async with FoxgloveServer("0.0.0.0", 8765, "example server") as server:
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
