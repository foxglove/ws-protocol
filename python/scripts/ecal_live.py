import asyncio
import argparse
import base64
import sys
from typing import TYPE_CHECKING, Type, NamedTuple
from foxglove_websocket import run_cancellable
from foxglove_websocket.server import FoxgloveServer, FoxgloveServerListener
from foxglove_websocket.types import ChannelId, ChannelWithoutId

import ecal.core.core as ecal_core

def ecal_monitoring():
    availableTopics = []
    if ecal_core.ok():
        topics = ecal_core.mon_monitoring()[1]['topics']
        for topic in topics:
            if(topic['direction']=='publisher'):
                current_topic = {}
                current_topic["topic"] = topic["tname"]
                current_topic["encoding"] = "protobuf"
                _, topic_type = topic["ttype"].split(":")
                current_topic["schemaName"] = topic_type
                current_topic["schema"] = base64.b64encode(topic["tdesc"]).decode("ascii")
                availableTopics.append(ChannelWithoutId(**current_topic))
    return availableTopics
# On 

class TopicSubscriber(object):
    channel_id : ChannelId
    info : ChannelWithoutId
    subscriber : ecal_core.subscriber
    server : FoxgloveServer
    
    def __init__(self, id : ChannelId, info : ChannelWithoutId, server : FoxgloveServer):
      self.id = id
      self.info = info
      self.subscriber = None
      self.server = server
    
    async def callback(self, topic_name, msg, time):
        await server.handle_message(
            self.id,
            time * 1000,
            msg
        )
    
    async def subscribe():
        self.subscriber = ecal_core.subscriber(self.info.topic)
        self.subscriber.set_callback(self.callback)
        
    async def unsubscribe():
        self.subscriber.destroy()
        self.subscriber = None
        

class Listener(FoxgloveServerListener):
    def __init__(self, topic_subscriptions):
        self.topic_subscriptions = topic_subscriptions
    
    def on_subscribe(self, server: FoxgloveServer, channel_id: ChannelId):
        self.topic_subscriptions[channel_id].subscribe()

    def on_unsubscribe(self, server: FoxgloveServer, channel_id: ChannelId):
        self.topic_subscriptions[channel_id].unsubscribe()  


async def main():
    ecal_core.initialize(sys.argv, "eCAL WS Gateway")
    ecal_core.mon_initialize()
    
    # sleep 1 second so monitoring info will be available
    await asyncio.sleep(1)

    async with FoxgloveServer("0.0.0.0", 8765, "example server") as server:
        topic_subscriptions: dict[ChannelId, TopicSubscriber] = {}

        # extract info from ecal monitoring
        for channel in ecal_monitoring():
            id = await server.add_channel(
                channel
            )
            topic_subscriptions[id] = TopicSubscriber
        
        server.set_listener(Listener(topic_subscriptions))
        
        while True:
            await asyncio.sleep(0.5)


if __name__ == "__main__":
    run_cancellable(main())
