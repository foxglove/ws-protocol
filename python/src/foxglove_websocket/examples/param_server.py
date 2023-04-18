import asyncio
from typing import Any, Dict, List, Optional
from foxglove_websocket import run_cancellable
from foxglove_websocket.server import FoxgloveServer, FoxgloveServerListener
from foxglove_websocket.types import Parameter


async def main():
    class Listener(FoxgloveServerListener):
        def __init__(self, param_store: Dict[str, Any]) -> None:
            self._param_store = param_store

        async def on_get_parameters(
            self,
            server: FoxgloveServer,
            param_names: List[str],
            request_id: Optional[str],
        ) -> List[Parameter]:
            return [
                Parameter(name=k, value=v, type=None)
                for k, v in self._param_store.items()
                if k in param_names or len(param_names) == 0
            ]

        async def on_set_parameters(
            self,
            server: FoxgloveServer,
            params: List[Parameter],
            request_id: Optional[str],
        ):
            for param in params:
                if not param["name"].startswith("read_only"):
                    self._param_store[param["name"]] = param["value"]
            param_names = [param["name"] for param in params]
            return [
                Parameter(name=k, value=v, type=None)
                for k, v in self._param_store.items()
                if k in param_names
            ]

    async with FoxgloveServer(
        "0.0.0.0",
        8765,
        "example param server",
        capabilities=["parameters", "parametersSubscribe"],
    ) as server:
        param_store: Dict[str, Any] = {
            "int_param": 0,
            "str_param": "asdf",
            "bool_param": True,
            "int_array_param": [1, 2, 3],
            "str_array_param": ["abc", "def", "fgh"],
            "bool_array_param": [True, False, True],
            "read_only_str_param": "can't change me",
        }

        server.set_listener(Listener(param_store))

        i = 0
        while True:
            i += 1
            await asyncio.sleep(3.0)
            param_store["int_param"] = i
            await server.update_parameters(
                [Parameter(name="int_param", value=param_store["int_param"], type=None)]
            )


if __name__ == "__main__":
    run_cancellable(main())
