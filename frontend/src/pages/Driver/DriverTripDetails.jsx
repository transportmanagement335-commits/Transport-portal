import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import DriverSidebar from "../../components/Driver/DriverSidebar";
import DriverNavbar from "../../components/Driver/DriverNavbar";

import "../../styles/Driver/DriverTripDetails.css";

function DriverTripDetails() {
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 768);

  const navigate = useNavigate();
  const { tripId } = useParams();

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

        <div className="trip-details-page">

          <div className="trip-details-header">

            <div>

              <button
                className="back-btn"
                onClick={() => navigate("/driver-trips")}
              >
                ← Back To Trips
              </button>

              <h1>Trip Details</h1>

              <p>
                Complete information about the assigned trip.
              </p>

            </div>

            <span className="trip-status assigned">
              Assigned
            </span>

          </div>

          <div className="trip-details-grid">

            <div className="detail-card">

              <h2>Trip Information</h2>

              <div className="detail-row">
                <span>Trip ID</span>
                <strong>{tripId || "--"}</strong>
              </div>

              <div className="detail-row">
                <span>Client Name</span>
                <strong>--</strong>
              </div>

              <div className="detail-row">
                <span>Source</span>
                <strong>--</strong>
              </div>

              <div className="detail-row">
                <span>Destination</span>
                <strong>--</strong>
              </div>

              <div className="detail-row">
                <span>Reporting Time</span>
                <strong>--</strong>
              </div>

            </div>

            <div className="detail-card">

              <h2>Vehicle Information</h2>

              <div className="detail-row">
                <span>Vehicle Number</span>
                <strong>--</strong>
              </div>

              <div className="detail-row">
                <span>Vehicle Type</span>
                <strong>--</strong>
              </div>

              <div className="detail-row">
                <span>Permit Status</span>
                <strong>--</strong>
              </div>

              <div className="detail-row">
                <span>Insurance Status</span>
                <strong>--</strong>
              </div>

              <div className="detail-row">
                <span>Fitness Status</span>
                <strong>--</strong>
              </div>

            </div>

          </div>

          <div className="detail-card">

            <h2>Live Trip Tracking</h2>

            <div className="tracking-placeholder">
              <h3>Live Tracking Will Appear Here</h3>

              <p>
                GPS tracking, route progress,
                destination monitoring and map
                integration will appear here.
              </p>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
}

export default DriverTripDetails;