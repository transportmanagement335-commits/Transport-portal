import { useState } from "react";
import { useNavigate } from "react-router-dom";

import "../../styles/Driver/DriverLogin.css";
import { authAPI } from "../../api";

function DriverLogin() {
  const navigate = useNavigate();

  const [step, setStep] = useState(1); // 1: Phone, 2: OTP
  const [phone, setPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRequestOtp = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await authAPI.requestOtp(phone);
      setStep(2);
    } catch (err) {
      setError(err.message || "Failed to request OTP. Please check your phone number.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const data = await authAPI.verifyOtp(phone, otpCode);
      
      if (data.role !== "driver") {
        throw new Error("Unauthorized driver access");
      }

      localStorage.setItem("access_token", data.access_token);
      localStorage.setItem("refresh_token", data.refresh_token);
      localStorage.setItem("role", data.role);

      navigate("/driver-dashboard");
    } catch (err) {
      setError(err.message || "Invalid OTP");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="driver-container">
      <div className="driver-overlay">
        <div className="driver-left">
          <h1>Driver Portal</h1>
          <p>
            Access trip updates, vehicle details
            and transport assignments securely.
          </p>
        </div>

        <div className="driver-login-card">
          <h2>Driver Login</h2>
          <p className="sub-text">
            {step === 1 ? "Enter your registered phone number" : `Enter the 6-digit OTP sent to ${phone}`}
          </p>

          {error && (
            <div className="error-box">
              {error}
            </div>
          )}

          {step === 1 ? (
            <form onSubmit={handleRequestOtp}>
              <input
                type="tel"
                placeholder="Enter Phone Number"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <button type="submit" disabled={loading}>
                {loading ? "Sending OTP..." : "Get OTP"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp}>
              <input
                type="text"
                placeholder="Enter 6-digit OTP"
                required
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                style={{ letterSpacing: "4px", textAlign: "center", fontSize: "18px", fontWeight: "bold" }}
              />
              <button type="submit" disabled={loading}>
                {loading ? "Verifying..." : "Login"}
              </button>
              
              <div style={{ marginTop: "15px", textAlign: "center" }}>
                <button 
                  type="button" 
                  onClick={handleRequestOtp} 
                  disabled={loading}
                  style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", textDecoration: "underline", padding: 0 }}
                >
                  Resend OTP
                </button>
                <span style={{ margin: "0 10px", color: "#d1d5db" }}>|</span>
                <button 
                  type="button" 
                  onClick={() => setStep(1)} 
                  style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", padding: 0 }}
                >
                  Change Number
                </button>
              </div>
            </form>
          )}

          <div className="register-link" style={{ marginTop: "30px" }}>
            <p style={{ color: "#9ca3af", fontSize: "13px", textAlign: "center" }}>
              Don't have an account? Contact your vendor admin — driver accounts are created by your company.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DriverLogin;