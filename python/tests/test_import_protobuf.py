def test_import_protobuf():
    """
    Ensure the generated protobuf file is successfully importable in a dev environment.
    """
    from foxglove_websocket.examples.proto.foxglove.SceneUpdate_pb2 import SceneUpdate

    _ = SceneUpdate()
