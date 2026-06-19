"""
WebSocket Connection Manager for real-time trip location tracking.

Usage:
    from app.services.websocket_manager import ws_manager

    # In WebSocket endpoint:
    await ws_manager.connect(trip_id, websocket)

    # In HTTP location-update endpoint:
    await ws_manager.broadcast(trip_id, {"lat": ..., "lng": ..., "ts": ...})
"""
import asyncio
from collections import defaultdict

from fastapi import WebSocket


class ConnectionManager:
    """
    Manages active WebSocket connections grouped by trip_id,
    and a global pool for admins watching all active trips.
    Thread-safe for asyncio (single-threaded event loop).
    """

    def __init__(self):
        # trip_id -> list[WebSocket]
        self._connections: dict[str, list[WebSocket]] = defaultdict(list)
        # Global list of admin connections watching all trips
        self._admin_connections: list[WebSocket] = []

    async def connect(self, trip_id: str, websocket: WebSocket) -> None:
        """Accept the WebSocket handshake and register the connection for a specific trip."""
        await websocket.accept()
        self._connections[trip_id].append(websocket)

    def disconnect(self, trip_id: str, websocket: WebSocket) -> None:
        """Remove a closed connection from the trip registry."""
        try:
            self._connections[trip_id].remove(websocket)
        except ValueError:
            pass  # Already removed

    async def connect_global(self, websocket: WebSocket) -> None:
        """Accept the WebSocket handshake and register a global admin connection."""
        await websocket.accept()
        self._admin_connections.append(websocket)
        
    def disconnect_global(self, websocket: WebSocket) -> None:
        """Remove a closed global admin connection."""
        try:
            self._admin_connections.remove(websocket)
        except ValueError:
            pass

    async def broadcast(self, trip_id: str, data: dict) -> None:
        """
        Push a JSON payload to every client watching this specific trip,
        AND to all global admin clients.
        Silently drops dead connections.
        """
        # Ensure the payload has the trip_id so global admins know who moved
        if "trip_id" not in data:
            data["trip_id"] = trip_id
            
        dead: list[WebSocket] = []
        for ws in list(self._connections[trip_id]):
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(trip_id, ws)
            
        dead_admin: list[WebSocket] = []
        for ws in list(self._admin_connections):
            try:
                await ws.send_json(data)
            except Exception:
                dead_admin.append(ws)
        for ws in dead_admin:
            self.disconnect_global(ws)

    def connection_count(self, trip_id: str) -> int:
        """Return how many clients are watching a given trip (not counting global admins)."""
        return len(self._connections[trip_id])


# Singleton — imported everywhere that needs to broadcast or connect
ws_manager = ConnectionManager()
