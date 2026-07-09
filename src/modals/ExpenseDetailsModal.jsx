import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import {
  FaTimes, FaTags, FaEdit, FaTrash, FaSave, FaArrowRight, FaTruckLoading, FaUser
} from 'react-icons/fa';

export default function ExpenseDetailsModal({ isOpen, onClose, expense, categories, onSaveSuccess, onOpenDeal }) {
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (isOpen && expense) {
      setForm({
        category_id: expense.category_id || '',
        amount_usd: expense.amount_usd || '',
        exchange_rate: expense.exchange_rate || '',
        amount_uah: expense.amount_uah || '',
        payment_method: expense.payment_method || 'Готівка',
        notes: expense.notes || ''
      });
      setIsEditing(false);
      setIsConfirmingDelete(false);
    }
  }, [isOpen, expense]);

  if (!isOpen || !expense || !form) return null;

  const handleAmountChange = (field, value) => {
    setForm(prev => {
      const next = { ...prev, [field]: value };
      const rate = parseFloat(next.exchange_rate) || 0;
      if (rate <= 0) return next;
      if (field === 'amount_usd') next.amount_uah = value ? (parseFloat(value) * rate).toFixed(2) : '';
      else if (field === 'amount_uah') next.amount_usd = value ? (parseFloat(value) / rate).toFixed(2) : '';
      else if (field === 'exchange_rate' && next.amount_usd) next.amount_uah = (parseFloat(next.amount_usd) * rate).toFixed(2);
      return next;
    });
  };

  const handleSave = async () => {
    const amount = parseFloat(form.amount_usd);
    if (!amount || amount <= 0) return alert('Введіть коректну суму ($)');
    if (!form.category_id) return alert('Оберіть категорію.');

    setIsSaving(true);
    try {
      const { error } = await supabase.from('expenses').update({
        category_id: form.category_id,
        amount_usd: amount,
        exchange_rate: parseFloat(form.exchange_rate) || null,
        amount_uah: parseFloat(form.amount_uah) || 0,
        payment_method: form.payment_method,
        notes: form.notes || null
      }).eq('id', expense.id);
      if (error) throw error;

      onSaveSuccess();
      onClose();
    } catch (error) {
      alert('Помилка збереження: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const { error } = await supabase.from('expenses').delete().eq('id', expense.id);
      if (error) throw error;
      onSaveSuccess();
      onClose();
    } catch (error) {
      alert('Помилка видалення: ' + error.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const eDate = new Date(expense.expense_date);

  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in custom-scrollbar overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg flex flex-col my-auto overflow-hidden">

        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-900 text-white shrink-0">
          <div>
            <h3 className="text-lg font-black uppercase tracking-tight flex items-center gap-2">
              <FaTags className="text-amber-400" /> Видаток #{expense.custom_id}
            </h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase mt-1 tracking-widest">{expense.expense_categories?.name || 'Без категорії'}</p>
          </div>
          <button onClick={onClose} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"><FaTimes size={18} /></button>
        </div>

        <div className="p-6 space-y-5 bg-slate-50/50">

          {expense.deals && (
            <div
              onClick={() => onOpenDeal && onOpenDeal(expense.deals.id)}
              className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between cursor-pointer hover:border-amber-400 transition-colors"
            >
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Прив'язана угода</p>
                <p className="font-bold text-slate-800 text-sm mt-0.5">№{expense.deals.custom_id} — {expense.deals.title}</p>
              </div>
              <FaArrowRight className="text-amber-500 shrink-0" size={14} />
            </div>
          )}

          {expense.employee && (
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
              <FaUser className="text-slate-400" />
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Компенсація працівнику</p>
                <p className="font-bold text-slate-800 text-sm mt-0.5">{expense.employee.full_name}</p>
              </div>
            </div>
          )}

          {expense.suppliers && (
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
              <FaTruckLoading className="text-slate-400" />
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Постачальник / Контрагент</p>
                <p className="font-bold text-slate-800 text-sm mt-0.5">{expense.suppliers.name}</p>
              </div>
            </div>
          )}

          {isEditing ? (
            <div className="bg-white p-4 rounded-2xl border border-amber-200 shadow-sm space-y-4">
              <div>
                <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Категорія</label>
                <select value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:border-amber-500 cursor-pointer">
                  {categories?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Сума ($)</label>
                  <input type="number" min="0.01" step="any" value={form.amount_usd} onChange={e => handleAmountChange('amount_usd', e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:border-amber-500" />
                </div>
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Курс (₴/$)</label>
                  <input type="number" min="0" step="any" value={form.exchange_rate} onChange={e => handleAmountChange('exchange_rate', e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:border-amber-500" />
                </div>
              </div>
              <div>
                <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Сума (₴)</label>
                <input type="number" min="0" step="any" value={form.amount_uah} onChange={e => handleAmountChange('amount_uah', e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:border-amber-500" />
              </div>
              <div>
                <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Метод оплати</label>
                <select value={form.payment_method} onChange={e => setForm({ ...form, payment_method: e.target.value })} className="w-full px-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-amber-500 cursor-pointer">
                  <option value="Готівка">Готівка</option>
                  <option value="Картка">Картка</option>
                  <option value="Банківський переказ">Банківський переказ</option>
                </select>
              </div>
              <div>
                <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Коментар</label>
                <textarea rows="2" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium outline-none focus:border-amber-500 resize-none" />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setIsEditing(false)} className="flex-1 py-2.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg">Скасувати</button>
                <button onClick={handleSave} disabled={isSaving} className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-white rounded-lg text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2"><FaSave size={12} /> {isSaving ? '...' : 'Зберегти'}</button>
              </div>
            </div>
          ) : (
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Сума</p>
                  <p className="font-black text-rose-600 text-lg mt-0.5">-{Number(expense.amount_usd).toLocaleString()} $</p>
                  <p className="text-[10px] font-bold text-slate-400 mt-0.5">{Number(expense.amount_uah).toLocaleString()} ₴ {expense.exchange_rate ? `(курс ${expense.exchange_rate})` : ''}</p>
                </div>
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Дата й час</p>
                  <p className="font-bold text-slate-800 text-sm mt-0.5">{eDate.toLocaleDateString('uk-UA')}</p>
                  <p className="text-[10px] font-bold text-slate-400">{eDate.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <span className="px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-100 rounded-md text-[9px] font-black uppercase tracking-widest">{expense.expense_categories?.name || 'Без категорії'}</span>
                {expense.payment_method && <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-md text-[9px] font-black uppercase tracking-widest">{expense.payment_method}</span>}
              </div>
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Менеджер</p>
                <p className="font-bold text-slate-700 text-sm mt-0.5">{expense.creator?.full_name || 'Система'}</p>
              </div>
              {expense.notes && (
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Коментар</p>
                  <p className="text-sm font-medium text-slate-700 mt-0.5">{expense.notes}</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-100 flex justify-between items-center bg-white shrink-0 gap-3">
          {isConfirmingDelete ? (
            <div className="flex items-center gap-2 flex-1">
              <span className="text-xs font-bold text-rose-600 flex-1">Видалити цей видаток безповоротно?</span>
              <button onClick={handleDelete} disabled={isDeleting} className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-lg text-xs font-black uppercase tracking-widest">{isDeleting ? '...' : 'Так, видалити'}</button>
              <button onClick={() => setIsConfirmingDelete(false)} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-xs font-black uppercase tracking-widest">Назад</button>
            </div>
          ) : !isEditing ? (
            <>
              <button onClick={() => setIsConfirmingDelete(true)} className="px-4 py-2 text-rose-500 hover:bg-rose-50 rounded-xl text-xs font-black uppercase tracking-widest transition-colors flex items-center gap-2"><FaTrash size={12} /> Видалити</button>
              <div className="flex gap-2">
                <button onClick={() => setIsEditing(true)} className="px-4 py-2 text-amber-600 hover:bg-amber-50 rounded-xl text-xs font-black uppercase tracking-widest transition-colors flex items-center gap-2"><FaEdit size={12} /> Редагувати</button>
                <button onClick={onClose} className="px-6 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-colors">Закрити</button>
              </div>
            </>
          ) : <div></div>}
        </div>
      </div>
    </div>
  );
}
