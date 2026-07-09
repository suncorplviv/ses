import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../AuthProvider';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FaTimes, FaTags, FaEdit, FaTrash, FaCheckCircle, FaTimesCircle
} from 'react-icons/fa';

const CategoriesTab = forwardRef(function CategoriesTab({ searchTerm }, ref) {
  const { employeeProfile } = useAuth();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [formData, setFormData] = useState({ name: '', is_active: true });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [confirmingDeleteId, setConfirmingDeleteId] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchCategories = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('expense_categories').select('*').order('name');
      if (error) throw error;
      setCategories(data || []);
    } catch (error) {
      console.error('Помилка завантаження категорій:', error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const handleEdit = (category) => {
    setEditingCategory(category);
    setFormData({ name: category.name || '', is_active: category.is_active });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return;
    setIsSubmitting(true);

    try {
      if (editingCategory) {
        const { error } = await supabase.from('expense_categories').update({
          name: formData.name.trim(),
          is_active: formData.is_active
        }).eq('id', editingCategory.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('expense_categories').insert([{
          name: formData.name.trim(),
          is_active: formData.is_active,
          created_by: employeeProfile?.id || null
        }]);
        if (error) throw error;
      }

      setIsModalOpen(false);
      fetchCategories();
    } catch (error) {
      alert('Помилка збереження категорії: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (category) => {
    setIsDeleting(true);
    try {
      const { error } = await supabase.from('expense_categories').delete().eq('id', category.id);
      if (error) {
        if (error.code === '23503') {
          throw new Error('Ця категорія вже використовується у видатках. Деактивуйте її замість видалення, або спочатку перенесіть видатки в іншу категорію.');
        }
        throw error;
      }
      setConfirmingDeleteId(null);
      fetchCategories();
    } catch (error) {
      alert(error.message);
    } finally {
      setIsDeleting(false);
    }
  };

  useImperativeHandle(ref, () => ({
    openNewModal: () => {
      setEditingCategory(null);
      setFormData({ name: '', is_active: true });
      setIsModalOpen(true);
    }
  }));

  const filteredCategories = categories.filter(c => c.name?.toLowerCase().includes((searchTerm || '').toLowerCase()));

  return (
    <div className="space-y-3 md:space-y-4">

      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-[10px] uppercase tracking-widest text-slate-400 bg-slate-50/50">
                <th className="p-5 font-black">Назва категорії</th>
                <th className="p-5 font-black text-center">Статус</th>
                <th className="p-5 font-black text-right">Дії</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {loading ? (
                <tr><td colSpan="3" className="text-center p-12 text-slate-400 font-bold uppercase tracking-widest animate-pulse">Завантаження...</td></tr>
              ) : filteredCategories.length === 0 ? (
                <tr><td colSpan="3" className="text-center p-12 text-slate-400 font-bold uppercase tracking-widest text-xs">Категорій не знайдено</td></tr>
              ) : (
                filteredCategories.map((category) => (
                  <tr key={category.id} className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${!category.is_active ? 'opacity-60 bg-slate-50' : 'bg-white'}`}>
                    <td className="p-5">
                      <div className="flex items-center gap-2.5 font-black text-slate-900">
                        <FaTags className="text-amber-500" size={14} /> {category.name}
                      </div>
                    </td>
                    <td className="p-5 text-center">
                      {category.is_active ? (
                        <span className="inline-flex items-center justify-center gap-1.5 text-[10px] font-black text-emerald-600 uppercase"><FaCheckCircle /> Активна</span>
                      ) : (
                        <span className="inline-flex items-center justify-center gap-1.5 text-[10px] font-black text-slate-400 uppercase"><FaTimesCircle /> Вимкнена</span>
                      )}
                    </td>
                    <td className="p-5 text-right">
                      {confirmingDeleteId === category.id ? (
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => handleDelete(category)} disabled={isDeleting} className="px-3 py-1.5 bg-rose-500 hover:bg-rose-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest">{isDeleting ? '...' : 'Так'}</button>
                          <button onClick={() => setConfirmingDeleteId(null)} className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-black uppercase tracking-widest">Ні</button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => handleEdit(category)} className="p-2.5 bg-slate-50 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-xl transition-all shadow-sm" title="Редагувати"><FaEdit size={14} /></button>
                          <button onClick={() => setConfirmingDeleteId(category.id)} className="p-2.5 bg-slate-50 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all shadow-sm" title="Видалити"><FaTrash size={14} /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center px-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-900 text-white">
                <h3 className="text-lg font-black uppercase tracking-tight">{editingCategory ? 'Редагувати категорію' : 'Нова категорія'}</h3>
                <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white p-2 rounded-full transition-colors bg-white/10 hover:bg-white/20"><FaTimes size={16} /></button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-5 bg-slate-50/50">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Назва категорії *</label>
                  <input
                    type="text" required autoFocus
                    value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-900 outline-none focus:border-amber-500 transition-all shadow-sm"
                    placeholder="Напр: Пальне, Оренда офісу..."
                  />
                </div>

                {editingCategory && (
                  <div className="flex items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.is_active} onChange={e => setFormData({ ...formData, is_active: e.target.checked })}
                        className="w-5 h-5 text-amber-500 rounded border-slate-300 focus:ring-amber-500 cursor-pointer"
                      />
                      <span className="text-sm font-black text-slate-700 uppercase tracking-tight">Категорія активна (доступна для вибору)</span>
                    </label>
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-3.5 text-sm font-bold text-slate-600 hover:bg-slate-100 bg-white border border-slate-200 rounded-xl transition-colors">Скасувати</button>
                  <button type="submit" disabled={isSubmitting || !formData.name.trim()} className="px-8 py-3.5 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-200 disabled:text-slate-400 text-slate-900 rounded-xl text-xs font-black uppercase tracking-widest transition-colors shadow-lg shadow-amber-500/20 active:scale-95">
                    {isSubmitting ? 'Збереження...' : 'Зберегти'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
});

export default CategoriesTab;
