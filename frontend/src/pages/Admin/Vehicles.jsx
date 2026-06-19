import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import Sidebar from "../../components/Admin/Sidebar";
import Topbar from "../../components/Admin/Topbar";
import {FaTruck, FaClipboardList,FaTools,FaCar} from "react-icons/fa";

import {
  vehiclesAPI,
  driversAPI,
  requireAuth,
} from "../../api";

import "../../styles/Admin/AdminDashboard.css";
import "../../styles/Admin/Vehicles.css";

function Vehicles() {

  const navigate = useNavigate();

  /* =====================================================
     STATES
  ===================================================== */

  const [sidebarOpen, setSidebarOpen] =
    useState(true);

  const [showForm, setShowForm] =
    useState(false);

  const [search, setSearch] =
    useState("");

  const [vehicleFilter, setVehicleFilter] =
    useState("All");

  const [statusFilter, setStatusFilter] =
    useState("All");

  /* =====================================================
     TRUCK FILTERS
  ===================================================== */

  const [truckSize, setTruckSize] =
    useState("");

  const [truckBody, setTruckBody] =
    useState("");

  const [truckCategory, setTruckCategory] =
    useState("");

  /* =====================================================
     BUS FILTERS
  ===================================================== */

  const [busType, setBusType] =
    useState("");

  const [busCategory, setBusCategory] =
    useState("");

  const [busLayout, setBusLayout] =
    useState("");

  const [busSeater, setBusSeater] =
    useState("");

  const [vehicles, setVehicles] =
    useState([]);

  const [drivers, setDrivers] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  /* =====================================================
     FORM DATA
  ===================================================== */

  const [formData, setFormData] =
    useState({

      number: "",
      type: "",
      model: "",

      driver: "",
      driver_id: "",

      insurance: "",
      permit: "",
      fitness: "",
      puc: "",

      status: "",

      /* TRUCK */

      truck_size: "",
      body_type: "",
      truck_category: "",

      /* BUS */

      bus_type: "",
      bus_category: "",
      bus_layout: "",
      seating_capacity: "",
    });

  /* =====================================================
     FETCH VEHICLES
  ===================================================== */

  async function fetchVehicles() {

    try {

      setLoading(true);

      const data =
        await vehiclesAPI.list();

      setVehicles(data || []);

    } catch (err) {

      console.error(err);

    } finally {

      setLoading(false);
    }
  }

  /* =====================================================
     FETCH DRIVERS
  ===================================================== */

  async function fetchDrivers() {

    try {

      /* REAL DRIVER RECORDS */

      const data =
        await driversAPI.list();

      setDrivers(data || []);

    } catch (err) {

      console.error(err);

      setDrivers([]);
    }
  }

  /* =====================================================
     USE EFFECT (MOUNT)
  ===================================================== */

  useEffect(() => {

    requireAuth();

    fetchVehicles();

    fetchDrivers();

  }, []);

  /* =====================================================
     HANDLE FORM CHANGE
  ===================================================== */

  function handleChange(e) {

    setFormData({

      ...formData,

      [e.target.name]:
        e.target.value,
    });
  }

  /* =====================================================
     ADD VEHICLE
  ===================================================== */

  async function addVehicle() {

    if (
      !formData.number ||
      !formData.type ||
      !formData.driver ||
      !formData.status
    ) {

      alert(
        "Please fill all required fields"
      );

      return;
    }

    try {

      setSaving(true);

      /* API CREATE */

      const created =
        await vehiclesAPI.create(
          formData
        );

      /* UPDATE TABLE */

     
setVehicles((prev) => [

  ...prev,

  {
    ...created,

    /* =========================================
       TRUCK DETAILS
    ========================================= */

    truck_size:
      formData.truck_size,

    body_type:
      formData.body_type,

    truck_category:
      formData.truck_category,

    /* =========================================
       BUS DETAILS
    ========================================= */

    bus_type:
      formData.bus_type,

    bus_category:
      formData.bus_category,

    bus_layout:
      formData.bus_layout,

    seating_capacity:
      formData.seating_capacity,
  },
]);
      /* RESET FORM */

      setFormData({

        number: "",
        type: "",
        model: "",

        driver: "",
        driver_id: "",

        insurance: "",
        permit: "",
        fitness: "",
        puc: "",

        status: "",

        truck_size: "",
        body_type: "",
        truck_category: "",

        bus_type: "",
        bus_category: "",
        bus_layout: "",
        seating_capacity: "",
      });

      setShowForm(false);

    } catch (err) {

      console.error(err);

      alert(
        "Failed to add vehicle"
      );

    } finally {

      setSaving(false);
    }
  }

  /* =====================================================
     FILTER VEHICLES
  ===================================================== */

  const filteredVehicles =
    vehicles.filter((v) => {

      const searchMatch =

        v.number
          ?.toLowerCase()
          .includes(
            search.toLowerCase()
          ) ||

        v.driver
          ?.toLowerCase()
          .includes(
            search.toLowerCase()
          );

      const typeMatch =

        vehicleFilter === "All"

          ? true

          : v.type ===
            vehicleFilter;

      const statusMatch =

        statusFilter === "All"

          ? true

          : v.status ===
            statusFilter;

            /* =====================================================
   TRUCK FILTER MATCH
===================================================== */

const truckMatch =

  vehicleFilter !== "Truck"

    ? true

    : (

      (!truckSize ||
        v.truck_size === truckSize)

      &&

      (!truckBody ||
        v.body_type === truckBody)

      &&

      (!truckCategory ||
        v.truck_category === truckCategory)
    );

/* =====================================================
   BUS FILTER MATCH
===================================================== */

const busMatch =

  vehicleFilter !== "Bus"

    ? true

    : (

      (!busType ||
        v.bus_type === busType)

      &&

      (!busCategory ||
        v.bus_category === busCategory)

      &&

      (!busLayout ||
        v.bus_layout === busLayout)

      &&

      (!busSeater ||
        v.seating_capacity === busSeater)
    );

      
      
      return (

         searchMatch &&
         typeMatch &&
         statusMatch &&
         truckMatch &&
         busMatch 
        );
    });

  /* =====================================================
     STATISTICS
  ===================================================== */

  const availableVehicles =

    vehicles.filter(
      (v) => v.status === "Active"
    ).length;

  const bookedVehicles =

    vehicles.filter(
      (v) => v.status === "Booked"
    ).length;

  const maintenanceVehicles =

    vehicles.filter(
      (v) =>
        v.status === "Maintenance"
    ).length;

  /* =====================================================
     UI
  ===================================================== */

  return (

    <div className="dashboard-layout">

      <Sidebar
        sidebarOpen={sidebarOpen}
      />

      <div
        className={`vehicles-content ${
          sidebarOpen
            ? "sidebar-open"
            : "sidebar-close"
        }`}
      >

        <Topbar
          sidebarOpen={sidebarOpen}
          setSidebarOpen={
            setSidebarOpen
          }
        />

        {/* =====================================================
            HEADER
        ===================================================== */}

        <div className="vehicles-header">

          <div>

            <h1>
              Vehicles Management
            </h1>

            <p>
              Manage all transport
              vehicles
            </p>

          </div>

          <button
            className="btn-Vehicle"
            onClick={() =>
              setShowForm(!showForm)
            }
          >
            {showForm ? "Hide Form" : "+  Add Vehicle"}
          </button>

        </div>

        {/* =====================================================
            DASHBOARD CARDS
        ===================================================== */}
         
         <div className="vehicles-cards">

  <div className="v-card">
    <div className="kpi-icon available">
      <FaTruck />
    </div>

    <h3>Available </h3>
    <p>{availableVehicles}</p>
  </div>

  <div className="v-card">
    <div className="kpi-icon booked">
      <FaClipboardList />
    </div>

    <h3>Booked </h3>
    <p>{bookedVehicles}</p>
  </div>

  <div className="v-card">
    <div className="kpi-icon maintenance">
      <FaTools />
    </div>

    <h3>Maintenance</h3>
    <p>{maintenanceVehicles}</p>
  </div>

  <div className="v-card">
    <div className="kpi-icon total">
      <FaCar />
    </div>

    <h3>Total Vehicles</h3>
    <p>{vehicles.length}</p>
  </div>

</div>
       
        {/* =====================================================
            FILTER SECTION
        ===================================================== */}

        <div className="modern-filter-wrapper">

          <div className="modern-filter-top">

            {/* SEARCH */}

            <input
              className="modern-search"
              placeholder="Search vehicle..."
              value={search}
              onChange={(e) =>
                setSearch(
                  e.target.value
                )
              }
            />

            {/* VEHICLE TYPE */}

            <select
              className="filter-dropdown"

              value={vehicleFilter}

              onChange={(e) =>
                setVehicleFilter(
                  e.target.value
                )
              }
            >

              <option value="All">
                Vehicle Type
              </option>

              <option value="Bus">
                Bus
              </option>

              <option value="Truck">
                Truck
              </option>

            </select>

            {/* STATUS */}

            <select
              className="filter-dropdown"

              value={statusFilter}

              onChange={(e) =>
                setStatusFilter(
                  e.target.value
                )
              }
            >

              <option value="All">
                Status
              </option>

              <option value="Active">
                Active
              </option>

              <option value="Booked">
                Booked
              </option>

              <option value="Maintenance">
                Maintenance
              </option>

            </select>

          </div>

          {/* =====================================================
              TRUCK FILTERS
          ===================================================== */}

          {
            vehicleFilter === "Truck" && (

              <div className="truck-filter-layout">

                <select
                  className="filter-dropdown"
                  value={truckSize}
                  onChange={(e) =>
                    setTruckSize(
                      e.target.value
                    )
                  }
                >

                  <option value="">
                    Truck Size
                  </option>

                  <option>
                    14 ft
                  </option>

                  <option>
                    17 ft
                  </option>

                  <option>
                    19 ft
                  </option>

                  <option>
                    22 ft
                  </option>

                  <option>
                    24 ft
                  </option>

                </select>

                <select
                  className="filter-dropdown"
                  value={truckBody}
                  onChange={(e) =>
                    setTruckBody(
                      e.target.value
                    )
                  }
                >

                  <option value="">
                    Body Type
                  </option>

                  <option>
                    Open Body
                  </option>

                  <option>
                    Closed Body
                  </option>

                </select>

                <select
                  className="filter-dropdown"
                  value={truckCategory}
                  onChange={(e) =>
                    setTruckCategory(
                      e.target.value
                    )
                  }
                >

                  <option value="">
                    Truck Category
                  </option>

                  <option>
                    Container
                  </option>

                  <option>
                    Flatbed
                  </option>

                  <option>
                    Refrigerated
                  </option>

                  <option>
                    Heavy Duty
                  </option>

                </select>

              </div>
            )
          }

          {/* =====================================================
              BUS FILTERS
          ===================================================== */}

          {
            vehicleFilter === "Bus" && (

              <div className="truck-filter-layout">

                <select
                  className="filter-dropdown"
                  value={busType}
                  onChange={(e) =>
                    setBusType(
                      e.target.value
                    )
                  }
                >

                  <option value="">
                    Bus Type
                  </option>

                  <option>
                    AC
                  </option>

                  <option>
                    Non AC
                  </option>

                </select>

                <select
                  className="filter-dropdown"
                  value={busCategory}
                  onChange={(e) =>
                    setBusCategory(
                      e.target.value
                    )
                  }
                >

                  <option value="">
                    Category
                  </option>

                  <option>
                    Premium
                  </option>

                  <option>
                    Standard
                  </option>

                </select>

                <select
                  className="filter-dropdown"
                  value={busLayout}
                  onChange={(e) =>
                    setBusLayout(
                      e.target.value
                    )
                  }
                >

                  <option value="">
                    Layout
                  </option>

                  <option>
                    Sleeper
                  </option>

                  <option>
                    Seater
                  </option>

                </select>

                <select
                  className="filter-dropdown"
                  value={busSeater}
                  onChange={(e) =>
                    setBusSeater(
                      e.target.value
                    )
                  }
                >

                  <option value="">
                    Seating Capacity
                  </option>

                  <option>
                    17 Seater
                  </option>

                  <option>
                    26 Seater
                  </option>

                  <option>
                    40 Seater
                  </option>

                  <option>
                    45 Seater
                  </option>

                  <option>
                    49 Seater
                  </option>

                </select>

              </div>
            )
          }

          {/* =====================================================
              ACTIVE FILTERS
          ===================================================== */}

          <div className="active-filters">

            {
  vehicleFilter !== "All" && (

    <div className="active-filter-chip">

      {/* TEXT */}

      <div className="chip-text-wrapper">

        {/* MAIN */}

        <span className="filter-main">

          {vehicleFilter}

        </span>

        {/* TRUCK */}

        {
          vehicleFilter === "Truck" &&
          (
            truckSize ||
            truckBody ||
            truckCategory
          ) && (

            <span className="filter-sub-info">

              {[
                truckSize,
                truckBody,
                truckCategory,
              ]
                .filter(Boolean)
                .join(" • ")}

            </span>
          )
        }

        {/* BUS */}

        {
          vehicleFilter === "Bus" &&
          (
            busType ||
            busSeater
          ) && (

            <span className="filter-sub-info">

              {[
                busType,
                busCategory,
                busLayout,
                busSeater,
              ]
                .filter(Boolean)
                .join(" • ")}

            </span>
          )
        }

      </div>

      {/* REMOVE */}

      <span
        className="remove-chip"

        onClick={() => {

          setVehicleFilter("All");

          setTruckSize("");
          setTruckBody("");
          setTruckCategory("");

          setBusType("");
          setBusCategory("");
          setBusLayout("");
          setBusSeater("");
        }}
      >
        ×
      </span>

    </div>
  )
}

            {
              statusFilter !==
                "All" && (

                <div className="active-filter-chip status-chip">

                  {statusFilter}

                  <span
                    onClick={() =>
                      setStatusFilter(
                        "All"
                      )
                    }
                  >
                    ×
                  </span>

                </div>
              )
            }

          </div>

        </div>

        {/* =====================================================
            ADD VEHICLE FORM
        ===================================================== */}

        {
          showForm && (

            <div className="vehicle-form-wrapper">

              <div className="vehicle-form-header">

                <div>

                  <h2>
                    Add New Vehicle
                  </h2>

                  <p>
                    Fill all vehicle details properly
                  </p>

                </div>

                <button
                  className="close-form-btn"
                  onClick={() =>
                    setShowForm(false)
                  }
                >
                  ×
                </button>

              </div>

              <div className="vehicle-form-grid">

                {/* VEHICLE NUMBER */}

                <div className="form-group">

                  <label>
                    Vehicle Number *
                  </label>

                  <input
                    type="text"
                    name="number"
                    placeholder="MH12AB1234"
                    value={formData.number}
                    onChange={handleChange}
                  />

                </div>

                {/* VEHICLE TYPE */}

                <div className="form-group">

                  <label>
                    Vehicle Type *
                  </label>

                  <select
                    name="type"
                    value={formData.type}
                    onChange={handleChange}
                  >

                    <option value="">
                      Select Type
                    </option>

                    <option value="Bus">
                      Bus
                    </option>

                    <option value="Truck">
                      Truck
                    </option>

                  </select>

                </div>

                {/* =====================================================
                    TRUCK FORM OPTIONS
                ===================================================== */}

                {
                  formData.type ===
                    "Truck" && (

                    <>

                      <div className="form-group">

                        <label>
                          Truck Size *
                        </label>

                        <select
                          name="truck_size"
                          value={formData.truck_size}
                          onChange={handleChange}
                        >

                          <option value="">
                            Select Truck Size
                          </option>

                          <option value="14 ft">
                            14 ft
                          </option>

                          <option value="17 ft">
                            17 ft
                          </option>

                          <option value="19 ft">
                            19 ft
                          </option>

                          <option value="22 ft">
                            22 ft
                          </option>

                          <option value="24 ft">
                            24 ft
                          </option>

                        </select>

                      </div>

                      <div className="form-group">

                        <label>
                          Body Type *
                        </label>

                        <select
                          name="body_type"
                          value={formData.body_type}
                          onChange={handleChange}
                        >

                          <option value="">
                            Select Body Type
                          </option>

                          <option value="Open Body">
                            Open Body
                          </option>

                          <option value="Closed Body">
                            Closed Body
                          </option>

                        </select>

                      </div>

                      <div className="form-group">

                        <label>
                          Truck Category *
                        </label>

                        <select
                          name="truck_category"
                          value={formData.truck_category}
                          onChange={handleChange}
                        >

                          <option value="">
                            Select Truck Category
                          </option>

                          <option value="Container">
                            Container
                          </option>

                          <option value="Flatbed">
                            Flatbed
                          </option>

                          <option value="Refrigerated">
                            Refrigerated
                          </option>

                          <option value="Heavy Duty">
                            Heavy Duty
                          </option>

                        </select>

                      </div>

                    </>
                  )
                }

                {/* =====================================================
                    BUS FORM OPTIONS
                ===================================================== */}

                {
                  formData.type ===
                    "Bus" && (

                    <>

                      <div className="form-group">

                        <label>
                          Bus Type *
                        </label>

                        <select
                          name="bus_type"
                          value={formData.bus_type}
                          onChange={handleChange}
                        >

                          <option value="">
                            Select Bus Type
                          </option>

                          <option value="AC">
                            AC
                          </option>

                          <option value="Non AC">
                            Non AC
                          </option>

                        </select>

                      </div>

                      <div className="form-group">

                        <label>
                          Bus Category *
                        </label>

                        <select
                          name="bus_category"
                          value={formData.bus_category}
                          onChange={handleChange}
                        >

                          <option value="">
                            Select Category
                          </option>

                          <option value="Premium">
                            Premium
                          </option>

                          <option value="Standard">
                            Standard
                          </option>

                        </select>

                      </div>

                      <div className="form-group">

                        <label>
                          Bus Layout *
                        </label>

                        <select
                          name="bus_layout"
                          value={formData.bus_layout}
                          onChange={handleChange}
                        >

                          <option value="">
                            Select Layout
                          </option>

                          <option value="Sleeper">
                            Sleeper
                          </option>

                          <option value="Seater">
                            Seater
                          </option>

                        </select>

                      </div>

                      <div className="form-group">

                        <label>
                          Seating Capacity *
                        </label>

                        <select
                          name="seating_capacity"
                          value={formData.seating_capacity}
                          onChange={handleChange}
                        >

                          <option value="">
                            Select Seating Capacity
                          </option>

                          <option value="17 Seater">
                            17 Seater
                          </option>

                          <option value="26 Seater">
                            26 Seater
                          </option>

                          <option value="40 Seater">
                            40 Seater
                          </option>

                          <option value="45 Seater">
                            45 Seater
                          </option>

                          <option value="49 Seater">
                            49 Seater
                          </option>

                        </select>

                      </div>

                    </>
                  )
                }

                {/* MODEL */}

                <div className="form-group">

                  <label>
                    Vehicle Model *
                  </label>

                  <input
                    type="text"
                    name="model"
                    placeholder="Volvo 9600"
                    value={formData.model}
                    onChange={handleChange}
                  />

                </div>

                {/* DRIVER */}

                <div className="form-group">

                  <label>
                    Assign Driver *
                  </label>

                  <select
                    value={
                      formData.driver_id
                        ? `${formData.driver_id}|${formData.driver}`
                        : ""
                    }

                    onChange={(e) => {

                      const value =
                        e.target.value;

                      if (!value) {

                        setFormData({

                          ...formData,

                          driver: "",
                          driver_id: "",
                        });

                        return;
                      }

                      const [id, name] =
                        value.split("|");

                      setFormData({

                        ...formData,

                        driver: name,
                        driver_id: id,
                      });
                    }}
                  >

                    <option value="">
                      Select Driver
                    </option>

                    {
                      drivers.map(
                        (driver) => (

                          <option
                            key={driver.id}
                            value={`${driver.id}|${driver.name}`}
                          >
                            {driver.name}
                          </option>
                        )
                      )
                    }

                  </select>

                </div>

                {/* STATUS */}

                <div className="form-group">

                  <label>
                    Vehicle Status *
                  </label>

                  <select
                    name="status"
                    value={formData.status}
                    onChange={handleChange}
                  >

                    <option value="">
                      Select Status
                    </option>

                    <option value="Active">
                      Active
                    </option>

                    <option value="Booked">
                      Booked
                    </option>

                    <option value="Maintenance">
                      Maintenance
                    </option>

                  </select>

                </div>

                {/* INSURANCE */}

                <div className="form-group">

                  <label>
                    Insurance Valid Till
                  </label>

                  <input
                    type="date"
                    name="insurance"
                    value={formData.insurance}
                    onChange={handleChange}
                  />

                </div>

                {/* PERMIT */}

                <div className="form-group">

                  <label>
                    Permit Valid Till
                  </label>

                  <input
                    type="date"
                    name="permit"
                    value={formData.permit}
                    onChange={handleChange}
                  />

                </div>

                {/* FITNESS */}

                <div className="form-group">

                  <label>
                    Fitness Valid Till
                  </label>

                  <input
                    type="date"
                    name="fitness"
                    value={formData.fitness}
                    onChange={handleChange}
                  />

                </div>

                {/* PUC */}

                <div className="form-group">

                  <label>
                    PUC Valid Till
                  </label>

                  <input
                    type="date"
                    name="puc"
                    value={formData.puc}
                    onChange={handleChange}
                  />

                </div>

                {/* SAVE BUTTON */}

                <div className="form-action">

                  <button
                    className="btn-primary"
                    onClick={addVehicle}
                    disabled={saving}
                  >
                    {
                      saving
                        ? "Saving..."
                        : "Save Vehicle"
                    }
                  </button>

                </div>

              </div>

            </div>
          )
        }

        {/* =====================================================
            TABLE
        ===================================================== */}

        <div className="vehicles-table-panel">

          {
            loading ? (

              <p className="table-message">
                Loading vehicles...
              </p>

            ) : filteredVehicles.length === 0 ? (

              <div className="empty-vehicle-state">

                <h3>
                  No Vehicles Available
                </h3>

                <p>
                  No vehicle is added currently.
                  Kindly click on Add Vehicle
                  button to add a new vehicle.
                </p>

              </div>

            ) : (

              <table>

                <thead>

                  <tr>

                    <th>
                      Vehicle No.
                    </th>

                    <th>
                      Type
                    </th>

                    <th>
                      Model
                    </th>

                    <th>
                      Driver
                    </th>

                    <th>
                      Status
                    </th>

                    <th>
                      Actions
                    </th>

                  </tr>

                </thead>

                <tbody>

                  {
                    filteredVehicles.map(
                      (
                        vehicle,
                        index
                      ) => (

                        <tr
                          key={
                            vehicle.id ||
                            index
                          }
                        >

                          <td>
                            {
                              vehicle.number
                            }
                          </td>

                          <td>

  <div className="table-type-info">

    {/* MAIN TYPE */}

    <span className="table-main-type">

      {vehicle.type}

    </span>

    {/* TRUCK INFO */}

    {
      vehicle.type?.toLowerCase() === "truck" && (

        <span className="table-sub-type">

          {vehicle.truck_size}

          {vehicle.body_type &&
            ` • ${vehicle.body_type}`}

          {vehicle.truck_category &&
            ` • ${vehicle.truck_category}`}

        </span>
      )
    }

    {/* BUS INFO */}

    {
      vehicle.type?.toLowerCase() === "bus" && (

        <span className="table-sub-type">

          {vehicle.bus_type}

          {vehicle.bus_category &&
            ` • ${vehicle.bus_category}`}

          {vehicle.bus_layout &&
            ` • ${vehicle.bus_layout}`}

          {vehicle.seating_capacity &&
            ` • ${vehicle.seating_capacity}`}

        </span>
      )
    }

  </div>

</td>

                          <td>
                            {
                              vehicle.model
                            }
                          </td>

                          <td>
                            {
                              vehicle.driver
                            }
                          </td>

                          <td>

                            <span
                              className={`status-badge ${vehicle.status?.toLowerCase()}`}
                            >
                              {
                                vehicle.status
                              }
                            </span>

                          </td>

                          <td>

                            <button
                              className="btn-primary btn-sm"
                              onClick={() =>
                                navigate(
                                  "/vehicle-details",
                                  {
                                    state: {
                                      vehicle,
                                    },
                                  }
                                )
                              }
                            >
                              View
                            </button>

                          </td>

                        </tr>
                      )
                    )
                  }

                </tbody>

              </table>
            )
          }

        </div>

      </div>

    </div>
  );
}

export default Vehicles;