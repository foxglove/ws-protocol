# Foxglove Studio WebSocket protocol libraries

This repository provides a protocol specification and reference implementations enabling [Foxglove Studio](https://github.com/foxglove/studio) to ingest arbitrary “live” streamed data.

The protocol is encoding-agnostic, i.e. it can support Protobuf messages, ROS 1 or 2 messages, etc. (as long as the desired encoding is supported by both client and server).

## Documentation

- [Protocol spec](docs/spec.md)

## Development

### Virtualenv usage

```
python3.8 -m venv venv
. venv/bin/activate
pip install -r python/requirements.txt -r python/dev-requirements.txt
```

#### h5py installation on M1 Macs

```
brew install hdf5
HDF5_DIR=/opt/homebrew/opt/hdf5 pip install -v --no-build-isolation h5py
```

### Run example server

```
python -m python.src [hdf5 file]
```

### Run example client

```
yarn workspace @foxglove/ws-protocol example [host] [topic]
```
