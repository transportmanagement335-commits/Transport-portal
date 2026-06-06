import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from app.config import settings

async def main():
    client = AsyncIOMotorClient(settings.MONGO_URI)
    db = client[settings.MONGO_DB_NAME]
    
    trips = await db.trips.find().to_list(length=1000)
    for trip in trips:
        # Calculate total payments
        payments = await db.payments.find({'trip_id': str(trip['_id'])}).to_list(length=100)
        total_paid = sum(p['amount'] for p in payments)
        
        # original selling price = current balance + total paid
        trip_cost = trip.get('balance_amount', 0.0) + total_paid
        
        await db.trips.update_one(
            {'_id': trip['_id']},
            {'$set': {'trip_cost': trip_cost, 'amount_paid': total_paid}}
        )
        print(f"Updated trip {trip.get('trip_id')} with trip_cost={trip_cost}")

if __name__ == '__main__':
    asyncio.run(main())
