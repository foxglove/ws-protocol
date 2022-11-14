# Foxglove Studio WebSocket protocol v1

## Protocol overview

- An application wishing to provide data for streamed consumption by Foxglove Studio hosts a [WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API) server.

- The client (Foxglove Studio) will specify supported subprotocols (a standard part of the WebSocket handshake) when establishing the connection. The current version of this document corresponds to subprotocol `foxglove.websocket.v1`. The server must select a subprotocol with which it is compatible for the connection to continue.

  - Example client code in JavaScript:
    ```js
    new WebSocket("ws://...", ["foxglove.websocket.v1"]);
    ```

- Both text and binary messages are used on the WebSocket connection.

  - Each text message must be a JSON object having a field called `op` which identifies the type of message. The interpretation of the other fields depends on the opcode.

  - Similarly, each binary message starts with a 1-byte opcode identifying the type of message. The interpretation of the remaining bytes depends on the opcode.

- Upon establishing a connection, the server must send clients a Server Info message with a list of supported capabilities.

## Summary of messages

### Sent by server

- [Server Info](#server-info) (json)
- [Status](#status) (json)
- [Advertise](#advertise) (json)
- [Unadvertise](#unadvertise) (json)
- [Message Data](#message-data) (binary)

### Sent by client

- [Subscribe](#subscribe) (json)
- [Unsubscribe](#unsubscribe) (json)
- [Client Advertise](#client-advertise) (json)
- [Client Unadvertise](#client-unadvertise) (json)
- [Client Message Data](#client-message-data) (json)

## JSON messages

Each JSON message must be an object containing a field called `op` which identifies the type of message.

### Server Info

- This message is always sent to new clients upon connection.

#### Fields

- `op`: string `"serverInfo"`
- `name`: free-form information about the server which the client may optionally display or use for debugging purposes
- `capabilities`: array of strings, informing the client about which optional features are supported
  - `clientPublish`: Allow clients to advertise channels to send data messages to the server

#### Example

```json
{
  "op": "serverInfo",
  "name": "example server",
  "capabilities": ["clientPublish"]
}
```

### Status

- The server may send this message at any time. Client developers may use it for debugging purposes, display it to the end user, or ignore it.

#### Fields

- `op`: string `"status"`
- `level`: 0 (info), 1 (warning), 2 (error)
- `message`: string

#### Example

```json
{
  "op": "status",
  "level": 0,
  "message": "Some info"
}
```

### Advertise

- Informs the client about newly available channels.
- At least one Advertise message is always sent to new clients upon connection.

#### Fields

- `op`: string `"advertise"`
- `channels`: array of:
  - `id`: number. The server may reuse ids when channels disappear and reappear, but only if the channel keeps the exact same topic, encoding, schemaName, and schema. Clients will use this unique id to cache schema info and deserialization routines.
  - `topic`: string
  - `encoding`: string
  - `schemaName`: string
  - `schema`: string

#### Example

```json
{
  "op": "advertise",
  "channels": [
    {
      "id": 1,
      "topic": "foo",
      "encoding": "protobuf",
      "schemaName": "ExampleMsg",
      "schema": "ZXhhbXBsZSBkYXRh"
    }
  ]
}
```

### Unadvertise

Informs the client that channels are no longer available.

#### Fields

- `op`: string `"unadvertise"`
- `channelIds`: array of number, corresponding to previous Advertise

#### Example

```json
{
  "op": "unadvertise",
  "channelIds": [1, 2]
}
```

### Subscribe

- Requests that the server start streaming messages on a given topic (or topics) to the client.
- A client may only have one subscription for each channel at a time.

#### Fields

- `op`: string `"subscribe"`
- `subscriptions`: array of:
  - `id`: number chosen by the client. The client may not reuse ids across multiple active subscriptions. The server may ignore subscriptions that attempt to reuse an id (and send an error status message). After unsubscribing, the client may reuse the id.
  - `channelId`: number, corresponding to previous Advertise message(s)

#### Example

```json
{
  "op": "subscribe",
  "subscriptions": [
    { "id": 0, "channelId": 3 },
    { "id": 1, "channelId": 5 }
  ]
}
```

### Unsubscribe

- Requests that the server stop streaming messages to which the client previously subscribed.

#### Fields

- `op`: string `"subscribe"`
- `subscriptionIds`: array of number, corresponding to previous Subscribe message(s)

#### Example

```json
{
  "op": "unsubscribe",
  "subscriptionIds": [0, 1]
}
```

### Client Advertise

- Informs the server about available client channels. Note that the client is only allowed to advertise channels if the server previously declared that it has the `clientPublish` [capability](#server-info).

#### Fields

- `op`: string `"advertise"`
- `channels`: array of:
  - `id`: number chosen by the client. The client may reuse ids that have previously been unadvertised.
  - `topic`: string
  - `encoding`: string, must be `"json"`
  - `schemaName`: string

#### Example

```json
{
  "op": "advertise",
  "channels": [
    {
      "id": 1,
      "topic": "foo",
      "encoding": "json",
      "schemaName": "ExampleMsg"
    }
  ]
}
```

### Client Unadvertise

- Informs the server that client channels are no longer available. Note that the client is only allowed to unadvertise channels if the server previously declared that it has the `clientPublish` [capability](#server-info).

#### Fields

- `op`: string `"unadvertise"`
- `channelIds`: array of number, corresponding to previous [Client Advertise](#client-advertise)

#### Example

```json
{
  "op": "unadvertise",
  "channelIds": [1, 2]
}
```

### Client Publish

- Sends a JSON message from the client to the server. Note that the client is only allowed to publish messages if the server previously declared that it has the `clientPublish` [capability](#server-info).

#### Fields

- `op`: string `"publish"`
- `channelId`: number. Channel ID corresponding to previous [Client Advertise](#client-advertise)
- `data`: object. JSON object

#### Example

```json
{
  "op": "publish",
  "channelId": 1,
  "data": {
    "header": {
      "frame_id": "/map"
    },
    "point": {
      "x": 1.0,
      "y": 2.0,
      "z": 0.0
    }
  }
}
```

## Binary messages

All binary messages must start with a 1-byte opcode identifying the type of message. The interpretation of the remaining bytes depends on the opcode.

All integer types explicitly specified (uint32, uint64, etc.) in this section are encoded with **little-endian** byte order.

### Message Data

- Provides a raw message payload, encoded as specified in the Advertise corresponding to the channel.
- Subscription id must correspond to a Subscribe that was previously sent.

| Bytes           | Type    | Description                     |
| --------------- | ------- | ------------------------------- |
| 1               | opcode  | 0x01                            |
| 4               | uint32  | subscription id                 |
| 8               | uint64  | receive timestamp (nanoseconds) |
| remaining bytes | uint8[] | message payload                 |
