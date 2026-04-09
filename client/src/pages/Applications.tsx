import { useState, useEffect, useCallback } from "react";
import { admin } from "../lib/api";

const STATUS_COLORS: Record<string, string> = {
  applied: "bg-gray-700 text-gray-300",
  reviewed: "bg-blue-900/50 text-blue-300",
  accepted: "bg-green-900/50 text-green-300",
  rejected: "bg-red-900/50 text-red-300",
  onboarded: "bg-purple-900/50 text-purple-300",
};

export function ApplicationsPage() {
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ applicantName: "", applicantEmail: "", programName: "" });
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const res = await admin.listApplications();
      setApplications(res.data);
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
      await admin.createApplication(form);
      setForm({ applicantName: "", applicantEmail: "", programName: "" });
      setShowCreate(false);
      load();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleAction = async (id: string, action: string) => {
    setActionLoading(id);
    try {
      const notes = reviewNotes[id] || undefined;
      switch (action) {
        case "review": await admin.reviewApplication(id, notes); break;
        case "accept": await admin.acceptApplication(id, { reviewNotes: notes }); break;
        case "reject": await admin.rejectApplication(id, notes); break;
        case "onboard": await admin.onboardApplication(id); break;
      }
      load();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const getActions = (app: any): { label: string; action: string; color: string }[] => {
    switch (app.status) {
      case "applied": return [
        { label: "Review", action: "review", color: "bg-blue-600 hover:bg-blue-700" },
        { label: "Reject", action: "reject", color: "bg-red-600 hover:bg-red-700" },
      ];
      case "reviewed": return [
        { label: "Accept", action: "accept", color: "bg-green-600 hover:bg-green-700" },
        { label: "Reject", action: "reject", color: "bg-red-600 hover:bg-red-700" },
      ];
      case "accepted": return [
        { label: "Onboard", action: "onboard", color: "bg-purple-600 hover:bg-purple-700" },
      ];
      default: return [];
    }
  };

  if (loading) return <div className="text-gray-500 text-sm">Loading...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-100">Applications</h2>
        <button onClick={() => setShowCreate(!showCreate)} className="text-xs bg-accent hover:bg-accent-hover text-white px-3 py-1.5 rounded">
          {showCreate ? "Cancel" : "+ New Application"}
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="bg-surface-card border border-surface-border rounded-lg p-4 mb-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input placeholder="Applicant Name" value={form.applicantName} onChange={(e) => setForm({ ...form, applicantName: e.target.value })}
              className="bg-surface border border-surface-border rounded px-3 py-2 text-sm text-gray-200" required />
            <input placeholder="Email" type="email" value={form.applicantEmail} onChange={(e) => setForm({ ...form, applicantEmail: e.target.value })}
              className="bg-surface border border-surface-border rounded px-3 py-2 text-sm text-gray-200" required />
            <input placeholder="Program Name" value={form.programName} onChange={(e) => setForm({ ...form, programName: e.target.value })}
              className="bg-surface border border-surface-border rounded px-3 py-2 text-sm text-gray-200" />
          </div>
          <button type="submit" className="text-xs bg-accent hover:bg-accent-hover text-white px-4 py-1.5 rounded">Create</button>
        </form>
      )}

      <div className="space-y-3">
        {applications.map((app) => {
          const actions = getActions(app);
          return (
            <div key={app.id} className="bg-surface-card border border-surface-border rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-gray-100">{app.applicantName}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${STATUS_COLORS[app.status] || ""}`}>
                      {app.status.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500">{app.applicantEmail}</div>
                  {app.programName && <div className="text-xs text-gray-400 mt-1">{app.programName}</div>}
                  {app.reviewNotes && (
                    <div className="text-xs text-gray-400 mt-2 border-l-2 border-surface-border pl-2 italic">
                      {app.reviewNotes}
                    </div>
                  )}
                </div>
                <div className="text-[10px] text-gray-500">
                  {new Date(app.createdAt).toLocaleDateString()}
                </div>
              </div>

              {actions.length > 0 && (
                <div className="mt-3 flex items-center gap-2">
                  <input
                    placeholder="Review notes (optional)"
                    value={reviewNotes[app.id] || ""}
                    onChange={(e) => setReviewNotes({ ...reviewNotes, [app.id]: e.target.value })}
                    className="flex-1 bg-surface border border-surface-border rounded px-2 py-1 text-xs text-gray-300"
                  />
                  {actions.map((a) => (
                    <button
                      key={a.action}
                      onClick={() => handleAction(app.id, a.action)}
                      disabled={actionLoading === app.id}
                      className={`text-[11px] text-white px-2 py-1 rounded ${a.color} disabled:opacity-50`}
                    >
                      {actionLoading === app.id ? "..." : a.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {applications.length === 0 && (
          <div className="text-xs text-gray-500 text-center py-8">No applications found</div>
        )}
      </div>
    </div>
  );
}
