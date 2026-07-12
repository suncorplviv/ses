import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import {
  FaCheck, FaTimes, FaCalendarAlt, FaTrash, FaPlus
} from 'react-icons/fa';
import ConfirmDialog from './ConfirmDialog';

// Офісні ролі не їздять на монтажі — у списку бригади їх не показуємо
const OFFICE_ROLE_RE = /директор|засновник|менеджер|бухгалтер|офіс/i;

// СПІЛЬНА СЕКЦІЯ "ГРАФІК ВИЇЗДІВ БРИГАДИ ПО ОБ'ЄКТУ".
// Використовується у Журналі монтажу (вкладка "Бригада та виїзди")
// та в робочому просторі завдання "Організація роботи монтажної бригади".
// Правило: один монтажник — один об'єкт на день.
export default function CrewVisitsManager({ dealId, onVisitsChange }) {
  const [visits, setVisits] = useState([]);
  const [team, setTeam] = useState([]);

  const [isAddingVisit, setIsAddingVisit] = useState(false);
  const [newVisitDate, setNewVisitDate] = useState('');
  const [newVisitNotes, setNewVisitNotes] = useState('');
  const [isSavingVisit, setIsSavingVisit] = useState(false);

  const [addingWorkerToVisitId, setAddingWorkerToVisitId] = useState(null);
  const [selectedWorkerId, setSelectedWorkerId] = useState('');
  const [visitToDelete, setVisitToDelete] = useState(null);

  const fetchVisits = async () => {
    const { data } = await supabase
      .from('installations')
      .select('*, installation_workers(id, worker_id, users(full_name))')
      .eq('deal_id', dealId)
      .order('scheduled_date', { ascending: true });
    setVisits(data || []);
    if (onVisitsChange) onVisitsChange(data || []);

    const { data: teamData } = await supabase.from('users').select('id, full_name, role').eq('is_active', true).order('full_name');
    setTeam((teamData || []).filter(u => !OFFICE_ROLE_RE.test(u.role || '')));
  };

  useEffect(() => {
    if (dealId) fetchVisits();
  }, [dealId]);

  const handleAddVisit = async (e) => {
    e.preventDefault();
    if (!newVisitDate) return;
    setIsSavingVisit(true);
    try {
      const { error } = await supabase.from('installations').insert([{
        deal_id: dealId,
        scheduled_date: newVisitDate,
        notes: newVisitNotes || null,
        is_ready: false
      }]);
      if (error) throw error;
      setNewVisitDate(''); setNewVisitNotes(''); setIsAddingVisit(false);
      fetchVisits();
    } catch (err) {
      alert('Помилка додавання виїзду: ' + err.message);
    } finally {
      setIsSavingVisit(false);
    }
  };

  const handleToggleReady = async (visit) => {
    await supabase.from('installations').update({ is_ready: !visit.is_ready }).eq('id', visit.id);
    fetchVisits();
  };

  const executeDeleteVisit = async () => {
    const visit = visitToDelete;
    if (!visit) return;
    try {
      await supabase.from('installation_workers').delete().eq('installation_id', visit.id);
      const { error } = await supabase.from('installations').delete().eq('id', visit.id);
      if (error) throw error;
      fetchVisits();
    } catch (err) {
      alert('Помилка видалення виїзду: ' + err.message);
    } finally {
      setVisitToDelete(null);
    }
  };

  const handleAddWorker = async (visitId) => {
    if (!selectedWorkerId) return;
    try {
      const visit = visits.find(v => v.id === visitId);

      // Вже у складі цього виїзду?
      if ((visit?.installation_workers || []).some(w => w.worker_id === selectedWorkerId)) {
        return alert('Цей працівник уже призначений на цей виїзд.');
      }

      // ЖОРСТКЕ ПРАВИЛО: один монтажник — один об'єкт на день
      if (visit?.scheduled_date) {
        const { data: busyRows, error: busyErr } = await supabase
          .from('installation_workers')
          .select('worker_id, users(full_name), installations!inner(id, scheduled_date, deals(custom_id, title))')
          .eq('installations.scheduled_date', visit.scheduled_date)
          .eq('worker_id', selectedWorkerId);
        if (busyErr) throw busyErr;

        const conflict = (busyRows || []).find(b => b.installations?.id && b.installations.id !== visitId);
        if (conflict) {
          return alert(
            `${conflict.users?.full_name || 'Працівник'} уже зайнятий ${new Date(visit.scheduled_date).toLocaleDateString('uk-UA')} ` +
            `на об'єкті СЕС №${conflict.installations?.deals?.custom_id ?? '?'} ${conflict.installations?.deals?.title || ''}.\n\n` +
            `Правило: один монтажник — один об'єкт на день.`
          );
        }
      }

      const { error } = await supabase.from('installation_workers').insert([{ installation_id: visitId, worker_id: selectedWorkerId }]);
      if (error) throw error;
      setSelectedWorkerId('');
      setAddingWorkerToVisitId(null);
      fetchVisits();
    } catch (err) {
      alert('Помилка призначення монтажника: ' + err.message);
    }
  };

  const handleRemoveWorker = async (workerRowId) => {
    await supabase.from('installation_workers').delete().eq('id', workerRowId);
    fetchVisits();
  };

  return (
    <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
          <FaCalendarAlt className="text-amber-500"/> Графік виїздів бригади по об'єкту
        </h3>
        <button onClick={() => setIsAddingVisit(!isAddingVisit)} className="text-[10px] font-black uppercase text-amber-700 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-lg border border-amber-200 flex items-center gap-1.5 transition-colors">
          <FaPlus size={10}/> Додати виїзд
        </button>
      </div>

      {isAddingVisit && (
        <form onSubmit={handleAddVisit} className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row gap-2 animate-fade-in">
          <input type="date" required autoFocus value={newVisitDate} onChange={e => setNewVisitDate(e.target.value)} className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold outline-none focus:border-amber-500"/>
          <input type="text" placeholder="Нотатки (необов'язково)" value={newVisitNotes} onChange={e => setNewVisitNotes(e.target.value)} className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium outline-none focus:border-amber-500"/>
          <button type="submit" disabled={isSavingVisit} className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-black uppercase tracking-widest transition-colors disabled:opacity-50">{isSavingVisit ? '...' : 'Зберегти'}</button>
        </form>
      )}

      {visits.length === 0 ? (
        <div className="text-center py-6 text-xs font-bold text-slate-400 uppercase tracking-widest border-2 border-dashed border-slate-200 rounded-xl">Виїздів ще не заплановано</div>
      ) : (
        <div className="space-y-2">
          {visits.map(visit => (
            <div key={visit.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="flex flex-wrap justify-between items-center gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-black text-slate-800">{new Date(visit.scheduled_date).toLocaleDateString('uk-UA')}</span>
                  {visit.notes && <span className="text-xs text-slate-500">{visit.notes}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleToggleReady(visit)} className={`text-[9px] font-black uppercase px-2 py-1 rounded-md border transition-colors ${visit.is_ready ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'}`}>
                    {visit.is_ready ? 'Готово' : 'Заплановано'}
                  </button>
                  <button onClick={() => setVisitToDelete(visit)} className="p-1.5 text-slate-300 hover:text-rose-500 transition-colors"><FaTrash size={12}/></button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                {(visit.installation_workers || []).map(w => (
                  <span key={w.id} className="inline-flex items-center gap-1.5 text-[10px] font-bold bg-white border border-slate-200 px-2 py-1 rounded-lg">
                    {w.users?.full_name}
                    <button onClick={() => handleRemoveWorker(w.id)} className="text-slate-300 hover:text-rose-500"><FaTimes size={9}/></button>
                  </span>
                ))}
                {addingWorkerToVisitId === visit.id ? (
                  <div className="flex items-center gap-1">
                    <select value={selectedWorkerId} onChange={e => setSelectedWorkerId(e.target.value)} className="text-[10px] font-bold px-2 py-1.5 bg-white border border-slate-200 rounded-lg outline-none cursor-pointer">
                      <option value="">Оберіть...</option>
                      {team.map(u => <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>)}
                    </select>
                    <button onClick={() => handleAddWorker(visit.id)} className="p-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors"><FaCheck size={10}/></button>
                    <button onClick={() => setAddingWorkerToVisitId(null)} className="p-1.5 bg-slate-200 hover:bg-slate-300 text-slate-600 rounded-lg transition-colors"><FaTimes size={10}/></button>
                  </div>
                ) : (
                  <button onClick={() => setAddingWorkerToVisitId(visit.id)} className="text-[10px] font-bold text-amber-600 hover:bg-amber-50 px-2 py-1 rounded-lg border border-dashed border-amber-200 transition-colors">+ Монтажник</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        isOpen={!!visitToDelete}
        title="Видалити виїзд?"
        message={visitToDelete ? `Виїзд ${visitToDelete.scheduled_date ? new Date(visitToDelete.scheduled_date).toLocaleDateString('uk-UA') : ''} разом із призначеною бригадою буде видалено.` : ''}
        onConfirm={executeDeleteVisit}
        onCancel={() => setVisitToDelete(null)}
      />
    </div>
  );
}
