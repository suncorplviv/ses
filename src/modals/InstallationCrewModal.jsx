import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthProvider';
import {
  FaTimes, FaHardHat, FaSearch, FaCalendarAlt, FaSave, FaTrash, FaUserTie, FaCheckCircle
} from 'react-icons/fa';
import ConfirmDialog from '../components/ConfirmDialog';

// Офісні ролі не їздять на монтажі — у списку бригади їх не показуємо
const OFFICE_ROLE_RE = /директор|засновник|менеджер|бухгалтер|офіс/i;

// Планування виїзду монтажної бригади:
// дата + склад бригади (installation_workers) + нотатки.
// Використовується зі сторінки "Монтажі" (з вибором угоди)
// та з картки угоди (завдання "Організація роботи монтажної бригади").
export default function InstallationCrewModal({ isOpen, onClose, deal, task, installation, onSave }) {
  const { employeeProfile } = useAuth();

  const [team, setTeam] = useState([]);
  const [selectedWorkers, setSelectedWorkers] = useState([]);
  const [scheduledDate, setScheduledDate] = useState('');
  const [notes, setNotes] = useState('');
  const [isReady, setIsReady] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [markTaskDone, setMarkTaskDone] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  // Вибір угоди (коли відкрито зі сторінки Монтажі без контексту угоди)
  const [dealsList, setDealsList] = useState([]);
  const [dealSearch, setDealSearch] = useState('');
  const [isDealDropdownOpen, setIsDealDropdownOpen] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState(null);

  const effectiveDeal = deal || selectedDeal;
  const isEdit = !!installation?.id;

  useEffect(() => {
    if (!isOpen) return;

    // Команда: тільки виїзний персонал (монтажники, інженери)
    supabase.from('users').select('id, full_name, role').eq('is_active', true).order('full_name')
      .then(({ data }) => setTeam((data || []).filter(u => !OFFICE_ROLE_RE.test(u.role || ''))));

    // Угоди для вибору (лише якщо угода не передана)
    if (!deal) {
      supabase.from('deals')
        .select('id, custom_id, title, status, clients(name)')
        .neq('status', 'Угоду програно')
        .order('created_at', { ascending: false })
        .then(({ data }) => setDealsList(data || []));
    }

    // Ініціалізація форми
    if (installation) {
      setScheduledDate(installation.scheduled_date || '');
      setNotes(installation.notes || '');
      setIsReady(!!installation.is_ready);
      setSelectedWorkers((installation.installation_workers || []).map(w => w.worker_id).filter(Boolean));
      if (!deal && installation.deals) {
        setSelectedDeal({ id: installation.deal_id, custom_id: installation.deals.custom_id, title: installation.deals.title });
        setDealSearch(`№${installation.deals.custom_id} — ${installation.deals.title || ''}`);
      }
    } else {
      setScheduledDate('');
      setNotes('');
      setIsReady(false);
      setSelectedWorkers([]);
      setSelectedDeal(null);
      setDealSearch('');
    }
    setMarkTaskDone(false);
    setIsConfirmingDelete(false);
  }, [isOpen, installation, deal]);

  const toggleWorker = (workerId) => {
    setSelectedWorkers(prev =>
      prev.includes(workerId) ? prev.filter(id => id !== workerId) : [...prev, workerId]
    );
  };

  const filteredDeals = dealsList.filter(d =>
    d.title?.toLowerCase().includes(dealSearch.toLowerCase()) ||
    d.clients?.name?.toLowerCase().includes(dealSearch.toLowerCase()) ||
    d.custom_id?.toString().includes(dealSearch)
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!effectiveDeal?.id) return alert('Оберіть угоду (об\'єкт) для виїзду!');
    if (!scheduledDate) return alert('Вкажіть дату виїзду!');
    if (selectedWorkers.length === 0) return alert('Додайте до бригади хоча б одного працівника!');

    setIsSubmitting(true);
    try {
      // ЖОРСТКЕ ПРАВИЛО: один монтажник — один об'єкт на день.
      // Перевіряємо, чи хтось із обраних вже призначений на інший виїзд цієї дати.
      const { data: busyRows, error: busyErr } = await supabase
        .from('installation_workers')
        .select('worker_id, users(full_name), installations!inner(id, scheduled_date, deals(custom_id, title))')
        .eq('installations.scheduled_date', scheduledDate)
        .in('worker_id', selectedWorkers);
      if (busyErr) throw busyErr;

      const conflicts = (busyRows || []).filter(b => b.installations?.id && b.installations.id !== installation?.id);
      if (conflicts.length > 0) {
        const lines = [...new Set(conflicts.map(b =>
          `• ${b.users?.full_name || 'Працівник'} — СЕС №${b.installations?.deals?.custom_id ?? '?'} ${b.installations?.deals?.title || ''}`
        ))];
        alert(
          `Неможливо зберегти виїзд на ${new Date(scheduledDate).toLocaleDateString('uk-UA')}.\n\n` +
          `Ці працівники вже зайняті на інших об'єктах у цей день:\n${lines.join('\n')}\n\n` +
          `Правило: один монтажник — один об'єкт на день. Приберіть зайнятих або оберіть іншу дату.`
        );
        setIsSubmitting(false);
        return;
      }

      let installationId = installation?.id;

      if (isEdit) {
        const { error } = await supabase.from('installations').update({
          scheduled_date: scheduledDate,
          notes: notes || null,
          is_ready: isReady
        }).eq('id', installationId);
        if (error) throw error;

        // Пересинхронізація бригади: видаляємо старих, додаємо актуальних
        await supabase.from('installation_workers').delete().eq('installation_id', installationId);
      } else {
        const { data: inst, error } = await supabase.from('installations').insert([{
          deal_id: effectiveDeal.id,
          scheduled_date: scheduledDate,
          notes: notes || null,
          is_ready: isReady
        }]).select().single();
        if (error) throw error;
        installationId = inst.id;
      }

      const { error: wErr } = await supabase.from('installation_workers').insert(
        selectedWorkers.map(workerId => ({ installation_id: installationId, worker_id: workerId }))
      );
      if (wErr) throw wErr;

      // Журнал угоди
      const workerNames = team.filter(u => selectedWorkers.includes(u.id)).map(u => u.full_name).join(', ');
      await supabase.from('deal_activity_log').insert([{
        deal_id: effectiveDeal.id,
        user_id: employeeProfile?.id || null,
        stage_id: task?.stage_id || null,
        action: `${isEdit ? 'Оновлено' : 'Заплановано'} виїзд бригади на ${new Date(scheduledDate).toLocaleDateString('uk-UA')}: ${workerNames}`
      }]);

      // Завершення завдання виконує батьківський компонент —
      // так спрацьовує стандартна логіка авто-переходу етапу угоди
      const shouldCompleteTask = markTaskDone && task?.id && task.status !== 'Виконана';
      if (onSave) onSave(shouldCompleteTask);
      onClose();
    } catch (err) {
      alert('Помилка збереження виїзду: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const executeDelete = async () => {
    try {
      await supabase.from('installation_workers').delete().eq('installation_id', installation.id);
      const { error } = await supabase.from('installations').delete().eq('id', installation.id);
      if (error) throw error;
      if (installation.deal_id) {
        await supabase.from('deal_activity_log').insert([{
          deal_id: installation.deal_id,
          user_id: employeeProfile?.id || null,
          action: `Скасовано запланований виїзд бригади (${installation.scheduled_date ? new Date(installation.scheduled_date).toLocaleDateString('uk-UA') : 'без дати'})`
        }]);
      }
      setIsConfirmingDelete(false);
      if (onSave) onSave();
      onClose();
    } catch (err) {
      alert('Помилка видалення: ' + err.message);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[170] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in overflow-y-auto custom-scrollbar">
      <form onSubmit={handleSubmit} className="bg-white rounded-3xl shadow-2xl w-full max-w-xl flex flex-col my-auto overflow-hidden max-h-[90vh]">

        <div className="p-6 border-b border-slate-100 bg-slate-900 text-white flex justify-between items-center shrink-0">
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
              <FaHardHat className="text-amber-400"/> {isEdit ? 'Виїзд бригади' : 'Запланувати виїзд'}
            </h3>
            <p className="text-[10px] font-medium mt-1 text-slate-400 line-clamp-1">
              {effectiveDeal ? `СЕС №${effectiveDeal.custom_id} — ${effectiveDeal.title || ''}` : 'Оберіть об\'єкт нижче'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"><FaTimes size={16}/></button>
        </div>

        <div className="p-6 space-y-4 bg-slate-50/50 flex-1 overflow-y-auto custom-scrollbar">

          {/* ВИБІР УГОДИ (тільки зі сторінки Монтажі) */}
          {!deal && !isEdit && (
            <div className="relative">
              <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Об'єкт (угода) *</label>
              <div className="relative">
                <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={12}/>
                <input
                  type="text"
                  placeholder="Пошук за назвою, клієнтом або №..."
                  value={dealSearch}
                  onChange={(e) => { setDealSearch(e.target.value); setIsDealDropdownOpen(true); setSelectedDeal(null); }}
                  onFocus={() => setIsDealDropdownOpen(true)}
                  className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-amber-500"
                />
              </div>
              {isDealDropdownOpen && dealSearch && !selectedDeal && (
                <div className="absolute z-30 top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-2xl max-h-56 overflow-y-auto custom-scrollbar">
                  {filteredDeals.length === 0 ? (
                    <p className="p-4 text-center text-[10px] font-black text-slate-400 uppercase">Нічого не знайдено</p>
                  ) : filteredDeals.slice(0, 15).map(d => (
                    <div key={d.id}
                      onMouseDown={() => { setSelectedDeal(d); setDealSearch(`№${d.custom_id} — ${d.title || ''}`); setIsDealDropdownOpen(false); }}
                      className="px-4 py-3 hover:bg-amber-50 cursor-pointer border-b border-slate-50 last:border-0">
                      <p className="text-xs font-bold text-slate-800">№{d.custom_id} — {d.title || 'Без назви'}</p>
                      <p className="text-[10px] font-bold text-slate-400 mt-0.5">{d.clients?.name}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Дата виїзду *</label>
              <div className="relative">
                <FaCalendarAlt className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={12}/>
                <input type="date" required value={scheduledDate} onChange={e => setScheduledDate(e.target.value)}
                  className="w-full pl-10 pr-3 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-amber-500 cursor-pointer"/>
              </div>
            </div>
            <div className="flex items-end">
              <label className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl border cursor-pointer text-[10px] font-black uppercase tracking-widest transition-all ${isReady ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'}`}>
                <input type="checkbox" checked={isReady} onChange={e => setIsReady(e.target.checked)} className="hidden"/>
                <FaCheckCircle size={12}/> {isReady ? 'Об\'єкт готовий' : 'Готовність об\'єкта'}
              </label>
            </div>
          </div>

          {/* СКЛАД БРИГАДИ */}
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">
              Бригада * <span className="text-slate-300">({selectedWorkers.length} обрано)</span>
            </label>
            <div className="bg-white border border-slate-200 rounded-2xl p-2 max-h-56 overflow-y-auto custom-scrollbar divide-y divide-slate-50">
              {team.map(u => {
                const checked = selectedWorkers.includes(u.id);
                return (
                  <label key={u.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors ${checked ? 'bg-amber-50' : 'hover:bg-slate-50'}`}>
                    <input type="checkbox" checked={checked} onChange={() => toggleWorker(u.id)}
                      className="w-4 h-4 accent-amber-500 cursor-pointer"/>
                    <FaUserTie className={checked ? 'text-amber-500' : 'text-slate-300'} size={13}/>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate">{u.full_name}</p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase">{u.role}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Нотатки до виїзду</label>
            <textarea rows="2" value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Інструменти, особливості об'єкта, час збору..."
              className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-amber-500 resize-none"/>
          </div>

          {task && task.status !== 'Виконана' && (
            <label className="flex items-start gap-3 bg-slate-100 p-4 rounded-xl border border-slate-200 cursor-pointer">
              <input type="checkbox" checked={markTaskDone} onChange={e => setMarkTaskDone(e.target.checked)}
                className="w-5 h-5 mt-0.5 accent-emerald-500 cursor-pointer"/>
              <div>
                <p className="text-sm font-bold text-slate-800">Позначити завдання виконаним</p>
                <p className="text-xs text-slate-500 mt-0.5">«{task.title}» закриється після збереження графіку.</p>
              </div>
            </label>
          )}
        </div>

        <div className="p-4 border-t border-slate-100 flex gap-3 bg-white shrink-0">
          {isEdit && (
            <button type="button" onClick={() => setIsConfirmingDelete(true)}
              className="px-4 py-3 text-rose-500 hover:bg-rose-50 rounded-xl text-xs font-black uppercase tracking-widest transition-colors flex items-center gap-2">
              <FaTrash size={12}/>
            </button>
          )}
          <button type="button" onClick={onClose}
            className="flex-1 py-3.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors">
            Скасувати
          </button>
          <button type="submit" disabled={isSubmitting}
            className="flex-1 py-3.5 text-xs font-black text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 uppercase tracking-widest rounded-xl transition-colors shadow-lg shadow-slate-900/20 flex items-center justify-center gap-2">
            <FaSave size={12}/> {isSubmitting ? 'Зберігаємо...' : isEdit ? 'Зберегти зміни' : 'Запланувати'}
          </button>
        </div>
      </form>

      <ConfirmDialog
        isOpen={isConfirmingDelete}
        title="Скасувати виїзд?"
        message="Запис про виїзд і склад бригади буде видалено з графіку."
        confirmLabel="Так, скасувати"
        onConfirm={executeDelete}
        onCancel={() => setIsConfirmingDelete(false)}
      />
    </div>
  );
}
