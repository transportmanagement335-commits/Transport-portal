from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import json
import os
import uuid
from datetime import datetime

app = Flask(__name__, static_folder='static')
CORS(app)

# In-memory data stores
trips = {}
expenses = {}
vehicles = {}
drivers = {}
routes = {}

# ─── Seed Data ────────────────────────────────────────────────
vehicles = {
    "v1": {"id": "v1", "name": "TN-01-AB-1234", "type": "Container / Flatbed"},
    "v2": {"id": "v2", "name": "MH-02-CD-5678", "type": "Refrigerated Truck"},
    "v3": {"id": "v3", "name": "DL-03-EF-9012", "type": "Heavy-duty Truck"},
}
drivers = {
    "d1": {"id": "d1", "name": "Rajesh Kumar"},
    "d2": {"id": "d2", "name": "Suresh Patel"},
    "d3": {"id": "d3", "name": "Mohan Singh"},
}
routes = {
    "r1": {"id": "r1", "name": "Mumbai → Delhi"},
    "r2": {"id": "r2", "name": "Chennai → Bangalore"},
    "r3": {"id": "r3", "name": "Kolkata → Hyderabad"},
}

# ─── Helpers ──────────────────────────────────────────────────
def generate_gr_number():
    return f"GR-{datetime.now().strftime('%Y%m%d')}-{str(uuid.uuid4())[:6].upper()}"

def generate_eway_bill():
    return f"EWB-{str(uuid.uuid4())[:10].upper()}"

# ═══════════════════════════════════════════════════════════════
# SECTION 5: Trip, Duty & Allotment Management
# ═══════════════════════════════════════════════════════════════

@app.route('/api/trips', methods=['GET'])
def get_trips():
    vehicle_type = request.args.get('vehicle_type')
    result = list(trips.values())
    if vehicle_type:
        result = [t for t in result if vehicles.get(t['vehicle_id'], {}).get('type') == vehicle_type]
    return jsonify(result)

@app.route('/api/trips', methods=['POST'])
def create_trip():
    data = request.json
    trip_id = str(uuid.uuid4())
    vehicle_id = data.get('vehicle_id')
    vehicle = vehicles.get(vehicle_id, {})
    is_truck = 'Truck' in vehicle.get('type', '') or 'Flatbed' in vehicle.get('type', '')

    trip = {
        "id": trip_id,
        "vehicle_id": vehicle_id,
        "driver_id": data.get('driver_id'),
        "route_id": data.get('route_id'),
        "permit_passing": data.get('permit_passing', ''),
        "driver_duty_log": [],
        "tracking": {"status": "Scheduled", "last_update": datetime.now().isoformat()},
        "gr_number": generate_gr_number() if is_truck else None,
        "eway_bill": generate_eway_bill() if is_truck else None,
        "created_at": datetime.now().isoformat(),
        "status": "Scheduled"
    }
    trips[trip_id] = trip
    return jsonify(trip), 201

@app.route('/api/trips/<trip_id>', methods=['GET'])
def get_trip(trip_id):
    trip = trips.get(trip_id)
    if not trip:
        return jsonify({"error": "Trip not found"}), 404
    return jsonify(trip)

@app.route('/api/trips/<trip_id>', methods=['PUT'])
def update_trip(trip_id):
    trip = trips.get(trip_id)
    if not trip:
        return jsonify({"error": "Trip not found"}), 404
    data = request.json
    trip.update(data)
    trip['updated_at'] = datetime.now().isoformat()
    return jsonify(trip)

@app.route('/api/trips/<trip_id>/duty-log', methods=['POST'])
def add_duty_log(trip_id):
    trip = trips.get(trip_id)
    if not trip:
        return jsonify({"error": "Trip not found"}), 404
    log_entry = {
        "timestamp": datetime.now().isoformat(),
        "event": request.json.get('event', ''),
        "location": request.json.get('location', '')
    }
    trip['driver_duty_log'].append(log_entry)
    return jsonify(log_entry), 201

@app.route('/api/trips/<trip_id>/tracking', methods=['PUT'])
def update_tracking(trip_id):
    trip = trips.get(trip_id)
    if not trip:
        return jsonify({"error": "Trip not found"}), 404
    trip['tracking'] = {
        "status": request.json.get('status', trip['tracking']['status']),
        "lat": request.json.get('lat'),
        "lng": request.json.get('lng'),
        "last_update": datetime.now().isoformat()
    }
    return jsonify(trip['tracking'])

# ═══════════════════════════════════════════════════════════════
# SECTION 6: Expense Recorder
# ═══════════════════════════════════════════════════════════════

EXPENSE_CATEGORIES = [
    "Fuel (Diesel/Petrol)",
    "Driver Payment",
    "Toll Charges & Border Taxes",
    "Parking Fees",
    "Service & Repair",
    "Miscellaneous"
]

@app.route('/api/expenses', methods=['GET'])
def get_expenses():
    trip_id = request.args.get('trip_id')
    vehicle_id = request.args.get('vehicle_id')
    result = list(expenses.values())
    if trip_id:
        result = [e for e in result if e.get('trip_id') == trip_id]
    if vehicle_id:
        result = [e for e in result if e.get('vehicle_id') == vehicle_id]
    return jsonify(result)

@app.route('/api/expenses', methods=['POST'])
def create_expense():
    data = request.json
    exp_id = str(uuid.uuid4())
    expense = {
        "id": exp_id,
        "trip_id": data.get('trip_id'),
        "vehicle_id": data.get('vehicle_id'),
        "category": data.get('category'),
        "amount": float(data.get('amount', 0)),
        "description": data.get('description', ''),
        "date": data.get('date', datetime.now().date().isoformat()),
        "created_at": datetime.now().isoformat()
    }
    expenses[exp_id] = expense
    return jsonify(expense), 201

@app.route('/api/expenses/<exp_id>', methods=['DELETE'])
def delete_expense(exp_id):
    if exp_id not in expenses:
        return jsonify({"error": "Expense not found"}), 404
    del expenses[exp_id]
    return jsonify({"deleted": exp_id})

@app.route('/api/trips/<trip_id>/profit', methods=['GET'])
def calculate_profit(trip_id):
    trip = trips.get(trip_id)
    if not trip:
        return jsonify({"error": "Trip not found"}), 404
    trip_expenses = [e for e in expenses.values() if e.get('trip_id') == trip_id]
    total_expense = sum(e['amount'] for e in trip_expenses)
    revenue = float(request.args.get('revenue', 0))
    profit = revenue - total_expense
    breakdown = {}
    for e in trip_expenses:
        cat = e['category']
        breakdown[cat] = breakdown.get(cat, 0) + e['amount']
    return jsonify({
        "trip_id": trip_id,
        "total_expenses": total_expense,
        "revenue": revenue,
        "profit": profit,
        "expense_breakdown": breakdown
    })

# ─── Static reference data ────────────────────────────────────
@app.route('/api/vehicles', methods=['GET'])
def get_vehicles():
    return jsonify(list(vehicles.values()))

@app.route('/api/drivers', methods=['GET'])
def get_drivers():
    return jsonify(list(drivers.values()))

@app.route('/api/routes', methods=['GET'])
def get_routes():
    return jsonify(list(routes.values()))

@app.route('/api/expense-categories', methods=['GET'])
def get_expense_categories():
    return jsonify(EXPENSE_CATEGORIES)

# ─── Serve frontend ───────────────────────────────────────────
@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

if __name__ == '__main__':
    os.makedirs('static', exist_ok=True)
    app.run(debug=True, port=5000)