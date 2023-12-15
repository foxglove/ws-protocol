# C++ implementation of the Foxglove WebSocket protocol

## Instructions

- Run `make build`
- Run `make example_server_protobuf` or `make example_server_flatbuffers`

For websocket throughput testing, you can use `make example_server_perf_test` and connect with https://foxglove.github.io/ws-protocol or with `make example_client_perf_test`.

## Thread safety

The C++ foxglove websocket implementation uses websocketpp which is thread safe. However, you cannot send data through the websocket inside a connection handler callback of the same websocket connection. For example, if you want to implement _message latching_, you might want to flush buffered messages upon client connection (using `subscribeHandler`). But nothing would get sent out inside the callback thread. To fix this, you can simply spin up a new thread. You could do something like:
```c++
auto server_ptr = foxglove::ServerFactory::createServer<websocketpp::connection_hdl>(server_name, log_handler, options);

// Setup handlers.
foxglove::ServerHandlers<foxglove::ConnHandle> hdlrs;
hdlrs.subscribeHandler = [&](foxglove::ChannelId channel_id, foxglove::ConnHandle) {
    // Spin up new thread here to publish messages through the same websocket
    std::thread t([&, channel_id]() {
        flush_buffered_messages(channel_id);
    });
    t.detach();
};

server_ptr->setHandlers(std::move(hdlrs));
server_ptr->start(ip, port);
```
