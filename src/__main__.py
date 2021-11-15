import asyncio
import argparse
import base64
import signal
from typing import Type

from .server import FoxgloveServer
from .types import ChannelId
from . import hdf5_native

try:
    from ecal.measurement.hdf5 import Meas
except ImportError:
    from .hdf5_native import Meas
Meas: Type[hdf5_native.Meas]


async def main(infile: str):
    measurement = Meas(infile)

    async with FoxgloveServer("localhost", 8765, "example server") as server:
        # server.start()
        channels_by_name: dict[str, ChannelId] = {}

        for chan_name in measurement.get_channel_names():
            protocol, type = measurement.get_channel_type(chan_name).split(":")
            descriptor = measurement.get_channel_description(chan_name)

            if protocol != "proto":
                raise NotImplementedError(f"Unsupported protocol {protocol}")

            channels_by_name[chan_name] = await server.add_channel(
                {
                    "topic": chan_name,
                    "encoding": "protobuf",
                    "schema": base64.b64encode(descriptor).decode("ascii"),
                    "schemaName": type,
                }
            )

        all_entries = sorted(
            (
                (chan_id, entry)
                for (chan_name, chan_id) in channels_by_name.items()
                for entry in measurement.get_entries_info(chan_name)
            ),
            key=lambda id_entry: id_entry[1]["rcv_timestamp"],
        )

        while True:
            print("Top of loop")
            for chan_id, entry in all_entries:
                print("Sending message")
                await asyncio.sleep(0.5)
                await server.handle_message(
                    chan_id,
                    entry["rcv_timestamp"] * 1000,
                    measurement.get_entry_data(entry["id"]),
                )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Foxglove server example")
    parser.add_argument(
        "infile",
        type=str,
        help="eCAL HDF5 file path",
    )
    args = parser.parse_args()

    # https://www.roguelynn.com/words/asyncio-graceful-shutdowns/
    loop = asyncio.get_event_loop()
    task = loop.create_task(main(**vars(args)))
    loop.add_signal_handler(signal.SIGINT, task.cancel)
    try:
        loop.run_until_complete(task)
    except asyncio.CancelledError:
        pass
