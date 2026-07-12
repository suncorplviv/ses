import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { getCurrentMonthRange } from '../utils/dateTime';
import {
  FaCalendarAlt, FaSearch, FaUserTie, FaMapMarkerAlt, FaArrowRight,
  FaCheckCircle, FaBuilding, FaUser, FaUsers, FaClock, FaPlus
} from 'react-icons/fa';
import InstallationCrewModal from '../modals/InstallationCrewModal';

export default function InstallationCalendar() {
  const navigate = useNavigate();
  const [visits, setVisits] = useState([]);
  const [team, setTeam] = useState([]);
  const [loading, setLoading] = useState(true);

  const [viewMode, setViewMode] = useState('objects'); // 'objects' | 'employee'

  // Планування / редагування виїзду
  const [isCrewModalOpen, setIsCrewModalOpen] = useState(false);
  const [editingVisit, setEditingVisit] = useState(null);

  // --- Режим "За об'єктами" ---
  const [searchTerm, setSearchTerm] = useState('');
  const [showPast, setShowPast] = useState(false);

  // --- Режим "За працівником" ---
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [employeeRange, setEmployeeRange] = useState(getCurrentMonthRange());

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('installations')
        .select(`
          *,
          deals(custom_id, title, clients(name, client_type), site_surveys(region, city)),
          installation_workers(id, worker_id, users(full_name))
        `)
        .order('scheduled_date', { ascending: true });
      if (error) throw error;
      setVisits(data || []);

      const { data: teamData } = await supabase.from('users').select('id, full_name, role').eq('is_active', true).order('full_name');
      setTeam(teamData || []);
    } catch (error) {
      console.error('Помилка завантаження графіку монтажів:', error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // ---------------- РЕЖИМ "ЗА ОБ'ЄКТАМИ" ----------------
  const filteredByObject = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const search = searchTerm.toLowerCase();

    return visits.filter(v => {
      const matchesSearch = !search ||
        v.deals?.title?.toLowerCase().includes(search) ||
        v.deals?.clients?.name?.toLowerCase().includes(search) ||
        v.deals?.custom_id?.toString().includes(search);

      const matchesDate = showPast ? true : (!v.scheduled_date || new Date(v.scheduled_date) >= today);

      return matchesSearch && matchesDate;
    });
  }, [visits, searchTerm, showPast]);

  const groupedByDate = useMemo(() => {
    const groups = new Map();
    filteredByObject.forEach(v => {
      const key = v.scheduled_date || 'Без дати';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(v);
    });
    return Array.from(groups.entries()).sort((a, b) => new Date(a[0]) - new Date(b[0]));
  }, [filteredByObject]);

  // ---------------- РЕЖИМ "ЗА ПРАЦІВНИКОМ" ----------------
  const employeeVisits = useMemo(() => {
    if (!selectedEmployeeId) return [];
    return visits
      .filter(v => (v.installation_workers || []).some(w => w.worker_id === selectedEmployeeId))
      .filter(v => {
        if (!v.scheduled_date) return true;
        const d = new Date(v.scheduled_date);
        const matchesFrom = employeeRange.dateFrom ? d >= new Date(employeeRange.dateFrom) : true;
        const matchesTo = employeeRange.dateTo ? d <= new Date(employeeRange.dateTo + 'T23:59:59') : true;
        return matchesFrom && matchesTo;
      })
      .sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date));
  }, [visits, selectedEmployeeId, employeeRange]);

  const selectedEmployee = team.find(u => u.id === selectedEmployeeId);

  const renderVisitCard = (visit) => {
    const isBusiness = visit.deals?.clients?.client_type === 'Юридична особа';
    const survey = Array.isArray(visit.deals?.site_surveys) ? visit.deals.site_surveys[0] : visit.deals?.site_surveys;
    const location = [survey?.region, survey?.city].filter(Boolean).join(', ');
    const workers = visit.installation_workers || [];

    return (
      <div
        key={visit.id}
        onClick={() => { setEditingVisit(visit); setIsCrewModalOpen(true); }}
        title="Редагувати виїзд та склад бригади"
        className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:border-amber-400 hover:shadow-md transition-all cursor-pointer group"
      >
        <div className="flex justify-between items-start gap-3 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`flex items-center justify-center w-8 h-8 rounded-xl shrink-0 ${isBusiness ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-500'}`}>
              {isBusiness ? <FaBuilding size={13} /> : <FaUser size={13} />}
            </span>
            <div className="min-w-0">
              <p className="font-bold text-slate-900 text-sm truncate group-hover:text-amber-600 transition-colors">{visit.deals?.title || 'Угода'}</p>
              <p className="text-[10px] text-slate-400 font-bold uppercase truncate">{visit.deals?.clients?.name} {visit.deals?.custom_id && `· №${visit.deals.custom_id}`}</p>
            </div>
          </div>
          <span className={`text-[9px] font-black uppercase px-2 py-1 rounded-md border shrink-0 flex items-center gap-1 ${visit.is_ready ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
            {visit.is_ready && <FaCheckCircle size={9} />}{visit.is_ready ? 'Готово' : 'Заплановано'}
          </span>
        </div>

        {location && (
          <p className="text-[10px] font-bold text-slate-500 flex items-center gap-1.5 mb-2"><FaMapMarkerAlt className="text-slate-400" size={10} /> {location}</p>
        )}

        {visit.notes && <p className="text-xs text-slate-500 mb-2">{visit.notes}</p>}

        <div className="flex flex-wrap gap-1.5 items-center justify-between">
          <div className="flex flex-wrap gap-1.5">
            {workers.length === 0 ? (
              <span className="text-[10px] font-bold text-slate-300 uppercase flex items-center gap-1"><FaUserTie size={10} /> Бригада не призначена</span>
            ) : workers.map(w => (
              <span key={w.id} className="text-[10px] font-bold bg-slate-50 border border-slate-200 px-2 py-1 rounded-lg flex items-center gap-1"><FaUserTie size={9} className="text-amber-500" /> {w.users?.full_name}</span>
            ))}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); visit.deal_id && navigate(`/deals/${visit.deal_id}`); }}
            title="Відкрити угоду"
            className="p-2 text-slate-300 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-colors shrink-0"
          >
            <FaArrowRight size={12} />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8 space-y-6 bg-slate-50 min-h-full">

      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-5">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <h1 className="text-xl md:text-2xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-3">
            <div className="p-2.5 bg-amber-500 text-slate-900 rounded-xl shadow-lg shadow-amber-500/20"><FaCalendarAlt size={20} /></div>
            Календар монтажів
          </h1>

          <div className="flex items-center gap-3 flex-wrap justify-center">
            <div className="flex bg-slate-100 p-1.5 rounded-2xl">
              <button onClick={() => setViewMode('objects')} className={`flex items-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${viewMode === 'objects' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                <FaMapMarkerAlt size={12} /> За об'єктами
              </button>
              <button onClick={() => setViewMode('employee')} className={`flex items-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${viewMode === 'employee' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                <FaUsers size={12} /> За працівником
              </button>
            </div>
            <button
              onClick={() => { setEditingVisit(null); setIsCrewModalOpen(true); }}
              className="px-5 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 shadow-lg shadow-slate-900/10 active:scale-95"
            >
              <FaPlus size={12} /> Запланувати виїзд
            </button>
          </div>
        </div>

        {viewMode === 'objects' ? (
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="relative w-full sm:w-72">
              <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Пошук клієнта, угоди, ID..."
                className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer whitespace-nowrap px-2">
              <input type="checkbox" checked={showPast} onChange={e => setShowPast(e.target.checked)} className="w-4 h-4 text-amber-500 rounded border-slate-300 focus:ring-amber-500" />
              <span className="text-xs font-bold text-slate-600">Показати минулі</span>
            </label>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <select
              value={selectedEmployeeId}
              onChange={e => setSelectedEmployeeId(e.target.value)}
              className="w-full sm:w-72 px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 outline-none focus:border-amber-500 cursor-pointer"
            >
              <option value="">Оберіть працівника...</option>
              {team.map(u => <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>)}
            </select>
            <div className="flex items-center gap-2 flex-1 w-full sm:w-auto">
              <input type="date" value={employeeRange.dateFrom} onChange={e => setEmployeeRange({ ...employeeRange, dateFrom: e.target.value })} className="flex-1 px-3 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-amber-500" />
              <span className="text-slate-300 font-black">—</span>
              <input type="date" value={employeeRange.dateTo} onChange={e => setEmployeeRange({ ...employeeRange, dateTo: e.target.value })} className="flex-1 px-3 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-amber-500" />
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="text-center p-12 text-slate-400 font-bold uppercase tracking-widest animate-pulse">Завантаження графіку...</div>
      ) : viewMode === 'objects' ? (
        groupedByDate.length === 0 ? (
          <div className="text-center p-12 bg-white rounded-3xl border-2 border-dashed border-slate-200 text-slate-400 font-bold uppercase tracking-widest">
            Запланованих виїздів не знайдено
          </div>
        ) : (
          <div className="space-y-6">
            {groupedByDate.map(([date, dateVisits]) => (
              <div key={date} className="space-y-3">
                <div className="text-xs font-black uppercase tracking-widest text-slate-500 border-l-4 border-amber-500 pl-3">
                  {date === 'Без дати' ? 'Без дати' : new Date(date).toLocaleDateString('uk-UA', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {dateVisits.map(renderVisitCard)}
                </div>
              </div>
            ))}
          </div>
        )
      ) : !selectedEmployeeId ? (
        <div className="text-center p-12 bg-white rounded-3xl border-2 border-dashed border-slate-200 text-slate-400 font-bold uppercase tracking-widest">
          Оберіть працівника, щоб побачити його виїзди
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-slate-900 text-amber-500 flex items-center justify-center font-black text-sm shrink-0">
              {selectedEmployee?.full_name?.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
            </div>
            <div>
              <p className="font-black text-slate-900 text-sm">{selectedEmployee?.full_name}</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{selectedEmployee?.role} · {employeeVisits.length} виїздів за період</p>
            </div>
          </div>

          {employeeVisits.length === 0 ? (
            <div className="text-center p-12 bg-white rounded-3xl border-2 border-dashed border-slate-200 text-slate-400 font-bold uppercase tracking-widest">
              У цей період виїздів не знайдено
            </div>
          ) : (
            <div className="relative pl-6 space-y-4 before:content-[''] before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
              {employeeVisits.map(visit => (
                <div key={visit.id} className="relative">
                  <div className={`absolute -left-6 top-4 w-3.5 h-3.5 rounded-full border-2 border-white shadow ${visit.is_ready ? 'bg-emerald-500' : 'bg-amber-400'}`}></div>
                  <div className="mb-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                    <FaClock size={10} /> {visit.scheduled_date ? new Date(visit.scheduled_date).toLocaleDateString('uk-UA', { weekday: 'short', day: '2-digit', month: 'long' }) : 'Без дати'}
                  </div>
                  {renderVisitCard(visit)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <InstallationCrewModal
        isOpen={isCrewModalOpen}
        onClose={() => { setIsCrewModalOpen(false); setEditingVisit(null); }}
        installation={editingVisit}
        deal={editingVisit?.deals ? { id: editingVisit.deal_id, custom_id: editingVisit.deals.custom_id, title: editingVisit.deals.title } : null}
        onSave={fetchData}
      />
    </div>
  );
}
