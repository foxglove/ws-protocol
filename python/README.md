# Foxglove WebSocket protocol in Python

The Foxglove WebSocket protocol is encoding-agnostic, as long as the desired encoding is supported by both client and server. It currently supports Protobuf and JSON messages.

## Installation

Install the `foxglove_websocket` Python package:

```
$ pip install foxglove_websocket
```

Next, run a simple example server which publishes messages on a single `example_msg` topic, using JSON to encode message data and [JSON Schema](https://json-schema.org/) to describe the message layout.

```
python -m foxglove_websocket.examples.simple_server
```

Open [studio.foxglove.dev](https://studio.foxglove.dev) in a browser, and initiate a Foxglove WebSocket connection to your WebSocket URL (`ws://localhost:8765/`).

<img width="676" alt="Foxglove Studio displaying data from the example server" src="https://user-images.githubusercontent.com/14237/145260376-ddda98c5-7ed0-4239-9ce4-10778ee8240b.png">

## Server template

The example server template below publishes messages on a single topic called `example_msg`, using JSON to encode message data and [JSON Schema](https://json-schema.org) to describe the message layout.

Copy the script below into a file (e.g. `server.py`) and run it (e.g. `python3 server.py`). Then, make the necessary adjustments to build a custom server.

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

Use [pipenv](https://github.com/pypa/pipenv) to manage developer dependencies and `virtualenv` while developing.

```
pipenv install --dev
pipenv shell
```