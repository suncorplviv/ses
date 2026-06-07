import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { 
  FaPlus, FaTrash, FaCog, FaUserTie, FaClock, FaEye, FaExclamationTriangle 
} from 'react-icons/fa';
import { useAuth } from '../AuthProvider';

export default function Settings() {
  const { isDirector } = useAuth();
  const [stages, setStages] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Стейт для форми нового шаблону
  const [newTemplate, setNewTemplate] = useState({
    stage_id: '',
    title: '',
    description: '',
    priority: 'Середній',
    deadline_days: 2,
    default_role: 'Менеджер з продажу',
    observer_role: 'Немає'
  });

  // Стейти для кастомної модалки видалення
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState(null);

  // Список ролей згідно ТЗ
  const roles = ["Менеджер з продажу", "Інженер", "Директор", "Засновник компанії"];
  const observerRoles = ["Немає", "Менеджер з продажу", "Інженер", "Директор", "Засновник компанії"];

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const { data: stData } = await supabase.from('deal_stages').select('*').order('position');
    const { data: ttData } = await supabase.from('task_templates').select(`*, deal_stages(name)`);
    
    setStages(stData || []);
    setTemplates(ttData || []);
    
    if (stData?.length > 0) {
      setNewTemplate(prev => ({ ...prev, stage_id: stData[0].id }));
    }
    setLoading(false);
  };

  const handleAddTemplate = async (e) => {
    e.preventDefault();
    const { error } = await supabase.from('task_templates').insert([{
      stage_id: newTemplate.stage_id,
      title: newTemplate.title,
      description: newTemplate.description,
      priority: newTemplate.priority,
      deadline_days: parseInt(newTemplate.deadline_days),
      default_role: newTemplate.default_role,
      observer_role: newTemplate.observer_role === "Немає" ? null : newTemplate.observer_role
    }]);

    if (!error) {
      setNewTemplate({ ...newTemplate, title: '', description: '' });
      fetchData();
    } else {
      alert("Помилка створення: " + error.message);
    }
  };

  // Відкриття модалки видалення
  const confirmDelete = (template) => {
    setTemplateToDelete(template);
    setIsDeleteModalOpen(true);
  };

  // Фактичне видалення
  const executeDelete = async () => {
    if (!templateToDelete) return;
    await supabase.from('task_templates').delete().eq('id', templateToDelete.id);
    setIsDeleteModalOpen(false);
    setTemplateToDelete(null);
    fetchData();
  };

  if (!isDirector) {
    return (
      <div className="h-full flex items-center justify-center p-6 bg-slate-50">
        <div className="bg-white border border-slate-200 rounded-3xl p-8 max-w-md text-center shadow-sm">
          <div className="w-14 h-14 rounded-2xl bg-slate-900 text-amber-500 flex items-center justify-center mx-auto mb-4">
            <FaCog size={22} />
          </div>
          <h1 className="text-lg font-black text-slate-900 uppercase tracking-tight">Доступ обмежено</h1>
          <p className="text-sm text-slate-500 font-medium mt-2">Налаштування системи доступні лише директору.</p>
        </div>
      </div>
    );
  }

  if (loading) return <div className="p-10 text-center animate-pulse font-bold text-slate-400">ЗАВАНТАЖЕННЯ НАЛАШТУВАНЬ...</div>;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-10">
      
      {/* ШАПКА */}
      <div className="flex items-center gap-4 border-b border-slate-200 pb-6">
        <div className="p-3 bg-slate-900 text-amber-500 rounded-2xl shadow-lg">
          <FaCog size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Налаштування системи</h1>
          <p className="text-sm text-slate-500 font-medium">Керування етапами та бізнес-процесами (авто-завдання)</p>
        </div>
      </div>

      {/* ФОРМА ДОДАВАННЯ ШАБЛОНУ */}
      <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
          <FaCog size={150} className="text-slate-900" />
        </div>
        
        <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-6 flex items-center gap-2 relative z-10">
          <FaPlus className="text-amber-500" /> Створити правило (Шаблон завдання)
        </h3>
        
        <form onSubmit={handleAddTemplate} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 relative z-10">
          
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Етап воронки</label>
            <select 
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-amber-500 cursor-pointer"
              value={newTemplate.stage_id}
              onChange={e => setNewTemplate({...newTemplate, stage_id: e.target.value})}
            >
              {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div className="space-y-1 lg:col-span-2">
            <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Назва завдання (Суть)</label>
            <input 
              required
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-amber-500"
              placeholder="Напр: Підготувати КП"
              value={newTemplate.title}
              onChange={e => setNewTemplate({...newTemplate, title: e.target.value})}
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase ml-1 flex items-center gap-1"><FaClock/> Термін (Днів)</label>
            <input 
              required type="number" min="1"
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black outline-none focus:border-amber-500 text-center"
              value={newTemplate.deadline_days}
              onChange={e => setNewTemplate({...newTemplate, deadline_days: e.target.value})}
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase ml-1 flex items-center gap-1"><FaUserTie/> Відповідальний (Роль)</label>
            <select 
              className="w-full p-3 bg-amber-50/50 border border-amber-100 rounded-xl text-sm font-bold text-amber-900 outline-none focus:border-amber-500 cursor-pointer"
              value={newTemplate.default_role}
              onChange={e => setNewTemplate({...newTemplate, default_role: e.target.value})}
            >
              {roles.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase ml-1 flex items-center gap-1"><FaEye/> Спостерігач</label>
            <select 
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:border-amber-500 cursor-pointer"
              value={newTemplate.observer_role}
              onChange={e => setNewTemplate({...newTemplate, observer_role: e.target.value})}
            >
              {observerRoles.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Пріоритет</label>
            <select 
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-amber-500 cursor-pointer"
              value={newTemplate.priority}
              onChange={e => setNewTemplate({...newTemplate, priority: e.target.value})}
            >
              <option value="Низький">Низький</option>
              <option value="Середній">Середній</option>
              <option value="🔴 Високий">🔴 Високий</option>
              <option value="🔴 Критичний">🔴 Критичний</option>
            </select>
          </div>

          <div className="lg:col-span-4">
            <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Опис / Чек-лист (необов'язково)</label>
            <textarea 
              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-amber-500 resize-none"
              rows="2"
              placeholder="Що саме потрібно зробити..."
              value={newTemplate.description}
              onChange={e => setNewTemplate({...newTemplate, description: e.target.value})}
            />
          </div>

          <div className="lg:col-span-4 flex justify-end">
            <button type="submit" className="bg-slate-900 text-amber-500 px-8 py-4 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/20 active:scale-95">
              Створити шаблон
            </button>
          </div>
        </form>
      </div>

      {/* СПИСОК ІСНУЮЧИХ ШАБЛОНІВ ПО ЕТАПАХ */}
      <div className="space-y-8">
        {stages.map(stage => {
          const stageTemplates = templates.filter(t => t.stage_id === stage.id);
          if (stageTemplates.length === 0) return null; // Не показуємо пусті етапи для чистоти

          return (
            <div key={stage.id} className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                <span className="text-xs font-black text-slate-900 uppercase tracking-widest">{stage.name}</span>
                <span className="text-[10px] font-bold bg-white px-2 py-1 rounded border border-slate-200 text-slate-500">
                  ЗАВДАНЬ: {stageTemplates.length}
                </span>
              </div>
              
              <div className="divide-y divide-slate-100">
                {stageTemplates.map(tt => (
                  <div key={tt.id} className="p-4 md:p-6 flex flex-col md:flex-row md:justify-between md:items-center gap-4 group hover:bg-slate-50/50 transition-colors">
                    
                    <div className="flex-1">
                      <div className="flex items-center gap-3 flex-wrap mb-2">
                        <p className="text-sm font-black text-slate-800">{tt.title}</p>
                        <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${tt.priority.includes('🔴') ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>
                          {tt.priority}
                        </span>
                        <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 flex items-center gap-1">
                          <FaClock size={8}/> {tt.deadline_days} днів
                        </span>
                      </div>
                      
                      {tt.description && <p className="text-xs text-slate-500 mt-1 mb-3 max-w-3xl leading-relaxed">{tt.description}</p>}
                      
                      <div className="flex items-center gap-4 text-[10px] font-bold text-slate-400">
                        <div className="flex items-center gap-1.5 bg-white border border-slate-200 px-2 py-1 rounded-md">
                          <FaUserTie className="text-amber-500" /> Відп: <span className="text-slate-700">{tt.default_role || 'Будь-хто'}</span>
                        </div>
                        {tt.observer_role && (
                          <div className="flex items-center gap-1.5 bg-white border border-slate-200 px-2 py-1 rounded-md">
                            <FaEye className="text-emerald-500" /> Сп: <span className="text-slate-700">{tt.observer_role}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <button 
                      onClick={() => confirmDelete(tt)}
                      className="p-3 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all self-end md:self-center shrink-0"
                      title="Видалити шаблон"
                    >
                      <FaTrash size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* КАСТОМНА МОДАЛКА ПІДТВЕРДЖЕННЯ ВИДАЛЕННЯ */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden transform scale-100 transition-transform">
            <div className="p-6 bg-rose-50 border-b border-rose-100 flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-rose-100 text-rose-500 rounded-full flex items-center justify-center mb-4">
                <FaExclamationTriangle size={30} />
              </div>
              <h3 className="text-lg font-black text-rose-700 uppercase tracking-tight">Видалення шаблону</h3>
              <p className="text-xs text-rose-600/80 font-medium mt-1">Ви впевнені, що хочете видалити це правило?</p>
            </div>
            
            <div className="p-6 text-center">
               <p className="text-sm font-bold text-slate-800">{templateToDelete?.title}</p>
               <p className="text-[10px] text-slate-400 font-medium mt-2">Нові угоди більше не отримуватимуть це завдання.</p>
            </div>

            <div className="p-4 flex gap-3 border-t border-slate-100 bg-slate-50">
              <button 
                onClick={() => setIsDeleteModalOpen(false)}
                className="flex-1 py-3 text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Скасувати
              </button>
              <button 
                onClick={executeDelete}
                className="flex-1 py-3 text-xs font-black uppercase tracking-widest text-white bg-rose-500 hover:bg-rose-600 rounded-xl transition-colors shadow-lg shadow-rose-500/20"
              >
                Так, видалити
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
