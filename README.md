## Virtualenv usage

```
python3 -m venv venv
. venv/bin/activate
pip install -r requirements.txt -r dev-requirements.txt
```

### h5py installation on M1 Macs
```
brew install hdf5
HDF5_DIR=/opt/homebrew/opt/hdf5 pip install -v --no-build-isolation h5py
```

## Run example server

```
python -m src /path/to/person.hdf5
```
