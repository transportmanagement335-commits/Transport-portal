import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from app.config import settings

async def main():
    client = AsyncIOMotorClient(settings.MONGO_URI)
    db = client[settings.MONGO_DB_NAME]
    
    owner_id = "6a1061b82e63a1707d8d5d8b"  # User's owner ID
    
    # Revenue
    rev_cursor = await db.trips.aggregate([
        {"$match": {"owner_id": owner_id}},
        {"$group": {"_id": None, "total": {"$sum": {"$ifNull": ["$trip_cost", "$balance_amount"]}}}}
    ]).to_list(length=1)
    total_revenue = rev_cursor[0].get("total", 0.0) if rev_cursor else 0.0
    print("Total Revenue:", total_revenue)

    # Expenses
    exp_cursor = await db.expenses.aggregate([
        {"$match": {"owner_id": owner_id}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]).to_list(length=1)
    total_expenses = exp_cursor[0].get("total", 0.0) if exp_cursor else 0.0
    print("Total Expenses:", total_expenses)
    
    print("Total Profit:", total_revenue - total_expenses)
    
asyncio.run(main())
