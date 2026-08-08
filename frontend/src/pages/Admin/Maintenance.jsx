import { useEffect, useState, useRef } from "react";
import Sidebar from "../../components/Admin/Sidebar";
import Topbar from "../../components/Admin/Topbar";
import {
    vehiclesAPI,
    requireAuth,
    maintenanceAPI
} from "../../api";

import "../../styles/Admin/Maintenance.css";

const TYPES = ["Oil Change","Brake Repair","Tyre Replacement","Engine Repair","Battery Replacement","AC Repair","Regular Service","Clutch Repair","Suspension Repair","Electrical Repair","Body Repair","Other"];
const STATUSES = ["Scheduled","In Progress","Completed","Overdue"];
const EMPTY_FORM = {
  vehicle_id:"", garage_name:"", mechanic_name:"", mechanic_contact:"",
  maintenance_type:"Oil Change", start_date:"", expected_completion_date:"",
  labour:0, spare_parts:0, engine_oil:0, tyres:0, battery:0, other_expenses:0,
  status:"Scheduled", notes:"",
  driver: "", vehicle_type: "", current_km: ""
};

const statusStyle = {
  Completed:  { bg:"#dcfce7", color:"#15803d" },
  "In Progress":{ bg:"#dbeafe", color:"#1d4ed8" },
  Scheduled:  { bg:"#fef3c7", color:"#b45309" },
  Overdue:    { bg:"#fee2e2", color:"#dc2626" },
};

function fmt(d){ return d ? new Date(d).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}) : "—"; }

