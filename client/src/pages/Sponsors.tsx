import { useState, useEffect, useCallback } from "react";
import { admin } from "../lib/api";

export function SponsorsPage() {
  const [sponsors, setSponsors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", contactEmail: "" });

  const load = useCallback(async () => {
    try {
      const res = await admin.listSponsors();
      setSponsors(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await admin.createSponsor(form);
      setForm({ name: "", description: "", contactEmail: "" });
      setShowCreate(false);
      load();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await admin.updateSponsor(id, { status });
      load();
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (loading) return <div className="text-gray-500 text-sm">Loading...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-100">Sponsors</h2>
        <button onClick={() => setShowCreate(!showCreate)} className="text-xs bg-accent hover:bg-accent-hover text-white px-3 py-1.5 rounded">
          {showCreate ? "Cancel" : "+ New Sponsor"}
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="bg-surface-card border border-surface-border rounded-lg p-4 mb-4 space-y-3">
          <input placeholder="Sponsor Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-gray-200" required />
          <input placeholder="Contact Email" type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
            className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-gray-200" />
          <textarea placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-gray-200 h-20" />
          <button type="submit" className="text-xs bg-accent hover:bg-accent-hover text-white px-4 py-1.5 rounded">Create</button>
        </form>
      )}

      <div className="space-y-3">
        {sponsors.map((s) => (
          <div key={s.id} className="bg-surface-card border border-surface-border rounded-lg p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-gray-100">{s.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                    s.status === "active" ? "bg-green-900/50 text-green-300" :
                    s.status === "completed" ? "bg-blue-900/50 text-blue-300" :
                    "bg-gray-700 text-gray-300"
                  }`}>
                    {s.status.toUpperCase()}
                  </span>
                </div>
                {s.contactEmail && <div className="text-xs text-gray-500">{s.contactEmail}</div>}
                {s.description && <div className="text-xs text-gray-400 mt-1">{s.description}</div>}
              </div>
              <div className="flex gap-1">
                {s.status === "active" && (
                  <button onClick={() => handleStatusChange(s.id, "inactive")}
                    className="text-[11px] text-gray-400 hover:text-red-400 px-2 py-1">Deactivate</button>
                )}
                {s.status === "inactive" && (
                  <button onClick={() => handleStatusChange(s.id, "active")}
                    className="text-[11px] text-gray-400 hover:text-green-400 px-2 py-1">Activate</button>
                )}
              </div>
            </div>
          </div>
        ))}

        {sponsors.length === 0 && (
          <div className="text-xs text-gray-500 text-center py-8">No sponsors found</div>
        )}
      </div>
    </div>
  );
}
