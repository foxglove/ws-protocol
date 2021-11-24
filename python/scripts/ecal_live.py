from abc import ABC, abstractmethod
import asyncio
import argparse
import base64
from enum import Enum
import logging
import sys
import time
from typing import TYPE_CHECKING, Type, NamedTuple
from foxglove_websocket import run_cancellable
from foxglove_websocket.server import FoxgloveServer, FoxgloveServerListener
from foxglove_websocket.types import ChannelId, ChannelWithoutId

import ecal.core.core as ecal_core

logger = logging.getLogger("FoxgloveServer")

class MyChannelWithoutId(NamedTuple):
    topic: str
    encoding: str
    schemaName: str
    schema: str

class MonitoringListener(ABC):
    @abstractmethod
    async def on_new_topics(self, new_topics : set[ChannelWithoutId]):
        """
        Called when there are new topics in the monitoring
        """
        ...

    @abstractmethod
    async def on_removed_topics(self, removed_topics : set[MyChannelWithoutId]):
        """
        Called when topics are no longer present in the monitoring
        """
        ...

# This class is handling the ecal monitoring. 
# It evaluates the messages cyclicly and notifies on added / removed topics
class Monitoring(object):
    topics : set[MyChannelWithoutId]

    def __init__(self):
        self.listener = None
        self.topics = set()

    def set_listener(self, listener : MonitoringListener):
        self.listener = listener

    async def monitoring(self):
        while ecal_core.ok():
            #logger.info("Monitoring...")
            current_topics = await self.get_topics_from_monitoring()
            new_topics = current_topics - self.topics
            removed_topics = self.topics - current_topics

            self.topics = current_topics

            if self.listener:
                if removed_topics:
                    logger.info("Removing topics")
                    await self.listener.on_removed_topics(removed_topics)
                if new_topics:
                    logger.info("Adding topics")
                    await self.listener.on_new_topics(new_topics)

            await asyncio.sleep(1)

    async def get_topics_from_monitoring(self):
        current_topics = set()
        try:
            topics = ecal_core.mon_monitoring()[1]['topics']
        except Exception: # Catch no monitoring information
            logger.warning("Cannot parse monitoring info")
            return current_topics

        for topic in topics:
            if(topic['direction']=='publisher'):
                current_topic = {}
                current_topic["topic"] = topic["tname"]
                current_topic["encoding"] = "protobuf"
                try:
                    _, topic_type = topic["ttype"].split(":")
                except Exception:
                    continue
                current_topic["schemaName"] = topic_type
                current_topic["schema"] = base64.b64encode(topic["tdesc"]).decode("ascii")
                current_topics.add(MyChannelWithoutId(**current_topic))

        return current_topics
        
class TimeSource(Enum):
    SEND_TIMESTAMP = 1
    LOCAL_TIME = 2

# This class handles each available Topic
# It contains an ecal subscriber, and will forward messages to the server.
class TopicSubscriber(object):
    channel_id : ChannelId
    info : MyChannelWithoutId
    subscriber : ecal_core.subscriber
    server : FoxgloveServer
    
    def __init__(self, id : ChannelId, info : MyChannelWithoutId, server : FoxgloveServer, loop, time_source : TimeSource = TimeSource.LOCAL_TIME):
      self.id = id
      self.info = info
      self.subscriber = None
      self.server = server
      self.loop = loop
      self.time_source = time_source
    
    @property
    def is_subscribed(self):
        return self.subscriber is not None

    def callback(self, topic_name, msg, send_time):
        try:
            if self.time_source == TimeSource.SEND_TIMESTAMP:
                timestamp = send_time * 1000
            else: #TimeSource.LOCAL_TIME
                timestamp = time.time_ns()
            
            self.loop.call_soon_threadsafe(lambda: asyncio.create_task(self.server.handle_message(
                     self.id,
                     timestamp,
                     msg
                 ))
            )
        except Exception as e:
            print("Caught exception in callback {}".format(e))
    
    def subscribe(self):
        self.subscriber = ecal_core.subscriber(self.info.topic)
        self.subscriber.set_callback(self.callback)
        
    def unsubscribe(self):
        self.subscriber.destroy()
        self.subscriber = None
        
# This class handles all connections.
# It advertises new topics to the server, and removes the ones that are no longer present in the monitoring
class ConnectionHandler(MonitoringListener):
    topic_subscriptions : dict[str, TopicSubscriber]
    id_channel_mapping : dict[ChannelId, str]
    server : FoxgloveServer

    def __init__(self, server : FoxgloveServer):
      self.topic_subscriptions = {}
      self.id_channel_mapping = {}
      self.server = server

    def get_subscriber_by_id(self, id : ChannelId):
      return self.topic_subscriptions[self.id_channel_mapping[id]]

    async def on_new_topics(self, new_topics : set[MyChannelWithoutId]):
      for topic in new_topics:
        channel_without_id = ChannelWithoutId(**topic._asdict())
        id = await self.server.add_channel(
           channel_without_id
        )
        loop = asyncio.get_running_loop()
        self.topic_subscriptions[topic.topic] = TopicSubscriber(id, topic, self.server, loop)
        self.id_channel_mapping[id] = topic.topic

    async def on_removed_topics(self, removed_topics : set[MyChannelWithoutId]):
      for topic in removed_topics:
        topic_name = topic.topic
        removed_subscriber = self.topic_subscriptions[topic_name]
        await self.server.remove_channel(
           removed_subscriber.id
        )
        if removed_subscriber.is_subscribed:
          removed_subscriber.unsubscribe()
        self.topic_subscriptions.pop(topic_name)
        self.id_channel_mapping.pop(removed_subscriber.id)

class Listener(FoxgloveServerListener):
    def __init__(self, connection_handler : ConnectionHandler):
        self.connection_handler = connection_handler
    
    def on_subscribe(self, server: FoxgloveServer, channel_id: ChannelId):
        self.connection_handler.get_subscriber_by_id(channel_id).subscribe()

    def on_unsubscribe(self, server: FoxgloveServer, channel_id: ChannelId):
        self.connection_handler.get_subscriber_by_id(channel_id).unsubscribe()  


async def main():
    ecal_core.initialize(sys.argv, "eCAL WS Gateway")
    ecal_core.mon_initialize()
    
    # sleep 1 second so monitoring info will be available
    await asyncio.sleep(1)
    
    async with FoxgloveServer("0.0.0.0", 8765, "example server") as server:
        connection_handler = ConnectionHandler(server)
        server.set_listener(Listener(connection_handler))

        monitoring = Monitoring()
        monitoring.set_listener(connection_handler)
        asyncio.create_task(monitoring.monitoring())
        
        while True:
            await asyncio.sleep(0.5)


if __name__ == "__main__":
    run_cancellable(main())
