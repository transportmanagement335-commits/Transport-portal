/**
 * api.js — Central API utility for the Transport Portal frontend.
 *
 * Features:
 * - Auto-attaches Bearer token from localStorage
 * - On 401, attempts to silently refresh the access token via refresh_token
 * - If refresh fails (refresh token expired/missing), redirects to login
 */

// ─── Backend URL ──────────────────────────────────────────────────────────────
//
//  Priority:
//    1. VITE_SERVER_URL env var  (set in Vercel Dashboard to override this)
//    2. Hardcoded ngrok tunnel   (current active tunnel for production)
//    3. localhost:8000           (local dev fallback)
//
//  To change the ngrok URL: update the NGROK_URL constant below.
// ─────────────────────────────────────────────────────────────────────────────

const NGROK_URL = "https://subcortical-bradley-soniferous.ngrok-free.dev";

// In development (local npm run dev), use localhost.
// In production (Vercel build), use the ngrok URL — unless VITE_SERVER_URL overrides it.
const isLocalDev = typeof window !== "undefined" && window.location.hostname === "localhost";

export const SERVER_URL = (
  import.meta.env.VITE_SERVER_URL ||
  (isLocalDev ? "http://localhost:8000" : NGROK_URL)
).replace(/\/$/, "");

export const BASE_URL    = `${SERVER_URL}/api`;
export const WS_BASE_URL = SERVER_URL.replace(/^https/, "wss").replace(/^http/, "ws") + "/api";

// Keep these exports so existing components that import them don't break.
export const API_HOST     = new URL(SERVER_URL).hostname;
export const API_PORT     = new URL(SERVER_URL).port || (SERVER_URL.startsWith("https") ? "443" : "80");
export const API_PROTOCOL = new URL(SERVER_URL).protocol;
export const WS_PROTOCOL  = SERVER_URL.startsWith("https") ? "wss:" : "ws:";



// ─── Token helpers ────────────────────────────────────────────────────────────

function getToken()  { return localStorage.getItem("access_token");  }
function getRefresh(){ return localStorage.getItem("refresh_token"); }
function getRole()   { return localStorage.getItem("role"); }

function saveTokens(access_token, refresh_token) {
  localStorage.setItem("access_token", access_token);
  if (refresh_token) localStorage.setItem("refresh_token", refresh_token);
}

function clearAuth() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
  localStorage.removeItem("role");
}

function redirectToLogin() {
  const role = getRole();
  clearAuth();
  window.location.href = role === "driver" ? "/driver-login" : "/admin-login";
}

// ─── Silent token refresh ─────────────────────────────────────────────────────

let isRefreshing = false;
let refreshPromise = null;

