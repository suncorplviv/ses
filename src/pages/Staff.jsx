import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { 
  FaPlus, FaSearch, FaTimes, FaUserTie, 
  FaUserShield, FaHardHat, FaHeadset, 
  FaCheckCircle, FaTimesCircle, FaPhone, 
  FaEnvelope, FaTelegramPlane, FaEdit 
} from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../AuthProvider';

// Доступні ролі в системі (розширений список)
const ROLES = ['Менеджер з продажу', 'Інженер', 'Директор', 'Засновник компанії', 'Монтажник', 'Бригадир'];

export default function Staff() {
  // Дістаємо профіль замість жорсткого isDirector
  const { employeeProfile } = useAuth();
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTab, setFilterTab] = useState('all'); // 'all', 'office', 'production'
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  // Стейт форми (БЕЗ tg_user_id)
  const [formData, setFormData] = useState({
    full_name: '',
    role: 'Менеджер з продажу',
    phone: '',
    email: '',
    notes: '',
    is_active: true
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Логіка перевірки прав доступу до редагування
  const userRole = employeeProfile?.role?.toLowerCase() || '';
  const canEditStaff = userRole.includes('директор') || userRole.includes('засновник') || userRole.includes('менеджер');

  useEffect(() => {
    fetchStaff();
  }, []);

  // Завантаження списку працівників
  const fetchStaff = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setStaff(data || []);
    } catch (error) {
      console.error('Помилка завантаження працівників:', error.message);
    } finally {
      setLoading(false);
    }
  };

  // Обробка вводу
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ 
      ...prev, 
      [name]: type === 'checkbox' ? checked : value 
    }));
  };

  // Відкриття модалки для нового
  const handleAddNew = () => {
    setEditingUser(null);
    setFormData({
      full_name: '', role: 'Менеджер з продажу', phone: '', email: '', notes: '', is_active: true
    });
    setIsModalOpen(true);
  };

  // Відкриття модалки для редагування
  const handleEdit = (user) => {
    setEditingUser(user);
    setFormData({
      full_name: user.full_name || '',
      role: user.role || 'Менеджер з продажу',
      phone: user.phone || '',
      email: user.email || '',
      notes: user.notes || '',
      is_active: user.is_active
    });
    setIsModalOpen(true);
  };

  // Збереження працівника
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      if (editingUser) {
        // Оновлення існуючого
        const { error } = await supabase.from('users').update(formData).eq('id', editingUser.id);
        if (error) throw error;
      } else {
        // Створення нового
        const { error } = await supabase.from('users').insert([formData]);
        if (error) throw error;
      }
      
      setIsModalOpen(false);
      fetchStaff();
    } catch (error) {
      console.error('Помилка збереження працівника:', error.message);
      alert('Помилка при збереженні профілю працівника.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Логіка фільтрації
  const filteredStaff = staff.filter(person => {
    // 1. Пошук
    const matchesSearch = 
      person.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
      person.role?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      person.phone?.includes(searchTerm);

    // 2. Вкладки (Офіс / Виробництво)
    const isProduction = person.role === 'Монтажник' || person.role === 'Бригадир';
    const matchesTab = filterTab === 'all' 
      ? true 
      : filterTab === 'production' ? isProduction : !isProduction;

    return matchesSearch && matchesTab;
  });

  // Хелпер для іконок та кольорів ролей
  const getRoleBadge = (role) => {
    if (role?.includes('Засновник') || role?.includes('Директор')) {
      return { icon: <FaUserShield />, color: 'bg-rose-100 text-rose-700 border-rose-200' };
    }
    if (role?.includes('Інженер') || role?.includes('Монтажник') || role?.includes('Бригадир')) {
      return { icon: <FaHardHat />, color: 'bg-amber-100 text-amber-700 border-amber-200' };
    }
    return { icon: <FaHeadset />, color: 'bg-sky-100 text-sky-700 border-sky-200' };
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      
      {/* Хедер сторінки */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm shrink-0">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-slate-900 text-amber-500 rounded-2xl shadow-lg">
              <FaUserTie size={24} />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-black text-slate-900 uppercase tracking-tight">Команда</h1>
              <p className="text-sm text-slate-500 font-medium mt-0.5">Управління доступом та ролями співробітників</p>
            </div>
          </div>
          
          <div className="flex w-full md:w-auto items-center gap-3">
            <div className="relative w-full md:w-64">
              <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text" placeholder="Пошук за ім'ям..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-amber-500 transition-all"
              />
            </div>
            {/* Перевірка прав доступу на додавання */}
            {canEditStaff && (
              <button
                onClick={handleAddNew}
                className="bg-slate-900 hover:bg-slate-800 text-amber-400 px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest flex items-center gap-2 transition-colors shadow-lg shadow-slate-900/10 active:scale-95 whitespace-nowrap"
              >
                <FaPlus size={14} /> Додати
              </button>
            )}
          </div>
        </div>

        {/* НАВІГАЦІЯ (ФІЛЬТРИ) */}
        <div className="flex bg-slate-100 p-1.5 rounded-2xl overflow-x-auto custom-scrollbar">
          <button onClick={() => setFilterTab('all')} className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 text-xs font-black uppercase tracking-widest rounded-xl transition-all whitespace-nowrap ${filterTab === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}>
            Всі співробітники
          </button>
          <button onClick={() => setFilterTab('office')} className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 text-xs font-black uppercase tracking-widest rounded-xl transition-all whitespace-nowrap ${filterTab === 'office' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}>
            Офіс / Менеджмент
          </button>
          <button onClick={() => setFilterTab('production')} className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 text-xs font-black uppercase tracking-widest rounded-xl transition-all whitespace-nowrap ${filterTab === 'production' ? 'bg-slate-900 text-amber-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}>
            <FaHardHat /> Монтажники (Виробництво)
          </button>
        </div>
      </div>

      {/* Таблиця персоналу */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-[10px] uppercase tracking-widest text-slate-400 bg-slate-50/50">
                <th className="p-5 font-black">Співробітник / Контакти</th>
                <th className="p-5 font-black text-center">Роль</th>
                <th className="p-5 font-black text-center">Telegram Бот</th>
                <th className="p-5 font-black text-center">Статус</th>
                <th className="p-5 font-black text-right">Дії</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {loading ? (
                <tr>
                  <td colSpan="5" className="text-center p-12 text-slate-500">
                    <div className="flex items-center justify-center gap-2">
                        <div className="w-5 h-5 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin"></div>
                        <span className="font-bold tracking-widest uppercase text-xs">Завантаження...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredStaff.length === 0 ? (
                <tr>
                  <td colSpan="5" className="text-center p-12 text-slate-400 font-bold uppercase tracking-widest text-xs">Працівників не знайдено</td>
                </tr>
              ) : (
                filteredStaff.map((person) => {
                  const badge = getRoleBadge(person.role);
                  return (
                    <tr key={person.id} className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${!person.is_active ? 'opacity-60 bg-slate-50' : 'bg-white'}`}>
                      
                      <td className="p-5">
                        <div className="font-black text-slate-900 text-base">{person.full_name}</div>
                        <div className="flex flex-col gap-1 mt-2">
                          <div className="flex items-center gap-2 text-[11px] font-bold text-slate-500">
                             <FaPhone className="text-slate-400" /> {person.phone || '—'}
                          </div>
                          {person.email && (
                            <div className="flex items-center gap-2 text-[11px] font-bold text-slate-500">
                               <FaEnvelope className="text-slate-400" /> {person.email}
                            </div>
                          )}
                        </div>
                        {person.notes && <div className="text-[10px] text-slate-400 mt-2 italic max-w-xs">{person.notes}</div>}
                      </td>

                      <td className="p-5 text-center">
                        <span className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-widest w-max mx-auto ${badge.color}`}>
                          {badge.icon} {person.role}
                        </span>
                      </td>

                      <td className="p-5 text-center">
                        {person.tg_user_id ? (
                           <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg">
                             <FaTelegramPlane size={12}/> Підключено
                           </span>
                        ) : (
                           <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 bg-slate-100 px-2.5 py-1 rounded-lg">
                             Не підключено
                           </span>
                        )}
                      </td>

                      <td className="p-5 text-center">
                        {person.is_active ? (
                           <span className="inline-flex items-center justify-center gap-1.5 text-[10px] font-black text-emerald-600 uppercase">
                             <FaCheckCircle /> Активний
                           </span>
                        ) : (
                           <span className="inline-flex items-center justify-center gap-1.5 text-[10px] font-black text-rose-500 uppercase">
                             <FaTimesCircle /> Звільнений
                           </span>
                        )}
                      </td>

                      <td className="p-5 text-right">
                        {/* Перевірка прав доступу на редагування */}
                        {canEditStaff ? (
                          <button 
                            onClick={() => handleEdit(person)} 
                            className="p-2.5 bg-slate-50 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-xl transition-all shadow-sm"
                            title="Редагувати профіль"
                          >
                            <FaEdit size={14}/>
                          </button>
                        ) : (
                          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-300">Перегляд</span>
                        )}
                      </td>

                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Модалка додавання/редагування працівника */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} 
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-900 text-white">
                <div>
                    <h3 className="text-lg font-black uppercase tracking-tight flex items-center gap-3">
                        {editingUser ? 'Редагувати профіль' : 'Новий працівник'}
                    </h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                      Дані для системи та зв'язку
                    </p>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white p-2 rounded-full transition-colors bg-white/10 hover:bg-white/20">
                  <FaTimes size={16} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 md:p-8 overflow-y-auto custom-scrollbar flex flex-col gap-5 bg-slate-50/50">
                
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">ПІБ (Повне ім'я) *</label>
                  <input 
                    type="text" name="full_name" required autoFocus
                    value={formData.full_name} onChange={handleChange}
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-900 outline-none focus:border-amber-500 transition-all shadow-sm"
                    placeholder="Іванов Іван Іванович"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Роль у системі *</label>
                    <select 
                      name="role" required
                      value={formData.role} onChange={handleChange}
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-900 outline-none focus:border-amber-500 cursor-pointer shadow-sm"
                    >
                      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Телефон</label>
                    <input 
                      type="tel" name="phone" 
                      value={formData.phone} onChange={handleChange}
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-900 outline-none focus:border-amber-500 transition-all shadow-sm"
                      placeholder="+380..."
                    />
                  </div>
                </div>

                {/* Показуємо Email тільки для офісного персоналу */}
                {formData.role !== 'Монтажник' && formData.role !== 'Бригадир' && (
                  <div className="animate-fade-in">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Email (Для входу)</label>
                    <input 
                      type="email" name="email" 
                      value={formData.email} onChange={handleChange}
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-900 outline-none focus:border-amber-500 transition-all shadow-sm"
                      placeholder="mail@example.com"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Примітки</label>
                  <textarea 
                    name="notes" rows="2"
                    value={formData.notes} onChange={handleChange}
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 outline-none focus:border-amber-500 transition-all resize-none shadow-sm"
                    placeholder="Додаткова інформація..."
                  ></textarea>
                </div>

                {editingUser && (
                  <div className="flex items-center mt-2 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                     <label className="flex items-center gap-3 cursor-pointer">
                        <input 
                          type="checkbox" name="is_active" 
                          checked={formData.is_active} onChange={handleChange}
                          className="w-5 h-5 text-amber-500 rounded border-slate-300 focus:ring-amber-500 cursor-pointer"
                        />
                        <span className="text-sm font-black text-slate-700 uppercase tracking-tight">Акаунт активний (Має доступ)</span>
                     </label>
                  </div>
                )}

              </form>

              <div className="p-6 border-t border-slate-100 flex justify-end gap-3 bg-white mt-auto shrink-0">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  className="px-6 py-3.5 text-sm font-bold text-slate-600 hover:bg-slate-100 bg-slate-50 rounded-xl transition-colors"
                >
                  Скасувати
                </button>
                <button 
                  onClick={handleSubmit}
                  disabled={isSubmitting || !formData.full_name}
                  className="px-8 py-3.5 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-200 disabled:text-slate-400 text-slate-900 rounded-xl text-xs font-black uppercase tracking-widest transition-colors flex items-center justify-center shadow-lg shadow-amber-500/20 active:scale-95"
                >
                  {isSubmitting ? (
                    <div className="w-4 h-4 border-2 border-slate-900/30 border-t-slate-900 rounded-full animate-spin"></div>
                  ) : 'Зберегти'}
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}