import React from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import { AuthProvider, useAuth } from "./AuthProvider";
import AuthPage from "./AuthPage";

import SolarLayout from "./SolarLayout";

import FinanceDashboard from "./pages/FinanceDashboard";
import Clients from "./pages/ClientsPage";
import Deals from "./pages/Deals";
import DealDetails from "./pages/DealDetails";
import PaymentsPage from "./pages/PaymentsPage";
import Inventory from "./pages/Inventory";
import Staff from "./pages/Staff";
import MyTasks from "./pages/MyTasks";
import Settings from "./pages/Settings";

const isManagementRole = (role = "") => {
  const normalizedRole = role.toLowerCase();

  return (
    normalizedRole.includes("директор") ||
    normalizedRole.includes("засновник") ||
    normalizedRole.includes("менеджер")
  );
};

const LoadingScreen = () => (
  <div className="flex h-screen w-full items-center justify-center bg-slate-50">
    <div className="h-12 w-12 animate-spin rounded-full border-4 border-amber-500/30 border-t-amber-500" />
  </div>
);

const ProtectedRoute = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return <SolarLayout />;
};

const RoleBasedRedirect = () => {
  const { employeeProfile, loading } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  const role = employeeProfile?.role || "";

  return (
    <Navigate
      to={isManagementRole(role) ? "/overview" : "/tasks"}
      replace
    />
  );
};

const ManagementRoute = ({ children }) => {
  const { employeeProfile, loading } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  const role = employeeProfile?.role || "";

  return isManagementRole(role)
    ? children
    : <Navigate to="/tasks" replace />;
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter basename="/ses">
        <Routes>

          <Route
            path="/auth"
            element={<AuthPage />}
          />

          <Route
            path="/"
            element={<RoleBasedRedirect />}
          />

          <Route
            path="/home"
            element={<RoleBasedRedirect />}
          />

          <Route element={<ProtectedRoute />}>

            <Route
              path="/tasks"
              element={<MyTasks />}
            />

            <Route
              path="/staff"
              element={<Staff />}
            />

            <Route
              path="/overview"
              element={
                <ManagementRoute>
                  <FinanceDashboard />
                </ManagementRoute>
              }
            />

            <Route
              path="/deals"
              element={
                <ManagementRoute>
                  <Deals />
                </ManagementRoute>
              }
            />

            <Route
              path="/deals/:id"
              element={
                <ManagementRoute>
                  <DealDetails />
                </ManagementRoute>
              }
            />

            <Route
              path="/clients"
              element={
                <ManagementRoute>
                  <Clients />
                </ManagementRoute>
              }
            />

            <Route
              path="/finance"
              element={
                <ManagementRoute>
                  <PaymentsPage />
                </ManagementRoute>
              }
            />

            <Route
              path="/inventory"
              element={
                <ManagementRoute>
                  <Inventory />
                </ManagementRoute>
              }
            />

            <Route
              path="/settings"
              element={
                <ManagementRoute>
                  <Settings />
                </ManagementRoute>
              }
            />

          </Route>

          <Route
            path="*"
            element={<RoleBasedRedirect />}
          />

        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;