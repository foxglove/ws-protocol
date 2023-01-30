#!/usr/bin/env node
import { program } from "commander";

import ImageServer from "./examples/image-server";
import McapPlay from "./examples/mcap-play";
import ParamClient from "./examples/param-client";
import ParamServer from "./examples/param-server";
import PublishClient from "./examples/publish-client";
import ServiceClient from "./examples/service-client";
import ServiceServer from "./examples/service-server";
import SimpleClient from "./examples/simple-client";
import Sysmon from "./examples/sysmon";

program.name("ws-protocol-examples");
program.addCommand(ImageServer);
program.addCommand(McapPlay);
program.addCommand(PublishClient);
program.addCommand(SimpleClient);
program.addCommand(Sysmon);
program.addCommand(ParamClient);
program.addCommand(ParamServer);
program.addCommand(ServiceClient);
program.addCommand(ServiceServer);

program.parseAsync().catch(console.error);
