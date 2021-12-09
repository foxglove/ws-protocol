#!/usr/bin/env node
import { program } from "commander";

import ImageServer from "./examples/image-server";
import SimpleClient from "./examples/simple-client";
import Sysmon from "./examples/sysmon";

program.name("ws-protocol-examples");
program.addCommand(ImageServer);
program.addCommand(Sysmon);
program.addCommand(SimpleClient);

program.parseAsync().catch(console.error);
