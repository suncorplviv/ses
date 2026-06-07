import React from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate
} from 'react-router-dom';

import { AuthProvider, useAuth } from './AuthProvider';
import AuthPage from './AuthPage';

// Лейаут "Сонячної Корпорації"
import SolarLayout from './SolarLayout'; 

// СТОРІНКИ
import FinanceDashboard from './pages/FinanceDashboard'; 
import Clients from './pages/ClientsPage';
import Deals from './pages/Deals';
import DealDetails from './pages/DealDetails';
import PaymentsPage from './pages/PaymentsPage'; 
import Inventory from './pages/Inventory';
import Staff from './pages/Staff';
import MyTasks from './pages/MyTasks';
import Settings from './pages/Settings';

// ProtectedRoute перевіряє саму наявність авторизації і рендерить Лейаут
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

// РОЗУМНИЙ РЕДІРЕКТ: Визначає, куди кинути користувача при вході
const RoleBasedRedirect = () => {
  const { employeeProfile, loading } = useAuth();
  
  if (loading) return null;
  
  const role = employeeProfile?.role?.toLowerCase() || '';
  const isManagement = role.includes('директор') || role.includes('засновник') || role.includes('менеджер');
  
  // Керівництво йде на Огляд, звичайні працівники - на Завдання
  return <Navigate to={isManagement ? "/overview" : "/tasks"} replace />;
};

// ЗАХИСТ РОУТІВ: Блокує доступ за прямим посиланням для нижчих ролей
const ManagementRoute = ({ children }) => {
  const { employeeProfile, loading } = useAuth();
  
  if (loading) return null;
  
  const role = employeeProfile?.role?.toLowerCase() || '';
  const isManagement = role.includes('директор') || role.includes('засновник') || role.includes('менеджер');
  
  // Якщо немає прав - примусово повертаємо на Завдання
  return isManagement ? children : <Navigate to="/tasks" replace />;
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>

          {/* АВТОРИЗАЦІЯ */}
          <Route path="/auth" element={<AuthPage />} />

          {/* ГОЛОВНІ РЕДІРЕКТИ */}
          <Route path="/" element={<RoleBasedRedirect />} />
          <Route path="/home" element={<RoleBasedRedirect />} /> {/* Сюди кидає AuthPage після логіну */}

          {/* ЗАХИЩЕНІ РОУТИ З ЛЕЙАУТОМ */}
          <Route element={<ProtectedRoute />}>
            
            {/* БАЗОВІ СТОРІНКИ (Доступні всім авторизованим) */}
            <Route path="/tasks" element={<MyTasks />} />
            <Route path="/staff" element={<Staff />} />
            
            {/* СТОРІНКИ КЕРІВНИЦТВА (Захищені ManagementRoute) */}
            <Route path="/overview" element={<ManagementRoute><FinanceDashboard /></ManagementRoute>} />
            <Route path="/deals" element={<ManagementRoute><Deals /></ManagementRoute>} />
            <Route path="/deals/:id" element={<ManagementRoute><DealDetails /></ManagementRoute>} />
            <Route path="/clients" element={<ManagementRoute><Clients /></ManagementRoute>} />
            <Route path="/finance" element={<ManagementRoute><PaymentsPage /></ManagementRoute>} />
            <Route path="/inventory" element={<ManagementRoute><Inventory /></ManagementRoute>} />
            <Route path="/settings" element={<ManagementRoute><Settings /></ManagementRoute>} />

          </Route>

          {/* FALLBACK - Якщо адреса невідома */}
          <Route path="*" element={<RoleBasedRedirect />} />

        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;