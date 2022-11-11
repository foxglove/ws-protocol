#!/usr/bin/env node
import { program } from "commander";

import ImageServer from "./examples/image-server";
import McapPlay from "./examples/mcap-play";
import SimpleClient from "./examples/simple-client";
import Sysmon from "./examples/sysmon";

program.name("ws-protocol-examples");
program.addCommand(ImageServer);
program.addCommand(Sysmon);
program.addCommand(SimpleClient);
program.addCommand(McapPlay);

program.parseAsync().catch(console.error);
