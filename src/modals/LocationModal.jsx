import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { FaTimes, FaSave, FaWarehouse, FaInfoCircle } from 'react-icons/fa';

export default function LocationModal({ isOpen, onClose, locationToEdit, onSaveSuccess }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    type: 'warehouse',
    notes: '',
    is_active: true
  });

  useEffect(() => {
    if (isOpen) {
      if (locationToEdit) {
        setFormData({
          name: locationToEdit.name || '',
          type: locationToEdit.type || 'warehouse',
          notes: locationToEdit.notes || '',
          is_active: locationToEdit.is_active ?? true
        });
      } else {
        setFormData({ name: '', type: 'warehouse', notes: '', is_active: true });
      }
    }
  }, [isOpen, locationToEdit]);

  const ensureSupplierExists = async (name) => {
    const supplierName = name.trim();
    if (!supplierName) return;

    const { data: existingSupplier, error: findError } = await supabase
      .from('suppliers')
      .select('id')
      .ilike('name', supplierName)
      .limit(1)
      .maybeSingle();

    if (findError) throw findError;
    if (existingSupplier?.id) return;

    const { error: insertError } = await supabase
      .from('suppliers')
      .insert([{ name: supplierName }]);

    if (insertError) throw insertError;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      if (formData.type === 'supplier') {
        await ensureSupplierExists(formData.name);
      }

      const payload = {
        name: formData.name,
        type: formData.type,
        notes: formData.notes || null,
        is_active: formData.is_active,
        // Ми не даємо ставити is_default вручну через форму, щоб не зламати унікальний індекс БД.
        // Основний склад задається адміністратором при налаштуванні.
      };

      let error;
      if (locationToEdit) {
        const { error: updateError } = await supabase.from('stock_locations').update(payload).eq('id', locationToEdit.id);
        error = updateError;
      } else {
        const { error: insertError } = await supabase.from('stock_locations').insert([payload]);
        error = insertError;
      }

      if (error) throw error;
      onSaveSuccess();
      onClose();
    } catch (error) {
      alert('Помилка збереження локації: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden relative">
        
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-900 text-white rounded-t-3xl">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500 text-white rounded-lg"><FaWarehouse size={18}/></div>
            <div>
              <h3 className="text-lg font-black uppercase tracking-tight">
                {locationToEdit ? 'Редагування локації' : 'Новий склад / постачальник'}
              </h3>
            </div>
          </div>
          <button onClick={onClose} className="p-2 bg-white/10 text-white hover:bg-white/20 rounded-full transition-colors">
            <FaTimes size={18} />
          </button>
        </div>

        <form id="locationForm" onSubmit={handleSubmit} className="p-6 space-y-5 bg-slate-50/50">
          
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Назва локації *</label>
            <input 
              type="text" required autoFocus
              placeholder="Напр: Основний склад або назва постачальника" 
              value={formData.name} 
              onChange={e => setFormData({...formData, name: e.target.value})} 
              className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-emerald-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Тип локації *</label>
            <select 
              value={formData.type} 
              onChange={e => setFormData({...formData, type: e.target.value})} 
              disabled={!!locationToEdit && locationToEdit.is_default}
              className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-emerald-500 cursor-pointer disabled:bg-slate-100 disabled:text-slate-400"
            >
              <option value="warehouse">Наш склад</option>
              <option value="supplier">Постачальник</option>
            </select>
            {formData.type === 'supplier' && (
              <p className="text-[9px] text-slate-500 mt-1 ml-1 font-bold flex items-center gap-1">
                <FaInfoCircle/> Така назва також буде доступна як постачальник у закупівлях.
              </p>
            )}
            {locationToEdit?.is_default && (
              <p className="text-[9px] text-amber-600 mt-1 ml-1 font-bold flex items-center gap-1">
                <FaInfoCircle/> Це основний склад, тип змінити неможливо.
              </p>
            )}
          </div>

          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Нотатки / Адреса</label>
            <textarea 
              rows="2"
              placeholder="Адреса складу або ПІБ водія..." 
              value={formData.notes} 
              onChange={e => setFormData({...formData, notes: e.target.value})} 
              className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-emerald-500 resize-none transition-colors"
            />
          </div>

          <div className="pt-2 border-t border-slate-100">
            <label className="flex items-center gap-3 cursor-pointer p-4 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
              <input 
                type="checkbox" 
                checked={formData.is_active} 
                onChange={e => setFormData({...formData, is_active: e.target.checked})} 
                className="w-5 h-5 text-emerald-500 rounded focus:ring-emerald-500"
              />
              <span className="text-xs font-black uppercase text-slate-700 tracking-widest">Локація активна</span>
            </label>
          </div>

        </form>

        <div className="p-6 border-t border-slate-100 flex justify-end gap-3 bg-white rounded-b-3xl shrink-0">
          <button type="button" onClick={onClose} className="px-6 py-3.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">Скасувати</button>
          <button form="locationForm" type="submit" disabled={isSubmitting} className="px-8 py-3.5 bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-colors disabled:opacity-50 shadow-lg shadow-emerald-500/30 active:scale-95 flex items-center gap-2">
            <FaSave size={14} />
            {isSubmitting ? 'ЗБЕРЕЖЕННЯ...' : 'ЗБЕРЕГТИ'}
          </button>
        </div>
      </div>
    </div>
  );
}
