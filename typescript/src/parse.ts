import { BinaryOpcode, ServerMessage } from "./types";

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
  }
  throw new Error(`Unrecognized server opcode in binary message: ${op.toString(16)}`);
}
