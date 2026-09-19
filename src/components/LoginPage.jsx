import React, { useState } from "react";
import { Lock, User, ShieldCheck, ArrowRight, AlertCircle } from "lucide-react";
import { authenticateUser } from "../utils/supabaseClient";

export default function LoginPage({ onLoginSuccess }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg("");

    if (!username.trim() || !password.trim()) {
      setErrorMsg("Harap masukkan username dan password.");
      return;
    }

    try {
      setIsLoading(true);
      const res = await authenticateUser(username, password);
      if (res.success) {
        onLoginSuccess(res.user);
      } else {
        setErrorMsg(res.message || "Username atau password tidak sesuai.");
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Terjadi kendala saat menghubungkan ke database.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-screen-overlay">
      <div className="login-card-container">
        {/* Brand Header */}
        <div className="login-brand-header">
          <div className="login-brand-icon">
            <ShieldCheck size={26} />
          </div>
          <h1 className="login-brand-title">Engkong Stuff</h1>
          <p className="login-brand-subtitle">
            Sistem Pemindai Barcode, Retur, & Inventaris Gudang
          </p>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="login-error-alert">
            <AlertCircle size={16} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-input-group">
            <label className="login-input-label">Username</label>
            <div className="login-input-wrapper">
              <User size={16} className="login-input-icon" />
              <input
                type="text"
                className="login-input-field"
                placeholder="Masukkan username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="off"
                autoFocus
                required
              />
            </div>
          </div>

          <div className="login-input-group">
            <label className="login-input-label">Password</label>
            <div className="login-input-wrapper">
              <Lock size={16} className="login-input-icon" />
              <input
                type="password"
                className="login-input-field"
                placeholder="Masukkan password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <button
            type="submit"
            className="login-submit-btn"
            disabled={isLoading}
          >
            {isLoading ? "Memverifikasi..." : "Masuk ke Sistem"}
            <ArrowRight size={16} />
          </button>
        </form>

        <div className="login-card-footer">
          Database terhubung ke <strong>Supabase Cloud PostgreSQL</strong>
        </div>
      </div>
    </div>
  );
}
