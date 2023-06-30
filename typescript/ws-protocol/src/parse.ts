import {
  BinaryOpcode,
  ClientBinaryOpcode,
  ClientMessage,
  FetchAssetStatus,
  ServerMessage,
} from "./types";

const textDecoder = new TextDecoder();

export function parseServerMessage(buffer: ArrayBuffer): ServerMessage {
  const view = new DataView(buffer);

  let offset = 0;
  const op = view.getUint8(offset);
  offset += 1;

  switch (op as BinaryOpcode) {
    case BinaryOpcode.MESSAGE_DATA: {
      const subscriptionId = view.getUint32(offset, true);
      offset += 4;
      const timestamp = view.getBigUint64(offset, true);
      offset += 8;
      const data = new DataView(buffer, offset);
      return { op, subscriptionId, timestamp, data };
    }
    case BinaryOpcode.TIME: {
      const timestamp = view.getBigUint64(offset, true);
      return { op, timestamp };
    }
    case BinaryOpcode.SERVICE_CALL_RESPONSE: {
      const serviceId = view.getUint32(offset, true);
      offset += 4;
      const callId = view.getUint32(offset, true);
      offset += 4;
      const encodingLength = view.getUint32(offset, true);
      offset += 4;
      const encodingBytes = new DataView(buffer, offset, encodingLength);
      const encoding = textDecoder.decode(encodingBytes);
      offset += encodingLength;
      const data = new DataView(buffer, offset, buffer.byteLength - offset);
      return { op, serviceId, callId, encoding, data };
    }
    case BinaryOpcode.FETCH_ASSET_RESPONSE: {
      const requestId = view.getUint32(offset, true);
      offset += 4;
      const status = view.getUint8(offset) as FetchAssetStatus;
      offset += 1;
      const errorMsgLength = view.getUint32(offset, true);
      offset += 4;
      const error = textDecoder.decode(new DataView(buffer, offset, errorMsgLength));
      offset += errorMsgLength;

      if (status === FetchAssetStatus.ERROR) {
        return { op, requestId, status, error };
      } else if (status === FetchAssetStatus.SUCCESS) {
        const data = new DataView(buffer, offset, buffer.byteLength - offset);
        return { op, requestId, status, data };
      } else {
        throw new Error(`Unrecognized fetch asset status: ${status as number}`);
      }
    }
  }
  throw new Error(`Unrecognized server opcode in binary message: ${op.toString(16)}`);
}

export function parseClientMessage(buffer: ArrayBuffer): ClientMessage {
  const view = new DataView(buffer);

  let offset = 0;
  const op = view.getUint8(offset);
  offset += 1;

  switch (op as ClientBinaryOpcode) {
    case ClientBinaryOpcode.MESSAGE_DATA: {
      const channelId = view.getUint32(offset, true);
      offset += 4;
      const data = new DataView(buffer, offset, buffer.byteLength - offset);
      return { op, channelId, data };
    }
    case ClientBinaryOpcode.SERVICE_CALL_REQUEST: {
      const serviceId = view.getUint32(offset, true);
      offset += 4;
      const callId = view.getUint32(offset, true);
      offset += 4;
      const encodingLength = view.getUint32(offset, true);
      offset += 4;
      const encodingBytes = new DataView(buffer, offset, encodingLength);
      const encoding = textDecoder.decode(encodingBytes);
      offset += encodingLength;
      const data = new DataView(buffer, offset, buffer.byteLength - offset);
      return { op, serviceId, callId, encoding, data };
    }
  }
  throw new Error(`Unrecognized client opcode in binary message: ${op.toString(16)}`);
}
