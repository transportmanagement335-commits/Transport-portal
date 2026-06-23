import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";

import DriverSidebar from "../../components/Driver/DriverSidebar";
import DriverNavbar from "../../components/Driver/DriverNavbar";

import "../../styles/Driver/DriverExpenseDetails.css";

function DriverExpenseDetails() {
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 768);

  const navigate = useNavigate();
  const { expenseId } = useParams();

  // Backend data will come here
  const [expenseDetails, setExpenseDetails] =
    useState(null);

  useEffect(() => {
    // Future Backend Call
    // loadExpenseDetails();
  }, [expenseId]);

  const totalExpense =
    expenseDetails?.expenses?.reduce(
      (sum, item) =>
        sum + Number(item.amount || 0),
      0
    ) || 0;

  return (
    <div className="driver-layout">

      <DriverSidebar isOpen={sidebarOpen} closeSidebar={() => setSidebarOpen(false)} />

      <div
        className={`driver-content ${
          sidebarOpen
            ? "sidebar-open"
            : "sidebar-closed"
        }`}
      >
        <DriverNavbar
          toggleSidebar={() =>
            setSidebarOpen(!sidebarOpen)
          }
        />

        <div className="expense-details-page">

          <button
            className="back-btn"
            onClick={() =>
              navigate("/driver-expenses")
            }
          >
            ← Back To Expenses
          </button>

          {!expenseDetails ? (

            <div className="expense-detail-card">
              <h2>
                No Expense Details Found
              </h2>

              <p>
                Expense records will appear
                here once loaded from the
                backend.
              </p>
            </div>

          ) : (

            <>
              {/* HEADER */}

              <div className="expense-detail-card">

                <h1>Expense Details</h1>

                <div className="detail-row">
                  <span>Trip ID</span>

                  <strong>
                    {expenseDetails.tripId}
                  </strong>
                </div>

                <div className="detail-row">
                  <span>Vehicle</span>

                  <strong>
                    {expenseDetails.vehicle}
                  </strong>
                </div>

                <div className="detail-row">
                  <span>
                    Submitted Date
                  </span>

                  <strong>
                    {
                      expenseDetails.submittedDate
                    }
                  </strong>
                </div>

                <div className="detail-row">
                  <span>
                    Total Expense
                  </span>

                  <strong>
                    ₹
                    {totalExpense.toLocaleString()}
                  </strong>
                </div>

              </div>

              {/* BREAKDOWN */}

              <div className="expense-detail-card">

                <h2>
                  Expense Breakdown
                </h2>

                <table className="breakdown-table">

                  <thead>
                    <tr>
                      <th>
                        Expense Type
                      </th>

                      <th>
                        Amount
                      </th>

                      <th>
                        Date
                      </th>

                      <th>
                        Receipt
                      </th>
                    </tr>
                  </thead>

                  <tbody>

                    {expenseDetails.expenses
                      ?.length === 0 ? (
                      <tr>
                        <td
                          colSpan="4"
                        >
                          No expenses found
                        </td>
                      </tr>
                    ) : (
                      expenseDetails.expenses?.map(
                        (expense) => (
                          <tr
                            key={
                              expense.id
                            }
                          >
                            <td>
                              {
                                expense.type
                              }
                            </td>

                            <td>
                              ₹
                              {Number(
                                expense.amount
                              ).toLocaleString()}
                            </td>

                            <td>
                              {
                                expense.date
                              }
                            </td>

                            <td>

                              <button className="receipt-btn">
                                View Receipt
                              </button>

                            </td>

                          </tr>
                        )
                      )
                    )}

                  </tbody>

                </table>

              </div>

              {/* RECEIPTS */}

              <div className="expense-detail-card">

                <h2>
                  Uploaded Receipts
                </h2>

                <div className="receipt-grid">

                  {expenseDetails.expenses?.map(
                    (expense) => (
                      <div
                        key={
                          expense.id
                        }
                        className="receipt-card"
                      >

                        <div className="receipt-placeholder">
                          Receipt Image
                        </div>

                        <p>
                          {
                            expense.receipt
                          }
                        </p>

                      </div>
                    )
                  )}

                </div>

              </div>

            </>
          )}

        </div>

      </div>

    </div>
  );
}

export default DriverExpenseDetails;