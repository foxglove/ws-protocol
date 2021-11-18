import asyncio
import signal
from typing import Any, Coroutine


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
