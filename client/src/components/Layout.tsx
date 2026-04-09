import { Link, useLocation } from "wouter";
import { useAuth } from "../lib/auth";

const NAV_ITEMS = [
  { path: "/admin/dashboard", label: "Dashboard", roles: ["super_admin", "tenant_admin", "admin"] },
  { path: "/admin/applications", label: "Applications", roles: ["super_admin", "tenant_admin", "admin"] },
  { path: "/admin/sponsors", label: "Sponsors", roles: ["super_admin", "tenant_admin", "admin"] },
  { path: "/admin/tenants", label: "Tenants", roles: ["super_admin"] },
  { path: "/admin/users", label: "Users", roles: ["super_admin", "tenant_admin", "admin"] },
  { path: "/admin/agents", label: "Agents", roles: ["super_admin", "tenant_admin", "admin"] },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const { role, logout } = useAuth();
  const [location] = useLocation();

  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(role || ""));

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-56 bg-surface-card border-r border-surface-border flex flex-col">
        <div className="p-4 border-b border-surface-border">
          <h1 className="text-sm font-semibold text-gray-200 tracking-wide">DEENVAULT</h1>
          <p className="text-xs text-gray-500 mt-0.5">Admin Console</p>
        </div>

        <nav className="flex-1 py-2">
          {visibleItems.map((item) => (
            <Link key={item.path} href={item.path}>
              <div
                className={`px-4 py-2 text-sm cursor-pointer transition-colors ${
                  location === item.path
                    ? "bg-accent/10 text-accent border-r-2 border-accent"
                    : "text-gray-400 hover:text-gray-200 hover:bg-surface-hover"
                }`}
              >
                {item.label}
              </div>
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-surface-border">
          <div className="text-xs text-gray-500 mb-2">{role?.replace("_", " ")}</div>
          <button
            onClick={logout}
            className="text-xs text-gray-400 hover:text-red-400 transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-6 overflow-auto">{children}</main>
    </div>
  );
}
