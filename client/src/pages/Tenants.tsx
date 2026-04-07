import { useState, useEffect } from "react";
import { admin, ApiError } from "../lib/api";

export function TenantsPage() {
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", primaryRegion: "NG" as "NG" | "EG" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    try {
      const res = await admin.listTenants();
      setTenants(res.data);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await admin.createTenant({ name: form.name, primaryRegion: form.primaryRegion, regionLocked: true });
      setShowCreate(false);
      setForm({ name: "", primaryRegion: "NG" });
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "suspended" : "active";
    try {
      await admin.updateTenant(id, { status: newStatus });
      await load();
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (loading) return <div className="text-gray-500 text-sm">Loading tenants...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-100">Tenants</h2>
        <button onClick={() => setShowCreate(!showCreate)} className="bg-accent hover:bg-accent-hover text-white text-xs px-3 py-1.5 rounded transition-colors">
          {showCreate ? "Cancel" : "Create Tenant"}
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="bg-surface-card border border-surface-border rounded-lg p-4 mb-4 space-y-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Name</label>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-accent" required minLength={2} />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Region</label>
            <select value={form.primaryRegion} onChange={(e) => setForm({ ...form, primaryRegion: e.target.value as "NG" | "EG" })} className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-accent">
              <option value="NG">Nigeria (NG)</option>
              <option value="EG">Egypt (EG)</option>
            </select>
          </div>
          {error && <div className="text-xs text-red-400">{error}</div>}
          <button type="submit" disabled={submitting} className="bg-accent hover:bg-accent-hover text-white text-xs px-3 py-1.5 rounded transition-colors disabled:opacity-50">
            {submitting ? "Creating..." : "Create"}
          </button>
        </form>
      )}

      <div className="bg-surface-card border border-surface-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 border-b border-surface-border">
              <th className="text-left p-3">Name</th>
              <th className="text-left p-3">Region</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Created</th>
              <th className="text-left p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((t) => (
              <tr key={t.id} className="border-b border-surface-border/50 hover:bg-surface-hover">
                <td className="p-3 text-gray-200">{t.name}</td>
                <td className="p-3 text-gray-400">{t.primaryRegion}</td>
                <td className="p-3">
                  <span className={`text-xs px-1.5 py-0.5 rounded ${t.status === "active" ? "bg-green-900/30 text-green-400" : "bg-red-900/30 text-red-400"}`}>
                    {t.status}
                  </span>
                </td>
                <td className="p-3 text-gray-500 text-xs">{new Date(t.createdAt).toLocaleDateString()}</td>
                <td className="p-3">
                  <button onClick={() => toggleStatus(t.id, t.status)} className="text-xs text-gray-400 hover:text-gray-200 transition-colors">
                    {t.status === "active" ? "Suspend" : "Activate"}
                  </button>
                </td>
              </tr>
            ))}
            {tenants.length === 0 && (
              <tr><td colSpan={5} className="p-4 text-center text-gray-500 text-xs">No tenants found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
