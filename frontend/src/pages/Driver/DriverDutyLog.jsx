import { useState } from "react";

import DriverSidebar from "../../components/Driver/DriverSidebar";
import DriverNavbar from "../../components/Driver/DriverNavbar";

import "../../styles/Driver/DriverDutyLog.css";

function DriverDutyLog() {
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 768);

  const [isOnDuty, setIsOnDuty] = useState(false);

  // Backend data will come here later
  const dutyLogs = [];

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

        <div className="duty-page">

          <div className="page-header">

            <div>
              <h1>Driver Duty Log</h1>

              <p>
                Track working hours, duty status and
                driving activity.
              </p>
            </div>

            <div className="duty-actions">

              {!isOnDuty ? (
                <button
                  className="start-duty-btn"
                  onClick={() => setIsOnDuty(true)}
                >
                  Start Duty
                </button>
              ) : (
                <button
                  className="end-duty-btn"
                  onClick={() => setIsOnDuty(false)}
                >
                  End Duty
                </button>
              )}

            </div>

          </div>

          <div className="summary-cards">

            <div className="summary-card blue">
              <h4>Today's Hours</h4>
              <span>--</span>
            </div>

            <div className="summary-card green">
              <h4>Today's KM</h4>
              <span>--</span>
            </div>

            <div className="summary-card orange">
              <h4>Duty Status</h4>

              <span>
                {isOnDuty
                  ? "On Duty"
                  : "Off Duty"}
              </span>
            </div>

          </div>

          <div className="duty-table-card">

            <div className="card-title">
              <h2>Duty History</h2>
            </div>

            <table className="duty-table">

              <thead>
                <tr>
                  <th>Date</th>
                  <th>Trip ID</th>
                  <th>Vehicle</th>
                  <th>Start Time</th>
                  <th>End Time</th>
                  <th>Hours</th>
                  <th>Total KM</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>

                {dutyLogs.length === 0 ? (

                  <tr>
                    <td
                      colSpan="8"
                      className="empty-row"
                    >
                      No duty records available.
                    </td>
                  </tr>

                ) : (

                  dutyLogs.map((log, index) => (
                    <tr key={index}>
                      <td>{log.date}</td>
                      <td>{log.tripId}</td>
                      <td>{log.vehicle}</td>
                      <td>{log.startTime}</td>
                      <td>{log.endTime}</td>
                      <td>{log.hours}</td>
                      <td>{log.totalKm}</td>
                      <td>{log.status}</td>
                    </tr>
                  ))

                )}

              </tbody>

            </table>

          </div>

        </div>
      </div>
    </div>
  );
}

export default DriverDutyLog;