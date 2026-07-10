import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def fix_phones():
    client = AsyncIOMotorClient('mongodb://localhost:27017')
    db = client['transport_portal']
    users = db.users.find({})
    updated = 0
    async for user in users:
        phone = user.get('phone')
        if phone and not phone.startswith('+91'):
            digits = phone.replace('+', '').replace('-', '').replace(' ', '')
            new_phone = None
            if len(digits) == 10:
                new_phone = '+91' + digits
            elif len(digits) == 12 and digits.startswith('91'):
                new_phone = '+' + digits
            
            if new_phone and new_phone != phone:
                await db.users.update_one({'_id': user['_id']}, {'$set': {'phone': new_phone}})
                updated += 1
    print(f'Updated {updated} user phones')

asyncio.run(fix_phones())
