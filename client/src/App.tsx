import { Route, Switch, Redirect } from "wouter";
import { useAuth } from "./lib/auth";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/Login";
import { DashboardPage } from "./pages/Dashboard";
import { TenantsPage } from "./pages/Tenants";
import { UsersPage } from "./pages/Users";
import { AgentsPage } from "./pages/Agents";
import { ApplicationsPage } from "./pages/Applications";
import { SponsorsPage } from "./pages/Sponsors";

export function App() {
  const { loading, authenticated, isAdmin } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500 text-sm">Loading...</div>
      </div>
    );
  }

  if (!authenticated || !isAdmin) {
    return (
      <Switch>
        <Route path="/admin/login" component={LoginPage} />
        <Route><Redirect to="/admin/login" /></Route>
      </Switch>
    );
  }

  return (
    <Layout>
      <Switch>
        <Route path="/admin/dashboard" component={DashboardPage} />
        <Route path="/admin/tenants" component={TenantsPage} />
        <Route path="/admin/users" component={UsersPage} />
        <Route path="/admin/agents" component={AgentsPage} />
        <Route path="/admin/applications" component={ApplicationsPage} />
        <Route path="/admin/sponsors" component={SponsorsPage} />
        <Route path="/admin/login"><Redirect to="/admin/dashboard" /></Route>
        <Route><Redirect to="/admin/dashboard" /></Route>
      </Switch>
    </Layout>
  );
}
