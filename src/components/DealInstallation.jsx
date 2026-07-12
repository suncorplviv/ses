import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import {
  FaHardHat, FaArrowLeft, FaCheckCircle, FaWifi, FaSave, FaEdit, FaUsers, FaTools
} from 'react-icons/fa';
import CrewVisitsManager from './CrewVisitsManager';
import MountJournal from './MountJournal';

// ЖУРНАЛ МОНТАЖУ (етап монтажних робіт).
// Секції: "Журнал монтажу" (моніторинг + звіти по специфікації, спільний MountJournal)
// та "Бригада та виїзди" (спільний CrewVisitsManager).
export default function DealInstallation({ dealId, onProgressUpdate, onBack, onCompleteTask }) {

  // Лічильники для бейджів вкладок і кнопки "Завершити"
  const [visitsCount, setVisitsCount] = useState(0);
  const [isAllMounted, setIsAllMounted] = useState(false);

  // СЕКЦІЇ ЖУРНАЛУ: монтаж обладнання / бригада та виїзди
  const [activeSection, setActiveSection] = useState('mount'); // 'mount' | 'crew'

  // МОНІТОРИНГ СТАНЦІЇ (назва станції моніторингу + програма/платформа)
  const [monitoringData, setMonitoringData] = useState({ monitoring_station_name: '', monitoring_program: '' });
  const [isEditingMonitoring, setIsEditingMonitoring] = useState(false);
  const [isSavingMonitoring, setIsSavingMonitoring] = useState(false);

  useEffect(() => {
    fetchMonitoringData();
    fetchVisitsCount();
  }, [dealId]);

  // Лічильник виїздів для бейджа вкладки (сама секція живе в CrewVisitsManager)
  const fetchVisitsCount = async () => {
    const { count } = await supabase
      .from('installations')
      .select('id', { count: 'exact', head: true })
      .eq('deal_id', dealId);
    setVisitsCount(count || 0);
  };

  // ====================== МОНІТОРИНГ СТАНЦІЇ ======================
  const fetchMonitoringData = async () => {
    const { data } = await supabase.from('deals').select('monitoring_station_name, monitoring_program').eq('id', dealId).single();
    if (data) {
      setMonitoringData({
        monitoring_station_name: data.monitoring_station_name || '',
        monitoring_program: data.monitoring_program || ''
      });
    }
  };

  const handleSaveMonitoring = async () => {
    setIsSavingMonitoring(true);
    try {
      const { error } = await supabase.from('deals').update({
        monitoring_station_name: monitoringData.monitoring_station_name || null,
        monitoring_program: monitoringData.monitoring_program || null
      }).eq('id', dealId);
      if (error) throw error;
      setIsEditingMonitoring(false);
    } catch (err) {
      alert('Помилка збереження даних моніторингу: ' + err.message);
    } finally {
      setIsSavingMonitoring(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 min-h-screen">

      <div className="bg-white mx-4 md:mx-6 mt-4 px-5 py-3 border border-slate-200 rounded-2xl flex justify-between items-center shadow-sm shrink-0">
        <button onClick={onBack} className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 rounded-xl text-xs font-black uppercase tracking-widest transition-colors">
          <FaArrowLeft size={12}/> Назад
        </button>

        <h2 className="text-sm md:text-base font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
          <FaHardHat className="text-amber-500"/> Журнал монтажу
        </h2>

        <div className="flex items-center justify-end w-[130px]">
          {isAllMounted && onCompleteTask && (
            <button onClick={onCompleteTask} className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex justify-center items-center gap-2 transition-all shadow-md shadow-emerald-500/30">
              <FaCheckCircle size={14}/> Завершити
            </button>
          )}
        </div>
      </div>

      <div className="p-4 md:p-6 space-y-6 flex-1 overflow-y-auto">
        <div className="animate-fade-in space-y-4">

          {/* СЕКЦІЇ ЖУРНАЛУ */}
          <div className="bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm grid grid-cols-2 gap-1.5">
            <button
              onClick={() => setActiveSection('mount')}
              className={`py-3 rounded-xl text-[10px] md:text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${activeSection === 'mount' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              <FaTools size={13}/> Журнал монтажу
            </button>
            <button
              onClick={() => setActiveSection('crew')}
              className={`py-3 rounded-xl text-[10px] md:text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${activeSection === 'crew' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              <FaUsers size={13}/> Бригада та виїзди
              {visitsCount > 0 && <span className={`px-1.5 py-0.5 rounded-full text-[9px] ${activeSection === 'crew' ? 'bg-amber-500 text-slate-900' : 'bg-slate-100 text-slate-500'}`}>{visitsCount}</span>}
            </button>
          </div>

          {/* МОНІТОРИНГ СТАНЦІЇ */}
          {activeSection === 'mount' && (
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2"><FaWifi className="text-sky-500"/> Моніторинг станції</h3>
              {!isEditingMonitoring && (
                <button onClick={() => setIsEditingMonitoring(true)} className="text-[10px] font-black uppercase text-sky-700 bg-sky-50 hover:bg-sky-100 px-3 py-1.5 rounded-lg border border-sky-200 flex items-center gap-1.5 transition-colors">
                  <FaEdit size={10}/> {monitoringData.monitoring_station_name || monitoringData.monitoring_program ? 'Редагувати' : 'Заповнити'}
                </button>
              )}
            </div>

            {isEditingMonitoring ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-fade-in">
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase mb-1.5 ml-1">Назва станції моніторингу</label>
                  <input type="text" autoFocus value={monitoringData.monitoring_station_name} onChange={e => setMonitoringData({...monitoringData, monitoring_station_name: e.target.value})} placeholder="Напр: СЕС-Іваненко-01" className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-sky-500"/>
                </div>
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase mb-1.5 ml-1">Програма / платформа моніторингу</label>
                  <input type="text" value={monitoringData.monitoring_program} onChange={e => setMonitoringData({...monitoringData, monitoring_program: e.target.value})} placeholder="Напр: SolarmanPV, SolisCloud..." className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-sky-500"/>
                </div>
                <div className="sm:col-span-2 flex gap-2 justify-end">
                  <button onClick={() => { setIsEditingMonitoring(false); fetchMonitoringData(); }} className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">Скасувати</button>
                  <button onClick={handleSaveMonitoring} disabled={isSavingMonitoring} className="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white text-xs font-black uppercase tracking-widest rounded-lg transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"><FaSave size={12}/> {isSavingMonitoring ? 'Збереження...' : 'Зберегти'}</button>
                </div>
              </div>
            ) : (
              monitoringData.monitoring_station_name || monitoringData.monitoring_program ? (
                <div className="flex flex-wrap gap-2 text-xs font-bold text-slate-700">
                  {monitoringData.monitoring_station_name && <span className="bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">Станція: {monitoringData.monitoring_station_name}</span>}
                  {monitoringData.monitoring_program && <span className="bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">Програма: {monitoringData.monitoring_program}</span>}
                </div>
              ) : (
                <div className="text-center py-3 text-xs font-bold text-slate-400 uppercase tracking-widest border-2 border-dashed border-slate-200 rounded-xl">Дані моніторингу ще не внесено</div>
              )
            )}
          </div>
          )}

          {/* СЕКЦІЯ: БРИГАДА ТА ВИЇЗДИ (спільний компонент) */}
          {activeSection === 'crew' && (
            <CrewVisitsManager dealId={dealId} onVisitsChange={(v) => setVisitsCount(v.length)}/>
          )}

          {/* СЕКЦІЯ: МОНТАЖ ОБЛАДНАННЯ (спільний компонент) */}
          {activeSection === 'mount' && (
            <MountJournal
              dealId={dealId}
              onProgressUpdate={onProgressUpdate}
              onStatsChange={({ allMounted }) => setIsAllMounted(allMounted)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
