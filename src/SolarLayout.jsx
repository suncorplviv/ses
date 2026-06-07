import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { 
  FaChartLine, FaSolarPanel, FaUsers, FaMoneyBillWave, FaWarehouse, 
  FaUserTie, FaTasks, FaSignOutAlt, FaBars, FaTimes 
} from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';

import logoUrl from './logo.svg';
import { useAuth } from './AuthProvider';

const MotionDiv = motion.div;
const MotionAside = motion.aside;

// Меню без "Налаштувань", оскільки їх прибрали для всіх
const navItems = [
  { name: 'Огляд', path: '/overview', icon: FaChartLine },
  { name: 'Угоди', path: '/deals', icon: FaSolarPanel },
  { name: 'Клієнти', path: '/clients', icon: FaUsers },
  { name: 'Фінанси', path: '/finance', icon: FaMoneyBillWave },
  { name: 'Склад', path: '/inventory', icon: FaWarehouse },
  { name: 'Команда', path: '/staff', icon: FaUserTie },
  { name: 'Завдання', path: '/tasks', icon: FaTasks },
];

export default function SolarLayout() {
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  const { employeeProfile, signOut } = useAuth();

  // Логіка перевірки ролі (Керівництво чи звичайний працівник)
  const userRole = employeeProfile?.role?.toLowerCase() || '';
  const isManagement = userRole.includes('директор') || userRole.includes('засновник') || userRole.includes('менеджер');

  // Фільтруємо пункти меню залежно від прав доступу
  const visibleNavItems = navItems.filter(item => {
    if (isManagement) return true; // Керівництво бачить усе
    // Звичайні працівники бачать лише "Команду" та "Завдання"
    return item.path === '/tasks' || item.path === '/staff';
  });

  const getInitials = (name) => {
    if (!name) return '??';
    const words = name.split(' ').filter(w => w.length > 0);
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
  };

  const handleLogout = async () => {
    try {
      await signOut(); 
      navigate('/');   
    } catch (error) {
      console.error('Помилка при виході:', error);
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-100 text-slate-800 font-sans">
      
      {/* --- ДЕСКТОПНЕ БІЧНЕ МЕНЮ --- */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 z-20 w-64 bg-slate-900 border-r border-slate-800 flex-col">
        {/* Логотип та Назва компанії */}
        <div className="h-20 flex items-center justify-start px-4 border-b border-slate-800 gap-3">
          <img src={logoUrl} alt="Logo" className="w-10 h-10 object-contain drop-shadow-md hover:scale-105 transition-transform shrink-0" />
          <span className="text-white font-black text-[11px] md:text-xs uppercase tracking-widest leading-tight">Сонячна<br/>Корпорація</span>
        </div>

        {/* Навігація */}
        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto custom-scrollbar">
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-sm font-medium
                ${isActive
                  ? 'bg-amber-500 text-slate-900'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`
              }
            >
              <item.icon className="w-4 h-4 shrink-0" />
              <span>{item.name}</span>
            </NavLink>
          ))}
        </nav>

        {/* Профіль / Вихід */}
        <div className="p-4 border-t border-slate-800 shrink-0">
            <div className="flex items-center gap-3 mb-4 px-2">
                <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center font-black text-slate-300 text-xs shrink-0">
                    {getInitials(employeeProfile?.full_name)}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-white truncate">{employeeProfile?.full_name || 'Завантаження...'}</div>
                    <div className="text-[10px] text-amber-500 uppercase tracking-widest truncate">{employeeProfile?.role || '...'}</div>
                </div>
            </div>
            <button 
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-slate-400 hover:text-white hover:bg-rose-500/20 hover:text-rose-400 rounded-lg transition-colors text-sm font-bold"
            >
                <FaSignOutAlt /> Вийти
            </button>
        </div>
      </aside>

      {/* --- ОСНОВНИЙ КОНТЕНТ --- */}
      <div className="flex-1 lg:ml-64 flex flex-col h-screen overflow-hidden">
        
        {/* Мобайл хедер */}
        <div className="lg:hidden h-16 bg-slate-900 flex items-center justify-between px-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <img src={logoUrl} alt="Logo" className="w-8 h-8 object-contain shrink-0" />
            <span className="text-white font-black text-[10px] uppercase tracking-widest leading-tight">Сонячна<br/>Корпорація</span>
          </div>
          <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 text-slate-300 hover:text-white transition-colors">
            <FaBars size={22} />
          </button>
        </div>

        {/* Основна область сторінки */}
        <main className="flex-1 overflow-y-auto bg-slate-50">
          <Outlet />
        </main>
      </div>

      {/* --- МОБІЛЬНЕ МЕНЮ (ПРАВА ПАНЕЛЬ) --- */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            {/* Затемнення фону */}
            <MotionDiv 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 bg-slate-900/60 z-40 lg:hidden backdrop-blur-sm"
            />
            
            {/* Сама панель (виїжджає справа) */}
            <MotionAside
                initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
                transition={{ type: 'tween', duration: 0.25, ease: 'easeOut' }}
                className="fixed inset-y-0 right-0 z-50 w-72 max-w-[80vw] bg-slate-900 flex flex-col shadow-2xl"
            >
                {/* Шапка мобільного меню з хрестиком (справа) */}
                <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800 shrink-0">
                    <div className="flex items-center gap-3">
                        <img src={logoUrl} alt="Logo" className="w-8 h-8 object-contain shrink-0" />
                        <span className="text-white font-black text-[10px] uppercase tracking-widest leading-tight">Сонячна<br/>Корпорація</span>
                    </div>
                    <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 text-slate-400 hover:text-white transition-colors bg-slate-800 rounded-lg">
                        <FaTimes size={18}/>
                    </button>
                </div>
                
                {/* Мобільна навігація */}
                <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto custom-scrollbar">
                    {visibleNavItems.map((item) => (
                        <NavLink 
                          key={item.path} 
                          to={item.path} 
                          onClick={() => setIsMobileMenuOpen(false)} 
                          className={({ isActive }) => `flex items-center gap-4 px-4 py-3.5 rounded-xl text-sm font-bold transition-all ${isActive ? 'bg-amber-500 text-slate-900 shadow-lg shadow-amber-500/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`} 
                        >
                            <item.icon className="w-5 h-5 shrink-0" /> <span>{item.name}</span>
                        </NavLink>
                    ))}
                </nav>

                {/* Профіль та Вихід (завжди внизу) */}
                <div className="p-4 border-t border-slate-800 bg-slate-900/50 shrink-0">
                    <div className="flex items-center gap-3 mb-4 px-2">
                        <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center font-black text-amber-500 text-sm border border-slate-700">
                            {getInitials(employeeProfile?.full_name)}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold text-white truncate">{employeeProfile?.full_name || '...'}</div>
                            <div className="text-[10px] text-amber-500 uppercase tracking-widest truncate">{employeeProfile?.role || '...'}</div>
                        </div>
                    </div>
                    <button 
                        onClick={handleLogout}
                        className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white rounded-xl transition-all text-sm font-bold uppercase tracking-wider"
                    >
                        <FaSignOutAlt size={16} /> Вийти
                    </button>
                </div>
            </MotionAside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}