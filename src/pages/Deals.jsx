import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FaPlus, FaSearch, FaTrash, FaSolarPanel, FaUserTie, FaTimes, 
  FaExclamationTriangle, FaBuilding, FaUser, FaChevronLeft, 
  FaChevronRight, FaCheckDouble, FaEdit, FaFilter 
} from 'react-icons/fa';

export default function Deals() {
  const navigate = useNavigate();
  const [stages, setStages] = useState([]);
  const [deals, setDeals] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [searchTerm, setSearchTerm] = useState('');
  
  const [statusFilters, setStatusFilters] = useState(['В роботі']);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  
  const scrollContainerRef = useRef(null);
  
  const [isNewDealModalOpen, setIsNewDealModalOpen] = useState(false);
  const [dealToDelete, setDealToDelete] = useState(null);
  const [dealToEdit, setDealToEdit] = useState(null); 
  
  const [clientMode, setClientMode] = useState('existing'); 
  
  const [formData, setFormData] = useState({
    client_id: '', title: '', goal: 'Економія (Власне споживання)', final_budget: '', needs_battery: false, notes: ''
  });

  const [editData, setEditData] = useState({
    title: '', goal: '', final_budget: '', needs_battery: false, status: 'В роботі'
  });

  const [newClientData, setNewClientData] = useState({ type: 'Фізична особа', name: '', company: '', phone: '', lead_source: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [clientSearchText, setClientSearchText] = useState('');
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (!loading && scrollContainerRef.current) {
      const savedScroll = sessionStorage.getItem('kanbanScrollPosition');
      if (savedScroll) {
        scrollContainerRef.current.scrollLeft = parseInt(savedScroll, 10);
      }
    }
  }, [loading]);

  const handleScroll = (e) => {
    sessionStorage.setItem('kanbanScrollPosition', e.target.scrollLeft);
  };

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const { data: stagesData } = await supabase.from('deal_stages').select('*').order('position');
      
      const { data: dealsData } = await supabase
        .from('deals')
        .select(`
          *, 
          clients(name, phone, client_type, company_name),
          site_surveys(system_type),
          tasks(id, status, stage_id)
        `)
        .order('updated_at', { ascending: false });
        
      const { data: clientsData } = await supabase.from('clients').select('id, custom_id, name, phone, client_type, company_name').order('name');
      
      setStages(stagesData || []);
      setDeals(dealsData || []);
      setClients(clientsData || []);
    } catch (e) {
      console.error("Помилка завантаження:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleMoveDeal = async (dealId, targetStageId, targetStageName) => {
    setDeals(prev => {
      const dealToMove = prev.find(d => d.id === dealId);
      if (!dealToMove) return prev;
      const updatedDeal = { ...dealToMove, stage_id: targetStageId, stage: targetStageName, updated_at: new Date().toISOString() };
      return [updatedDeal, ...prev.filter(d => d.id !== dealId)];
    });

    const { error } = await supabase.from('deals').update({ 
      stage_id: targetStageId, stage: targetStageName, updated_at: new Date() 
    }).eq('id', dealId);

    if (!error) {
      setTimeout(() => fetchInitialData(), 300);
    }
  };

  const onDrop = (e, targetStageId, targetStageName) => {
    e.preventDefault();
    const dealId = e.dataTransfer.getData('dealId');
    if (dealId) handleMoveDeal(dealId, targetStageId, targetStageName);
  };

  const handleMoveAdjacent = (e, deal, direction) => {
    e.stopPropagation(); 
    const currentIndex = stages.findIndex(s => s.id === deal.stage_id);
    const newIndex = currentIndex + direction;
    if (newIndex >= 0 && newIndex < stages.length) {
      const targetStage = stages[newIndex];
      handleMoveDeal(deal.id, targetStage.id, targetStage.name);
    }
  };

  const confirmDeleteDeal = async () => {
    if (!dealToDelete) return;
    const { error } = await supabase.from('deals').delete().eq('id', dealToDelete.id);
    if (!error) setDeals(prev => prev.filter(d => d.id !== dealToDelete.id));
    setDealToDelete(null);
  };

  const openEditModal = (deal) => {
    setDealToEdit(deal);
    setEditData({
      title: deal.title || '',
      goal: deal.goal || '',
      final_budget: deal.final_budget || '',
      needs_battery: deal.needs_battery || false,
      status: deal.status || 'В роботі'
    });
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    const { error } = await supabase.from('deals').update({
      title: editData.title,
      goal: editData.goal,
      final_budget: editData.final_budget ? parseFloat(editData.final_budget) : 0,
      needs_battery: editData.needs_battery,
      status: editData.status,
      updated_at: new Date()
    }).eq('id', dealToEdit.id);

    if (!error) {
      setDealToEdit(null);
      fetchInitialData(); 
    } else {
      alert("Помилка оновлення: " + error.message);
    }
    setIsSubmitting(false);
  };

  const handleNewDealSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    let finalClientId = formData.client_id;

    if (clientMode === 'new') {
      if (!newClientData.name) {
        alert('Введіть ім\'я клієнта!');
        setIsSubmitting(false); return;
      }
      const { data: createdClient, error: clientErr } = await supabase.from('clients').insert([{
        client_type: newClientData.type, name: newClientData.name, company_name: newClientData.type === 'Юридична особа' ? newClientData.company : null, phone: newClientData.phone, lead_source: newClientData.lead_source
      }]).select().single();

      if (clientErr) {
        alert('Помилка: ' + clientErr.message);
        setIsSubmitting(false); return;
      }
      finalClientId = createdClient.id;
    } else {
      if (!finalClientId) {
          alert('Оберіть клієнта зі списку!');
          setIsSubmitting(false); return;
      }
    }

    const firstStage = stages[0];
    const payload = {
      client_id: finalClientId, title: formData.title || 'Нова СЕС', goal: formData.goal, final_budget: formData.final_budget ? parseFloat(formData.final_budget) : 0, needs_battery: formData.needs_battery, notes: formData.notes, stage_id: firstStage?.id, stage: firstStage?.name, status: 'В роботі'
    };

    const { error: dealError } = await supabase.from('deals').insert([payload]);

    if (!dealError) {
      setIsNewDealModalOpen(false);
      setFormData({ client_id: '', title: '', goal: 'Економія (Власне споживання)', final_budget: '', needs_battery: false, notes: '' });
      setNewClientData({ type: 'Фізична особа', name: '', company: '', phone: '', lead_source: '' });
      setClientSearchText(''); setClientMode('existing');
      fetchInitialData();
    } else {
      alert("Помилка: " + dealError.message);
    }
    setIsSubmitting(false);
  };

  const filteredDeals = deals.filter(d => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = searchTerm 
      ? (d.custom_id?.toString().includes(searchLower) || 
         d.title?.toLowerCase().includes(searchLower) ||
         d.clients?.name?.toLowerCase().includes(searchLower))
      : true;
      
    const matchesStatus = searchTerm ? true : statusFilters.includes(d.status);
    return matchesSearch && matchesStatus;
  });

  const toggleStatusFilter = (status) => {
    setStatusFilters(prev => prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]);
  };

  const filteredClientsForSelect = clients.filter(c => 
    c.name?.toLowerCase().includes(clientSearchText.toLowerCase()) || 
    c.custom_id?.toString().includes(clientSearchText)
  );

  // Виділив список фільтрів в окремий блок, щоб не дублювати код
  const renderFilterDropdown = () => (
    <div className="absolute right-0 top-[110%] mt-2 w-60 md:w-64 bg-white border border-slate-200 rounded-2xl p-4 z-50 shadow-xl">
       <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Відображати статуси:</h4>
       <div className="space-y-2">
         {['В роботі', 'Угоду виграно', 'Клієнт на паузі', 'Угоду програно'].map(status => (
           <label key={status} className="flex items-center gap-3 cursor-pointer group p-1">
             <input type="checkbox" checked={statusFilters.includes(status)} onChange={() => toggleStatusFilter(status)} className="w-4 h-4 text-amber-500 rounded border-slate-300 focus:ring-amber-500 cursor-pointer" />
             <span className="text-xs md:text-sm font-bold text-slate-700 group-hover:text-slate-900 transition-colors">{status}</span>
           </label>
         ))}
       </div>
       <div className="mt-3 pt-2 border-t border-slate-100">
          <p className="text-[9px] font-bold text-slate-400 leading-tight">При пошуку тексту, система шукає серед усіх статусів.</p>
       </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-slate-50 px-3 sm:px-6 lg:px-8 py-4 md:py-8 space-y-4 md:space-y-6">
      
      {/* ПАНЕЛЬ КЕРУВАННЯ */}
      <div className="bg-white p-4 md:p-6 rounded-2xl md:rounded-3xl border border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shrink-0">
        
        {/* Мобільний рядок: Заголовок + Фільтр */}
        <div className="flex items-center justify-between w-full md:w-auto md:flex-1">
           <h1 className="text-lg md:text-2xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-2.5">
             <div className="p-2 md:p-2.5 bg-amber-500 text-slate-900 rounded-lg md:rounded-xl shadow-sm"><FaSolarPanel size={18}/></div>
             Воронка Угод
           </h1>
           
           {/* Фільтр (тільки для мобільних) */}
           <div className="relative md:hidden">
             <button onClick={() => setIsFilterOpen(!isFilterOpen)} className={`p-2.5 rounded-lg transition-colors border ${isFilterOpen ? 'bg-amber-100 text-amber-600 border-amber-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
               <FaFilter size={14}/>
             </button>
             {isFilterOpen && renderFilterDropdown()}
           </div>
        </div>

        {/* Права частина: Пошук + Нова угода */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
          
          {/* Фільтр (для десктопу) */}
          <div className="relative hidden md:block">
            <button onClick={() => setIsFilterOpen(!isFilterOpen)} className={`p-3.5 rounded-xl transition-colors border ${isFilterOpen ? 'bg-amber-100 text-amber-600 border-amber-200' : 'bg-slate-50 hover:bg-slate-100 text-slate-500 border-slate-200'}`}>
              <FaFilter size={14}/>
            </button>
            {isFilterOpen && renderFilterDropdown()}
          </div>

          <div className="relative w-full md:w-64 lg:w-72">
            <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input type="text" placeholder="Пошук за назвою або ID..." className="w-full pl-10 pr-4 py-3 md:py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-colors" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          
          <button onClick={() => setIsNewDealModalOpen(true)} className="w-full sm:w-auto bg-slate-900 hover:bg-slate-800 text-amber-500 px-6 py-3 md:py-3.5 rounded-xl font-black text-xs transition-colors flex items-center justify-center gap-2 uppercase tracking-widest">
            <FaPlus size={12} /> НОВА УГОДА
          </button>
        </div>
      </div>

      {/* КАНБАН ДОШКА */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center font-black text-slate-400 uppercase tracking-widest text-xs animate-pulse">Завантаження воронки...</div>
      ) : (
        <div 
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-x-auto overflow-y-hidden pb-2 [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-slate-400 [&::-webkit-scrollbar-track]:bg-transparent transition-colors"
        >
          <div className="flex gap-4 md:gap-6 h-full min-w-max">
            {stages.map((stage) => {
              const stageDeals = filteredDeals.filter(d => d.stage_id === stage.id);
              
              return (
                <div 
                  key={stage.id} 
                  className="w-[300px] md:w-[340px] flex flex-col bg-slate-100/50 rounded-2xl border border-slate-200 max-h-full" 
                  onDragOver={e => e.preventDefault()} 
                  onDrop={e => onDrop(e, stage.id, stage.name)}
                >
                  <div className="p-3 md:p-4 flex items-center justify-between border-b border-slate-200 shrink-0">
                    <span className="text-[11px] md:text-xs font-black text-slate-700 uppercase tracking-widest pl-2 border-l-4 border-amber-500">{stage.name}</span>
                    <span className="text-[10px] font-black bg-white border border-slate-100 text-slate-500 px-2.5 py-1 rounded-lg">{stageDeals.length}</span>
                  </div>

                  <div className="flex-1 p-2 md:p-3 overflow-y-auto space-y-2 md:space-y-3 pr-1 md:pr-2 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent">
                    <AnimatePresence>
                      {stageDeals.map(deal => {
                        const sysType = Array.isArray(deal.site_surveys) ? deal.site_surveys[0]?.system_type : deal.site_surveys?.system_type;
                        const isBusiness = deal.clients?.client_type === 'Юридична особа';
                        const isFirstStage = stages.findIndex(s => s.id === deal.stage_id) === 0;
                        const isLastStage = stages.findIndex(s => s.id === deal.stage_id) === stages.length - 1;

                        const currentStageTasks = deal.tasks?.filter(t => t.stage_id === deal.stage_id) || [];
                        const totalTasks = currentStageTasks.length;
                        const completedTasks = currentStageTasks.filter(t => t.status === 'Виконана').length;
                        const progressPercent = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

                        return (
                          <motion.div 
                            layout="position"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            key={deal.id} 
                            draggable 
                            onDragStart={e => e.dataTransfer.setData('dealId', deal.id)} 
                            onClick={() => navigate(`/deals/${deal.id}`)} 
                            className={`bg-white p-3 md:p-4 rounded-xl border cursor-pointer transition-colors group relative flex flex-col 
                              ${deal.status === 'Угоду програно' ? 'border-rose-200 bg-rose-50/30 opacity-70' : 
                                deal.status === 'Угоду виграно' ? 'border-emerald-200 bg-emerald-50/40' : 
                                deal.status === 'Клієнт на паузі' ? 'border-amber-200 bg-amber-50/40 opacity-80' : 
                                'border-slate-200 hover:border-amber-400'}`}
                          >
                            
                            {deal.status !== 'В роботі' && (
                              <div className={`absolute top-0 right-0 px-2.5 py-1 text-[8px] font-black uppercase rounded-bl-lg rounded-tr-xl border-l border-b
                                ${deal.status === 'Угоду виграно' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                                  deal.status === 'Угоду програно' ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-amber-50 text-amber-700 border-amber-100'}`}>
                                {deal.status}
                              </div>
                            )}

                            <div className="flex justify-between items-center mb-2">
                              <div className="flex items-center gap-1.5">
                                 <span className="text-[9px] font-black font-mono text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">№ {deal.custom_id}</span>
                                 <span className={`flex items-center justify-center w-4 h-4 rounded ${isBusiness ? 'bg-amber-50 text-amber-600' : 'bg-slate-50 text-slate-400'}`} title={deal.clients?.client_type}>
                                    {isBusiness ? <FaBuilding size={9}/> : <FaUser size={9}/>}
                                 </span>
                              </div>
                              <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                <button onClick={(e) => { e.stopPropagation(); openEditModal(deal); }} className="p-1.5 text-slate-400 hover:text-amber-500 hover:bg-amber-50 rounded transition-colors"><FaEdit size={10} /></button>
                                <button onClick={(e) => { e.stopPropagation(); setDealToDelete(deal); }} className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded transition-colors"><FaTrash size={10} /></button>
                              </div>
                            </div>

                            <h4 className="font-black text-slate-800 text-xs md:text-sm mb-1 leading-tight line-clamp-2">{deal.title || 'Нова СЕС'}</h4>
                            
                            <div className="flex flex-col gap-0.5 text-[9px] md:text-[10px] font-bold text-slate-500 bg-slate-50/50 p-1.5 md:p-2 rounded-lg mb-2">
                               <div className="flex items-center gap-1.5 truncate">
                                 <FaUserTie size={9} className="shrink-0 text-slate-400"/> <span className="truncate">{deal.clients?.name || 'Клієнт не вказаний'}</span>
                               </div>
                               {isBusiness && deal.clients?.company_name && (
                                 <div className="flex items-center gap-1.5 truncate text-amber-600">
                                   <FaBuilding size={9} className="shrink-0"/> <span className="truncate">{deal.clients.company_name}</span>
                                 </div>
                               )}
                            </div>

                            <div className="space-y-1.5">
                               <div className="flex justify-between items-center"><span className="text-[8px] font-black uppercase text-slate-400">Ціль:</span><span className="text-[9px] md:text-[10px] font-bold text-slate-700 truncate max-w-[120px] text-right">{deal.goal}</span></div>
                               {sysType && <div className="flex justify-between items-center"><span className="text-[8px] font-black uppercase text-slate-400">Тип:</span><span className="text-[9px] md:text-[10px] font-black text-amber-600 bg-amber-50 px-1.5 md:px-2 py-0.5 rounded">{sysType}</span></div>}
                               <div className="flex justify-between items-center"><span className="text-[8px] font-black uppercase text-slate-400">Бюджет:</span><span className="text-[10px] md:text-[11px] font-black text-emerald-600">{Number(deal.final_budget).toLocaleString()} $</span></div>
                            </div>

                            {/* ПРОГРЕС ЗАВДАНЬ */}
                            {totalTasks > 0 && (
                              <div className="mt-3 pt-2 border-t border-slate-100">
                                <div className="flex justify-between items-center mb-1">
                                  <span className="text-[8px] font-black uppercase text-slate-400 flex items-center gap-1"><FaCheckDouble size={8}/> Завдань</span>
                                  <span className={`text-[9px] font-black ${completedTasks === totalTasks ? 'text-emerald-500' : 'text-slate-500'}`}>
                                    {completedTasks} / {totalTasks}
                                  </span>
                                </div>
                                <div className="w-full bg-slate-100 rounded-full h-1 overflow-hidden">
                                   <div className={`h-full rounded-full transition-all ${completedTasks === totalTasks ? 'bg-emerald-400' : 'bg-amber-400'}`} style={{ width: `${progressPercent}%` }}></div>
                                </div>
                              </div>
                            )}

                            {/* КНОПКИ ПЕРЕМІЩЕННЯ (Мобільні) */}
                            <div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-50 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                               <button onClick={(e) => handleMoveAdjacent(e, deal, -1)} disabled={isFirstStage} className="p-1.5 text-slate-400 hover:text-amber-500 hover:bg-amber-50 rounded disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400 transition-colors"><FaChevronLeft size={12} /></button>
                               <span className="text-[7px] md:text-[8px] font-black uppercase text-slate-300 tracking-[0.1em] md:tracking-[0.2em]">Перемістити</span>
                               <button onClick={(e) => handleMoveAdjacent(e, deal, 1)} disabled={isLastStage} className="p-1.5 text-slate-400 hover:text-amber-500 hover:bg-amber-50 rounded disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400 transition-colors"><FaChevronRight size={12} /></button>
                            </div>

                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                    {stageDeals.length === 0 && <div className="h-16 border border-dashed border-slate-200 rounded-xl flex items-center justify-center text-slate-400 text-[9px] font-bold uppercase tracking-widest opacity-60">Порожньо</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* МОДАЛКА ШВИДКОГО РЕДАГУВАННЯ УГОДИ */}
      {dealToEdit && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/50 transition-opacity">
          <div className="bg-white rounded-2xl md:rounded-3xl shadow-lg w-full max-w-md overflow-hidden flex flex-col">
            <div className="p-5 md:p-6 border-b border-slate-100 flex justify-between items-center bg-slate-900 text-white">
              <h3 className="text-base md:text-lg font-black uppercase tracking-tight flex items-center gap-2"><FaEdit className="text-amber-500"/> Редагування</h3>
              <button onClick={() => setDealToEdit(null)} className="text-slate-400 hover:text-white transition-colors"><FaTimes size={14}/></button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-5 md:p-6 space-y-4 bg-slate-50/50">
              <div>
                <label className="block text-[9px] md:text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Статус Угоди</label>
                <select 
                  className={`w-full px-3 py-2.5 md:py-3 border rounded-lg md:rounded-xl text-xs md:text-sm font-black uppercase tracking-widest outline-none transition-colors cursor-pointer
                    ${editData.status === 'Угоду виграно' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 
                      editData.status === 'Угоду програно' ? 'bg-rose-50 border-rose-200 text-rose-700' : 
                      editData.status === 'Клієнт на паузі' ? 'bg-amber-50 border-amber-200 text-amber-800' : 
                      'bg-white border-slate-200 text-slate-900'}`}
                  value={editData.status} onChange={e => setEditData({...editData, status: e.target.value})}
                >
                  <option value="В роботі">🔄 В роботі (Активна)</option>
                  <option value="Угоду виграно">✅ Угоду виграно (Успіх)</option>
                  <option value="Клієнт на паузі">⏸️ Клієнт на паузі</option>
                  <option value="Угоду програно">❌ Угоду програно (Відмова)</option>
                </select>
              </div>

              <div>
                <label className="block text-[9px] md:text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Назва об'єкту</label>
                <input type="text" required className="w-full px-3 py-2.5 md:py-3 bg-white border border-slate-200 rounded-lg md:rounded-xl text-xs md:text-sm font-bold outline-none focus:border-amber-500" value={editData.title} onChange={e => setEditData({...editData, title: e.target.value})}/>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[9px] md:text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Ціль клієнта</label>
                  <select 
                    className="w-full px-3 py-2.5 md:py-3 bg-white border border-slate-200 rounded-lg md:rounded-xl text-xs md:text-sm font-bold outline-none focus:border-amber-500 cursor-pointer" 
                    value={editData.goal} 
                    onChange={e => setEditData({...editData, goal: e.target.value})}
                  >
                    <option value="Економія (Власне споживання)">Економія (Власне споживання)</option>
                    <option value="Резерв (Безперебійне живлення)">Резерв (Безперебійне живлення)</option>
                    <option value="Продаж (Зелений тариф)">Продаж (Зелений тариф)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[9px] md:text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Бюджет ($)</label>
                  <input type="number" className="w-full px-3 py-2.5 md:py-3 bg-white border border-slate-200 rounded-lg md:rounded-xl text-xs md:text-sm font-bold outline-none focus:border-amber-500" value={editData.final_budget} onChange={e => setEditData({...editData, final_budget: e.target.value})}/>
                </div>
              </div>
            </form>

            <div className="p-5 md:p-6 border-t border-slate-100 flex justify-end gap-2 md:gap-3 bg-white">
              <button type="button" onClick={() => setDealToEdit(null)} className="px-4 md:px-6 py-2.5 md:py-3 text-xs md:text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg md:rounded-xl transition-colors">Скасувати</button>
              <button onClick={handleEditSubmit} disabled={isSubmitting} className="px-5 md:px-8 py-2.5 md:py-3 bg-amber-500 hover:bg-amber-400 text-slate-900 text-[10px] md:text-xs font-black uppercase tracking-widest rounded-lg md:rounded-xl transition-colors flex items-center gap-2">
                {isSubmitting ? 'ЗБЕРЕЖЕННЯ...' : 'ЗБЕРЕГТИ'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* МОДАЛКА ВИДАЛЕННЯ УГОДИ */}
      {dealToDelete && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/50 transition-opacity">
           <div className="bg-white rounded-2xl md:rounded-3xl p-6 md:p-8 shadow-lg w-full max-w-sm flex flex-col items-center text-center">
              <div className="w-12 h-12 md:w-16 md:h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mb-4"><FaExclamationTriangle size={24} /></div>
              <h3 className="text-lg md:text-xl font-black text-slate-900 uppercase tracking-tight mb-2">Видалення угоди</h3>
              <p className="text-xs md:text-sm text-slate-500 font-medium mb-1">Ви дійсно хочете видалити угоду <span className="font-bold text-slate-800">№{dealToDelete.custom_id}</span>?</p>
              <p className="text-[9px] md:text-[10px] font-bold text-rose-500 uppercase tracking-widest mb-6 bg-rose-50 px-2 py-1 rounded">Це неможливо скасувати</p>
              <div className="flex gap-2 md:gap-3 w-full">
                 <button onClick={() => setDealToDelete(null)} className="flex-1 py-2.5 md:py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold uppercase text-[10px] md:text-xs tracking-widest rounded-lg md:rounded-xl transition-colors">Скасувати</button>
                 <button onClick={confirmDeleteDeal} className="flex-1 py-2.5 md:py-3 bg-rose-500 hover:bg-rose-600 text-white font-bold uppercase text-[10px] md:text-xs tracking-widest rounded-lg md:rounded-xl transition-colors">Видалити</button>
              </div>
           </div>
        </div>
      )}

      {/* МОДАЛКА НОВОЇ УГОДИ */}
      {isNewDealModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/50 transition-opacity">
          <div className="bg-white rounded-2xl md:rounded-3xl shadow-lg w-full max-w-2xl overflow-hidden flex flex-col">
            <div className="p-5 md:p-6 border-b border-slate-100 flex justify-between items-center bg-slate-900 text-white">
              <div className="flex items-center gap-2 md:gap-3">
                <div className="p-1.5 md:p-2 bg-amber-500 text-slate-900 rounded-lg"><FaPlus size={14}/></div>
                <div>
                  <h3 className="text-base md:text-lg font-black uppercase tracking-tight leading-none">Нова угода</h3>
                  <p className="text-[9px] md:text-[10px] text-amber-500 font-bold uppercase mt-1 tracking-widest leading-none">Запуск проєкту</p>
                </div>
              </div>
              <button onClick={() => setIsNewDealModalOpen(false)} className="p-2 text-slate-400 hover:text-white transition-colors"><FaTimes size={16} /></button>
            </div>

            <form id="dealForm" onSubmit={handleNewDealSubmit} className="p-4 md:p-6 space-y-4 md:space-y-6 bg-slate-50/50 overflow-y-auto max-h-[75vh] custom-scrollbar">
              
              <div className="bg-white p-4 md:p-5 rounded-xl md:rounded-2xl border border-slate-200">
                <div className="flex bg-slate-100 p-1 rounded-lg mb-4">
                   <button type="button" onClick={() => setClientMode('existing')} className={`flex-1 py-2 text-[9px] md:text-[10px] font-black uppercase tracking-widest rounded transition-colors ${clientMode === 'existing' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Існуючий клієнт</button>
                   <button type="button" onClick={() => setClientMode('new')} className={`flex-1 py-2 text-[9px] md:text-[10px] font-black uppercase tracking-widest rounded transition-colors ${clientMode === 'new' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Новий клієнт</button>
                </div>

                {clientMode === 'existing' ? (
                  <div>
                    <label className="block text-[9px] md:text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Пошук за ПІБ або ID *</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 md:pl-4 flex items-center pointer-events-none"><FaUserTie className="text-slate-400" size={14} /></div>
                      <input 
                        type="text" required={clientMode === 'existing'} className="w-full pl-9 md:pl-11 pr-3 md:pr-4 py-2.5 md:py-3 bg-slate-50 border border-slate-200 rounded-lg md:rounded-xl focus:border-amber-500 outline-none text-xs md:text-sm font-bold text-slate-800"
                        placeholder="Введіть ім'я або ID..." value={clientSearchText}
                        onChange={(e) => { setClientSearchText(e.target.value); setIsClientDropdownOpen(true); setFormData({...formData, client_id: ''}); }}
                        onFocus={() => setIsClientDropdownOpen(true)} onBlur={() => setTimeout(() => setIsClientDropdownOpen(false), 200)}
                      />
                      {isClientDropdownOpen && clientSearchText && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg md:rounded-xl shadow-lg max-h-48 overflow-y-auto custom-scrollbar">
                          {filteredClientsForSelect.length > 0 ? filteredClientsForSelect.map(c => (
                              <div 
                                key={c.id} 
                                onMouseDown={(e) => {
                                  e.preventDefault(); 
                                  setFormData({...formData, client_id: c.id}); 
                                  setClientSearchText(`${c.name}`); 
                                  setIsClientDropdownOpen(false); 
                                }}
                                className="px-3 md:px-4 py-2.5 md:py-3 hover:bg-amber-50 cursor-pointer border-b border-slate-50 flex justify-between items-center" 
                              >
                                <div>
                                   <div className="font-bold text-xs md:text-sm text-slate-800">{c.name}</div>
                                   {c.company_name && <div className="text-[9px] md:text-[10px] text-slate-500 font-bold uppercase mt-0.5">{c.company_name}</div>}
                                </div>
                                <div className="text-[9px] md:text-[10px] text-slate-400 font-bold font-mono bg-slate-100 px-1.5 md:px-2 py-0.5 rounded">ID: {c.custom_id}</div>
                              </div>
                            )) : <div className="p-3 md:p-4 text-xs font-bold text-slate-400 text-center">Нічого не знайдено</div>}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 md:space-y-4 border border-amber-200 bg-amber-50/30 p-3 md:p-4 rounded-lg md:rounded-xl">
                    <div className="flex flex-col sm:flex-row gap-2 md:gap-4">
                      {['Фізична особа', 'Юридична особа'].map(type => (
                         <label key={type} className={`flex-1 flex items-center justify-center gap-2 p-2 border rounded-lg cursor-pointer transition-colors text-xs font-bold ${newClientData.type === type ? 'border-amber-500 bg-white text-amber-800' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
                           <input type="radio" name="new_client_type" value={type} checked={newClientData.type === type} onChange={e => setNewClientData({...newClientData, type: e.target.value})} className="hidden" />
                           {type === 'Юридична особа' ? <FaBuilding size={12}/> : <FaUser size={12}/>}
                           {type}
                         </label>
                      ))}
                    </div>
                    <div>
                      <label className="block text-[9px] md:text-[10px] font-black text-slate-500 uppercase mb-1 ml-1">{newClientData.type === 'Юридична особа' ? 'Контактна особа' : 'ПІБ клієнта'} *</label>
                      <input type="text" required={clientMode === 'new'} value={newClientData.name} onChange={e => setNewClientData({...newClientData, name: e.target.value})} className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg focus:border-amber-500 outline-none text-xs md:text-sm font-bold" placeholder="Іван Іванов" />
                    </div>
                    {newClientData.type === 'Юридична особа' && (
                      <div><label className="block text-[9px] md:text-[10px] font-black text-slate-500 uppercase mb-1 ml-1">Назва компанії *</label><input type="text" required={clientMode === 'new' && newClientData.type === 'Юридична особа'} value={newClientData.company} onChange={e => setNewClientData({...newClientData, company: e.target.value})} className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg focus:border-amber-500 outline-none text-xs md:text-sm font-bold" placeholder="ТОВ СонцеПром" /></div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                      <div><label className="block text-[9px] md:text-[10px] font-black text-slate-500 uppercase mb-1 ml-1">Телефон</label><input type="tel" value={newClientData.phone} onChange={e => setNewClientData({...newClientData, phone: e.target.value})} className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg focus:border-amber-500 outline-none text-xs md:text-sm font-bold" placeholder="+38 (000) 000-00-00" /></div>
                      <div>
                        <label className="block text-[9px] md:text-[10px] font-black text-slate-500 uppercase mb-1 ml-1">Джерело</label>
                        <select className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg focus:border-amber-500 outline-none text-xs md:text-sm font-bold" value={newClientData.lead_source} onChange={e => setNewClientData({...newClientData, lead_source: e.target.value})}>
                          <option value="">Оберіть...</option><option value="TikTok">TikTok</option><option value="Instagram">Instagram</option><option value="Google">Google / Сайт</option><option value="Рекомендація">Рекомендація</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-white p-4 md:p-5 rounded-xl md:rounded-2xl border border-slate-200 space-y-3 md:space-y-4">
                <div><label className="block text-[9px] md:text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Назва об'єкту / Угоди *</label><input type="text" required placeholder="Напр: СЕС 15кВт Київ" className="w-full px-3 py-2.5 md:py-3 bg-slate-50 border border-slate-200 rounded-lg md:rounded-xl text-xs md:text-sm font-bold outline-none focus:border-amber-500" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})}/></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-5 pt-1 md:pt-2">
                  <div><label className="block text-[9px] md:text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Ціль клієнта</label><select className="w-full px-3 py-2.5 md:py-3 bg-slate-50 border border-slate-200 rounded-lg md:rounded-xl text-xs md:text-sm font-bold outline-none focus:border-amber-500" value={formData.goal} onChange={e => setFormData({...formData, goal: e.target.value})}><option value="Економія (Власне споживання)">Економія (Власне споживання)</option><option value="Резерв (Безперебійне живлення)">Резерв (Безперебійне живлення)</option><option value="Продаж (Зелений тариф)">Продаж (Зелений тариф)</option></select></div>
                  <div><label className="block text-[9px] md:text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Бюджет ($)</label><input type="number" placeholder="Напр: 15000" className="w-full px-3 py-2.5 md:py-3 bg-slate-50 border border-slate-200 rounded-lg md:rounded-xl text-xs md:text-sm font-bold outline-none focus:border-amber-500" value={formData.final_budget} onChange={e => setFormData({...formData, final_budget: e.target.value})}/></div>
                  <div className="md:col-span-2 pt-1 md:pt-2"><label className="flex items-center gap-2 md:gap-3 cursor-pointer p-3 md:p-4 bg-amber-50 border border-amber-200 rounded-lg md:rounded-xl transition-colors"><input type="checkbox" checked={formData.needs_battery} onChange={e => setFormData({...formData, needs_battery: e.target.checked})} className="w-4 h-4 md:w-5 md:h-5 text-amber-600 rounded focus:ring-amber-500"/><span className="text-[10px] md:text-xs font-black uppercase text-amber-800 tracking-widest">Потрібен акумулятор (АКБ)</span></label></div>
                </div>
              </div>

              <div className="bg-white p-4 md:p-5 rounded-xl md:rounded-2xl border border-slate-200"><label className="block text-[9px] md:text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Нотатки до угоди</label><textarea className="w-full px-3 py-2.5 md:py-3 bg-slate-50 border border-slate-200 rounded-lg md:rounded-xl text-xs md:text-sm font-medium outline-none focus:border-amber-500 resize-none" rows="3" placeholder="Додаткові побажання..." value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})}/></div>
            </form>

            <div className="p-4 md:p-6 border-t border-slate-100 flex justify-end gap-2 md:gap-3 bg-white shrink-0">
              <button type="button" onClick={() => setIsNewDealModalOpen(false)} className="px-4 md:px-6 py-2.5 md:py-3 text-xs md:text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg md:rounded-xl transition-colors">Скасувати</button>
              <button form="dealForm" type="submit" disabled={isSubmitting || (clientMode === 'existing' && !formData.client_id)} className="px-5 md:px-8 py-2.5 md:py-3 bg-amber-500 hover:bg-amber-400 text-slate-900 text-[10px] md:text-xs font-black uppercase tracking-widest rounded-lg md:rounded-xl transition-colors disabled:opacity-50 flex items-center gap-2">{isSubmitting ? 'ОБРОБКА...' : 'СТВОРИТИ'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}