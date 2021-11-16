import asyncio
import argparse
import base64
import signal
from typing import TYPE_CHECKING, Any, Coroutine, Type

from .server import FoxgloveServer
from .types import ChannelId

try:
    from ecal.measurement.hdf5 import Meas
except ImportError:
    from .hdf5_native import Meas

if TYPE_CHECKING:
    from . import hdf5_native

    Meas: Type[hdf5_native.Meas]


async def main(infile: str):
    measurement = Meas(infile)

    async with FoxgloveServer("0.0.0.0", 8765, "example server") as server:
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
            for chan_id, entry in all_entries:
                await asyncio.sleep(0.5)
                await server.handle_message(
                    chan_id,
                    entry["rcv_timestamp"] * 1000,
                    measurement.get_entry_data(entry["id"]),
                )


def run_cancellable(coro: Coroutine[None, None, Any]):
    """
    Run a coroutine such that a ctrl-C interrupt will gracefully cancel its
    execution and give it a chance to clean up before returning.

    See also: https://www.roguelynn.com/words/asyncio-graceful-shutdowns/
    """
    loop = asyncio.get_event_loop()
    task = loop.create_task(coro)
    try:
        loop.add_signal_handler(signal.SIGINT, task.cancel)
    except NotImplementedError:
        # signal handlers are not available on Windows, KeyboardInterrupt will be raised instead
        pass

    try:
        try:
            loop.run_until_complete(task)
        except KeyboardInterrupt:
            task.cancel()
            loop.run_until_complete(task)
    except asyncio.CancelledError:
        pass


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Foxglove server example")
    parser.add_argument(
        "infile",
        type=str,
        help="eCAL HDF5 file path",
    )
    args = parser.parse_args()

    run_cancellable(main(**vars(args)))
