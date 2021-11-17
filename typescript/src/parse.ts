import { ServerMessage, ServerOpcode } from "./types";

export function parseServerMessage(buffer: ArrayBuffer): ServerMessage {
  const view = new DataView(buffer);

  let offset = 0;
  const op = view.getUint8(offset);
  offset += 1;

  switch (op as ServerOpcode) {
    case ServerOpcode.SERVER_INFO:
    case ServerOpcode.STATUS_MESSAGE:
    case ServerOpcode.CHANNEL_LIST:
      // case ServerOpcode.SUBSCRIPTION_ACK:
      throw new Error(`Opcode ${op} should be sent as JSON rather than binary`);

    case ServerOpcode.MESSAGE_DATA: {
      const clientSubscriptionId = view.getUint32(offset, true);
      offset += 4;
      const timestamp = view.getBigUint64(offset, true);
      offset += 8;
      const data = new DataView(buffer, offset);
      return { op, clientSubscriptionId, timestamp, data };
    }
  }
  throw new Error(`Unrecognized server opcode in binary message: ${op.toString(16)}`);
}
