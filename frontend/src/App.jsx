import { BrowserRouter, Routes, Route } from "react-router-dom";

import RoleSelection from "./pages/RoleSelection";

/* ADMIN PAGES */

import AdminLogin from "./pages/Admin/AdminLogin";
import AdminRegister from "./pages/Admin/AdminRegister";
import AdminDashboard from "./pages/Admin/AdminDashboard";
import Vehicles from "./pages/Admin/Vehicles";
import VehicleDetails from "./pages/Admin/VehicleDetails";
import Trips from "./pages/Admin/Trips";
import TripDetails from "./pages/Admin/TripDetails";
import Payments from "./pages/Admin/Payments";
import Expenses from "./pages/Admin/Expenses";
import Customers from "./pages/Admin/Customers";
import CustomerDetails from "./pages/Admin/CustomerDetails";
import Invoices from "./pages/Admin/Invoices";
import Maintenance from "./pages/Admin/Maintenance";
import CreateInvoice from "./pages/Admin/CreateInvoice";
import InvoiceDetails from "./pages/Admin/InvoiceDetails";
import BusinessReport from "./pages/Admin/BusinessReport";
import Settings from "./pages/Admin/Settings";

/* DRIVER PAGES */

import DriverLogin from "./pages/Driver/DriverLogin";
import DriverDashboard from "./pages/Driver/DriverDashboard";
import Drivers from "./pages/Admin/Drivers";
import DriverDutyLog from "./pages/Driver/DriverDutyLog";
import DriverExpenses from "./pages/Driver/DriverExpenses";
import DriverTrips from "./pages/Driver/DriverTrips";
import DriverTripDetails from "./pages/Driver/DriverTripDetails";
import DriverExpenseDetails from "./pages/Driver/DriverExpenseDetails";

import "./App.css";

function App() {

  return (

    <div className="app">

      <BrowserRouter>

        <Routes>

          {/* HOME */}

          <Route
            path="/"
            element={<RoleSelection />}
          />

          {/* ADMIN ROUTES */}

          <Route
            path="/admin-login"
            element={<AdminLogin />}
          />

          <Route
            path="/admin-register"
            element={<AdminRegister />}
          />

          <Route
            path="/admin-dashboard"
            element={<AdminDashboard />}
          />

          <Route
            path="/vehicles"
            element={<Vehicles />}
          />

          <Route
            path="/vehicle-details"
            element={<VehicleDetails />}
          />
          
          <Route
            path="/Maintenance"
            element={<Maintenance />}
          />
          <Route
            path="/trips"
            element={<Trips />}
          />

          <Route
            path="/trip-details"
            element={<TripDetails />}
          />
          <Route
            path="/payments"
            element={<Payments />}
          />
          <Route
            path="/expenses"
            element={<Expenses />}
          />
          <Route
            path="/settings"
            element={<Settings />}
          />

          {/* INVOICE & CUSTOMER ROUTES */}

          <Route path="/customers" element={<Customers />} />
          <Route path="/customers/:id" element={<CustomerDetails />} />
          <Route path="/invoices" element={<Invoices />} />
          <Route path="/invoices/create" element={<CreateInvoice />} />
          <Route path="/invoices/:id" element={<InvoiceDetails />} />
          {/* business report   */}

          <Route path="/business-report" element={<BusinessReport />} />

          {/* DRIVER ROUTES */}

          <Route
            path="/driver-login"
            element={<DriverLogin />}
          />

          <Route
            path="/drivers"
            element={<Drivers />}
          />

          <Route
            path="/driver-dashboard"
            element={<DriverDashboard />}
          />
          <Route path="/driver-duty-log" element={<DriverDutyLog />} />
          <Route path="/driver-expenses" element={<DriverExpenses />} />
          <Route path="/driver-trips" element={<DriverTrips />}/>
          <Route path="/driver/trips/:tripId" element={<DriverTripDetails />}/>
          <Route path="/driver-expense/:expenseId" element={<DriverExpenseDetails />}/>

        </Routes>

      </BrowserRouter>

    </div>

  );
}

export default App;