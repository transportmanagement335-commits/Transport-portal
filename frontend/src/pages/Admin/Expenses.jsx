import React, { useEffect, useState } from "react";
import Sidebar from "../../components/Admin/Sidebar";
import Topbar from "../../components/Admin/Topbar";
import { expensesAPI, tripsAPI, uploadAPI, SERVER_URL, requireAuth } from "../../api";
import "../../styles/Admin/Expenses.css";
import { FaRupeeSign } from "react-icons/fa";
import {
  FiTrash2,
  FiSearch,
  FiChevronDown,
  FiChevronRight,
} from "react-icons/fi";

const Expenses = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Data State
  const [expenses, setExpenses] = useState([]);
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedTrips, setExpandedTrips] = useState({});

  // Form State
  const [showForm, setShowForm] = useState(false);
  const [expenseSaving, setExpenseSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [expenseForm, setExpenseForm] = useState({
    trip_id: "",
    category: "Fuel",
    amount: "",
    notes: "",
    receipt_url: ""
  });


  // Filters
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  async function fetchData() {
    try {
      setLoading(true);
      setError("");
      const [expensesData, tripsData] = await Promise.all([
        expensesAPI.list(),
        tripsAPI.list()
      ]);
      setExpenses(expensesData);
      setTrips(tripsData);
    } catch (err) {
      setError("Failed to load expenses: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    requireAuth();
    fetchData();
  }, []);


  async function handleAddExpense(e) {
    e.preventDefault();
    if (!expenseForm.trip_id || !expenseForm.amount) {
      alert("Please select a trip and enter an amount");
      return;
    }
    try {
      setExpenseSaving(true);
      const trip = trips.find(t => t.id === expenseForm.trip_id);
      await expensesAPI.create({
        vehicle_id: trip ? (trip.vehicle_id || "") : "",
        trip_id: expenseForm.trip_id,
        category: expenseForm.category,
        amount: parseFloat(expenseForm.amount),
        notes: expenseForm.notes,
        receipt_url: expenseForm.receipt_url
      });
      fetchData();
      setShowForm(false);
      setExpenseForm({ trip_id: "", category: "Fuel", amount: "", notes: "", receipt_url: "" });
    } catch (err) {
      alert("Failed to add expense: " + err.message);
    } finally {
      setExpenseSaving(false);
    }
  }

  async function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      const data = await uploadAPI.uploadFile(file);
      setExpenseForm(prev => ({ ...prev, receipt_url: data.url }));
    } catch (err) {
      alert("Image upload failed: " + err.message);
    } finally {
      setUploadingImage(false);
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this expense?")) return;
    try {
      await expensesAPI.delete(id);
      fetchData();
    } catch (err) {
      alert("Failed to delete expense: " + err.message);
    }
  };

  const filteredExpenses = expenses.filter((exp) => {
    const matchesSearch =
      exp.notes?.toLowerCase().includes(search.toLowerCase()) ||
      exp.recorded_by?.toLowerCase().includes(search.toLowerCase()) ||
      exp.category?.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = selectedCategory === "All" || exp.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const totalExpenses = filteredExpenses.reduce((s, e) => s + (e.amount || 0), 0);
  const categories = ["All", ...new Set(expenses.map(e => e.category))];

  // Group by Trip
  const expenseGroups = {};
  filteredExpenses.forEach(exp => {
    const trip = trips.find(t => t.id === exp.trip_id);
    const key = trip ? trip.id : "Unassigned";

    if (!expenseGroups[key]) {
      expenseGroups[key] = {
        trip: trip,
        expenses: [],
        total: 0
      };
    }
    expenseGroups[key].expenses.push(exp);
    expenseGroups[key].total += (exp.amount || 0);
  });

  const toggleTrip = (key) => {
    setExpandedTrips(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  return (
    <div className="dashboard-layout">
      <Sidebar sidebarOpen={sidebarOpen} />
      <div className={`dashboard-content ${sidebarOpen ? "sidebar-open" : "sidebar-close"}`}>
        <Topbar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

        {/* ── Page Header ── */}
        <div className="expenses-header-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 className="expenses-page-title">All Expenses</h2>
            <div className="expenses-breadcrumb">
              Dashboard <span>›</span> Expenses
            </div>
          </div>
          <button 
            className="btn-Driver" 
            style={{ padding: "10px 20px", background: "#2563eb", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "bold" }}
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? "Cancel" : "+ Add Expense"}
          </button>
        </div>

        {error && (
          <div style={{ margin: "0 32px 16px", color: "#ef4444", fontWeight: 600 }}>
            ⚠ {error}
          </div>
        )}


        {showForm && (
          <div style={{ margin: "0 32px 20px", background: "white", padding: "24px", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
            <h3 style={{ marginTop: 0, marginBottom: "20px", color: "#1e293b", fontSize: "16px" }}>Add New Expense</h3>
            <form onSubmit={handleAddExpense} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
              <div>
                <label style={{ display: "block", marginBottom: "8px", fontWeight: "500", color: "#475569", fontSize: "14px" }}>Select Trip <span style={{color: "red"}}>*</span></label>
                <select 
                  className="t-input" 
                  value={expenseForm.trip_id} 
                  onChange={e => setExpenseForm({...expenseForm, trip_id: e.target.value})}
                  required
                  style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                >
                  <option value="">-- Select an active trip --</option>
                  {trips.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.trip_id} - {t.client_name} ({t.vehicle_number})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "8px", fontWeight: "500", color: "#475569", fontSize: "14px" }}>Category <span style={{color: "red"}}>*</span></label>
                <select 
                  className="t-input" 
                  value={expenseForm.category} 
                  onChange={e => setExpenseForm({...expenseForm, category: e.target.value})}
                  style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                >
                  <option value="Fuel">Fuel</option>
                  <option value="Toll">Toll</option>
                  <option value="Maintenance">Maintenance</option>
                  <option value="Driver Allowance">Driver Allowance</option>
                  <option value="Miscellaneous">Miscellaneous</option>
                </select>
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "8px", fontWeight: "500", color: "#475569", fontSize: "14px" }}>Amount (₹) <span style={{color: "red"}}>*</span></label>
                <input 
                  type="number" 
                  className="t-input" 
                  value={expenseForm.amount} 
                  onChange={e => setExpenseForm({...expenseForm, amount: e.target.value})}
                  required
                  min="0"
                  style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "8px", fontWeight: "500", color: "#475569", fontSize: "14px" }}>Bill / Receipt Image</label>
                <input 
                  type="file" 
                  accept="image/*"
                  onChange={handleImageUpload}
                  style={{ width: "100%", padding: "7px", borderRadius: "6px", border: "1px solid #cbd5e1", background: "#f8fafc" }}
                />
                {uploadingImage && <span style={{fontSize: "12px", color: "#2563eb", marginTop: "4px", display: "block"}}>Uploading...</span>}
                {expenseForm.receipt_url && (
                  <div style={{ marginTop: "8px" }}>
                    <a href={SERVER_URL + expenseForm.receipt_url} target="_blank" rel="noreferrer" style={{ fontSize: "13px", color: "#2563eb", textDecoration: "none" }}>
                      View Uploaded Bill ✓
                    </a>
                  </div>
                )}
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ display: "block", marginBottom: "8px", fontWeight: "500", color: "#475569", fontSize: "14px" }}>Notes</label>
                <input 
                  type="text" 
                  className="t-input" 
                  value={expenseForm.notes} 
                  onChange={e => setExpenseForm({...expenseForm, notes: e.target.value})}
                  placeholder="Additional details..."
                  style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                />
              </div>

              <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", marginTop: "10px" }}>
                <button 
                  type="submit" 
                  disabled={expenseSaving || uploadingImage}
                  style={{ 
                    padding: "10px 24px", 
                    background: expenseSaving || uploadingImage ? "#94a3b8" : "#10b981", 
                    color: "white", 
                    border: "none", 
                    borderRadius: "8px", 
                    cursor: expenseSaving || uploadingImage ? "not-allowed" : "pointer", 
                    fontWeight: "bold" 
                  }}
                >
                  {expenseSaving ? "Saving..." : "Save Expense"}
                </button>
              </div>
            </form>
          </div>
        )}
        {/* ── KPI Cards ── */}
        <div className="expense-kpi-grid">
          <div className="expense-kpi-card red-card">
            <div className="expense-kpi-content">
              <div>
                <p className="expense-kpi-label">Total Filtered Expenses</p>
                <h3>₹{totalExpenses.toLocaleString()}</h3>
              </div>
              <div className="expense-kpi-icon red-icon">
                <FaRupeeSign />
              </div>
            </div>
          </div>
        </div>

        {/* ── Filter Bar ── */}
        <div style={{ display: "flex", gap: "15px", padding: "0 32px 20px" }}>
          <div className="search-box-wrapper" style={{ flex: 1, position: "relative" }}>
            <FiSearch style={{ position: "absolute", left: "14px", top: "12px", color: "#94a3b8" }} />
            <input
              className="t-input"
              placeholder="Search by notes, recorded by, or category..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: "100%", paddingLeft: "40px" }}
            />
          </div>
          <select
            className="t-input"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            style={{ width: "200px" }}
          >
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat === "All" ? "All Categories" : cat}</option>
            ))}
          </select>
        </div>

        {/* ── Expenses Table ── */}
        <div
          className="expenses-table-panel"
          style={{ margin: "0 32px 40px", background: "white", borderRadius: "14px", border: "1px solid #e2e8f0", overflow: "hidden" }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f1f5f9", textAlign: "left", fontSize: "12px", color: "#475569", textTransform: "uppercase" }}>
                <th style={{ padding: "14px 20px" }}>Date</th>
                <th style={{ padding: "14px 20px" }}>Category</th>
                <th style={{ padding: "14px 20px" }}>Amount</th>
                <th style={{ padding: "14px 20px" }}>Notes</th>
                <th style={{ padding: "14px 20px" }}>Recorded By</th>
                <th style={{ padding: "14px 20px" }}>Receipt</th>
                <th style={{ padding: "14px 20px", textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" style={{ padding: "30px", textAlign: "center", color: "#94a3b8" }}>
                    Loading expenses...
                  </td>
                </tr>
              ) : Object.keys(expenseGroups).length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ padding: "30px", textAlign: "center", color: "#94a3b8" }}>
                    No expenses found.
                  </td>
                </tr>
              ) : (
                Object.entries(expenseGroups).map(([key, group]) => {
                  const isExpanded = expandedTrips[key];
                  return (
                    <React.Fragment key={key}>
                      <tr
                        style={{ cursor: "pointer", background: isExpanded ? "#f8fafc" : "white", borderBottom: "1px solid #f1f5f9" }}
                        onClick={() => toggleTrip(key)}
                      >
                        <td colSpan="2" style={{ padding: "16px 20px", fontWeight: "bold", display: "flex", alignItems: "center", gap: "10px" }}>
                          <span style={{ color: "#64748b" }}>
                            {isExpanded ? <FiChevronDown /> : <FiChevronRight />}
                          </span>
                          <div>
                            {group.trip ? (
                              <>
                                <div style={{ color: "#2563eb" }}>Trip {group.trip.trip_id}</div>
                                <div style={{ fontSize: "12px", color: "#64748b", fontWeight: "normal" }}>
                                  {group.trip.client_name} · {group.trip.vehicle_number}
                                </div>
                              </>
                            ) : (
                              <div>General / Unassigned</div>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: "16px 20px", fontWeight: "bold", color: "#ef4444" }}>
                          ₹{group.total.toLocaleString()}
                        </td>
                        <td colSpan="3" style={{ padding: "16px 20px", color: "#64748b", textAlign: "right" }}>
                          {group.expenses.length} Expense(s)
                        </td>
                      </tr>

                      {isExpanded &&
                        group.expenses.map((expense) => (
                          <tr key={expense.id} style={{ background: "#fafafa", borderBottom: "1px solid #f1f5f9" }}>
                            <td style={{ padding: "12px 20px 12px 54px" }}>{new Date(expense.date).toLocaleDateString()}</td>
                            <td style={{ padding: "12px 20px", fontWeight: "bold", color: "#334155" }}>{expense.category}</td>
                            <td style={{ padding: "12px 20px", fontWeight: "bold", color: "#ef4444" }}>
                              ₹{expense.amount.toLocaleString()}
                            </td>
                            <td style={{ padding: "12px 20px", color: "#64748b" }}>
                              {expense.notes || "—"}
                              {expense.audio_note_url && (
                                <audio src={SERVER_URL + expense.audio_note_url} controls style={{ height: "30px", width: "150px", display: "block", marginTop: "4px" }} />
                              )}
                            </td>
                            <td style={{ padding: "12px 20px" }}>{expense.recorded_by}</td>
                            <td style={{ padding: "12px 20px" }}>
                              {expense.receipt_url ? (
                                <a href={SERVER_URL + expense.receipt_url} target="_blank" rel="noreferrer" style={{ color: "#2563eb", textDecoration: "none", fontSize: "13px", fontWeight: "500" }}>
                                  View Bill
                                </a>
                              ) : (
                                <span style={{ color: "#94a3b8", fontSize: "13px" }}>—</span>
                              )}
                            </td>
                            <td style={{ padding: "12px 20px", textAlign: "right" }}>
                              <button
                                onClick={() => handleDelete(expense.id)}
                                style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: "16px" }}
                                title="Delete Expense"
                              >
                                <FiTrash2 />
                              </button>
                            </td>
                          </tr>
                        ))
                      }
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Expenses;
