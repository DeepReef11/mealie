import asyncio
import json
import logging
from collections import defaultdict
from uuid import UUID

logger = logging.getLogger(__name__)


class SSEConnectionManager:
    """Manages Server-Sent Event connections for shopping list live updates."""

    def __init__(self) -> None:
        self._connections: dict[str, list[asyncio.Queue]] = defaultdict(list)

    def connect(self, list_id: str) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue()
        self._connections[list_id].append(queue)
        logger.debug(f"SSE client connected for list {list_id} (total: {len(self._connections[list_id])})")
        return queue

    def disconnect(self, list_id: str, queue: asyncio.Queue) -> None:
        queues = self._connections.get(list_id, [])
        if queue in queues:
            queues.remove(queue)
        if not queues:
            self._connections.pop(list_id, None)
        logger.debug(f"SSE client disconnected from list {list_id}")

    def broadcast(self, list_id: str, operation: str, item_ids: list[str | UUID]) -> None:
        """Broadcast an event to all SSE clients watching a shopping list.

        Safe to call from synchronous code — uses put_nowait().
        """
        queues = self._connections.get(list_id, [])
        if not queues:
            return

        data = json.dumps({
            "shopping_list_id": list_id,
            "operation": operation,
            "item_ids": [str(uid) for uid in item_ids],
        })

        dead_queues = []
        for queue in queues:
            try:
                queue.put_nowait(data)
            except asyncio.QueueFull:
                dead_queues.append(queue)

        for queue in dead_queues:
            self.disconnect(list_id, queue)

    @property
    def connection_count(self) -> int:
        return sum(len(q) for q in self._connections.values())


sse_manager = SSEConnectionManager()
