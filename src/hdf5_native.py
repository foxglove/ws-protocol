# ========================= eCAL LICENSE =================================
#
# Copyright (C) 2016 - 2019 Continental Corporation
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#
# ========================= eCAL LICENSE =================================

"""
  @package eCALHDF5
  Python wrapper for eCALHDF5

  You can use the eCALHDF5 API in a function style or OO manner.
"""

import h5py


class Meas:
    def __init__(self, path: str = "", access: int = 0):
        self.meas = h5py.File(path, "r")
        self.channels = self.meas.attrs["Channels"].decode("ascii").split(",")

    def open(self, path, access):
        raise NotImplementedError()

    def close(self):
        raise NotImplementedError()

    def is_ok(self):
        raise NotImplementedError()

    def get_file_version(self):
        raise NotImplementedError()

    def get_max_size_per_file(self):
        raise NotImplementedError()

    def set_max_size_per_file(self, size):
        raise NotImplementedError()

    def get_channel_names(self) -> list[str]:
        return self.channels

    def get_channel_description(self, channel_name: str) -> bytes:
        channel = self.meas[channel_name]
        return channel.attrs["Channel Description"]

    def set_channel_description(self, channel_name, description):
        raise NotImplementedError()

    def get_channel_type(self, channel_name: str) -> str:
        channel = self.meas[channel_name]
        return channel.attrs["Channel Type"].decode("ascii")

    def set_channel_type(self, channel_name, type):
        raise NotImplementedError()

    def get_min_timestamp(self, channel_name):
        raise NotImplementedError()

    def get_max_timestamp(self, channel_name):
        raise NotImplementedError()

    # to be implemented using slicing!!!
    def get_entries_info(self, channel_name: str):
        channel = self.meas[channel_name]
        entries_size = channel.shape
        entries = []
        for i in range(entries_size[0]):
            entry = {}
            entry["snd_timestamp"] = channel[i, 0]
            entry["id"] = channel[i, 1]
            entry["snd_clock"] = channel[i, 2]
            entry["rcv_timestamp"] = channel[i, 3]
            entry["snd_id"] = channel[i, 4]
            entries.append(entry)
        return entries

    def get_entries_info_range(self, channel_name, begin, end):
        raise NotImplementedError()

    def get_entry_data_size(self, entry_id):
        raise NotImplementedError()

    def get_entry_data(self, entry_id: int) -> bytes:
        return self.meas[str(entry_id)][:].tobytes()

    def set_file_base_name(self, base_name):
        raise NotImplementedError()

    def add_entry_to_file(
        self, data, snd_timestamp, rcv_timestamp, channel_name, counter=0
    ):
        raise NotImplementedError()


class Channel:
    def __init__(self, name, description, type):
        self.name = name
        self.description = description
        self.type = type
