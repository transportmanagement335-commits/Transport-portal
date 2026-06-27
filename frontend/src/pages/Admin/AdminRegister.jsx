import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FaEye, FaEyeSlash } from "react-icons/fa";

import "../../styles/Admin/AdminRegister.css";
import { BASE_URL } from "../../api";

function AdminRegister() {

  const navigate = useNavigate();

  const [showPassword, setShowPassword] =
    useState(false);

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    company_name: "",
    gst_number: "",
    service_type: "Tankers",
    password: "",
  });

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [passwordReqs, setPasswordReqs] =
    useState({
      length: false,
      upper: false,
      lower: false,
      number: false,
      special: false,
    });

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handlePasswordChange = (e) => {

    const value = e.target.value;

    setFormData({
      ...formData,
      password: value,
    });

    setPasswordReqs({
      length: value.length >= 8,
      upper: /[A-Z]/.test(value),
      lower: /[a-z]/.test(value),
      number: /\d/.test(value),
      special: /[@$!%*?&#^]/.test(value),
    });
  };

  const handleSubmit = async (e) => {

    e.preventDefault();

    setError("");

    const emailRegex =
      /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

    if (!emailRegex.test(formData.email)) {
      setError(
        "Please enter a valid email address"
      );
      return;
    }

    const passwordRegex =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^])[A-Za-z\d@$!%*?&#^]{8,}$/;

    if (!passwordRegex.test(formData.password)) {
      setError(
        "Password must be at least 8 characters long, include an uppercase letter, a lowercase letter, a number, and a special character"
      );
      return;
    }

    setLoading(true);

    try {

      const response = await fetch(
        `${BASE_URL}/auth/register/owner`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(formData),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "Registration failed"
        );
      }

      navigate("/admin-login");

    } catch (err) {

      setError(err.message);

    } finally {

      setLoading(false);

    }
  };

  return (
    <div className="register-container">

      <div className="register-left">

        <div className="left-content">

          <h1>Admin Portal</h1>

          <p>
            Register your transport company
            to manage fleet, assign drivers,
            and monitor transport operations efficiently.
          </p>

        </div>

      </div>

      <div className="register-right">

        <div className="register-card">

          <h2>Create Account</h2>

          <p className="sub-title">
            Admin / Owner Registration
          </p>

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>

            <div className="input-group">

              <label>Full Name</label>

              <input
                type="text"
                name="name"
                placeholder="Enter Full Name"
                required
                value={formData.name}
                onChange={handleChange}
              />

            </div>

            <div className="input-group">

              <label>Email Address</label>

              <input
                type="email"
                name="email"
                placeholder="Enter Email Address"
                required
                value={formData.email}
                onChange={handleChange}
              />

            </div>

            <div className="input-group">

              <label>Phone Number</label>

              <input
                type="text"
                name="phone"
                placeholder="Enter Phone Number"
                maxLength="15"
                required
                value={formData.phone}
                onChange={handleChange}
              />

            </div>

            <div className="input-group">

              <label>Company Name</label>

              <input
                type="text"
                name="company_name"
                placeholder="Enter Company Name"
                required
                value={formData.company_name}
                onChange={handleChange}
              />

            </div>

            <div className="input-group">

              <label>GST Number (Optional)</label>

              <input
                type="text"
                name="gst_number"
                placeholder="Enter GST Number"
                value={formData.gst_number}
                onChange={handleChange}
              />

            </div>

            <div className="input-group">

              <label>Type of Service</label>

              <select
                name="service_type"
                value={formData.service_type}
                onChange={handleChange}
                required
              >
                <option value="Tankers">Tankers</option>
                <option value="Busses">Busses</option>
                <option value="Trucks">Trucks</option>
              </select>

            </div>

            <div className="input-group">

              <label>Password</label>

              <div
                style={{
                  position: "relative",
                }}
              >
                <input
                  type={
                    showPassword
                      ? "text"
                      : "password"
                  }
                  name="password"
                  placeholder="Enter Password"
                  required
                  value={formData.password}
                  onChange={handlePasswordChange}
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

              <div
                className="password-requirements"
                style={{
                  fontSize: "13px",
                  marginTop: "8px",
                  color: "#6b7280",
                  display: "flex",
                  flexDirection: "column",
                  gap: "3px",
                }}
              >
                <span
                  style={{
                    color: passwordReqs.length
                      ? "#16a34a"
                      : "#ef4444",
                  }}
                >
                  {passwordReqs.length
                    ? "✓"
                    : "○"}{" "}
                  At least 8 characters
                </span>

                <span
                  style={{
                    color: passwordReqs.upper
                      ? "#16a34a"
                      : "#ef4444",
                  }}
                >
                  {passwordReqs.upper
                    ? "✓"
                    : "○"}{" "}
                  One uppercase letter
                </span>

                <span
                  style={{
                    color: passwordReqs.lower
                      ? "#16a34a"
                      : "#ef4444",
                  }}
                >
                  {passwordReqs.lower
                    ? "✓"
                    : "○"}{" "}
                  One lowercase letter
                </span>

                <span
                  style={{
                    color: passwordReqs.number
                      ? "#16a34a"
                      : "#ef4444",
                  }}
                >
                  {passwordReqs.number
                    ? "✓"
                    : "○"}{" "}
                  One number
                </span>

              </div>

            </div>

            <button
              type="submit"
              className="register-btn"
              disabled={loading}
            >
              {loading
                ? "Registering..."
                : "Register"}
            </button>

          </form>

          <div className="login-link">

            <p>
              Already have an account?

              <Link to="/admin-login">
                Login Here
              </Link>

            </p>

          </div>

        </div>

      </div>

    </div>
  );
}

export default AdminRegister;