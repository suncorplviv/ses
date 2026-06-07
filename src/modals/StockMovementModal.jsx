import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthProvider';
import { FaTimes, FaArrowDown, FaBox, FaClipboardList, FaCheckCircle } from 'react-icons/fa';

export default function StockMovementModal({ isOpen, onClose, stockItem, actionType, onSaveSuccess }) {
  const { employeeProfile } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    quantity: '',
    document_number: '',
    notes: ''
  });

  const getCurrentUserId = async () => {
    if (employeeProfile?.id) return employeeProfile.id;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) throw new Error('Не визначено поточного користувача.');
    return user.id;
  };

  if (!isOpen || !stockItem) return null;

  const isReceive = actionType === 'receive';
  const title = isReceive ? 'Оприбуткування товару' : 'Інвентаризаційне коригування';
  const subtitle = isReceive ? 'Поповнення конкретної локації' : 'Встановити фактичний залишок';
  const buttonText = isReceive ? 'ОПРИБУТКУВАТИ' : 'ЗАФІКСУВАТИ';

  const handleSubmit = async (e) => {
    e.preventDefault();

    const qty = parseFloat(formData.quantity);
    if (Number.isNaN(qty) || qty < 0 || (isReceive && qty <= 0)) {
      alert(isReceive ? 'Кількість має бути більшою за нуль' : 'Залишок не може бути від’ємним');
      return;
    }

    setIsSubmitting(true);

    try {
      const userId = await getCurrentUserId();

      const rpcName = isReceive ? 'erp_receive_stock' : 'erp_adjust_stock';
      const rpcPayload = isReceive
        ? {
            p_product_id: stockItem.product_id,
            p_quantity: qty,
            p_to_location_id: stockItem.location_id,
            p_performed_by: userId,
            p_document_number: formData.document_number || null,
            p_notes: formData.notes || null
          }
        : {
            p_product_id: stockItem.product_id,
            p_location_id: stockItem.location_id,
            p_new_quantity: qty,
            p_performed_by: userId,
            p_document_number: formData.document_number || null,
            p_notes: formData.notes || null
          };

      const { error } = await supabase.rpc(rpcName, rpcPayload);
      if (error) throw error;

      setFormData({ quantity: '', document_number: '', notes: '' });
      onSaveSuccess();
      onClose();
    } catch (error) {
      console.error(error);
      alert('Помилка складської операції: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
        <div className={`p-6 border-b border-slate-100 flex justify-between items-center text-white ${isReceive ? 'bg-emerald-600' : 'bg-slate-900'}`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${isReceive ? 'bg-white text-emerald-600' : 'bg-amber-500 text-slate-900'}`}>
              {isReceive ? <FaArrowDown size={18}/> : <FaCheckCircle size={18}/>}
            </div>
            <div>
              <h3 className="text-lg font-black uppercase tracking-tight">{title}</h3>
              <p className={`text-[10px] font-bold uppercase mt-0.5 tracking-widest ${isReceive ? 'text-emerald-100' : 'text-amber-400'}`}>
                {subtitle}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors">
            <FaTimes size={18} />
          </button>
        </div>

        <form id="movementForm" onSubmit={handleSubmit} className="p-6 md:p-8 space-y-6 bg-slate-50/50">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 shrink-0">
              <FaBox size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-bold text-slate-900 truncate">{stockItem.product_name}</h4>
              <p className="text-[10px] font-mono text-slate-500">SKU: {stockItem.sku || stockItem.custom_id}</p>
              <p className="text-[10px] font-black uppercase text-amber-600 mt-1">{stockItem.location_name}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[10px] font-black uppercase text-slate-400">Фізично є</p>
              <p className="text-sm font-black text-slate-800">{stockItem.physical_stock} <span className="text-xs text-slate-500">{stockItem.unit}</span></p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">
                {isReceive ? `Кількість приходу (${stockItem.unit}) *` : `Фактичний залишок (${stockItem.unit}) *`}
              </label>
              <input 
                type="number"
                step="0.01"
                required
                min={isReceive ? '0.01' : '0'}
                value={formData.quantity} 
                onChange={e => setFormData({...formData, quantity: e.target.value})} 
                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-lg font-black text-center outline-none focus:border-amber-500 transition-colors"
                placeholder={isReceive ? '0.00' : String(stockItem.physical_stock || 0)}
              />
            </div>

            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1 flex items-center gap-1.5">
                <FaClipboardList /> Номер документа
              </label>
              <input 
                type="text" 
                value={formData.document_number} 
                onChange={e => setFormData({...formData, document_number: e.target.value})} 
                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-amber-500 transition-colors"
                placeholder={isReceive ? 'ВХ-123456' : 'ІНВ-0001'}
              />
            </div>

            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Коментар</label>
              <textarea 
                rows="2"
                value={formData.notes} 
                onChange={e => setFormData({...formData, notes: e.target.value})} 
                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-amber-500 resize-none transition-colors"
                placeholder={isReceive ? 'Закупка у постачальника...' : 'Результат інвентаризації...'}
              />
            </div>
          </div>
        </form>

        <div className="p-6 border-t border-slate-100 flex justify-end gap-3 bg-white shrink-0">
          <button type="button" onClick={onClose} className="px-6 py-3.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
            Скасувати
          </button>
          <button 
            form="movementForm" 
            type="submit" 
            disabled={isSubmitting} 
            className={`px-8 py-3.5 text-xs font-black uppercase tracking-widest rounded-xl transition-all disabled:opacity-50 active:scale-95 flex items-center gap-2 text-white shadow-lg ${
              isReceive 
                ? 'bg-emerald-500 hover:bg-emerald-400 shadow-emerald-500/30' 
                : 'bg-amber-500 hover:bg-amber-400 shadow-amber-500/30 text-slate-900'
            }`}
          >
            {isSubmitting ? 'ОБРОБКА...' : buttonText}
          </button>
        </div>
      </div>
    </div>
  );
}
