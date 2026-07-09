import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthProvider';
import {
  FaCheck, FaTimes, FaTools,
  FaClipboardCheck, FaHardHat, FaChevronDown, FaChevronUp, FaCommentDots,
  FaArrowLeft, FaConciergeBell, FaCheckCircle, FaTruckLoading, FaSpinner, FaBoxOpen,
  FaCalendarAlt, FaTrash, FaPlus, FaWifi, FaSave, FaEdit
} from 'react-icons/fa';

export default function DealInstallation({ dealId, onProgressUpdate, onBack, onCompleteTask }) {
  const { employeeProfile } = useAuth();
  
  const [bomItems, setBomItems] = useState([]);
  const [loading, setLoading] = useState(true);

  // СТЕЙТИ МОДАЛКИ: ФІКСАЦІЯ МОНТАЖУ (ДЛЯ ОБЛАДНАННЯ)
  const [isMountModalOpen, setIsMountModalOpen] = useState(false);
  const [mountItem, setMountItem] = useState(null);
  const [mountData, setMountData] = useState({ amount: '', notes: '' });
  const [isMounting, setIsMounting] = useState(false);
  const [isMountNotesOpen, setIsMountNotesOpen] = useState(false);

  // НОВІ СТЕЙТИ: ЕКСПРЕС-ПРИЙОМКА ПРЯМОЇ ПОСТАВКИ
  const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);
  const [receiveItem, setReceiveItem] = useState(null);
  const [receiveData, setReceiveData] = useState({ qty: '', poItemId: '', locationId: '', maxQty: 0 });
  const [isReceiving, setIsReceiving] = useState(false);

  // ГРАФІК ВИЇЗДІВ МОНТАЖНОЇ БРИГАДИ (хто / коли)
  const [visits, setVisits] = useState([]);
  const [team, setTeam] = useState([]);
  const [isAddingVisit, setIsAddingVisit] = useState(false);
  const [newVisitDate, setNewVisitDate] = useState('');
  const [newVisitNotes, setNewVisitNotes] = useState('');
  const [isSavingVisit, setIsSavingVisit] = useState(false);
  const [addingWorkerToVisitId, setAddingWorkerToVisitId] = useState(null);
  const [selectedWorkerId, setSelectedWorkerId] = useState('');

  // МОНІТОРИНГ СТАНЦІЇ (назва станції моніторингу + програма/платформа)
  const [monitoringData, setMonitoringData] = useState({ monitoring_station_name: '', monitoring_program: '' });
  const [isEditingMonitoring, setIsEditingMonitoring] = useState(false);
  const [isSavingMonitoring, setIsSavingMonitoring] = useState(false);

  const getCurrentUserId = async () => {
    if (employeeProfile?.id) return employeeProfile.id;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) throw new Error('Не визначено поточного користувача.');
    return user.id;
  };

  const getReadyOnSiteQty = (item) => {
    const issued = Number(item.quantity_issued || 0);
    const directReceived = Number(item.quantity_received || 0);
    const mounted = Number(item.quantity_mounted || 0);
    return Math.max(issued + directReceived - mounted, 0);
  };

  const fetchBom = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('v_deal_bom_fulfillment')
      .select('*')
      .eq('deal_id', dealId)
      .order('line_type', { ascending: true }) 
      .order('product_name');

    if (error) {
      console.error("Помилка завантаження журналу монтажу:", error);
      setLoading(false);
      return;
    }

    setBomItems(data || []);

    if (onProgressUpdate) {
      const totalPlanned = (data || []).length;
      const mountedCount = (data || []).filter(item => Number(item.quantity_mounted || 0) >= Number(item.quantity_planned || 0)).length;
      onProgressUpdate({ total: totalPlanned, mounted: mountedCount });
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchBom();
    fetchVisits();
    fetchMonitoringData();
  }, [dealId]);

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

  // ====================== ГРАФІК ВИЇЗДІВ ======================
  const fetchVisits = async () => {
    const { data } = await supabase
      .from('installations')
      .select('*, installation_workers(id, worker_id, users(full_name))')
      .eq('deal_id', dealId)
      .order('scheduled_date', { ascending: true });
    setVisits(data || []);

    const { data: teamData } = await supabase.from('users').select('id, full_name, role').eq('is_active', true);
    setTeam(teamData || []);
  };

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

  const handleDeleteVisit = async (visit) => {
    if (!window.confirm('Видалити цей виїзд і всіх призначених монтажників?')) return;
    try {
      await supabase.from('installation_workers').delete().eq('installation_id', visit.id);
      const { error } = await supabase.from('installations').delete().eq('id', visit.id);
      if (error) throw error;
      fetchVisits();
    } catch (err) {
      alert('Помилка видалення виїзду: ' + err.message);
    }
  };

  const handleAddWorker = async (visitId) => {
    if (!selectedWorkerId) return;
    try {
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

  // ====================== ЛОГІКА МОНТАЖУ ======================
  const openMountModal = (item) => {
    setMountItem(item);
    const remainingToMount = Number(item.quantity_planned || 0) - Number(item.quantity_mounted || 0);
    const readyOnSite = getReadyOnSiteQty(item);
    const reservedOpen = Number(item.quantity_reserved || 0);
    const suggestedAmount = Math.min(Math.max(remainingToMount, 0), readyOnSite + reservedOpen);
    
    setMountData({ 
      amount: suggestedAmount > 0 ? suggestedAmount : 0, 
      notes: `Встановлено ${new Date().toLocaleDateString('uk-UA')}` 
    });
    setIsMountNotesOpen(false);
    setIsMountModalOpen(true);
  };

  const submitMounting = async (e) => {
    e.preventDefault();
    if (!mountItem) return;
    const amountToMount = parseFloat(mountData.amount);
    if (amountToMount <= 0) return alert('Кількість має бути більшою за нуль!');

    setIsMounting(true);
    try {
      const remainingToMount = Number(mountItem.quantity_planned || 0) - Number(mountItem.quantity_mounted || 0);
      if (amountToMount > remainingToMount) {
        const newPlanned = Number(mountItem.quantity_planned || 0) + (amountToMount - remainingToMount);
        if (!window.confirm(`Кількість перевищує план (${mountItem.quantity_planned} ${mountItem.unit}). Скоригувати план до ${newPlanned} ${mountItem.unit} і продовжити?`)) {
          setIsMounting(false);
          return;
        }
        const { error: planError } = await supabase.from('deal_bom').update({ quantity_planned: newPlanned }).eq('id', mountItem.bom_id);
        if (planError) throw planError;
      }

      const userId = await getCurrentUserId();
      const readyOnSite = getReadyOnSiteQty(mountItem);

      if (readyOnSite < amountToMount) {
        let qtyToIssue = amountToMount - readyOnSite;
        
        const { data: reservations, error: findError } = await supabase
          .from('deal_reservations')
          .select('id, quantity, quantity_issued')
          .eq('bom_id', mountItem.bom_id)
          .in('status', ['pending', 'confirmed', 'partially_issued'])
          .order('created_at', { ascending: true });
          
        if (findError) throw findError;

        for (const reservation of reservations || []) {
          if (qtyToIssue <= 0) break;
          const reservationOpenQty = Number(reservation.quantity || 0) - Number(reservation.quantity_issued || 0);
          const issueQty = Math.min(qtyToIssue, reservationOpenQty);
          if (issueQty <= 0) continue;

          const { error } = await supabase.rpc('erp_issue_reserved_stock', {
            p_reservation_id: reservation.id, 
            p_quantity: issueQty, 
            p_to_location_id: null, 
            p_performed_by: userId, 
            p_notes: mountData.notes || `Автовидача перед монтажем`
          });
          if (error) throw error;
          qtyToIssue -= issueQty;
        }

        if (qtyToIssue > 0) {
          throw new Error('На об\'єкті фізично немає цього обладнання. Спочатку зробіть видачу зі складу або дочекайтеся прямої поставки.');
        }
      }

      const { error: mountError } = await supabase.rpc('erp_mount_bom_item', {
        p_bom_id: mountItem.bom_id, 
        p_quantity: amountToMount, 
        p_reported_by: userId, 
        p_installation_id: null, 
        p_notes: mountData.notes || null
      });
      if (mountError) throw mountError;

      await supabase.from('deal_activity_log').insert([{ 
        deal_id: dealId, 
        user_id: userId, 
        action: `Змонтовано: ${mountItem.product_name} (${amountToMount})` 
      }]);

      setIsMountModalOpen(false);
      setMountItem(null);
      fetchBom();
    } catch (err) {
      alert("Помилка фіксації монтажу: " + err.message);
    } finally {
      setIsMounting(false);
    }
  };

  const handleMarkServiceDone = async (item) => {
    if (!window.confirm(`Відмітити послугу "${item.product_name}" як повністю надану?`)) return;
    try {
      const userId = await getCurrentUserId();
      const remainingToMount = Number(item.quantity_planned || 0) - Number(item.quantity_mounted || 0);
      const { error } = await supabase.rpc('erp_mount_bom_item', {
        p_bom_id: item.bom_id, p_quantity: remainingToMount, p_reported_by: userId, p_installation_id: null, p_notes: 'Послуга надана (зафіксовано вручну)'
      });
      if (error) throw error;
      await supabase.from('deal_activity_log').insert([{ deal_id: dealId, user_id: userId, action: `Надано послугу: ${item.product_name}` }]);
      fetchBom();
    } catch (err) { alert("Помилка фіксації послуги: " + err.message); }
  };

  // ====================== ЛОГІКА ЕКСПРЕС-ПРИЙОМКИ ======================
  const openReceiveModal = async (item) => {
    setIsReceiveModalOpen(true);
    setReceiveItem({ ...item, isLoadingStatus: true });
    setReceiveData({ qty: '', poItemId: '', locationId: '', maxQty: 0 });

    // Шукаємо відкрите замовлення для цього товару
    const { data, error } = await supabase
      .from('deal_bom_allocations')
      .select(`
        purchase_order_item_id, 
        location_id, 
        purchase_order_items (quantity_ordered, quantity_received)
      `)
      .eq('bom_id', item.bom_id)
      .eq('source_type', 'purchase_order')
      .not('purchase_order_item_id', 'is', null);

    if (!error && data && data.length > 0) {
      // Знаходимо першу алокацію, де ще не все прийнято
      const validAlloc = data.find(d => {
         const qO = Number(d.purchase_order_items?.quantity_ordered || 0);
         const qR = Number(d.purchase_order_items?.quantity_received || 0);
         return qO > qR;
      });

      if (validAlloc) {
         const remaining = Number(validAlloc.purchase_order_items.quantity_ordered) - Number(validAlloc.purchase_order_items.quantity_received);
         setReceiveData({
           poItemId: validAlloc.purchase_order_item_id,
           locationId: validAlloc.location_id, 
           maxQty: remaining,
           qty: remaining // Пропонуємо прийняти все, що залишилось
         });
         setReceiveItem({ ...item, isLoadingStatus: false, found: true });
         return;
      }
    }
    
    setReceiveItem({ ...item, isLoadingStatus: false, found: false });
  };

  const submitReceive = async (e) => {
    e.preventDefault();
    const qty = parseFloat(receiveData.qty);
    if (qty <= 0 || qty > receiveData.maxQty) return alert(`Введіть кількість від 0.1 до ${receiveData.maxQty}`);

    setIsReceiving(true);
    try {
      const userId = await getCurrentUserId();
      // Викликаємо системну процедуру прийомки
      const { error } = await supabase.rpc('erp_receive_stock', {
        p_product_id: receiveItem.product_id,
        p_quantity: qty,
        p_to_location_id: receiveData.locationId || null,
        p_performed_by: userId,
        p_purchase_order_item_id: receiveData.poItemId,
        p_notes: 'Експрес-прийомка перед монтажем'
      });

      if (error) throw error;

      await supabase.from('deal_activity_log').insert([{ 
        deal_id: dealId, user_id: userId, action: `Прийнято на об'єкт: ${receiveItem.product_name} (${qty})` 
      }]);

      setIsReceiveModalOpen(false);
      fetchBom();
    } catch (err) {
      alert("Помилка прийомки товару: " + err.message);
    } finally {
      setIsReceiving(false);
    }
  };

  const isAllMounted = bomItems.length > 0 && bomItems.every(item => {
    return Number(item.quantity_mounted || 0) >= Number(item.quantity_planned || 0);
  });

  if (loading) return <div className="p-8 text-center text-slate-400 font-bold text-sm animate-pulse flex-1 flex items-center justify-center min-h-[50vh]">Завантаження журналу...</div>;

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

      {/* ОСНОВНИЙ КОНТЕНТ: СПИСОК ЗАВДАНЬ */}
      <div className="p-4 md:p-6 space-y-6 flex-1 overflow-y-auto">
        <div className="animate-fade-in space-y-4">
          {/* МОНІТОРИНГ СТАНЦІЇ */}
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

          {/* ГРАФІК ВИЇЗДІВ МОНТАЖНОЇ БРИГАДИ */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2"><FaCalendarAlt className="text-amber-500"/> Графік виїздів</h3>
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
                        <button onClick={() => handleDeleteVisit(visit)} className="p-1.5 text-slate-300 hover:text-rose-500 transition-colors"><FaTrash size={12}/></button>
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
          </div>

          <div className="grid grid-cols-1 gap-4">
            {bomItems.length === 0 ? (
              <div className="py-16 text-center text-slate-400 font-bold border-2 border-dashed border-slate-200 rounded-2xl bg-white">Специфікація порожня. Додайте позиції на етапі комплектації.</div>
            ) : (
              bomItems.map((item) => {
                const isService = (item.line_type || 'equipment') === 'service';
                const qPlan = Number(item.quantity_planned || 0);
                const qAct = Number(item.quantity_mounted || 0);
                const progress = Math.min(100, Math.round((qAct / qPlan) * 100));
                const isComplete = qAct >= qPlan;
                
                const readyOnSite = isService ? 0 : getReadyOnSiteQty(item);
                const pendingDeliveryQty = Math.max(Number(item.quantity_ordered || 0) - Number(item.quantity_received || 0), 0);
                const canMount = isService ? !isComplete : (!isComplete && (readyOnSite > 0 || Number(item.quantity_reserved || 0) > 0));

                return (
                  <div key={item.bom_id} className={`p-5 rounded-2xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-6 ${isComplete ? 'bg-emerald-50/30 border-emerald-100' : 'bg-white border-slate-200 shadow-sm'}`}>
                    
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {isComplete ? (
                          <FaCheck className="text-emerald-500" size={14}/>
                        ) : isService ? (
                          <FaConciergeBell className="text-sky-500" size={14}/>
                        ) : null}
                        <h4 className={`font-bold text-sm md:text-base ${isComplete ? 'text-slate-500 line-through decoration-slate-300' : 'text-slate-900'}`}>
                          {item.product_name}
                        </h4>
                        {isService && !isComplete && (
                          <span className="ml-2 px-2 py-0.5 bg-sky-50 text-sky-600 border border-sky-100 rounded text-[9px] font-black uppercase tracking-widest">
                            Послуга
                          </span>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-4 mt-3">
                         <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all duration-1000 ${isComplete ? 'bg-emerald-400' : isService ? 'bg-sky-400' : 'bg-amber-400'}`} style={{ width: `${progress}%` }}></div>
                         </div>
                         <div className="text-[10px] font-black text-slate-600 w-20 text-right bg-slate-50 px-2 py-1 rounded-md border border-slate-200">
                           {qAct} / {qPlan} <span className="uppercase text-[8px]">{item.unit}</span>
                         </div>
                      </div>

                      {!isComplete && !isService && (
                        <div className="flex gap-4 mt-3 text-[10px] font-bold text-slate-500 border-t border-slate-100 pt-2">
                          <p>Доступно на об'єкті: <span className="text-slate-800 font-black">{readyOnSite}</span></p>
                          <p>В резерві складу: <span className="text-slate-800">{item.quantity_reserved || 0}</span></p>
                          {pendingDeliveryQty > 0 && (
                            <p className="text-amber-600">В дорозі від постачальника: <span className="font-black">{pendingDeliveryQty}</span></p>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="shrink-0 flex items-center justify-end w-full md:w-auto border-t md:border-t-0 border-slate-100 pt-4 md:pt-0 md:pl-4">
                      {!isComplete ? (
                        isService ? (
                          <button 
                            onClick={() => handleMarkServiceDone(item)}
                            className="w-full md:w-auto px-6 py-3 bg-slate-900 hover:bg-sky-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-sm flex items-center justify-center gap-2"
                          >
                            <FaCheck size={14}/> Відмітити як надану
                          </button>
                        ) : (
                          <div className="flex flex-col gap-2 w-full md:w-auto">
                            {/* КНОПКА ЕКСПРЕС-ПРИЙОМКИ */}
                            {pendingDeliveryQty > 0 && (
                              <button 
                                onClick={() => openReceiveModal(item)}
                                className="w-full md:w-auto px-6 py-2.5 bg-amber-50 hover:bg-amber-500 text-amber-700 hover:text-slate-900 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 border border-amber-200 hover:border-amber-500"
                              >
                                <FaTruckLoading size={14}/> Прийняти поставку
                              </button>
                            )}
                            
                            <button 
                              onClick={() => openMountModal(item)}
                              disabled={!canMount}
                              className="w-full md:w-auto px-6 py-2.5 bg-slate-900 hover:bg-emerald-600 disabled:bg-slate-100 disabled:text-slate-400 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-sm flex items-center justify-center gap-2"
                            >
                              <FaTools size={14}/> {canMount ? 'Звіт про монтаж' : (pendingDeliveryQty > 0 ? 'Спочатку прийміть товар' : 'Очікує доставки')}
                            </button>
                          </div>
                        )
                      ) : (
                        <span className="text-[10px] font-black text-emerald-600 uppercase bg-emerald-50 px-4 py-2 rounded-xl border border-emerald-200 flex items-center gap-2 w-full md:w-auto justify-center">
                          <FaCheck size={12}/> {isService ? 'Послугу надано' : 'Повністю змонтовано'}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* МОДАЛКА: ЗВІТ ПРО МОНТАЖ */}
      {isMountModalOpen && mountItem && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <form onSubmit={submitMounting} className="bg-white rounded-3xl shadow-2xl w-full max-w-sm flex flex-col overflow-hidden">
            <div className="p-6 border-b border-slate-100 bg-slate-900 text-white flex justify-between items-center">
              <div>
                <h3 className="text-sm font-black uppercase tracking-widest mb-1 flex items-center gap-2">
                  <FaClipboardCheck className="text-emerald-400"/> Звіт про монтаж
                </h3>
                <p className="text-[10px] text-slate-400 font-medium line-clamp-1">{mountItem.product_name}</p>
              </div>
              <button type="button" onClick={() => setIsMountModalOpen(false)} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors">
                <FaTimes size={16}/>
              </button>
            </div>
            
            <div className="p-6 space-y-5 bg-slate-50/50">
               <div>
                 <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Скільки встановлено сьогодні?</label>
                 <div className="flex items-center gap-3">
                   <input 
                     type="number" step="any" required autoFocus
                     value={mountData.amount} onChange={(e) => setMountData({...mountData, amount: e.target.value})}
                     className="w-full text-xl font-black p-3 bg-white border border-slate-200 rounded-xl outline-none focus:border-emerald-500"
                   />
                   <span className="text-sm font-black text-slate-500 uppercase">{mountItem.unit}</span>
                 </div>
                 <div className="flex gap-4 mt-3 text-[10px] font-bold text-slate-400 border-t border-slate-200 pt-2">
                    <p>Залишок до плану: <span className="text-slate-600">{mountItem.quantity_planned - (mountItem.quantity_mounted || 0)}</span></p>
                    <p>Доступно на об'єкті: <span className="text-slate-600">{getReadyOnSiteQty(mountItem)}</span></p>
                 </div>
               </div>

               <div className="pt-2 border-t border-slate-100">
                 <button type="button" onClick={() => setIsMountNotesOpen(!isMountNotesOpen)} className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase hover:text-slate-600 transition-colors ml-1">
                   <FaCommentDots /> {isMountNotesOpen ? 'Сховати коментар' : 'Коментар (Опціонально)'} {isMountNotesOpen ? <FaChevronUp size={10}/> : <FaChevronDown size={10}/>}
                 </button>
                 {isMountNotesOpen && (
                   <div className="mt-3 animate-fade-in">
                     <textarea 
                       rows="2"
                       value={mountData.notes} onChange={(e) => setMountData({...mountData, notes: e.target.value})}
                       className="w-full text-sm font-medium p-3 bg-white border border-slate-200 rounded-xl outline-none focus:border-emerald-500 resize-none transition-colors"
                       placeholder="Напр: Встановлено перший ряд панелей"
                     />
                   </div>
                 )}
               </div>
            </div>

            <div className="p-4 border-t border-slate-100 flex gap-3 bg-white shrink-0">
               <button type="button" onClick={() => setIsMountModalOpen(false)} className="flex-1 py-3.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors">Скасувати</button>
               <button type="submit" disabled={isMounting} className="flex-1 py-3.5 text-xs font-black text-white bg-emerald-500 hover:bg-emerald-600 uppercase tracking-widest rounded-xl transition-colors shadow-lg shadow-emerald-500/30">
                 {isMounting ? 'ЗАПИС...' : 'ПІДТВЕРДИТИ'}
               </button>
            </div>
          </form>
        </div>
      )}

      {/* МОДАЛКА: ЕКСПРЕС-ПРИЙОМКА ТОВАРУ */}
      {isReceiveModalOpen && receiveItem && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm flex flex-col overflow-hidden">
            <div className="p-6 border-b border-slate-100 bg-slate-900 text-white flex justify-between items-center">
              <div>
                <h3 className="text-sm font-black uppercase tracking-widest mb-1 flex items-center gap-2">
                  <FaBoxOpen className="text-amber-400"/> Прийом товару
                </h3>
                <p className="text-[10px] text-slate-400 font-medium line-clamp-1">{receiveItem.product_name}</p>
              </div>
              <button type="button" onClick={() => setIsReceiveModalOpen(false)} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors">
                <FaTimes size={16}/>
              </button>
            </div>
            
            <div className="p-6 bg-slate-50/50">
              {receiveItem.isLoadingStatus ? (
                <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                   <FaSpinner className="animate-spin mb-3 text-amber-500" size={24} />
                   <span className="text-[10px] font-black uppercase tracking-widest">Перевірка замовлень...</span>
                </div>
              ) : !receiveItem.found ? (
                <div className="text-center py-8">
                  <FaTimes className="text-rose-400 text-4xl mx-auto mb-3 opacity-50" />
                  <p className="text-xs font-bold text-slate-600">Не знайдено активного замовлення для цього товару.</p>
                  <p className="text-[10px] text-slate-400 mt-2">Можливо, товар вже прийнято або замовлено не через пряму поставку.</p>
                </div>
              ) : (
                <form id="expressReceiveForm" onSubmit={submitReceive}>
                   <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Скільки доставлено на об'єкт?</label>
                   <div className="flex items-center gap-3">
                     <input 
                       type="number" step="any" required autoFocus
                       max={receiveData.maxQty}
                       value={receiveData.qty} onChange={(e) => setReceiveData({...receiveData, qty: e.target.value})}
                       className="w-full text-xl font-black p-3 bg-white border border-amber-200 rounded-xl outline-none focus:border-amber-500 shadow-inner"
                     />
                     <span className="text-sm font-black text-slate-500 uppercase">{receiveItem.unit}</span>
                   </div>
                   <p className="text-[10px] font-bold text-slate-400 mt-3 text-center">
                      Максимально до прийомки: <span className="text-slate-700 font-black">{receiveData.maxQty}</span>
                   </p>
                </form>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 flex gap-3 bg-white shrink-0">
               <button type="button" onClick={() => setIsReceiveModalOpen(false)} className="flex-1 py-3 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors">Скасувати</button>
               {receiveItem.found && !receiveItem.isLoadingStatus && (
                 <button type="submit" form="expressReceiveForm" disabled={isReceiving} className="flex-1 py-3 text-xs font-black text-white bg-amber-500 hover:bg-amber-600 uppercase tracking-widest rounded-xl transition-colors shadow-lg shadow-amber-500/30">
                   {isReceiving ? 'ОБРОБКА...' : 'ПРИЙНЯТИ'}
                 </button>
               )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}