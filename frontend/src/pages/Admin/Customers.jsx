import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "../../components/Admin/Sidebar";
import Topbar from "../../components/Admin/Topbar";
import { customersAPI, requireAuth } from "../../api";
import { FiPlus, FiEdit2, FiTrash2, FiEye, FiX } from "react-icons/fi";
import "../../styles/Admin/Customers.css";

const EMPTY_FORM = {
  name: "", contact_person: "", email: "", phone: "",
  address: "", gst_number: "", payment_terms_days: 30,
};

function Customers() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [customers, setCustomers]     = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");
  const [search, setSearch]           = useState("");
  const [filterActive, setFilterActive] = useState("all");

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editCustomer, setEditCustomer] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    requireAuth();
    fetchCustomers();
  }, []);

  async function fetchCustomers() {
    try {
      setLoading(true);
      const data = await customersAPI.list();
      setCustomers(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase();
    const matchesSearch = !q || c.name?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) || c.phone?.includes(q) ||
      c.gst_number?.toLowerCase().includes(q);
    const matchesActive =
      filterActive === "all" ? true :
      filterActive === "active" ? c.is_active :
      !c.is_active;
    return matchesSearch && matchesActive;
  });

  function openAddModal() {
    setEditCustomer(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setShowModal(true);
  }

  function openEditModal(customer) {
    setEditCustomer(customer);
    setForm({
      name: customer.name || "",
      contact_person: customer.contact_person || "",
      email: customer.email || "",
      phone: customer.phone || "",
      address: customer.address || "",
      gst_number: customer.gst_number || "",
      payment_terms_days: customer.payment_terms_days || 30,
    });
    setFormError("");
    setShowModal(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) { setFormError("Customer name is required."); return; }
    try {
      setSaving(true);
      setFormError("");
      if (editCustomer) {
        await customersAPI.update(editCustomer.id, form);
      } else {
        await customersAPI.create(form);
      }
      setShowModal(false);
      fetchCustomers();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(customer) {
    if (!window.confirm(`Deactivate "${customer.name}"? They will no longer appear in new invoice dropdowns.`)) return;
    try {
      await customersAPI.delete(customer.id);
      fetchCustomers();
    } catch (err) {
      alert("Failed: " + err.message);
    }
  }

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

  return (
    <div className="dashboard-layout">
      <Sidebar sidebarOpen={sidebarOpen} />
      <div className={`dashboard-content ${sidebarOpen ? "sidebar-open" : "sidebar-close"}`}>
        <Topbar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

        {/* Header */}
        <div className="customers-header-row">
          <div>
            <h2 className="customers-page-title">Customers</h2>
            <div className="customers-breadcrumb">Dashboard <span>›</span> Customers</div>
          </div>
          <button id="btn-add-customer" className="btn-add-customer" onClick={openAddModal}>
            <FiPlus /> Add New Customer
          </button>
        </div>

        {error && <div style={{ margin: "0 32px 16px", color: "#ef4444", fontWeight: 600 }}>⚠ {error}</div>}

        {/* Filters */}
        <div className="customers-filter-bar">
          <input
            id="customer-search"
            className="c-search-input"
            placeholder="Search by name, email, phone, or GST..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            id="customer-filter-active"
            className="c-filter-select"
            value={filterActive}
            onChange={(e) => setFilterActive(e.target.value)}
          >
            <option value="all">All Customers</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>
        </div>

        {/* Table */}
        <div className="customers-table-panel">
          <table className="customers-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Contact</th>
                <th>Email</th>
                <th>GST Number</th>
                <th>Payment Terms</th>
                <th>Status</th>
                <th>Added On</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr className="c-empty-row"><td colSpan="8">Loading customers...</td></tr>
              ) : filtered.length === 0 ? (
                <tr className="c-empty-row">
                  <td colSpan="8">
                    {search ? "No customers match your search." : "No customers yet. Click \"Add New Customer\" to get started."}
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div className="c-name-cell">
                        <div className="c-avatar">{c.name.charAt(0).toUpperCase()}</div>
                        <div>
                          <div className="c-name-text">{c.name}</div>
                          {c.contact_person && <div className="c-sub-text">{c.contact_person}</div>}
                        </div>
                      </div>
                    </td>
                    <td>{c.phone || "—"}</td>
                    <td>{c.email || "—"}</td>
                    <td>{c.gst_number || "—"}</td>
                    <td>{c.payment_terms_days} days</td>
                    <td>
                      {c.is_active
                        ? <span className="c-badge-active">Active</span>
                        : <span className="c-badge-inactive">Inactive</span>
                      }
                    </td>
                    <td>{fmtDate(c.created_at)}</td>
                    <td>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button className="c-action-btn" title="View Details" onClick={() => navigate(`/customers/${c.id}`)}><FiEye /></button>
                        <button className="c-action-btn" title="Edit" onClick={() => openEditModal(c)}><FiEdit2 /></button>
                        {c.is_active && (
                          <button className="c-action-btn danger" title="Deactivate" onClick={() => handleDelete(c)}><FiTrash2 /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Add / Edit Modal */}
        {showModal && (
          <div className="c-modal-overlay">
            <div className="c-modal">
              <div className="c-modal-header">
                <h3>{editCustomer ? "Edit Customer" : "Add New Customer"}</h3>
                <button className="c-modal-close" onClick={() => setShowModal(false)}><FiX /></button>
              </div>
              <form onSubmit={handleSubmit}>
                <div className="c-modal-body">
                  {formError && <div className="c-error-msg">⚠ {formError}</div>}
                  <div className="c-form-grid">
                    <div className="c-form-field">
                      <label>Company / Customer Name *</label>
                      <input id="cf-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Reliance Logistics Ltd." />
                    </div>
                    <div className="c-form-field">
                      <label>Contact Person</label>
                      <input id="cf-contact" value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} placeholder="e.g. Rahul Sharma" />
                    </div>
                    <div className="c-form-field">
                      <label>Email</label>
                      <input id="cf-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="billing@company.com" />
                    </div>
                    <div className="c-form-field">
                      <label>Phone</label>
                      <input id="cf-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91 98765 43210" />
                    </div>
                    <div className="c-form-field" style={{ gridColumn: "1 / -1" }}>
                      <label>Billing Address</label>
                      <input id="cf-address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Full billing address" />
                    </div>
                    <div className="c-form-field">
                      <label>GST Number</label>
                      <input id="cf-gst" value={form.gst_number} onChange={(e) => setForm({ ...form, gst_number: e.target.value })} placeholder="22AAAAA0000A1Z5" />
                    </div>
                    <div className="c-form-field">
                      <label>Payment Terms (days)</label>
                      <input id="cf-terms" type="number" min="1" max="365" value={form.payment_terms_days} onChange={(e) => setForm({ ...form, payment_terms_days: parseInt(e.target.value) || 30 })} />
                    </div>
                  </div>
                </div>
                <div className="c-modal-footer">
                  <button type="button" className="c-btn-cancel" onClick={() => setShowModal(false)}>Cancel</button>
                  <button type="submit" id="cf-submit" className="c-btn-save" disabled={saving}>
                    {saving ? "Saving..." : (editCustomer ? "Update Customer" : "Add Customer")}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Customers;
