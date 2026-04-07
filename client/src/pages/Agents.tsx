import { useState, useEffect } from "react";
import { admin } from "../lib/api";

export function AgentsPage() {
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: "", description: "", agentType: "general" as string,
    objective: "", policyVersion: "v1.2",
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    try {
      const res = await admin.listAgents();
      setAgents(res.data);
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
      await admin.createAgent(form);
      setShowCreate(false);
      setForm({ name: "", description: "", agentType: "general", objective: "", policyVersion: "v1.2" });
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const approve = async (id: string) => {
    try {
      await admin.approveAgent(id);
      await load();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const suspend = async (id: string) => {
    const reason = prompt("Suspension reason (optional):");
    try {
      await admin.suspendAgent(id, reason || undefined);
      await load();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const statusColors: Record<string, string> = {
    active: "bg-green-900/30 text-green-400",
    draft: "bg-gray-700/30 text-gray-400",
    under_review: "bg-yellow-900/30 text-yellow-400",
    suspended: "bg-red-900/30 text-red-400",
  };

  if (loading) return <div className="text-gray-500 text-sm">Loading agents...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-100">Agents</h2>
        <button onClick={() => setShowCreate(!showCreate)} className="bg-accent hover:bg-accent-hover text-white text-xs px-3 py-1.5 rounded transition-colors">
          {showCreate ? "Cancel" : "Create Agent"}
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="bg-surface-card border border-surface-border rounded-lg p-4 mb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Name</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-accent" required minLength={2} />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Type</label>
              <select value={form.agentType} onChange={(e) => setForm({ ...form, agentType: e.target.value })} className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-accent">
                <option value="general">General</option>
                <option value="policy_check">Policy Check</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Description</label>
            <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-accent" required minLength={2} />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Objective (governs agent behavior)</label>
            <textarea value={form.objective} onChange={(e) => setForm({ ...form, objective: e.target.value })} className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-accent h-20 resize-none" required minLength={10} />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Policy Version</label>
            <input type="text" value={form.policyVersion} onChange={(e) => setForm({ ...form, policyVersion: e.target.value })} className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-accent max-w-[120px]" required />
          </div>
          {error && <div className="text-xs text-red-400">{error}</div>}
          <button type="submit" disabled={submitting} className="bg-accent hover:bg-accent-hover text-white text-xs px-3 py-1.5 rounded transition-colors disabled:opacity-50">
            {submitting ? "Creating..." : "Create Agent"}
          </button>
        </form>
      )}

      <div className="bg-surface-card border border-surface-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 border-b border-surface-border">
              <th className="text-left p-3">Name</th>
              <th className="text-left p-3">Type</th>
              <th className="text-left p-3">Policy</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Approved</th>
              <th className="text-left p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((a) => (
              <tr key={a.id} className="border-b border-surface-border/50 hover:bg-surface-hover">
                <td className="p-3">
                  <div className="text-gray-200">{a.name}</div>
                  {a.description && <div className="text-[11px] text-gray-500 mt-0.5 truncate max-w-[200px]">{a.description}</div>}
                </td>
                <td className="p-3 text-gray-400 text-xs">{a.agentType}</td>
                <td className="p-3 text-gray-400 text-xs">{a.policyVersion}</td>
                <td className="p-3">
                  <span className={`text-xs px-1.5 py-0.5 rounded ${statusColors[a.status] || "bg-gray-700/30 text-gray-400"}`}>
                    {a.status}
                  </span>
                </td>
                <td className="p-3">
                  {a.approved ? (
                    <span className="text-xs text-green-400">Yes</span>
                  ) : (
                    <span className="text-xs text-gray-500">No</span>
                  )}
                </td>
                <td className="p-3 space-x-2">
                  {!a.approved && a.status !== "suspended" && (
                    <button onClick={() => approve(a.id)} className="text-xs text-green-400 hover:text-green-300 transition-colors">
                      Approve
                    </button>
                  )}
                  {a.status !== "suspended" && (
                    <button onClick={() => suspend(a.id)} className="text-xs text-red-400 hover:text-red-300 transition-colors">
                      Suspend
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {agents.length === 0 && (
              <tr><td colSpan={6} className="p-4 text-center text-gray-500 text-xs">No agents registered</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Review Notes */}
      {agents.some((a) => a.reviewNotes) && (
        <div className="mt-4 bg-surface-card border border-surface-border rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-300 mb-2">Review Notes</h3>
          {agents.filter((a) => a.reviewNotes).map((a) => (
            <div key={a.id} className="text-xs text-gray-400 mb-1">
              <span className="text-gray-300">{a.name}:</span> {a.reviewNotes}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
