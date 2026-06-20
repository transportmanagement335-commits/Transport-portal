import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FaEye, FaEyeSlash } from "react-icons/fa";

import "../../styles/Admin/AdminLogin.css";
import { BASE_URL } from "../../api";

function AdminLogin() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    setError("");
    setLoading(true);

    try {
      const response = await fetch(
        `${BASE_URL}/auth/login`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true",
          },
          body: JSON.stringify({
            email,
            password,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Login failed");
      }

      if (data.role !== "owner") {
        throw new Error(
          "Unauthorized: You do not have admin access."
        );
      }

      localStorage.setItem(
        "access_token",
        data.access_token
      );

      localStorage.setItem(
        "refresh_token",
        data.refresh_token
      );

      localStorage.setItem(
        "role",
        data.role
      );

      navigate("/admin-dashboard");

    } catch (err) {

      setError(err.message);

    } finally {

      setLoading(false);

    }
  };

  return (
    <div className="admin-container">

      {/* LEFT SECTION */}

      <div className="admin-left">

        <div className="left-content">

          <h1>Transport Management System</h1>

          <p>
            Manage vehicles, drivers, trips and
            transport operations with a smart dashboard.
          </p>

        </div>

      </div>

      {/* RIGHT SECTION */}

      <div className="admin-right">

        <div className="login-card">

          <h2>Admin Login</h2>

          <p>Welcome back Admin</p>

          {error && (
            <div
              style={{
                color: "#ef4444",
                backgroundColor: "#fee2e2",
                padding: "10px",
                borderRadius: "8px",
                marginBottom: "20px",
                fontSize: "14px",
                textAlign: "center",
              }}
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>

            <input
              type="email"
              placeholder="Enter Email Address"
              required
              value={email}
              onChange={(e) =>
                setEmail(e.target.value)
              }
            />

            <div
              style={{
                position: "relative",
                width: "100%",
              }}
            >
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Enter Password"
                required
                value={password}
                onChange={(e) =>
                  setPassword(e.target.value)
                }
                style={{
                  width: "100%",
                  paddingRight: "45px",
                }}
              />

              <span
                onClick={() =>
                  setShowPassword(!showPassword)
                }
                style={{
                  position: "absolute",
                  right: "15px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  cursor: "pointer",
                  color: "#6b7280",
                }}
              >
                {showPassword ? (
                  <FaEyeSlash />
                ) : (
                  <FaEye />
                )}
              </span>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading
                ? "Logging in..."
                : "Login"}
            </button>

          </form>

          <div
            style={{
              textAlign: "center",
              marginTop: "20px",
              fontSize: "14px",
              color: "#6b7280",
            }}
          >
            <p>
              New Admin?

              <Link
                to="/admin-register"
                style={{
                  color: "#2563eb",
                  textDecoration: "none",
                  fontWeight: "600",
                  marginLeft: "5px",
                }}
              >
                Register Here
              </Link>

            </p>
          </div>

        </div>

      </div>

    </div>
  );
}

export default AdminLogin;