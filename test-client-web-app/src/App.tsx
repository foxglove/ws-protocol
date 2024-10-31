import {
  Channel,
  ChannelId,
  FoxgloveClient,
  MessageData,
  ServerInfo,
  StatusLevel,
  StatusMessage,
  SubscriptionId,
} from "@foxglove/ws-protocol";
import {
  Button,
  Checkbox,
  Container,
  FormControlLabel,
  FormGroup,
  Input,
  Paper,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import { BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, Title } from "chart.js";
import { memo, useCallback, useEffect, useRef, useState, ReactElement } from "react";
import { Bar } from "react-chartjs-2";

import "./App.css";
import WorkerSocketAdapter from "./WorkerSocketAdapter";

type ChannelStats = {
  totalNumMsgs: number;
  totalNumBytes: number;
  ticks: StampedStats[];
  currentSubId?: number;
};

type StampedStats = {
  time: number;
  numBytes: number;
  numMsgs: number;
  byteDiff?: number;
};

type LogEntry =
  | { type: "misc"; value: string }
  | { type: "serverInfo"; value: ServerInfo }
  | { type: "status"; value: StatusMessage }
  | { type: "error"; value: string };
type StampedLogEntry = LogEntry & { time: Date };

const UPDATE_PERIOD_MS = 500;
const NUM_TICKS_TOTAL_STATS = 30;
const NUM_TICKS_CHANNEL_STATS = 10;

const channelStats = new Map<ChannelId, ChannelStats>();
const subscribedChannels = new Map<SubscriptionId, ChannelId>();

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Legend);

const chartOptions = {
  responsive: true,
  plugins: {
    title: {
      display: false,
      text: "Bandwidth",
    },
  },
};

