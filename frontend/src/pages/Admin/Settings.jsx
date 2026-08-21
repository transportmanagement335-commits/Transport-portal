import React, { useEffect, useRef, useState } from "react";

import Sidebar from "../../components/Admin/Sidebar";
import Topbar from "../../components/Admin/Topbar";

import "../../styles/Admin/Settings.css";

export default function Settings() {
  // ---- state (exactly as specified) ----
  const [company, setCompany] = useState({
    companyName: "",
    email: "",
    phone: "",
    address: "",
    gstin: "",
    licenseNumber: "",
  });
  const [notifications, setNotifications] = useState({
    emailAlerts: false,
    smsAlerts: false,
    tripUpdates: false,
    maintenanceReminders: false,
    invoiceAlerts: false,
  });
  const [password, setPassword] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [loading, setLoading] = useState(true);
  const [editCompany, setEditCompany] = useState(false);
  const [editPassword, setEditPassword] = useState(false);
  const [editNotification, setEditNotification] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // snapshots of last-fetched backend data, used to restore on Cancel
  const companySnapshot = useRef(null);
  const notificationsSnapshot = useRef(null);

  const [savingCompany, setSavingCompany] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [savingNotifications, setSavingNotifications] = useState(false);

  // ---- data fetching ----
  const fetchCompany = async () => {
    const res = await fetch("/api/settings/company");
    if (!res.ok) throw new Error("Failed to load company information");
    const data = await res.json();
    setCompany(data);
    companySnapshot.current = data;
  };

  const fetchNotifications = async () => {
    const res = await fetch("/api/settings/notifications");
    if (!res.ok) throw new Error("Failed to load notification settings");
    const data = await res.json();
    setNotifications(data);
    notificationsSnapshot.current = data;
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await Promise.all([fetchCompany(), fetchNotifications()]);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ---- company handlers ----
  const handleCompanyField = (field) => (e) => {
    setCompany((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const cancelCompanyEdit = () => {
    if (companySnapshot.current) setCompany(companySnapshot.current);
    setEditCompany(false);
  };

  const saveCompany = async () => {
    setSavingCompany(true);
    try {
      const res = await fetch("/api/settings/company", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(company),
      });
      if (!res.ok) throw new Error("Failed to update company information");
      await fetchCompany();
      setEditCompany(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSavingCompany(false);
    }
  };

  // ---- password handlers ----
  const handlePasswordField = (field) => (e) => {
    setPassword((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const closePasswordEdit = () => {
    setPassword({ currentPassword: "", newPassword: "", confirmPassword: "" });
    setEditPassword(false);
  };

  const updatePassword = async () => {
    setSavingPassword(true);
    try {
      const res = await fetch("/api/settings/change-password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(password),
      });
      if (!res.ok) throw new Error("Failed to update password");
      closePasswordEdit();
    } catch (err) {
      console.error(err);
    } finally {
      setSavingPassword(false);
    }
  };

  // ---- notification handlers ----
  const toggleNotification = (field) => () => {
    setNotifications((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  const cancelNotificationEdit = () => {
    if (notificationsSnapshot.current) setNotifications(notificationsSnapshot.current);
    setEditNotification(false);
  };

  const saveNotifications = async () => {
    setSavingNotifications(true);
    try {
      const res = await fetch("/api/settings/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(notifications),
      });
      if (!res.ok) throw new Error("Failed to update notification settings");
      await fetchNotifications();
      setEditNotification(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSavingNotifications(false);
    }
  };

  const notificationLabels = {
    emailAlerts: "Email alerts",
    smsAlerts: "SMS alerts",
    tripUpdates: "Trip updates",
    maintenanceReminders: "Maintenance reminders",
    invoiceAlerts: "Invoice alerts",
  };

  const companyFields = [
    { key: "companyName", label: "Company name", type: "text" },
    { key: "email", label: "Email", type: "email" },
    { key: "phone", label: "Phone", type: "text" },
    { key: "gstin", label: "GSTIN", type: "text" },
    { key: "licenseNumber", label: "Transport license no.", type: "text" },
    { key: "address", label: "Address", type: "textarea" },
  ];

  return (
    <div className="dashboard-layout">
      <Sidebar sidebarOpen={sidebarOpen} />

      <div
        className={`admin-main ${sidebarOpen ? "sidebar-open" : "sidebar-close"}`}
      >
        <Topbar
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          title="Settings"
          subtitle="Transport Management System"
        />

        {loading ? (
          <div className="settings-page">
            <div className="settings-loading">
              <span className="loading-dot" />
              <span className="loading-dot" />
              <span className="loading-dot" />
              <p>Loading settings&hellip;</p>
            </div>
          </div>
        ) : (
          <div className="settings-page">
            <div className="settings-page-header">
              <div>
                <h1>Settings</h1>
                <span className="breadcrumb">
                  Dashboard <span className="breadcrumb-sep">&rsaquo;</span> Settings
                </span>
              </div>
            </div>

            <main className="settings-grid">
              {/* ---------------- COMPANY INFORMATION ---------------- */}
              <section className="panel panel-company">
                <div className="panel-header">
                  <h2>Company Information</h2>
                </div>
                <div className="panel-divider" />

                {!editCompany ? (
                  <>
                    <div className="field-grid view-mode">
                      {companyFields.map((f) => (
                        <div
                          className={`field-view ${f.type === "textarea" ? "span-2" : ""}`}
                          key={f.key}
                        >
                          <span className="field-label">{f.label}</span>
                          <span className="field-value">
                            {company[f.key] ? company[f.key] : "—"}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="panel-actions">
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => setEditCompany(true)}
                      >
                        Update Details
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="field-grid edit-mode">
                      {companyFields.map((f) =>
                        f.type === "textarea" ? (
                          <div className="field-edit span-2" key={f.key}>
                            <label className="field-label" htmlFor={f.key}>
                              {f.label}
                            </label>
                            <textarea
                              id={f.key}
                              value={company[f.key]}
                              onChange={handleCompanyField(f.key)}
                              rows={2}
                            />
                          </div>
                        ) : (
                          <div className="field-edit" key={f.key}>
                            <label className="field-label" htmlFor={f.key}>
                              {f.label}
                            </label>
                            <input
                              id={f.key}
                              type={f.type}
                              value={company[f.key]}
                              onChange={handleCompanyField(f.key)}
                            />
                          </div>
                        )
                      )}
                    </div>
                    <div className="panel-actions">
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={cancelCompanyEdit}
                        disabled={savingCompany}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={saveCompany}
                        disabled={savingCompany}
                      >
                        {savingCompany ? "Saving…" : "Save Changes"}
                      </button>
                    </div>
                  </>
                )}
              </section>

              <div className="side-stack">
                {/* ---------------- SECURITY ---------------- */}
                <section className="panel panel-security">
                  <div className="panel-header">
                    <h2>Security</h2>
                  </div>
                  <div className="panel-divider" />

                  {!editPassword ? (
                    <>
                      <div className="field-view">
                        <span className="field-label">Password</span>
                        <span className="field-value mono">••••••••••••</span>
                      </div>
                      <div className="panel-actions">
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => setEditPassword(true)}
                        >
                          Change Password
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="field-grid edit-mode compact">
                        <div className="field-edit">
                          <label className="field-label" htmlFor="currentPassword">
                            Current password
                          </label>
                          <input
                            id="currentPassword"
                            type="password"
                            value={password.currentPassword}
                            onChange={handlePasswordField("currentPassword")}
                          />
                        </div>
                        <div className="field-edit">
                          <label className="field-label" htmlFor="newPassword">
                            New password
                          </label>
                          <input
                            id="newPassword"
                            type="password"
                            value={password.newPassword}
                            onChange={handlePasswordField("newPassword")}
                          />
                        </div>
                        <div className="field-edit">
                          <label className="field-label" htmlFor="confirmPassword">
                            Confirm new password
                          </label>
                          <input
                            id="confirmPassword"
                            type="password"
                            value={password.confirmPassword}
                            onChange={handlePasswordField("confirmPassword")}
                          />
                        </div>
                      </div>
                      <div className="panel-actions">
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={closePasswordEdit}
                          disabled={savingPassword}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={updatePassword}
                          disabled={savingPassword}
                        >
                          {savingPassword ? "Updating…" : "Update Password"}
                        </button>
                      </div>
                    </>
                  )}
                </section>

                {/* ---------------- NOTIFICATIONS ---------------- */}
                <section className="panel panel-notifications">
                  <div className="panel-header">
                    <h2>Notification Settings</h2>
                  </div>
                  <div className="panel-divider" />

                  {!editNotification ? (
                    <>
                      <ul className="notification-list view-mode">
                        {Object.keys(notificationLabels).map((key) => (
                          <li key={key}>
                            <span className="field-label">{notificationLabels[key]}</span>
                            <span
                              className={`state-chip ${
                                notifications[key] ? "state-on" : "state-off"
                              }`}
                            >
                              {notifications[key] ? "ON" : "OFF"}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <div className="panel-actions">
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => setEditNotification(true)}
                        >
                          Update Notifications
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <ul className="notification-list edit-mode">
                        {Object.keys(notificationLabels).map((key) => (
                          <li key={key}>
                            <span className="field-label">{notificationLabels[key]}</span>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={notifications[key]}
                              className={`switch ${notifications[key] ? "switch-on" : ""}`}
                              onClick={toggleNotification(key)}
                            >
                              <span className="switch-knob" />
                            </button>
                          </li>
                        ))}
                      </ul>
                      <div className="panel-actions">
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={cancelNotificationEdit}
                          disabled={savingNotifications}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={saveNotifications}
                          disabled={savingNotifications}
                        >
                          {savingNotifications ? "Saving…" : "Save Changes"}
                        </button>
                      </div>
                    </>
                  )}
                </section>
              </div>
            </main>
          </div>
        )}
      </div>
    </div>
  );
}
