# Foxglove WebSocket server

> ⚠️ Important Notice: This package is no longer maintained and has been replaced by
> [foxglove-sdk](https://pypi.org/project/foxglove-sdk/). We recommend migrating to the [Foxglove
> SDK](https://docs.foxglove.dev/docs/sdk) for future development.

This package provides a server implementation of the [Foxglove WebSocket protocol](https://github.com/foxglove/ws-protocol) with examples. The protocol enables [Foxglove](https://foxglove.dev/) to ingest arbitrary “live” streamed data.

## Example servers

This package includes example servers demonstrating how to use JSON and Protobuf data. To install additional dependencies required for the examples, run:

```
$ pip install 'foxglove-websocket[examples]'
```

Run a simple example server that publishes messages on a single `example_msg` topic:

- [JSON server](https://github.com/foxglove/ws-protocol/blob/main/python/src/foxglove_websocket/examples/json_server.py) – Uses JSON to encode message data and [JSON Schema](https://json-schema.org/) to describe the message layout.

  ```
  python -m foxglove_websocket.examples.json_server
  ```

- [Protobuf server](https://github.com/foxglove/ws-protocol/blob/main/python/src/foxglove_websocket/examples/protobuf_server.py) – Uses [Protobuf](https://developers.google.com/protocol-buffers) to encode message data.

  ```
  python -m foxglove_websocket.examples.protobuf_server
  ```

_Note:_ You must exit each server (<kbd>control</kbd> + <kbd>c</kbd>) before starting up another.

To see data from any server, open [Foxglove](https://app.foxglove.dev/~/view?ds=foxglove-websocket&ds.url=ws://localhost:8765/) with a Foxglove WebSocket connection to `ws://localhost:8765/`:

<img width="676" alt="Foxglove displaying data from the example server" src="https://user-images.githubusercontent.com/14237/145260376-ddda98c5-7ed0-4239-9ce4-10778ee8240b.png">

To customize each server for your specifications, copy either server into a separate file like `server.py` and make the desired adjustments to this template. Start up your server from the command line, using `python3 server.py`.

### Multi-threaded usage

The [`threaded_server` example](https://github.com/foxglove/ws-protocol/blob/main/python/src/foxglove_websocket/examples/threaded_server/__main__.py) demonstrates how to use the `FoxgloveServer` class in a thread-safe way when interacting with a threaded middleware. Run the server using:

```
python -m foxglove_websocket.examples.threaded_server
```

When connected to the server in Foxglove, use the [Data Source Info](https://docs.foxglove.dev/docs/visualization/panels/data-source-info/) panel to see channels appearing and disappearing, and a [Plot](https://docs.foxglove.dev/docs/visualization/panels/plot/) panel to visualize data on each channel.

<img width="869" alt="image" src="https://user-images.githubusercontent.com/14237/154611361-37f87c06-b85f-4117-8bfe-e1bbbc31f7f4.png">

For a more detailed explanation, read the [example's source code](https://github.com/foxglove/ws-protocol/blob/main/python/src/foxglove_websocket/examples/threaded_server/__main__.py).

## Development

When developing or maintaining the `foxglove-websocket` package, it is recommended to use [`pipenv`](https://github.com/pypa/pipenv) to manage development dependencies and `virtualenv`.

- `pipenv install --dev` – Create a `virtualenv` and install development dependencies
- `pipenv shell` – Enter the `virtualenv`
