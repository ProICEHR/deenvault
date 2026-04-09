import { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { admin } from "../lib/api";
import { useAuth } from "../lib/auth";

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: "#ef4444",
  HIGH: "#f97316",
  MEDIUM: "#eab308",
  LOW: "#22c55e",
  INFO: "#3b82f6",
};

const STATUS_COLORS: Record<string, string> = {
  applied: "#6b7280",
  reviewed: "#3b82f6",
  accepted: "#22c55e",
  rejected: "#ef4444",
  onboarded: "#8b5cf6",
};

function KpiCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-surface-card border border-surface-border rounded-lg p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="text-2xl font-semibold text-gray-100">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

export function DashboardPage() {
  const { isSuperAdmin } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [appStats, usersRes, agentsRes, severityRes, eventsRes] = await Promise.all([
          admin.applicationStats().catch(() => null),
          admin.listUsers(),
          admin.agentStatus(),
          admin.severityDistribution().catch(() => ({ data: [] })),
          admin.securityEvents(5).catch(() => ({ data: [] })),
        ]);

        let tenantsRes = { data: [], total: 0 };
        if (isSuperAdmin) {
          tenantsRes = await admin.listTenants().catch(() => ({ data: [], total: 0 }));
        }

        setData({
          appStats,
          users: usersRes,
          agents: agentsRes,
          tenants: tenantsRes,
          severity: severityRes.data,
          events: eventsRes.data,
        });
      } catch (err) {
        console.error("Dashboard load error:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [isSuperAdmin]);

  if (loading) return <div className="text-gray-500 text-sm">Loading dashboard...</div>;
  if (!data) return <div className="text-red-400 text-sm">Failed to load dashboard data</div>;

  const appStatusData = data.appStats?.byStatus
    ? Object.entries(data.appStats.byStatus)
        .map(([name, value]) => ({ name, value: Number(value), color: STATUS_COLORS[name] || "#6b7280" }))
        .filter((d) => d.value > 0)
    : [];

  const agentStatusData = [
    { name: "Active", value: data.agents?.summary?.active || 0, color: "#22c55e" },
    { name: "Draft", value: data.agents?.summary?.draft || 0, color: "#6b7280" },
    { name: "Suspended", value: data.agents?.summary?.suspended || 0, color: "#ef4444" },
  ].filter((d) => d.value > 0);

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-100 mb-4">Dashboard</h2>

      {/* Academy KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <KpiCard
          label="Total Applications"
          value={data.appStats?.totalApplications || 0}
          sub={`${data.appStats?.pendingReview || 0} pending review`}
        />
        <KpiCard
          label="Accepted Learners"
          value={data.appStats?.acceptedLearners || 0}
          sub={`${data.appStats?.activeLearners || 0} onboarded`}
        />
        <KpiCard
          label="Sponsors"
          value={data.appStats?.totalSponsors || 0}
        />
        {isSuperAdmin && <KpiCard label="Tenants" value={data.tenants.total} />}
        <KpiCard label="Users" value={data.users.total} />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Application Pipeline */}
        <div className="bg-surface-card border border-surface-border rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-300 mb-3">Application Pipeline</h3>
          {appStatusData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={appStatusData}>
                <XAxis dataKey="name" tick={{ fill: "#9ca3af", fontSize: 11 }} />
                <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: "#1a1d27", border: "1px solid #2e3345", borderRadius: 6, fontSize: 12 }}
                  labelStyle={{ color: "#9ca3af" }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {appStatusData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-xs text-gray-500 py-8 text-center">No applications yet</div>
          )}
        </div>

        {/* Agent Status */}
        <div className="bg-surface-card border border-surface-border rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-300 mb-3">Agents by Status</h3>
          {agentStatusData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={agentStatusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, value }) => `${name}: ${value}`}>
                  {agentStatusData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: "#1a1d27", border: "1px solid #2e3345", borderRadius: 6, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-xs text-gray-500 py-8 text-center">No agents registered</div>
          )}
        </div>
      </div>

      {/* Recent Security Events (Audit Trail) */}
      <div className="bg-surface-card border border-surface-border rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-300 mb-3">Recent Admin Actions & Security Events</h3>
        {data.events.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-surface-border">
                  <th className="text-left py-2 pr-4">Severity</th>
                  <th className="text-left py-2 pr-4">Type</th>
                  <th className="text-left py-2 pr-4">Details</th>
                  <th className="text-left py-2 pr-4">Time</th>
                </tr>
              </thead>
              <tbody>
                {data.events.map((evt: any) => (
                  <tr key={evt.id} className="border-b border-surface-border/50">
                    <td className="py-2 pr-4">
                      <span
                        className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium"
                        style={{ backgroundColor: (SEVERITY_COLORS[evt.severity] || "#6b7280") + "22", color: SEVERITY_COLORS[evt.severity] || "#6b7280" }}
                      >
                        {evt.severity}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-gray-300">{evt.eventType}</td>
                    <td className="py-2 pr-4 text-gray-400 max-w-[200px] truncate">
                      {evt.details?.action || JSON.stringify(evt.details).substring(0, 50)}
                    </td>
                    <td className="py-2 text-gray-500">{new Date(evt.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-xs text-gray-500 py-4 text-center">No events recorded</div>
        )}
      </div>
    </div>
  );
}