async function refreshAccessToken() {
  const refresh_token = getRefresh();
  if (!refresh_token) throw new Error("No refresh token");

  const res = await fetch(`${BASE_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token }),
  });

  if (!res.ok) throw new Error("Refresh failed");

  const data = await res.json();
  saveTokens(data.access_token, null);
  return data.access_token;
}

// ─── Core fetch wrapper ───────────────────────────────────────────────────────

async function apiFetch(path, opts = {}, retry = true) {
  const token = getToken();

  const headers = {
    ...(opts.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...opts.headers,
  };

  const res = await fetch(`${BASE_URL}${path}`, { ...opts, headers });

  // 204 No Content
  if (res.status === 204) return null;

  // 401 Unauthorized — try to refresh once
  if (res.status === 401 && retry) {
    try {
      // Deduplicate concurrent refresh calls
      if (!isRefreshing) {
        isRefreshing = true;
        refreshPromise = refreshAccessToken().finally(() => { isRefreshing = false; });
      }
      await refreshPromise;
      // Retry the original request with the new token
      return apiFetch(path, opts, false);
    } catch {
      redirectToLogin();
      throw new Error("Session expired. Please log in again.");
    }
  }

  const data = await res.json();

  if (!res.ok) {
    // Surface a clean error message
    const detail = data.detail;
    if (typeof detail === "string") throw new Error(detail);
    if (Array.isArray(detail))     throw new Error(detail.map((d) => d.msg).join(", "));
    throw new Error(`Request failed (${res.status})`);
  }

  return data;
}

// ─── Auth guard (call on protected pages) ────────────────────────────────────

/**
 * Call this at the top of any protected page.
 * Redirects to login if no token is present at all.
 */
export function requireAuth() {
  if (!getToken() && !getRefresh()) {
    redirectToLogin();
  }
}

export function logout() {
  const refreshToken = getRefresh();
  if (refreshToken) {
    apiFetch("/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refresh_token: refreshToken }),
    }).catch((err) => console.error("Logout request failed:", err));
  }
  clearAuth();
  window.location.href = "/";
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const authAPI = {
  me: () => apiFetch("/auth/me"),
  requestOtp: (phone) => apiFetch("/auth/driver/request-otp", { method: "POST", body: JSON.stringify({ phone }) }),
  verifyOtp: (phone, otp_code) => apiFetch("/auth/driver/verify-otp", { method: "POST", body: JSON.stringify({ phone, otp_code }) }),
};

// ─── General File Upload ──────────────────────────────────────────────────────

export const uploadAPI = {
  uploadFile: (file) => {
    const formData = new FormData();
    formData.append("file", file);
    return apiFetch("/upload/", { method: "POST", body: formData });
  }
};

// ─── Expenses ─────────────────────────────────────────────────────────────────

export const expensesAPI = {
  list: () => apiFetch("/expenses/"),
  create: (data) => apiFetch("/expenses/", { method: "POST", body: JSON.stringify(data) }),
  verifyReceipt: (data) => apiFetch("/expenses/verify-receipt", { method: "POST", body: JSON.stringify(data) }),
  getByTrip: (tripId) => apiFetch(`/expenses/?trip_id=${tripId}`),
  getByVehicle: (vehicleId) => apiFetch(`/expenses/?vehicle_id=${vehicleId}`),
  delete: (id) => apiFetch(`/expenses/${id}`, { method: "DELETE" }),
};

// ─── Vehicles ─────────────────────────────────────────────────────────────────

export const vehiclesAPI = {
  list:   ()           => apiFetch("/vehicles/"),
  get:    (id)         => apiFetch(`/vehicles/${id}`),
  create: (body)       => apiFetch("/vehicles/", { method: "POST", body: JSON.stringify(body) }),
  update: (id, body)   => apiFetch(`/vehicles/${id}`, { method: "PUT",  body: JSON.stringify(body) }),
};

// ─── Admin dashboard ──────────────────────────────────────────────────────────

export const adminAPI = {
  stats:          () => apiFetch("/admin/stats"),
  recentActivity: () => apiFetch("/admin/recent-activity"),
};

// ─── Drivers (admin manages) ──────────────────────────────────────────────────

export const driversAPI = {
  list:   ()     => apiFetch("/auth/drivers-list"),
  create: (body) => apiFetch("/auth/drivers", { method: "POST", body: JSON.stringify(body) }),
};

// ─── Driver dashboard ─────────────────────────────────────────────────────────

export const driverAPI = {
  stats:            () =>        apiFetch("/driver/stats"),
  currentTrip:      () =>        apiFetch("/driver/current-trip"),
  updateTripStatus: (body) =>    apiFetch("/driver/trip-status", { method: "PUT", body: JSON.stringify(body) }),
};

// ─── Trips ────────────────────────────────────────────────────────────────────

export const tripsAPI = {
  list:           ()         => apiFetch("/trips/"),
  get:            (id)       => apiFetch(`/trips/${id}`),
  create:         (body)     => apiFetch("/trips/", { method: "POST", body: JSON.stringify(body) }),
  update:         (id, body) => apiFetch(`/trips/${id}`, { method: "PUT",  body: JSON.stringify(body) }),
  updateFreightDocs: (id, body) => apiFetch(`/trips/${id}/freight-docs`, { method: "PUT", body: JSON.stringify(body) }),
  cancel:         (id)       => apiFetch(`/trips/${id}`, { method: "DELETE" }),
  deleteAll:      ()         => apiFetch("/trips/all", { method: "DELETE" }),
  addDutyLog:     (id, body) => apiFetch(`/trips/${id}/duty-log`, { method: "POST", body: JSON.stringify(body) }),
  updateLocation: (id, body) => apiFetch(`/trips/${id}/location`, { method: "PUT",  body: JSON.stringify(body) }),
};

// ─── Payments ─────────────────────────────────────────────────────────────────

export const paymentsAPI = {
  list:   ()       => apiFetch("/payments/"),
  create: (body)   => apiFetch("/payments/", { method: "POST", body: JSON.stringify(body) }),
  delete: (id)     => apiFetch(`/payments/${id}`, { method: "DELETE" }),
};

// ─── Customers ────────────────────────────────────────────────────────────────

export const customersAPI = {
  list:   ()         => apiFetch("/customers/"),
  get:    (id)       => apiFetch(`/customers/${id}`),
  create: (body)     => apiFetch("/customers/", { method: "POST", body: JSON.stringify(body) }),
  update: (id, body) => apiFetch(`/customers/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  delete: (id)       => apiFetch(`/customers/${id}`, { method: "DELETE" }),
};

// ─── Invoices ─────────────────────────────────────────────────────────────────

export const invoicesAPI = {
  stats:           ()             => apiFetch("/invoices/stats"),
  overdue:         ()             => apiFetch("/invoices/overdue"),
  list:            (params = {})  => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ""))
    ).toString();
    return apiFetch(`/invoices/${qs ? "?" + qs : ""}`);
  },
  get:             (id)           => apiFetch(`/invoices/${id}`),
  create:          (body)         => apiFetch("/invoices/", { method: "POST", body: JSON.stringify(body) }),
  update:          (id, body)     => apiFetch(`/invoices/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  send:            (id)           => apiFetch(`/invoices/${id}/send`, { method: "POST" }),
  sendWhatsApp:    (id)           => apiFetch(`/invoices/send-whatsapp/${id}`, { method: "POST" }),
  recordPayment:   (id, body)     => apiFetch(`/invoices/${id}/payment`, { method: "POST", body: JSON.stringify(body) }),
  delete:          (id)           => apiFetch(`/invoices/${id}`, { method: "DELETE" }),
  fromTrip:        (tripId)       => apiFetch(`/invoices/from-trip/${tripId}`, { method: "POST" }),
  convertProforma: (id, body)     => apiFetch(`/invoices/convert-proforma/${id}`, { method: "POST", body: JSON.stringify(body) }),
};

// ─── Notifications ────────────────────────────────────────────────────────────

export const notificationsAPI = {
  sendWhatsAppMessage: (body) => apiFetch("/send-whatsapp-message", { method: "POST", body: JSON.stringify(body) }),
};
