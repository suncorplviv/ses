import React, { useState, useMemo } from 'react';
import {
  FaArrowLeft, FaHardHat, FaCheckCircle, FaCalendarAlt, FaUsers, FaClock, FaTools
} from 'react-icons/fa';
import CrewVisitsManager from './CrewVisitsManager';
import MountJournal from './MountJournal';

// РОБОЧИЙ ПРОСТІР завдання "Організація роботи монтажної бригади":
// повноекранний вигляд із секціями (як журнал монтажу), а не модальне вікно.
// Секція "Бригада та виїзди" — зведення + графік виїздів.
// Секція "Звіт монтажу" — повний журнал: звіти "встановлено сьогодні",
// прийом поставок, фіксація послуг (спільний MountJournal).
export default function DealCrewSchedule({ dealId, onBack, onCompleteTask }) {
  const [visits, setVisits] = useState([]);
  const [activeSection, setActiveSection] = useState('crew'); // 'crew' | 'mount'

  // Статистика монтажу для бейджа вкладки (рахує MountJournal)
  const [mountStats, setMountStats] = useState({ total: 0, mounted: 0, allMounted: false });

  const summary = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const upcoming = visits
      .filter(v => v.scheduled_date && new Date(v.scheduled_date) >= today)
      .sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date));

    const workerIds = new Set();
    visits.forEach(v => (v.installation_workers || []).forEach(w => w.worker_id && workerIds.add(w.worker_id)));

    const withoutCrew = visits.filter(v => (v.installation_workers || []).length === 0).length;

    return {
      total: visits.length,
      nextDate: upcoming[0]?.scheduled_date || null,
      peopleCount: workerIds.size,
      withoutCrew
    };
  }, [visits]);

  // Організацію можна підтверджувати, коли є хоча б один виїзд і всюди призначена бригада
  const canComplete = visits.length > 0 && summary.withoutCrew === 0;

  return (
    <div className="flex flex-col h-full bg-slate-50 min-h-screen">

      {/* ХЕДЕР */}
      <div className="bg-white mx-4 md:mx-6 mt-4 px-5 py-3 border border-slate-200 rounded-2xl flex justify-between items-center shadow-sm shrink-0">
        <button onClick={onBack} className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 rounded-xl text-xs font-black uppercase tracking-widest transition-colors">
          <FaArrowLeft size={12}/> Назад
        </button>

        <h2 className="text-sm md:text-base font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
          <FaHardHat className="text-amber-500"/> Організація монтажної бригади
        </h2>

        <div className="flex items-center justify-end min-w-[130px]">
          {canComplete && onCompleteTask && (
            <button onClick={onCompleteTask} className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex justify-center items-center gap-2 transition-all shadow-md shadow-emerald-500/30">
              <FaCheckCircle size={14}/> Підтвердити організацію
            </button>
          )}
        </div>
      </div>

      <div className="p-4 md:p-6 space-y-4 flex-1 overflow-y-auto">
        <div className="animate-fade-in space-y-4">

          {/* ПЕРЕМИКАЧ СЕКЦІЙ */}
          <div className="bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm grid grid-cols-2 gap-1.5">
            <button
              onClick={() => setActiveSection('crew')}
              className={`py-3 rounded-xl text-[10px] md:text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${activeSection === 'crew' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              <FaUsers size={13}/> Бригада та виїзди
              {summary.total > 0 && <span className={`px-1.5 py-0.5 rounded-full text-[9px] ${activeSection === 'crew' ? 'bg-amber-500 text-slate-900' : 'bg-slate-100 text-slate-500'}`}>{summary.total}</span>}
            </button>
            <button
              onClick={() => setActiveSection('mount')}
              className={`py-3 rounded-xl text-[10px] md:text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${activeSection === 'mount' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              <FaTools size={13}/> Звіт монтажу
              {mountStats.total > 0 && <span className={`px-1.5 py-0.5 rounded-full text-[9px] ${activeSection === 'mount' ? 'bg-amber-500 text-slate-900' : 'bg-slate-100 text-slate-500'}`}>{mountStats.mounted}/{mountStats.total}</span>}
            </button>
          </div>

          {/* ======== СЕКЦІЯ: БРИГАДА ТА ВИЇЗДИ ======== */}
          {activeSection === 'crew' && (
            <>
              {/* Зведення по організації */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mb-1"><FaCalendarAlt className="text-amber-500" size={10}/> Виїздів заплановано</p>
                  <p className="text-2xl font-black text-slate-800">{summary.total}</p>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mb-1"><FaClock className="text-sky-500" size={10}/> Найближчий виїзд</p>
                  <p className="text-lg font-black text-slate-800 mt-1.5">
                    {summary.nextDate
                      ? new Date(summary.nextDate).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' })
                      : <span className="text-slate-300 text-sm">Не заплановано</span>}
                  </p>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mb-1"><FaUsers className="text-emerald-500" size={10}/> Людей задіяно</p>
                  <p className="text-2xl font-black text-slate-800">{summary.peopleCount}</p>
                </div>
                <div className={`p-4 rounded-2xl border shadow-sm ${summary.withoutCrew > 0 ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200'}`}>
                  <p className={`text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 mb-1 ${summary.withoutCrew > 0 ? 'text-rose-500' : 'text-emerald-600'}`}>
                    <FaHardHat size={10}/> Без бригади
                  </p>
                  <p className={`text-2xl font-black ${summary.withoutCrew > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{summary.withoutCrew}</p>
                </div>
              </div>

              {summary.withoutCrew > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-xs font-bold text-amber-800">
                  Щоб підтвердити організацію, призначте бригаду на кожен запланований виїзд.
                  Нагадування: один монтажник — один об'єкт на день.
                </div>
              )}

              <CrewVisitsManager dealId={dealId} onVisitsChange={setVisits}/>
            </>
          )}

          {/* ======== СЕКЦІЯ: ЗВІТ МОНТАЖУ (повний журнал) ======== */}
          {activeSection === 'mount' && (
            <MountJournal dealId={dealId} onStatsChange={setMountStats}/>
          )}
        </div>
      </div>
    </div>
  );
}