/* ── MAIN COMPONENT ─────────────────────────────────────────── */
export default function Maintenance() {
  const [sidebarOpen,   setSidebarOpen]   = useState(true);
  const [records,       setRecords]       = useState([]);
  const [vehicles,      setVehicles]      = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [panelMode,     setPanelMode]     = useState(null); // "add" | "view" | "edit"
  const [selected,      setSelected]      = useState(null);
  const [saving,        setSaving]        = useState(false);
  const [form,          setForm]          = useState(EMPTY_FORM);
  const [invoiceFile,   setInvoiceFile]   = useState(null);
  const [invoicePreview,setInvoicePreview]= useState(null);
  const [search,        setSearch]        = useState("");
  const [typeFilter,    setTypeFilter]    = useState("All");
  const [statusFilter,  setStatusFilter]  = useState("All");
  const [vehicleFilter, setVehicleFilter] = useState("");
  const [currentPage,   setCurrentPage]   = useState(1);
  const PER_PAGE = 8;
  const fileRef = useRef();

  /* selected vehicle info */
  const selVehicle = vehicles.find(
    vehicle =>
        String(vehicle._id || vehicle.id) ===
        String(form.vehicle_id)
  );

  useEffect(() => {
    requireAuth();
    fetchVehicles();
    fetchMaintenance();
  }, []);

  async function fetchVehicles(){
    try{
        const data = await vehiclesAPI.list();
        console.log("Vehicles:", data);
        setVehicles(
            data.filter(
                v => v.status === "Active"
            )
        );
    }
    catch(err){
        console.error(
            "Failed to load vehicles",
            err
        );
    }
  }

  async function fetchMaintenance() {
    setLoading(true);
    try {
      const m = await maintenanceAPI.list();
      setRecords(m || []);
    } catch(e){ console.error(e); }
    finally { setLoading(false); }
  }

  /* computed totals */
  const totalExpense = (f) =>
    [f.labour, f.spare_parts, f.engine_oil, f.tyres, f.battery, f.other_expenses]
      .reduce((s, v) => s + (parseFloat(v) || 0), 0);

  /* form change */
  function hc(e) {
    const { name, value } = e.target;
    setForm(p => ({ ...p, [name]: value }));
  }

  const handleVehicleChange = (e) => {
    const vehicleId = e.target.value;
    const vehicle = vehicles.find(
      v => String(v._id || v.id) === String(vehicleId)
    );
    setForm(prev => ({
      ...prev,
      vehicle_id: vehicleId,
      driver: vehicle?.driver || "",
      vehicle_type: vehicle?.type || "",
      current_km: vehicle?.current_km || ""
    }));
  };

  /* open Add panel */
  function openAdd() {
    setForm(EMPTY_FORM);
    setInvoiceFile(null); setInvoicePreview(null);
    setPanelMode("add"); setSelected(null);
  }

  /* open View panel */
  function openView(rec) {
    setSelected(rec);
    setPanelMode("view");
  }

  /* switch view → edit */
  function startEdit() {
    setForm({
      vehicle_id:                 selected.vehicle_id       || "",
      garage_name:                selected.garage_name      || "",
      mechanic_name:              selected.mechanic_name    || "",
      mechanic_contact:           selected.mechanic_contact || "",
      maintenance_type:           selected.maintenance_type || "Oil Change",
      start_date:                 selected.start_date?.slice(0,10) || "",
      expected_completion_date:   selected.expected_completion_date?.slice(0,10) || "",
      labour:                     selected.labour           || 0,
      spare_parts:                selected.spare_parts      || 0,
      engine_oil:                 selected.engine_oil       || 0,
      tyres:                      selected.tyres            || 0,
      battery:                    selected.battery          || 0,
      other_expenses:             selected.other_expenses   || 0,
      status:                     selected.status           || "Scheduled",
      notes:                      selected.notes            || "",
      driver:                     selected.driver           || "",
      vehicle_type:               selected.vehicle_type     || "",
      current_km:                 selected.current_km       || "",
    });
    setPanelMode("edit");
  }

  /* Save (create or update) */
  async function handleSave() {
    const required = ["vehicle_id","garage_name","maintenance_type","start_date","expected_completion_date","status"];
    if (required.some(k => !form[k])) { alert("Fill all required fields."); return; }
    try {
      setSaving(true);
      const payload = { ...form, total_expense: totalExpense(form) };
      if (panelMode === "add") {
        const created = await maintenanceAPI.create(payload);
        setRecords(p => [created, ...p]);
        setPanelMode(null);
      } else {
        const updated = await maintenanceAPI.update(selected.id, payload);
        setRecords(p => p.map(r => r.id === updated.id ? updated : r));
        setSelected(updated);
        setPanelMode("view");
      }
    } catch(e){ alert(e.message); }
    finally { setSaving(false); }
  }

  /* Delete */
  async function handleDelete(id) {
    if (!window.confirm("Delete this maintenance record?")) return;
    try {
      await maintenanceAPI.delete(id);
      setRecords(p => p.filter(r => r.id !== id));
      if (selected?.id === id) setPanelMode(null);
    } catch(e){ alert(e.message); }
  }

  /* Filter + paginate */
  const filtered = records.filter(r => {
    const q = search.toLowerCase();
    return (
      (r.vehicle_number?.toLowerCase().includes(q) || r.driver?.toLowerCase().includes(q) || r.garage_name?.toLowerCase().includes(q)) &&
      (typeFilter    === "All" || r.maintenance_type === typeFilter) &&
      (statusFilter === "All" || r.status      === statusFilter) &&
      (vehicleFilter === ""    || String(r.vehicle_id) === String(vehicleFilter))
    );
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const page = filtered.slice((currentPage-1)*PER_PAGE, currentPage*PER_PAGE);

  /* ────────────────────────────────────── RENDER ─────────────────── */
  return (
    <div className="dashboard-layout">
      <Sidebar sidebarOpen={sidebarOpen} />

      <div className={`dashboard-content ${sidebarOpen ? "sidebar-open" : "sidebar-close"}`}>
        <Topbar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

        {/* ── HEADER ── */}
        <div className="mn-container">
          <div  className="mn-title">
            <h1>Maintenance Management</h1>
            <p>Manage vehicle maintenance, repairs and service history</p>
          </div>
          <button className="mn-btn-add" onClick={panelMode === "add" ? () => setPanelMode(null) : openAdd}>
            {panelMode === "add" ? "✕ Close" : "+ Add Maintenance"}
          </button>
        </div>

        {/* ── MAIN AREA: TABLE + SIDE PANEL ── */}
        <div className={`mn-workspace ${panelMode ? "panel-open" : ""}`}>

          {/* ── TABLE SECTION ── */}
          <div className="mn-table-section">

            {/* Filter bar */}
            <div className="mn-filters">
              <input className="mn-search" placeholder="Search vehicle, driver, garage…"
                value={search} onChange={e => { setSearch(e.target.value); setCurrentPage(1); }} />
              
              <select
                value={vehicleFilter}
                onChange={(e)=>{
                    setVehicleFilter(e.target.value);
                    setCurrentPage(1);
                }}
              >
                <option value="">
                All Vehicles
                </option>
                {vehicles.map(v=>(
                <option
                key={v._id || v.id}
                value={v._id || v.id}
                >
                {v.number}
                </option>
                ))}
              </select>

              <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
                <option value="All">All Types</option>
                {TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="All">All Status</option>
                {STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
              <button className="mn-btn-reset" onClick={() => { setSearch(""); setTypeFilter("All"); setStatusFilter("All"); setVehicleFilter(""); setCurrentPage(1); }}>
                Reset
              </button>
            </div>

            {/* Table */}
            <div className="mn-table-wrap">
              <table className="mn-table">
                <thead>
                  <tr>
                    <th>Vehicle No.</th><th>Driver</th><th>Maintenance Type</th>
                    <th>Garage</th><th>Start Date</th><th>Expected Completion</th>
                    <th>Total Expense</th><th>Status</th><th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={9} className="mn-empty">Loading…</td></tr>
                  ) : !page.length ? (
                    <tr><td colSpan={9} className="mn-empty">No maintenance records found.</td></tr>
                  ) : page.map(r => {
                    const ss = statusStyle[r.status] || statusStyle.Scheduled;
                    return (
                      <tr key={r.id} className={selected?.id === r.id ? "mn-row-active" : ""}>
                        <td><span className="mn-vehicle-no">{r.vehicle_number}</span></td>
                        <td>{r.driver || "—"}</td>
                        <td>{r.maintenance_type}</td>
                        <td>{r.garage_name}</td>
                        <td>{fmt(r.start_date)}</td>
                        <td>{fmt(r.expected_completion_date)}</td>
                        <td><strong>₹{(r.total_expense||0).toLocaleString("en-IN")}</strong></td>
                        <td><span className="mn-badge" style={{ background:ss.bg, color:ss.color }}>{r.status}</span></td>
                        <td>
                          <button className="mn-btn-view" onClick={() => openView(r)}>View</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="mn-pagination">
              <span>Showing {Math.min((currentPage-1)*PER_PAGE+1, filtered.length)}–{Math.min(currentPage*PER_PAGE, filtered.length)} of {filtered.length} entries</span>
              <div className="mn-pages">
                <button disabled={currentPage===1} onClick={() => setCurrentPage(p=>p-1)}>‹</button>
                {Array.from({length:totalPages},(_,i)=>i+1).map(n=>(
                  <button key={n} className={n===currentPage?"active":""} onClick={()=>setCurrentPage(n)}>{n}</button>
                ))}
                <button disabled={currentPage===totalPages} onClick={() => setCurrentPage(p=>p+1)}>›</button>
              </div>
            </div>
          </div>

          {/* ── SIDE PANEL ── */}
          {panelMode && (
            <div className="mn-panel">

              {/* ADD / EDIT FORM */}
              {(panelMode === "add" || panelMode === "edit") && (
                <>
                  <div className="mn-panel-header">
                    <h2>{panelMode === "add" ? "Add Maintenance" : "Edit Maintenance"}</h2>
                    <button className="mn-panel-close" onClick={() => setPanelMode(null)}>✕</button>
                  </div>

                  <div className="mn-panel-body">

                    <div className="mn-section-title">Vehicle Information</div>
                    <div className="mn-form-row">
                      <label>Vehicle <span className="req">*</span>
                        <select
                        name="vehicle_id"
                        value={form.vehicle_id}
                        onChange={handleVehicleChange}
                        >
                        <option value="">
                        Select Vehicle
                        </option>
                        {vehicles.map(v=>(
                        <option
                        key={v._id || v.id}
                        value={v._id || v.id}
                        >
                        {v.number}
                        —
                        Driver:
                        {v.driver}
                        </option>
                        ))}
                        </select>
                      </label>
                      
                      <label>
                      Driver
                      <input
                      readOnly
                      value={form.driver}
                      />
                      </label>

                      <label>
                      Vehicle Type
                      <input
                      readOnly
                      value={form.vehicle_type}
                      />
                      </label>

                      <label>
                      Current KM
                      <input
                      readOnly
                      value={form.current_km}
                      />
                      </label>
                    </div>

                    <div className="mn-section-title">Maintenance Details</div>
                    <div className="mn-form-row">
                      <label>Maintenance Type <span className="req">*</span>
                        <select name="maintenance_type" value={form.maintenance_type} onChange={hc}>
                          {TYPES.map(t=><option key={t}>{t}</option>)}
                        </select>
                      </label>
                      <label>Garage Name <span className="req">*</span>
                        <input name="garage_name" value={form.garage_name} onChange={hc} placeholder="Enter garage name" />
                      </label>
                      <label>Mechanic Name
                        <input name="mechanic_name" value={form.mechanic_name} onChange={hc} placeholder="Enter mechanic name" />
                      </label>
                    </div>
                    <div className="mn-form-row">
                      <label>Mechanic Contact
                        <input name="mechanic_contact" value={form.mechanic_contact} onChange={hc} placeholder="Phone number" />
                      </label>
                    </div>

                    <div className="mn-section-title">Dates</div>
                    <div className="mn-form-row two-col">
                      <label>Start Date <span className="req">*</span>
                        <input type="date" name="start_date" value={form.start_date} onChange={hc} />
                      </label>
                      <label>Expected Completion <span className="req">*</span>
                        <input type="date" name="expected_completion_date" value={form.expected_completion_date} onChange={hc} />
                      </label>
                    </div>

                    <div className="mn-section-title">Expense Breakdown</div>
                    <div className="mn-form-row three-col">
                      {[
                        ["labour","Labour Charges (₹)"],
                        ["spare_parts","Spare Parts (₹)"],
                        ["engine_oil","Engine Oil (₹)"],
                        ["tyres","Tyres (₹)"],
                        ["battery","Battery (₹)"],
                        ["other_expenses","Other Expenses (₹)"],
                      ].map(([k,l])=>(
                        <label key={k}>{l}
                          <input type="number" min="0" name={k} value={form[k]} onChange={hc} />
                        </label>
                      ))}
                    </div>
                    <div className="mn-total-row">
                      <span>Total Expense (₹)</span>
                      <strong>₹{totalExpense(form).toLocaleString("en-IN")}</strong>
                    </div>

                    <div className="mn-section-title">Status</div>
                    <label>Status <span className="req">*</span>
                      <select name="status" value={form.status} onChange={hc}>
                        {STATUSES.map(s=><option key={s}>{s}</option>)}
                      </select>
                    </label>

                    <div className="mn-section-title">Notes</div>
                    <textarea name="notes" rows={3} value={form.notes} onChange={hc} placeholder="Enter maintenance notes…" />

                    <div className="mn-section-title">Upload Invoice</div>
                    <div className="mn-upload-box" onClick={() => fileRef.current.click()}>
                      {invoicePreview
                        ? <img src={invoicePreview} alt="Invoice" className="mn-invoice-preview" />
                        : <>
                            <div className="mn-upload-icon">📄</div>
                            <p>Drag & drop invoice here<br /><span>or click to browse</span></p>
                            <small>Supports: JPG, PNG, PDF (Max 5MB)</small>
                          </>
                      }
                      <input type="file" ref={fileRef} style={{display:"none"}} accept="image/*,.pdf"
                        onChange={e => {
                          const f = e.target.files[0];
                          if (f) { setInvoiceFile(f); setInvoicePreview(URL.createObjectURL(f)); }
                        }} />
                    </div>

                  </div>

                  <div className="mn-panel-footer">
                    <button className="mn-btn-cancel" onClick={() => setPanelMode(null)}>Cancel</button>
                    <button className="mn-btn-save" onClick={handleSave} disabled={saving}>
                      {saving ? "Saving…" : "Save Maintenance"}
                    </button>
                  </div>
                </>
              )}

              {/* VIEW DETAILS */}
              {panelMode === "view" && selected && (() => {
                const ss = statusStyle[selected.status] || statusStyle.Scheduled;
                return (
                  <>
                    <div className="mn-panel-header">
                      <h2>Maintenance Details — {selected.vehicle_number}</h2>
                      <button className="mn-panel-close" onClick={() => setPanelMode(null)}>✕</button>
                    </div>

                    <div className="mn-panel-body">

                      {/* Timeline */}
                      <div className="mn-timeline">
                        <div className="mn-tl-item">
                          <div className="mn-tl-dot green" />
                          <div><p className="mn-tl-date">{fmt(selected.start_date)}</p><small>Maintenance Started</small></div>
                        </div>
                        <div className="mn-tl-line" />
                        <div className="mn-tl-item">
                          <div className="mn-tl-dot blue" />
                          <div><p className="mn-tl-date">{fmt(selected.expected_completion_date)}</p><small>Expected Completion</small></div>
                        </div>
                        <div className="mn-tl-line" />
                        <div className="mn-tl-item">
                          <div className="mn-tl-dot grey" />
                          <div><p className="mn-tl-date">—</p><small>Completed On</small></div>
                        </div>
                        <div className="mn-tl-line" />
                        <div className="mn-tl-item">
                          <div className="mn-tl-dot" style={{ background:ss.color }} />
                          <div><p className="mn-tl-date" style={{ color:ss.color }}>{selected.status}</p><small>Current Status</small></div>
                        </div>
                      </div>

                      {/* 2 column layout */}
                      <div className="mn-view-grid">

                        {/* Vehicle Info */}
                        <div className="mn-view-card">
                          <h4>Vehicle Information</h4>
                          {[
                            ["Vehicle No.",   selected.vehicle_number],
                            ["Driver",        selected.driver],
                            ["Vehicle Type",  selected.vehicle_type],
                            ["Engine No.",    selected.engine_no || "—"],
                            ["Chassis No.",   selected.chassis_no || "—"],
                          ].map(([l,v])=>(
                            <div key={l} className="mn-view-row"><span>{l}</span><strong>{v||"—"}</strong></div>
                          ))}
                        </div>

                        {/* Expense Breakdown */}
                        <div className="mn-view-card">
                          <h4>Expense Breakdown</h4>
                          {[
                            ["Labour Charges", selected.labour],
                            ["Spare Parts",    selected.spare_parts],
                            ["Engine Oil",     selected.engine_oil],
                            ["Tyres",          selected.tyres],
                            ["Battery",        selected.battery],
                            ["Other Expenses", selected.other_expenses],
                          ].map(([l,v])=>(
                            <div key={l} className="mn-view-row"><span>{l}</span><strong>₹{(v||0).toLocaleString("en-IN")}</strong></div>
                          ))}
                          <div className="mn-view-row total">
                            <span>Total Expense</span>
                            <strong>₹{(selected.total_expense||0).toLocaleString("en-IN")}</strong>
                          </div>
                        </div>

                        {/* Maintenance Details */}
                        <div className="mn-view-card">
                          <h4>Maintenance Details</h4>
                          {[
                            ["Maintenance Type", selected.maintenance_type],
                            ["Garage Name",      selected.garage_name],
                            ["Mechanic Name",    selected.mechanic_name],
                            ["Contact No.",      selected.mechanic_contact],
                          ].map(([l,v])=>(
                            <div key={l} className="mn-view-row"><span>{l}</span><strong>{v||"—"}</strong></div>
                          ))}
                        </div>

                        {/* Invoice */}
                        <div className="mn-view-card">
                          <h4>Documents</h4>
                          {selected.invoice_url
                            ? <div className="mn-invoice-card">
                                <img src={selected.invoice_url} alt="Invoice" style={{ width:"100%", borderRadius:8 }} />
                                <a href={selected.invoice_url} target="_blank" rel="noreferrer" className="mn-dl-btn">⬇ Download Invoice</a>
                              </div>
                            : <p className="mn-no-doc">No invoice uploaded.</p>
                          }
                        </div>

                      </div>

                      {selected.notes && (
                        <div className="mn-notes-block">
                          <h4>Notes</h4>
                          <p>{selected.notes}</p>
                        </div>
                      )}

                    </div>

                    <div className="mn-panel-footer">
                      <button className="mn-btn-danger" onClick={() => handleDelete(selected.id)}>Delete</button>
                      <button className="mn-btn-cancel" onClick={() => panelMode === "view" ? setPanelMode(null) : setPanelMode("view")}>Close</button>
                      <button className="mn-btn-save" onClick={startEdit}>Edit Details</button>
                    </div>
                  </>
                );
              })()}

            </div>
          )}
        </div>

      </div>
    </div>
  );
}