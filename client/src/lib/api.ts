/** Typed API client for DeenVault backend */

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error || res.statusText, body.code);
  }
  return res.json();
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

// ─── Auth ───────────────────────────────────────────────

export const auth = {
  login: (email: string, password: string, tenantId: string) =>
    request<{ success: boolean; user: any; tenant: any }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password, tenantId }),
    }),
  logout: () => request<{ success: boolean }>("/api/auth/logout", { method: "POST" }),
  session: () => request<{ authenticated: boolean; userId?: string; tenantId?: string; role?: string }>("/api/auth/session"),
};

// ─── Admin ──────────────────────────────────────────────

export const admin = {
  // Users
  listUsers: (tenantId?: string) =>
    request<{ data: any[]; total: number }>(`/api/admin/users${tenantId ? `?tenantId=${tenantId}` : ""}`),
  createUser: (body: any) =>
    request<{ ok: boolean; user: any }>("/api/admin/users", { method: "POST", body: JSON.stringify(body) }),
  updateUser: (id: string, body: any) =>
    request<{ ok: boolean; user: any }>(`/api/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  resetSession: (id: string) =>
    request<{ ok: boolean }>(`/api/admin/users/${id}/reset-session`, { method: "POST" }),

  // Tenants
  listTenants: () =>
    request<{ data: any[]; total: number }>("/api/admin/tenants"),
  createTenant: (body: any) =>
    request<{ ok: boolean; tenant: any }>("/api/admin/tenants", { method: "POST", body: JSON.stringify(body) }),
  updateTenant: (id: string, body: any) =>
    request<{ ok: boolean; tenant: any }>(`/api/admin/tenants/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  // Agents
  listAgents: () =>
    request<{ data: any[]; total: number }>("/api/admin/agents"),
  createAgent: (body: any) =>
    request<{ ok: boolean; agent: any }>("/api/admin/agents", { method: "POST", body: JSON.stringify(body) }),
  updateAgent: (id: string, body: any) =>
    request<{ ok: boolean; agent: any }>(`/api/admin/agents/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  approveAgent: (id: string) =>
    request<{ ok: boolean; agent: any }>(`/api/admin/agents/${id}/approve`, { method: "POST" }),
  suspendAgent: (id: string, reason?: string) =>
    request<{ ok: boolean; agent: any }>(`/api/admin/agents/${id}/suspend`, { method: "POST", body: JSON.stringify({ reason }) }),

  // Applications
  applicationStats: () =>
    request<any>("/api/admin/applications/stats"),
  listApplications: (status?: string) =>
    request<{ data: any[]; total: number }>(`/api/admin/applications${status ? `?status=${status}` : ""}`),
  createApplication: (body: any) =>
    request<{ ok: boolean; application: any }>("/api/admin/applications", { method: "POST", body: JSON.stringify(body) }),
  reviewApplication: (id: string, reviewNotes?: string) =>
    request<{ ok: boolean; application: any }>(`/api/admin/applications/${id}/review`, { method: "POST", body: JSON.stringify({ reviewNotes }) }),
  acceptApplication: (id: string, body?: any) =>
    request<{ ok: boolean; application: any }>(`/api/admin/applications/${id}/accept`, { method: "POST", body: JSON.stringify(body || {}) }),
  rejectApplication: (id: string, reviewNotes?: string) =>
    request<{ ok: boolean; application: any }>(`/api/admin/applications/${id}/reject`, { method: "POST", body: JSON.stringify({ reviewNotes }) }),
  onboardApplication: (id: string) =>
    request<{ ok: boolean; application: any }>(`/api/admin/applications/${id}/onboard`, { method: "POST" }),

  // Sponsors
  listSponsors: () =>
    request<{ data: any[]; total: number }>("/api/admin/sponsors"),
  createSponsor: (body: any) =>
    request<{ ok: boolean; sponsor: any }>("/api/admin/sponsors", { method: "POST", body: JSON.stringify(body) }),
  updateSponsor: (id: string, body: any) =>
    request<{ ok: boolean; sponsor: any }>(`/api/admin/sponsors/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  // Observability
  severityDistribution: () =>
    request<{ data: any[] }>("/api/admin/severity-distribution"),
  securityEvents: (limit = 10) =>
    request<{ data: any[] }>(`/api/admin/security-events?limit=${limit}`),
  executionVolume: () =>
    request<{ data: any[] }>("/api/admin/execution-volume"),
  agentStatus: () =>
    request<any>("/api/admin/agent-status"),
};
