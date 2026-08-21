import sys, asyncio
sys.path.insert(0, '.')
from app.database import connect_to_mongo, close_mongo_connection, get_database
from app.services.report_service import get_business_report

async def main():
    await connect_to_mongo()
    db = get_database()
    owner = await db.users.find_one({'role': 'owner'})
    owner_id = str(owner['_id'])
    print('Owner ID:', owner_id)

    for r in ['This Month', 'Last Month', 'Last 3 Months', 'This Year']:
        report = await get_business_report(owner_id, r, db)
        kpi = report['kpi']
        print('\nRange: ' + r)
        print('  Revenue: ' + str(kpi['totalRevenue']))
        print('  Expense: ' + str(kpi['totalExpense']))
        print('  Profit:  ' + str(kpi['totalProfit']))
        print('  Trips:   ' + str(kpi['tripsCompleted']))
        print('  Margin:  ' + str(kpi['profitMargin']) + '%')
        print('  Top clients: ' + str(len(report['topClients'])))
        print('  Insights: ' + str(len(report['aiInsights'])))
        if report['topClients']:
            c = report['topClients'][0]
            print('  Top client: name=' + str(c['name']) + ' revenue=' + str(c['revenue']) + ' trips=' + str(c['trips']))
        if report['trend']:
            print('  Trend months: ' + str([t['month'] for t in report['trend']]))

    await close_mongo_connection()

asyncio.run(main())
