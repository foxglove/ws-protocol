# Foxglove Studio WebSocket server

This package provides a server implementation of the [Foxglove Studio WebSocket protocol](https://github.com/foxglove/ws-protocol), enabling [Foxglove Studio](https://github.com/foxglove/studio) to ingest arbitrary “live” streamed data.

The protocol is encoding-agnostic, i.e. it can support Protobuf messages, ROS 1 or 2 messages, etc. (as long as the desired encoding is supported by both client and server).

## Installation

```
$ pip install foxglove-websocket
```

## Example server

The following script provides a simple example server which publishes messages on a single topic called `example_msg`, using JSON to encode message data and [JSON Schema](https://json-schema.org) to describe the message layout.

To get started with the example server:

1. Copy the script below into a file named `example.py` and run `python3 example.py`.  
   **or:** Install the foxglove-websocket package and run `python -m foxglove_websocket.examples.simple_server`.

2. In a browser, open up https://studio.foxglove.dev and initiate a Foxglove WebSocket connection to `ws://localhost:8765/`.

<img width="676" alt="Foxglove Studio displaying data from the example server" src="https://user-images.githubusercontent.com/14237/145260376-ddda98c5-7ed0-4239-9ce4-10778ee8240b.png">

```py
import asyncio
import json
import time
from foxglove_websocket import run_cancellable
from foxglove_websocket.server import FoxgloveServer, FoxgloveServerListener
from foxglove_websocket.types import ChannelId


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
```

## Development

When developing or maintaining the foxglove-websocket package, it is recommended to use [pipenv](https://github.com/pypa/pipenv) to manage development dependencies and virtualenv.

- Run `pipenv install --dev` to create a virtualenv and install development dependencies.
- Run `pipenv shell` to enter the virtualenv.
