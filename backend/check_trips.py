import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def main():
    client = AsyncIOMotorClient('mongodb://localhost:27017')
    db = client.transport_portal
    
    trips = await db.trips.find().to_list(length=10)
    for trip in trips:
        print(f"Trip {trip.get('trip_id')}: trip_cost={trip.get('trip_cost')}, balance_amount={trip.get('balance_amount')}")
        
asyncio.run(main())
