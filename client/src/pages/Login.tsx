import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "../lib/auth";

export function LoginPage() {
  const { login } = useAuth();
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password, tenantId);
      navigate("/admin/dashboard");
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <div className="w-full max-w-sm">
        <div className="bg-surface-card border border-surface-border rounded-lg p-6">
          <h1 className="text-lg font-semibold text-gray-100 mb-1">DeenVault Admin</h1>
          <p className="text-xs text-gray-500 mb-6">Sign in to the governance console</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Tenant ID</label>
              <input
                type="text"
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-accent"
                placeholder="UUID"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-accent"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-accent"
                required
              />
            </div>

            {error && (
              <div className="text-xs text-red-400 bg-red-900/20 border border-red-900/30 rounded p-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent hover:bg-accent-hover text-white text-sm font-medium py-2 rounded transition-colors disabled:opacity-50"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
