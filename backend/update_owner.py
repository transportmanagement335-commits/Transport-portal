import asyncio
from app.database import connect_to_mongo, close_mongo_connection, get_database

async def main():
    await connect_to_mongo()
    db = get_database()
    result = await db.users.update_one(
        {"email": "darshan.yadav23@spit.ac.in"},
        {"$set": {"service_type": "Busses"}}
    )
    print(f"Matched {result.matched_count} document(s), modified {result.modified_count} document(s)")
    await close_mongo_connection()

if __name__ == "__main__":
    asyncio.run(main())
