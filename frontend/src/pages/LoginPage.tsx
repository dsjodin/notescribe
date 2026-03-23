import { useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../api";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await login(password);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Wrong password");
    }
  }

  return (
    <div className="login-wrapper">
      <div className="login-box">
        <h1>NoteScribe</h1>
        <p>Enter password to continue</p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
            {error && <div className="error-msg">{error}</div>}
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: "100%" }}>
            Log in
          </button>
        </form>
      </div>
    </div>
  );
}
