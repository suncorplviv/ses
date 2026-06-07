import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { FaTimes, FaHardHat, FaSpinner, FaClipboardList } from 'react-icons/fa';

export default function ReserveDetailsModal({ isOpen, onClose, productId }) {
  const [loading, setLoading] = useState(true);
  const [reserves, setReserves] = useState([]);

  useEffect(() => {
    if (isOpen && productId) {
      fetchReserves();
    }
  }, [isOpen, productId]);

  const fetchReserves = async () => {
    setLoading(true);
    try {
      // Додали 'title' в блок deals, щоб витягнути назву угоди
      const { data, error } = await supabase
        .from('deal_bom')
        .select(`
          id,
          quantity_planned,
          status,
          created_at,
          deals ( custom_id, title ),
          users ( full_name )
        `)
        .eq('product_id', productId)
        .in('status', ['allocated', 'partially_allocated', 'planned'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      setReserves(data || []);
    } catch (error) {
      console.error('Помилка завантаження деталей резерву:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-fade-in">
      <div 
        className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Хедер модалки */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50">
          <h3 className="text-lg font-black text-slate-900 uppercase tracking-widest flex items-center gap-3">
            <div className="p-2.5 bg-amber-50 text-amber-500 rounded-xl shadow-sm border border-amber-100">
              <FaClipboardList size={18} />
            </div>
            Деталі резерву
          </h3>
          <button 
            onClick={onClose} 
            className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-colors"
          >
            <FaTimes size={20} />
          </button>
        </div>

        {/* Тіло модалки */}
        <div className="flex-1 overflow-auto custom-scrollbar p-6 bg-slate-50/50">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <FaSpinner className="animate-spin mb-3 text-amber-500" size={28} />
              <span className="text-[10px] font-black uppercase tracking-widest">Завантаження даних...</span>
            </div>
          ) : reserves.length === 0 ? (
            <div className="text-center py-12 text-slate-400 border-2 border-dashed border-slate-200 rounded-2xl bg-white shadow-sm">
              <div className="flex justify-center mb-3">
                <FaHardHat size={32} className="opacity-20" />
              </div>
              <p className="font-black text-xs uppercase tracking-widest">Активних резервів не знайдено</p>
              <p className="text-[10px] font-bold mt-1">Можливо, статус обладнання вже змінено на об'єкті.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {reserves.map((item) => (
                <div 
                  key={item.id} 
                  className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm hover:border-amber-200 transition-colors"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <FaHardHat className="text-slate-400 shrink-0" size={14} />
                      <span className="text-sm font-black text-slate-900 line-clamp-1">
                        СЕС №{item.deals?.custom_id || 'Невідомо'} {item.deals?.title ? `— ${item.deals.title}` : ''}
                      </span>
                    </div>
                    <div className="text-[10px] font-bold text-slate-400 mt-2 uppercase tracking-widest flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-500">
                        Додав(ла): {item.users?.full_name || 'Система'}
                      </span>
                      <span>•</span>
                      <span>{new Date(item.created_at).toLocaleDateString('uk-UA')}</span>
                    </div>
                  </div>
                  
                  <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2 shrink-0 border-t border-slate-100 sm:border-0 pt-3 sm:pt-0 mt-1 sm:mt-0">
                    <span className="inline-flex items-center justify-center px-4 py-1.5 bg-amber-50 text-amber-700 rounded-xl text-sm font-black border border-amber-100 shadow-sm">
                      {item.quantity_planned} шт.
                    </span>
                    <div className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${
                      item.status.includes('allocated') 
                        ? 'bg-sky-50 text-sky-600' 
                        : 'bg-slate-100 text-slate-500'
                    }`}>
                      {item.status.includes('allocated') ? 'Заброньовано' : 'В плані'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Футер */}
        <div className="px-6 py-4 border-t border-slate-100 bg-white flex justify-end shrink-0">
          <button 
            onClick={onClose}
            className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-black uppercase tracking-widest transition-colors shadow-sm"
          >
            Закрити
          </button>
        </div>

      </div>
    </div>
  );
}