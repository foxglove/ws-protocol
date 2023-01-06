import { FoxgloveClient, ServerCapability } from "@foxglove/ws-protocol";
import { Command } from "commander";
import Debug from "debug";
import WebSocket from "ws";

const log = Debug("foxglove:param-client");
Debug.enable("foxglove:*");

async function main(url: string) {
  const address = url.startsWith("ws://") || url.startsWith("wss://") ? url : `ws://${url}`;
  const initialParamRequest = "initialRequest";
  log(`Client connecting to ${address}`);
  const client = new FoxgloveClient({
    ws: new WebSocket(address, [FoxgloveClient.SUPPORTED_SUBPROTOCOL]),
  });
  client.on("error", (error) => {
    log("Error", error);
    throw error;
  });
  client.on("parameterValues", (event) => {
    if (event.id === initialParamRequest) {
      console.log(event.parameters);
      console.log(`Subscribing to ${event.parameters.length} parameters`);
      client.subscribeParameterUpdates(event.parameters.map((p) => p.name));
    } else {
      console.log(`Received ${event.parameters.length} parameter updates`);
      console.log(event.parameters);
    }

    // Periodically change some parameter value to see subscriptions working
    setTimeout(() => {
      const toggledBoolParams = event.parameters
        .filter((p) => typeof p.value === "boolean")
        .map((p) => ({ ...p, value: !(p.value as boolean) }));
      client.setParameters(toggledBoolParams);
    }, 1000);
  });
  client.on("serverInfo", (event) => {
    console.assert(
      event.capabilities.includes(ServerCapability.parameters),
      `Capability ${ServerCapability.parameters} is missing`,
    );
    console.assert(
      event.capabilities.includes(ServerCapability.parametersSubscribe),
      `Capability ${ServerCapability.parametersSubscribe} is missing`,
    );

    // Get all available parameters.
    client.getParameters([], initialParamRequest);
  });
}

export default new Command("param-client")
  .description("connect to a server and subscribe to all available parameters")
  .argument("[url]", "ws(s)://host:port", "ws://localhost:8765")
  .action(main);
