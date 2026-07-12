import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthProvider';
import {
  FaTimes, FaMicrochip, FaPlus, FaTrash, FaSave, FaSolarPanel,
  FaBatteryFull, FaWifi, FaMemory, FaBarcode
} from 'react-icons/fa';
import ConfirmDialog from './ConfirmDialog';

// Типи обладнання з серійними номерами
const EQUIPMENT_TYPES = {
  inverter: { label: 'Інвертор',    icon: FaSolarPanel,  color: 'text-amber-500' },
  logger:   { label: 'Дата-логер',  icon: FaWifi,        color: 'text-sky-500' },
  battery:  { label: 'Акумулятор',  icon: FaBatteryFull, color: 'text-emerald-500' },
  bms:      { label: 'BMS',         icon: FaMemory,      color: 'text-violet-500' },
};

// Паспорт обладнання угоди: моніторинг (назва станції, програма)
// + серійні номери (кілька на кожен тип). Відкривається з картки угоди
// та з вікна клієнта.
export default function DealEquipmentModal({ isOpen, onClose, dealId, dealLabel }) {
  const { employeeProfile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [serials, setSerials] = useState([]);
  const [monitoring, setMonitoring] = useState({ monitoring_station_name: '', monitoring_program: '' });
  const [isSavingMonitoring, setIsSavingMonitoring] = useState(false);

  const [newSerial, setNewSerial] = useState({ equipment_type: 'inverter', serial_number: '' });
  const [isAdding, setIsAdding] = useState(false);
  const [serialToDelete, setSerialToDelete] = useState(null);

  useEffect(() => {
    if (isOpen && dealId) fetchAll();
  }, [isOpen, dealId]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [dealRes, serialsRes] = await Promise.all([
        supabase.from('deals').select('monitoring_station_name, monitoring_program').eq('id', dealId).single(),
        supabase.from('deal_equipment_serials').select('*').eq('deal_id', dealId).order('created_at', { ascending: true })
      ]);
      setMonitoring({
        monitoring_station_name: dealRes.data?.monitoring_station_name || '',
        monitoring_program: dealRes.data?.monitoring_program || ''
      });
      setSerials(serialsRes.data || []);
    } catch (err) {
      console.error('Помилка завантаження обладнання:', err);
      if (String(err?.message || '').includes('deal_equipment_serials')) {
        alert('Таблиця серійників не знайдена. Виконайте міграцію src/sql/equipment_serials_migration.sql');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSaveMonitoring = async () => {
    setIsSavingMonitoring(true);
    const { error } = await supabase.from('deals').update({
      monitoring_station_name: monitoring.monitoring_station_name || null,
      monitoring_program: monitoring.monitoring_program || null
    }).eq('id', dealId);
    if (error) alert('Помилка збереження: ' + error.message);
    else {
      await supabase.from('deal_activity_log').insert([{
        deal_id: dealId, user_id: employeeProfile?.id || null,
        action: `Оновлено дані моніторингу: ${monitoring.monitoring_station_name || '—'} (${monitoring.monitoring_program || '—'})`
      }]);
    }
    setIsSavingMonitoring(false);
  };

  const handleAddSerial = async (e) => {
    e.preventDefault();
    const sn = newSerial.serial_number.trim();
    if (!sn) return;
    setIsAdding(true);
    try {
      const { error } = await supabase.from('deal_equipment_serials').insert([{
        deal_id: dealId,
        equipment_type: newSerial.equipment_type,
        serial_number: sn,
        created_by: employeeProfile?.id || null
      }]);
      if (error) throw error;

      await supabase.from('deal_activity_log').insert([{
        deal_id: dealId, user_id: employeeProfile?.id || null,
        action: `Додано серійний номер (${EQUIPMENT_TYPES[newSerial.equipment_type]?.label}): ${sn}`
      }]);

      setNewSerial(prev => ({ ...prev, serial_number: '' }));
      fetchAll();
    } catch (err) {
      alert('Помилка додавання: ' + err.message);
    } finally {
      setIsAdding(false);
    }
  };

  const executeDeleteSerial = async () => {
    if (!serialToDelete) return;
    await supabase.from('deal_equipment_serials').delete().eq('id', serialToDelete.id);
    await supabase.from('deal_activity_log').insert([{
      deal_id: dealId, user_id: employeeProfile?.id || null,
      action: `Видалено серійний номер (${EQUIPMENT_TYPES[serialToDelete.equipment_type]?.label}): ${serialToDelete.serial_number}`
    }]);
    setSerialToDelete(null);
    fetchAll();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[170] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in overflow-y-auto custom-scrollbar">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl flex flex-col my-auto overflow-hidden max-h-[90vh]">

        <div className="p-6 border-b border-slate-100 bg-slate-900 text-white flex justify-between items-center shrink-0">
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
              <FaMicrochip className="text-amber-400"/> Обладнання станції
            </h3>
            <p className="text-[10px] font-medium mt-1 text-slate-400 line-clamp-1">{dealLabel}</p>
          </div>
          <button onClick={onClose} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"><FaTimes size={16}/></button>
        </div>

        <div className="p-6 space-y-5 bg-slate-50/50 flex-1 overflow-y-auto custom-scrollbar">
          {loading ? (
            <div className="py-12 text-center text-slate-400 font-black uppercase text-xs animate-pulse">Завантаження...</div>
          ) : (
            <>
              {/* МОНІТОРИНГ */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Моніторинг станції</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[9px] font-black text-slate-400 uppercase mb-1 ml-1">Назва станції в програмі</label>
                    <input type="text" value={monitoring.monitoring_station_name}
                      onChange={e => setMonitoring({ ...monitoring, monitoring_station_name: e.target.value })}
                      placeholder="Напр: СЕС-Іваненко-01"
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-amber-500"/>
                  </div>
                  <div>
                    <label className="block text-[9px] font-black text-slate-400 uppercase mb-1 ml-1">Програма моніторингу</label>
                    <input type="text" value={monitoring.monitoring_program}
                      onChange={e => setMonitoring({ ...monitoring, monitoring_program: e.target.value })}
                      placeholder="Напр: SolarmanPV, SolisCloud..."
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-amber-500"/>
                  </div>
                </div>
                <button onClick={handleSaveMonitoring} disabled={isSavingMonitoring}
                  className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors flex items-center gap-2">
                  <FaSave size={11}/> {isSavingMonitoring ? 'Зберігаємо...' : 'Зберегти моніторинг'}
                </button>
              </div>

              {/* ДОДАВАННЯ СЕРІЙНИКА */}
              <form onSubmit={handleAddSerial} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Додати серійний номер</p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <select value={newSerial.equipment_type}
                    onChange={e => setNewSerial({ ...newSerial, equipment_type: e.target.value })}
                    className="sm:w-44 px-3 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-amber-500 cursor-pointer">
                    {Object.entries(EQUIPMENT_TYPES).map(([key, t]) => (
                      <option key={key} value={key}>{t.label}</option>
                    ))}
                  </select>
                  <div className="relative flex-1">
                    <FaBarcode className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={13}/>
                    <input type="text" value={newSerial.serial_number}
                      onChange={e => setNewSerial({ ...newSerial, serial_number: e.target.value })}
                      placeholder="Серійний номер..."
                      className="w-full pl-10 pr-3 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold font-mono outline-none focus:border-amber-500"/>
                  </div>
                  <button type="submit" disabled={isAdding || !newSerial.serial_number.trim()}
                    className="px-5 py-3 bg-amber-400 hover:bg-amber-500 disabled:bg-slate-200 disabled:text-slate-400 text-slate-900 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-md shadow-amber-400/30">
                    <FaPlus size={10}/> Додати
                  </button>
                </div>
              </form>

              {/* СПИСОК СЕРІЙНИКІВ ПО ТИПАХ */}
              {serials.length === 0 ? (
                <div className="py-8 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-white">
                  <FaBarcode className="mx-auto text-slate-200 mb-2" size={28}/>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Серійних номерів ще не додано</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {Object.entries(EQUIPMENT_TYPES).map(([key, t]) => {
                    const typeSerials = serials.filter(s => s.equipment_type === key);
                    if (typeSerials.length === 0) return null;
                    const Icon = t.icon;
                    return (
                      <div key={key} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                          <Icon className={t.color} size={13}/>
                          <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">{t.label}</span>
                          <span className="text-[9px] font-black text-slate-400 bg-white border border-slate-200 px-1.5 py-0.5 rounded ml-auto">{typeSerials.length}</span>
                        </div>
                        <div className="divide-y divide-slate-50">
                          {typeSerials.map(s => (
                            <div key={s.id} className="px-4 py-2.5 flex items-center justify-between gap-3 group">
                              <span className="text-sm font-bold font-mono text-slate-800 break-all">{s.serial_number}</span>
                              <button onClick={() => setSerialToDelete(s)}
                                className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all shrink-0" title="Видалити">
                                <FaTrash size={11}/>
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        <div className="p-4 border-t border-slate-100 bg-white shrink-0">
          <button onClick={onClose} className="w-full py-3 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors">
            Закрити
          </button>
        </div>
      </div>

      <ConfirmDialog
        isOpen={!!serialToDelete}
        title="Видалити серійний номер?"
        message={serialToDelete ? `${EQUIPMENT_TYPES[serialToDelete.equipment_type]?.label}: «${serialToDelete.serial_number}»` : ''}
        onConfirm={executeDeleteSerial}
        onCancel={() => setSerialToDelete(null)}
      />
    </div>
  );
}
