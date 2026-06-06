import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from app.config import settings

async def main():
    client = AsyncIOMotorClient(settings.MONGO_URI)
    db = client[settings.MONGO_DB_NAME]
    
    # Reset vehicle statuses so they can be booked again
    await db.vehicles.update_many({}, {"$set": {"status": "Active"}})
    
    t_result = await db.trips.delete_many({})
    p_result = await db.payments.delete_many({})
    e_result = await db.expenses.delete_many({})
    
    print(f"Reset complete: Deleted {t_result.deleted_count} trips, {p_result.deleted_count} payments, {e_result.deleted_count} expenses.")

if __name__ == '__main__':
    asyncio.run(main())
