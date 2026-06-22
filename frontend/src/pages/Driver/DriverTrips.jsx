import { useState } from "react";
import { useNavigate } from "react-router-dom";

import DriverSidebar from "../../components/Driver/DriverSidebar";
import DriverNavbar from "../../components/Driver/DriverNavbar";

import "../../styles/Driver/DriverTrips.css";

function DriverTrips() {
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 768);
  const [search, setSearch] = useState("");

  const navigate = useNavigate();

  const trips = [];

  const filteredTrips = trips.filter((trip) =>
    trip.tripId.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="driver-layout">
      <DriverSidebar isOpen={sidebarOpen} closeSidebar={() => setSidebarOpen(false)} />

      <div
        className={`driver-content ${
          sidebarOpen ? "sidebar-open" : "sidebar-closed"
        }`}
      >
        <DriverNavbar
          toggleSidebar={() =>
            setSidebarOpen(!sidebarOpen)
          }
        />

        <div className="driver-trips-page">

          <div className="page-header">
            <div>
              <h1>My Assigned Trips</h1>
              <p>
                Trips assigned by transport admin.
              </p>
            </div>
          </div>

          <div className="trip-search">
            <input
              type="text"
              placeholder="Search Trip ID..."
              value={search}
              onChange={(e) =>
                setSearch(e.target.value)
              }
            />
          </div>

          <div className="trip-list">

            {filteredTrips.length === 0 ? (

              <div className="empty-trips">
                <h3>No Trips Assigned</h3>

                <p>
                  Trips assigned by the transport admin
                  will appear here once available.
                </p>
              </div>

            ) : (

              filteredTrips.map((trip) => (
                <div
                  key={trip.tripId}
                  className="trip-card"
                >
                  <div className="trip-card-top">

                    <h3>{trip.tripId}</h3>

                    <span
                      className={`status-badge ${
                        trip.status === "Completed"
                          ? "completed"
                          : "active"
                      }`}
                    >
                      {trip.status}
                    </span>

                  </div>

                  <div className="trip-route">
                    {trip.source}
                    <span>→</span>
                    {trip.destination}
                  </div>

                  <div className="client-name">
                    {trip.client}
                  </div>

                  <div className="trip-details">

                    <div>
                      <label>Vehicle</label>
                      <p>{trip.vehicleNo}</p>
                    </div>

                    <div>
                      <label>Reporting</label>
                      <p>{trip.reportingTime}</p>
                    </div>

                    <div>
                      <label>Start Date</label>
                      <p>{trip.startDate}</p>
                    </div>

                    <div>
                      <label>Delivery Date</label>
                      <p>{trip.deliveryDate}</p>
                    </div>

                  </div>

                  <button
                    className="view-btn"
                    onClick={() =>
                      navigate(`/driver-trips/${trip.tripId}`)
                    }
                  >
                    View Trip Details
                  </button>

                </div>
              ))

            )}

          </div>

        </div>
      </div>
    </div>
  );
}

export default DriverTrips;