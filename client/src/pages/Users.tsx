import { useState, useEffect } from "react";
import { admin } from "../lib/api";

export function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ email: "", name: "", role: "student" as string, password: "", mustChangePassword: true });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    try {
      const res = await admin.listUsers();
      setUsers(res.data);
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
      await admin.createUser({ email: form.email, name: form.name || undefined, role: form.role, password: form.password, mustChangePassword: form.mustChangePassword });
      setShowCreate(false);
      setForm({ email: "", name: "", role: "student", password: "", mustChangePassword: true });
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleStatus = async (id: string, current: string) => {
    try {
      await admin.updateUser(id, { status: current === "active" ? "suspended" : "active" });
      await load();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const resetSession = async (id: string) => {
    try {
      await admin.resetSession(id);
      alert("Session invalidated");
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (loading) return <div className="text-gray-500 text-sm">Loading users...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-100">Users</h2>
        <button onClick={() => setShowCreate(!showCreate)} className="bg-accent hover:bg-accent-hover text-white text-xs px-3 py-1.5 rounded transition-colors">
          {showCreate ? "Cancel" : "Create User"}
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="bg-surface-card border border-surface-border rounded-lg p-4 mb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-accent" required />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Name</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-accent" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Role</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-accent">
                <option value="tenant_admin">Tenant Admin</option>
                <option value="instructor">Instructor</option>
                <option value="student">Student</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Password (min 12 chars)</label>
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-accent" required minLength={12} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-400">
            <input type="checkbox" checked={form.mustChangePassword} onChange={(e) => setForm({ ...form, mustChangePassword: e.target.checked })} className="rounded" />
            Require password change on first login
          </label>
          {error && <div className="text-xs text-red-400">{error}</div>}
          <button type="submit" disabled={submitting} className="bg-accent hover:bg-accent-hover text-white text-xs px-3 py-1.5 rounded transition-colors disabled:opacity-50">
            {submitting ? "Creating..." : "Create User"}
          </button>
        </form>
      )}

      <div className="bg-surface-card border border-surface-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 border-b border-surface-border">
              <th className="text-left p-3">Email</th>
              <th className="text-left p-3">Name</th>
              <th className="text-left p-3">Role</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-surface-border/50 hover:bg-surface-hover">
                <td className="p-3 text-gray-200">{u.email}</td>
                <td className="p-3 text-gray-400">{u.name || "—"}</td>
                <td className="p-3"><span className="text-xs px-1.5 py-0.5 rounded bg-surface text-gray-300">{u.role}</span></td>
                <td className="p-3">
                  <span className={`text-xs px-1.5 py-0.5 rounded ${u.status === "active" ? "bg-green-900/30 text-green-400" : "bg-red-900/30 text-red-400"}`}>
                    {u.status}
                  </span>
                </td>
                <td className="p-3 space-x-2">
                  <button onClick={() => toggleStatus(u.id, u.status)} className="text-xs text-gray-400 hover:text-gray-200 transition-colors">
                    {u.status === "active" ? "Suspend" : "Activate"}
                  </button>
                  <button onClick={() => resetSession(u.id)} className="text-xs text-orange-400 hover:text-orange-300 transition-colors">
                    Reset Session
                  </button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={5} className="p-4 text-center text-gray-500 text-xs">No users found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
