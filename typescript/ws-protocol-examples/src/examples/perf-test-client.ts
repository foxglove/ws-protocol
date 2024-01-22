import { Channel, FoxgloveClient } from "@foxglove/ws-protocol";
import { Command } from "commander";
import Debug from "debug";
import WebSocket from "ws";

const log = Debug("foxglove:perf-test-client");
Debug.enable("foxglove:*");

async function main(url: string, topics: string) {
  const address = url.startsWith("ws://") || url.startsWith("wss://") ? url : `ws://${url}`;
  const topicsRegex = new RegExp(topics);

  const channelsBySubId = new Map<number, Channel>();
  const channelStatsBySubId = new Map<number, { timestamp: number; bytesRcvd: number }[]>();

  const printStats = () => {
    let totalKiloBytesRcvd = 0;

    const topicWidth = [...channelsBySubId.values()].reduce(
      (acc, x) => (x.topic.length > acc ? x.topic.length : acc),
      0,
    );
    const nMsgsWidth = 9;
    const nKbRcvdWidth = 14;

    console.log(
      `| ${"topic".padEnd(topicWidth)} | ${"Msgs rcvd".padEnd(nMsgsWidth)} | ${"kB rcvd".padEnd(
        nKbRcvdWidth,
      )} |`,
    );
    console.log(
      `|-${"".padEnd(topicWidth, "-")}-|-${"".padEnd(nMsgsWidth, "-")}-|-${"".padEnd(
        nKbRcvdWidth,
        "-",
      )}-|`,
    );

    channelsBySubId.forEach((channel, subId) => {
      const stats = channelStatsBySubId.get(subId);
      const sumBytesReceived = (stats?.reduce((acc, x) => acc + x.bytesRcvd, 0) ?? 0) / 1e3;
      totalKiloBytesRcvd += sumBytesReceived;
      const topicStr = channel.topic.padEnd(topicWidth);
      const nMsgsStr = `${stats?.length ?? 0}`.padEnd(nMsgsWidth);
      const sumBytesReceivedStr = sumBytesReceived.toFixed(2).padEnd(nKbRcvdWidth);

      console.log(`| ${topicStr} | ${nMsgsStr} | ${sumBytesReceivedStr} |`);
    });

    console.log(`\nTotal kB received: ${totalKiloBytesRcvd}`);
  };

  log(`Client connecting to ${address}`);
  const client = new FoxgloveClient({
    ws: new WebSocket(address, [FoxgloveClient.SUPPORTED_SUBPROTOCOL]),
  });
  client.on("error", (error) => {
    log("Error", error);
    throw error;
  });
  client.on("advertise", (channels) => {
    const subscribedChannelIds = [...channelsBySubId.values()].map((channel) => channel.id);
    const newChannels = channels
      .filter((c) => !subscribedChannelIds.includes(c.id))
      .filter((c) => topicsRegex.test(c.topic));

    for (const channel of newChannels) {
      const subId = client.subscribe(channel.id);
      channelsBySubId.set(subId, channel);
      channelStatsBySubId.set(subId, []);
    }
  });
  client.on("message", (event) => {
    const rcvMsgs = channelStatsBySubId.get(event.subscriptionId);
    rcvMsgs?.push({ timestamp: new Date().getTime(), bytesRcvd: event.data.byteLength });
  });
  client.on("close", printStats);

  process.on("SIGINT", () => {
    console.log("Caught interrupt signal");
    client.close();
    printStats();
    process.exit();
  });
}

export default new Command("perf-test-client")
  .description(
    "connect to a server and subscribe to all available channels. Print channel statistics on disconnect / exit",
  )
  .argument("[url]", "ws(s)://host:port", "ws://localhost:8765")
  .argument("[topics]", "regex for topics to subscribe", ".*")
  .action(main);