function App(): ReactElement {
  const [url, setUrl] = useState<string>("ws://localhost:8765");
  const [client, setClient] = useState<FoxgloveClient | undefined>();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [totalStats, setTotalStats] = useState<ChannelStats>({
    totalNumMsgs: 0,
    totalNumBytes: 0,
    ticks: [],
  });
  const [config, setConfig] = useState({
    runInWorker: true,
    subscribeNewChannels: false,
  });
  const [statusLogs, setStatusLogs] = useState<StampedLogEntry[]>([]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!client) {
        return;
      }

      const now = new Date().getTime();
      let numMsgs = 0;
      let numBytes = 0;
      for (const stats of channelStats.values()) {
        numMsgs += stats.totalNumMsgs;
        numBytes += stats.totalNumBytes;
        stats.ticks = [
          {
            time: now,
            numMsgs: stats.totalNumMsgs,
            numBytes: stats.totalNumBytes,
          },
          ...stats.ticks.slice(0, NUM_TICKS_CHANNEL_STATS - 1),
        ];
      }
      setTotalStats((prevTotalStats: ChannelStats) => ({
        totalNumMsgs: numMsgs,
        totalNumBytes: numBytes,
        ticks: [
          {
            time: now,
            numMsgs,
            numBytes,
            byteDiff: numBytes - prevTotalStats.totalNumBytes,
          },
          ...prevTotalStats.ticks.slice(0, NUM_TICKS_TOTAL_STATS - 1),
        ],
      }));
    }, UPDATE_PERIOD_MS);

    return () => {
      clearInterval(interval);
    };
  }, [client]);

  const enableSubscription = useCallback(
    (channelId: number, action: "subscribe" | "unsubscribe") => {
      if (!client) {
        throw new Error("Client not connected");
      }

      const stats = channelStats.get(channelId);
      if (action === "subscribe" && stats && stats.currentSubId == undefined) {
        const subId = client.subscribe(channelId);
        stats.currentSubId = subId;
        subscribedChannels.set(subId, channelId);
      } else if (action === "unsubscribe" && stats?.currentSubId != undefined) {
        client.unsubscribe(stats.currentSubId);
        subscribedChannels.delete(stats.currentSubId);
        stats.currentSubId = undefined;
      }
    },
    [client],
  );

  const subscribeAll = useCallback(
    (action: "subscribe" | "unsubscribe") => {
      channels.forEach(({ id }) => {
        enableSubscription(id, action);
      });
    },
    [channels, enableSubscription],
  );

  useEffect(() => {
    for (const channel of channels) {
      const stats = channelStats.get(channel.id);
      if (!stats) {
        channelStats.set(channel.id, {
          totalNumMsgs: 0,
          totalNumBytes: 0,
          ticks: [],
        });
        if (config.subscribeNewChannels) {
          enableSubscription(channel.id, "subscribe");
        }
      }
    }
  }, [channels, config, enableSubscription]);

  const addLogEntry = useCallback(
    (entry: LogEntry) => {
      setStatusLogs((logs: StampedLogEntry[]) => logs.concat([{ ...entry, time: new Date() }]));
    },
    [setStatusLogs],
  );

  const connect = useCallback(() => {
    if (client) {
      throw new Error("Already connected");
    }
    const wsClient = new FoxgloveClient({
      ws:
        typeof Worker !== "undefined" && config.runInWorker
          ? new WorkerSocketAdapter(url, [FoxgloveClient.SUPPORTED_SUBPROTOCOL])
          : new WebSocket(url, [FoxgloveClient.SUPPORTED_SUBPROTOCOL]),
    });

    wsClient.on("open", () => {
      setClient(wsClient);
      channelStats.clear();
      subscribedChannels.clear();
      setChannels([]);
      setTotalStats({
        totalNumBytes: 0,
        totalNumMsgs: 0,
        ticks: new Array(NUM_TICKS_TOTAL_STATS).fill({
          time: new Date().getTime(),
          numBytes: 0,
          numMsgs: 0,
        }) as StampedStats[],
      });
      setStatusLogs([
        {
          type: "misc",
          value: `Connection to ${url} established`,
          time: new Date(),
        },
      ]);
    });
    wsClient.on("close", () => {
      addLogEntry({ type: "misc", value: `Connection closed` });
      setClient(undefined);
    });
    wsClient.on("serverInfo", (serverInfo: ServerInfo) => {
      addLogEntry({ type: "serverInfo", value: serverInfo });
    });
    wsClient.on("error", (error: Error) => {
      addLogEntry({ type: "error", value: error.message });
    });
    wsClient.on("status", (status: StatusMessage) => {
      addLogEntry({ type: "status", value: status });
    });
    wsClient.on("advertise", (newChannels: Channel[]) => {
      setChannels((oldChannels: Channel[]) =>
        oldChannels.concat(newChannels).sort((lhs, rhs) => {
          if (lhs.topic < rhs.topic) {
            return -1;
          } else if (lhs.topic > rhs.topic) {
            return 1;
          }
          return 0;
        }),
      );
    });
    wsClient.on("unadvertise", (removedChannelIds: ChannelId[]) => {
      for (const channelId of removedChannelIds) {
        const stats = channelStats.get(channelId);
        if (stats?.currentSubId != undefined) {
          subscribedChannels.delete(stats.currentSubId);
          stats.currentSubId = undefined;
        }
      }
      setChannels((currChannels: Channel[]) =>
        currChannels.filter((channel) => !removedChannelIds.includes(channel.id)),
      );
    });
    wsClient.on("message", (event: MessageData) => {
      const channelId = subscribedChannels.get(event.subscriptionId);
      if (channelId == undefined) {
        return;
      }

      const stats = channelStats.get(channelId);
      if (!stats) {
        return;
      }

      stats.totalNumMsgs++;
      stats.totalNumBytes += event.data.byteLength;
    });
  }, [url, client, addLogEntry, config]);

  const disconnect = useCallback(() => {
    client?.close();
    setClient(undefined);
  }, [client]);

  const totalTicks = totalStats.ticks.filter((v: StampedStats | undefined) => !!v);
  const firstTotalTick = totalTicks[0];
  const lastTotalTick = totalTicks[totalTicks.length - 1];
  const avgBandWith =
    firstTotalTick != undefined && lastTotalTick != undefined
      ? Math.abs(firstTotalTick.numBytes - lastTotalTick.numBytes) /
        ((firstTotalTick.time - lastTotalTick.time) / 1000)
      : 0;

  const chartData = {
    labels: totalStats.ticks.map(() => ""),
    datasets: [
      {
        label: "Bandwidth [byte/s]",
        data: totalStats.ticks.map((bt) => (bt.byteDiff ?? 0) / (UPDATE_PERIOD_MS / 1000)),
        backgroundColor: "rgba(53, 162, 235, 0.5)",
      },
    ],
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>ws-protocol client</h1>
      </header>
      <Container maxWidth="lg">
        <Stack spacing={2}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            gap={1}
            justifyContent={"space-between"}
            alignItems={"center"}
          >
            <Stack direction="column" spacing={1}>
              <Stack direction="row" spacing={1}>
                <Input
                  type="url"
                  placeholder="ws://localhost:8765"
                  value={url}
                  onChange={(event) => {
                    setUrl(event.target.value);
                  }}
                />
                <Button
                  type="button"
                  disabled={!!client}
                  onClick={connect}
                  variant="outlined"
                  color="success"
                >
                  Connect
                </Button>
                <Button
                  type="button"
                  disabled={!client}
                  onClick={disconnect}
                  variant="outlined"
                  color="error"
                >
                  Disconnect
                </Button>
              </Stack>
              <FormGroup>
                <FormControlLabel
                  control={
                    <Switch
                      disabled={!!client || typeof Worker === "undefined"}
                      checked={config.runInWorker}
                      onChange={(_, checked) => {
                        setConfig((currConfig) => ({
                          ...currConfig,
                          runInWorker: checked,
                        }));
                      }}
                    />
                  }
                  label="Run in webworker"
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={config.subscribeNewChannels}
                      onChange={(_, checked) => {
                        setConfig((currConfig) => ({
                          ...currConfig,
                          subscribeNewChannels: checked,
                        }));
                      }}
                    />
                  }
                  label="Subscribe to new channels"
                />
              </FormGroup>
            </Stack>
            <Stack direction={{ xs: "row", sm: "column" }} gap={1} justifyContent={"flex-end"}>
              <Typography variant="body2">Total msgs: {totalStats.totalNumMsgs}</Typography>
              <Typography variant="body2">
                Total bytes: {totalStats.totalNumBytes.toExponential(1)}
              </Typography>
              <Typography variant="body2">
                Avg. Bandwidth: {avgBandWith.toExponential(1)} Byte/s
              </Typography>
            </Stack>
            <div style={{ maxHeight: "150px" }}>
              <Bar options={{ ...chartOptions, animation: false }} data={chartData} />
            </div>
          </Stack>
          <TableContainer component={Paper}>
            <Table sx={{ minWidth: 650 }} size="small">
              <TableHead>
                <TableRow>
                  <TableCell>
                    <Tooltip title="Subscribe / Unsubscribe">
                      <Checkbox
                        disabled={!client}
                        size="small"
                        checked={subscribedChannels.size === channels.length}
                        onChange={(_, checked) => {
                          subscribeAll(checked ? "subscribe" : "unsubscribe");
                        }}
                      />
                    </Tooltip>
                  </TableCell>
                  <TableCell>Topic (id)</TableCell>
                  <TableCell align="right">Type</TableCell>
                  <TableCell align="right">Msgs</TableCell>
                  <TableCell align="right">Bytes</TableCell>
                  <TableCell align="right">Avg. size</TableCell>
                  <TableCell align="right">Avg. frequency</TableCell>
                  <TableCell align="right">Avg. bandwith</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {channels.map((channel: Channel) => {
                  const stats = channelStats.get(channel.id);
                  let avgFreq = 0,
                    avgBw = 0;
                  const ticks = stats?.ticks ?? [];
                  const firstTick = ticks[0];
                  const lastTick = ticks[ticks.length - 1];
                  if (firstTick != undefined && lastTick != undefined) {
                    const timeDiffInSec = (firstTick.time - lastTick.time) / 1000;
                    avgFreq = (firstTick.numMsgs - lastTick.numMsgs) / timeDiffInSec;
                    avgBw = (firstTick.numBytes - lastTick.numBytes) / timeDiffInSec;
                  }
                  return (
                    <TableRow
                      role="checkbox"
                      key={channel.topic}
                      sx={{ "&:last-child td, &:last-child th": { border: 0 } }}
                    >
                      <TableCell padding="checkbox">
                        <Tooltip title="Subscribe / Unsubscribe">
                          <Checkbox
                            disabled={!client}
                            size="small"
                            checked={stats?.currentSubId != undefined}
                            onChange={(_, checked) => {
                              enableSubscription(channel.id, checked ? "subscribe" : "unsubscribe");
                            }}
                          />
                        </Tooltip>
                      </TableCell>
                      <TableCell
                        component="th"
                        scope="row"
                      >{`${channel.topic} (${channel.id})`}</TableCell>
                      <TableCell align="right">{channel.schemaName}</TableCell>
                      <TableCell align="right">{stats?.totalNumMsgs ?? 0}</TableCell>
                      <TableCell align="right">
                        {stats?.totalNumBytes.toExponential(1) ?? 0}
                      </TableCell>
                      <TableCell align="right">
                        {stats?.totalNumBytes != undefined
                          ? (stats.totalNumBytes / stats.totalNumMsgs).toExponential(1)
                          : 0}
                      </TableCell>
                      <TableCell align="right">{avgFreq.toFixed(1)} Hz</TableCell>
                      <TableCell align="right">{avgBw.toExponential(1)} Byte/s</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>

          <Typography variant="body1" justifyContent={"flex-start"}>
            Logs
          </Typography>
          <LogView logs={statusLogs} />
        </Stack>
      </Container>
    </div>
  );
}

const LogViewEntry = memo((props: { entry: StampedLogEntry }) => {
  const LABEL_BY_STATUS_LEVEL = {
    [StatusLevel.INFO]: "INFO",
    [StatusLevel.WARNING]: "WARNING",
    [StatusLevel.ERROR]: "ERROR",
  };
  const strVal =
    props.entry.type === "status"
      ? props.entry.value.message
      : props.entry.type === "serverInfo"
        ? JSON.stringify(props.entry.value)
        : props.entry.value;
  return (
    <TableRow>
      <TableCell>{props.entry.time.toLocaleString()}</TableCell>
      <TableCell>
        {props.entry.type === "status"
          ? `Status (${LABEL_BY_STATUS_LEVEL[props.entry.value.level]})`
          : props.entry.type}
      </TableCell>
      <TableCell>{strVal}</TableCell>
    </TableRow>
  );
});

const LogView = memo(function LogView(props: { logs: StampedLogEntry[] }) {
  const tableRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (tableRef.current) {
      tableRef.current.scrollTop = tableRef.current.scrollHeight;
    }
  }, [props.logs]);
  return (
    <Paper sx={{ width: "100%", overflow: "hidden" }}>
      <TableContainer ref={tableRef} sx={{ maxHeight: 300 }}>
        <Table size="small" stickyHeader aria-label="sticky table">
          <TableHead>
            <TableRow>
              <TableCell>Time</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Content</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {props.logs.map((entry, idx) => (
              <LogViewEntry key={idx} entry={entry} />
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
});

export default App;
