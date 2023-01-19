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
- [Time](#time) (binary)
- [Parameter Values](#parameter-values) (json)
- [AdvertiseServices](#advertise-services) (json)
- [UnadvertiseServices](#unadvertise-services) (json)
- [Service Call Response](#service-call-response) (binary)

### Sent by client

- [Subscribe](#subscribe) (json)
- [Unsubscribe](#unsubscribe) (json)
- [Client Advertise](#client-advertise) (json)
- [Client Unadvertise](#client-unadvertise) (json)
- [Client Message Data](#client-message-data) (binary)
- [Get Parameters](#get-parameters) (json)
- [Set Parameters](#set-parameters) (json)
- [Subscribe Parameter Update](#subscribe-parameter-update) (json)
- [Unsubscribe Parameter Update](#unsubscribe-parameter-update) (json)
- [Service Call Request](#service-call-request) (binary)

## JSON messages

Each JSON message must be an object containing a field called `op` which identifies the type of message.

### Server Info

- This message is always sent to new clients upon connection.

#### Fields

- `op`: string `"serverInfo"`
- `name`: free-form information about the server which the client may optionally display or use for debugging purposes
- `capabilities`: array of strings, informing the client about which optional features are supported
  - `clientPublish`: Allow clients to advertise channels to send data messages to the server
  - `parameters`: Allow clients to get & set parameters
  - `parametersSubscribe`: Allow clients to subscribe to parameter changes
  - `time`: The server may publish binary [time](#time) messages
  - `services`: Allow clients to call services
- `supportedEncodings`: array of strings | informing the client about which encodings may be used for client-side publishing. Only set if client publishing is supported.
- `metadata`: optional map of key-value pairs

#### Example

```json
{
  "op": "serverInfo",
  "name": "example server",
  "capabilities": ["clientPublish", "time"],
  "supportedEncodings": ["json"],
  "metadata": {
    "key": "value"
  }
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
    > Note: Encodings currently supported by Foxglove Studio are `json`, `protobuf`, `ros1`, and `cdr` (ROS 2). For more information, see the [Foxglove Studio documentation](https://foxglove.dev/docs/studio/connection/custom#foxglove-websocket).
  - `schemaName`: string
  - `schema`: string
    > Note: Foxglove Studio expects the schema to be in a format matching the `encoding`. For more information, see the [Foxglove Studio documentation](https://foxglove.dev/docs/studio/connection/custom#foxglove-websocket).

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

### Parameter Values

Informs the client about parameters. Only supported if the server declares the `parameters` [capability](#server-info).

#### Fields

- `op`: string `"parameterValues"`
- `parameters`: array of:
  - `name`: string, name of the parameter
  - `value`: number | boolean | string | number[] | boolean[] | string[]
- `id`: string | undefined. Only set when the [getParameters](#get-parameters) or [setParameters](#set-parameters) request's `id` field was set

#### Example

```json
{
  "op": "parameterValues",
  "parameters": [
    { "name": "/int_param", "value": 2 },
    { "name": "/float_param", "value": 1.2 },
    { "name": "/string_param", "value": "foo" },
    { "name": "/node/nested_ints_param", "value": [1, 2, 3] }
  ],
  "id": "request-123"
}
```

### Advertise Services

Informs the client about available services. Only supported if the server declares the `services` [capability](#server-info).

#### Fields

- `op`: string `"advertiseServices"`
- `services`: array of:
  - `id`: number. The server may reuse ids when services disappear and reappear, but only if the services keeps the exact same name, type, and schema. Clients will use this unique id to cache schema info and deserialization routines.
  - `name`: string
  - `type`: string
  - `requestSchema`: string
  - `responseSchema`: string
  - `acceptedEncodings`: array of string, encodings which can be used to encode service call requests

#### Example

```json
{
  "op": "advertiseServices",
  "services": [
    {
      "id": 1,
      "name": "foo",
      "type": "std_srvs/srv/Empty",
      "requestSchema": "",
      "responseSchema": "",
      "acceptedEncodings": ["cdr", "json"]
    }
  ]
}
```

### Unadvertise Services

Informs the client about services that are no longer available. Only supported if the server declares the `services` [capability](#server-info).

#### Fields

- `op`: string `"unadvertiseServices"`
- `serviceIds`: array of number, corresponding to previous [advertisement](#advertise-services)

#### Example

```json
{
  "op": "unadvertiseServices",
  "serviceIds": [1, 2]
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
  - `encoding`: string, one of the encodings [supported by the server](#server-info)
  - `schemaName`: string

#### Example

```json
{
  "op": "advertise",
  "channels": [
    {
      "id": 1,
      "topic": "foo",
      "encoding": "protobuf",
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

- Sends a binary websocket message containing the raw messsage payload to the server. Note that the client is only allowed to publish messages if the server previously declared that it has the `clientPublish` [capability](#server-info).

#### Message Data

- Provides a raw message payload, encoded as advertised in the [Client Advertise](#client-advertise) operation.

| Bytes           | Type    | Description     |
| --------------- | ------- | --------------- |
| 1               | opcode  | 0x01            |
| 4               | uint32  | channel id      |
| remaining bytes | uint8[] | message payload |

### Get Parameters

Request one or more parameters. Only supported if the server previously declared that it has the `parameters` [capability](#server-info).

#### Fields

- `op`: string `"getParameters"`
- `parameterNames`: string[], leave empty to retrieve all currently set parameters
- `id`: string | undefined, arbitrary string used for identifying the corresponding server [response](#parameter-values)

#### Example

```json
{
  "op": "getParameters",
  "parameterNames": [
    "/int_param",
    "/float_param",
    "/string_param",
    "/node/nested_ints_param"
  ],
  "id": "request-123"
}
```

### Set Parameters

Set one or more parameters. Only supported if the server previously declared that it has the `parameters` [capability](#server-info).

#### Fields

- `op`: string `"setParameters"`
- `parameters`: array of:
  - `name`: string
  - `value`: number | boolean | string | number[] | boolean[] | string[]
- `id`: string | undefined, arbitrary string used for identifying the corresponding server [response](#parameter-values). If this field is not set, the server may not send a response to the client.

#### Example

```json
{
  "op": "setParameters",
  "parameters": [
    { "name": "/int_param", "value": 3 },
    { "name": "/float_param", "value": 4.1 }
  ],
  "id": "request-456"
}
```

### Subscribe Parameter Update

Subscribe to parameter updates. Only supported if the server previously declared that it has the `parametersSubscribe` [capability](#server-info).

Sending `subscribeParameterUpdates` multiple times will append the list of parameter subscriptions, not replace them. Note that parameters can be subscribed at most once. Hence, this operation will ignore parameters that are already subscribed. Use [unsubscribeParameterUpdates](#unsubscribe-parameter-update) to unsubscribe from existing parameter subscriptions.

#### Fields

- `op`: string `"subscribeParameterUpdates"`
- `parameterNames`: string[], leave empty to subscribe to all currently known parameters

#### Example

```json
{
  "op": "subscribeParameterUpdates",
  "parameterNames": [
    "/int_param",
    "/float_param",
    "/string_param",
    "/node/nested_ints_param"
  ]
}
```

### Unsubscribe Parameter Update

Unsubscribe from parameter updates. Only supported if the server previously declared that it has the `parametersSubscribe` [capability](#server-info).

#### Fields

- `op`: string `"unsubscribeParameterUpdates"`
- `parameterNames`: string[], leave empty to unsubscribe from all parameter updates

#### Example

```json
{
  "op": "unsubscribeParameterUpdates",
  "parameterNames": [
    "/int_param",
    "/float_param",
    "/string_param",
    "/node/nested_ints_param"
  ]
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

### Time

- Inform clients about the latest server time. This allows accelerated, slowed, or stepped control over the progress of time.
- If the server publishes time data, then timestamps of [published messages](#message-data) must originate from the same time source
- The server may only publish time data if it previously declared support for it via the `time` [capability](#server-info)

| Bytes | Type   | Description             |
| ----- | ------ | ----------------------- |
| 1     | opcode | 0x02                    |
| 8     | uint64 | timestamp (nanoseconds) |

#### Service Call Request

- Request to call a service that has been advertised by the server.
- Only supported if the server previously declared the `services` [capability](#server-info).

| Bytes             | Type    | Description                                                                |
| ----------------- | ------- | -------------------------------------------------------------------------- |
| 1                 | opcode  | 0x02                                                                       |
| 4                 | uint32  | service id                                                                 |
| 4                 | uint32  | call id, a unique number to identify the corresponding service response    |
| 4                 | uint32  | encoding length                                                            |
| _encoding length_ | char[]  | encoding, as specified in the [service advertisement](#advertise-services) |
| remaining bytes   | uint8[] | request payload                                                            |

### Service Call Response

- Provides the response to a previous [service call](#service-call-request).

| Bytes             | Type    | Description                                           |
| ----------------- | ------- | ----------------------------------------------------- |
| 1                 | opcode  | 0x03                                                  |
| 4                 | uint32  | service id                                            |
| 4                 | uint32  | call id                                               |
| 4                 | uint32  | encoding length                                       |
| _encoding length_ | char[]  | encoding, same encoding that was used for the request |
| remaining bytes   | uint8[] | response payload                                      |
