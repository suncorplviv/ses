import React from 'react';
import {
  HashRouter,
  Routes,
  Route,
  Navigate
} from 'react-router-dom';

import { AuthProvider, useAuth } from './AuthProvider';
import AuthPage from './AuthPage';

import SolarLayout from './SolarLayout';

import FinanceDashboard from './pages/FinanceDashboard';
import Clients from './pages/ClientsPage';
import Deals from './pages/Deals';
import DealDetails from './pages/DealDetails';
import PaymentsPage from './pages/PaymentsPage';
import Inventory from './pages/Inventory';
import Staff from './pages/Staff';
import MyTasks from './pages/MyTasks';
import Settings from './pages/Settings';

const ProtectedRoute = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-50">
        <div className="w-12 h-12 border-4 border-amber-500/30 border-t-amber-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return <SolarLayout />;
};

const RoleBasedRedirect = () => {
  const { employeeProfile, loading } = useAuth();

  if (loading) return null;

  const role = employeeProfile?.role?.toLowerCase() || '';

  const isManagement =
    role.includes('директор') ||
    role.includes('засновник') ||
    role.includes('менеджер');

  return (
    <Navigate
      to={isManagement ? "/overview" : "/tasks"}
      replace
    />
  );
};

const ManagementRoute = ({ children }) => {
  const { employeeProfile, loading } = useAuth();

  if (loading) return null;

  const role = employeeProfile?.role?.toLowerCase() || '';

  const isManagement =
    role.includes('директор') ||
    role.includes('засновник') ||
    role.includes('менеджер');

  return isManagement
    ? children
    : <Navigate to="/tasks" replace />;
};

function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>

          {/* Авторизація */}
          <Route path="/auth" element={<AuthPage />} />

          {/* Головні редіректи */}
          <Route path="/" element={<RoleBasedRedirect />} />
          <Route path="/home" element={<RoleBasedRedirect />} />

          {/* Захищені маршрути */}
          <Route element={<ProtectedRoute />}>

            {/* Доступні всім */}
            <Route path="/tasks" element={<MyTasks />} />
            <Route path="/staff" element={<Staff />} />

            {/* Тільки керівництво */}
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

          {/* Якщо маршрут невідомий */}
          <Route path="*" element={<RoleBasedRedirect />} />

        </Routes>
      </HashRouter>
    </AuthProvider>
  );
}

export default App;