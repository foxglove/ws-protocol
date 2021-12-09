import protobufjs from "protobufjs";

declare module "protobufjs" {
  declare namespace ReflectionObject {
    // This method is added as a side effect of importing protobufjs/ext/descriptor
    export const fromDescriptor: (desc: protobufjs.Message) => protobufjs.Root;
  }
}
