import asyncio
import pytest
from foxglove_websocket.server import FoxgloveServer


@pytest.mark.asyncio
async def test_server():
    server = FoxgloveServer("0.0.0.0", 0, "test server")
    server.start()
    await asyncio.sleep(0)
    server.close()
    await server.wait_closed()
