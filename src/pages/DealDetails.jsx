import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthProvider'; 
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FaArrowLeft, FaInfoCircle, FaHistory, FaEye, 
  FaUserTie, FaChevronRight
} from 'react-icons/fa';

import DealTasks from '../components/DealTasks';
import SiteSurveyModal from '../components/SiteSurveyModal';
import SiteSurveyViewer from '../components/SiteSurveyViewer';
import DealSpecification from '../components/DealSpecification';
import DealInstallation from '../components/DealInstallation'; 
import InitialContactModal from '../components/InitialContactModal';
import DocumentUploadModal from '../components/DocumentUploadModal'; 
import DeliveryOrganizationModal from '../modals/DeliveryOrganizationModal';

import DealPaymentsModal from '../components/DealPaymentsModal';
import DealAdditionalMaterials from '../components/DealAdditionalMaterials';

export default function DealDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { employeeProfile } = useAuth(); 
  
  const [deal, setDeal] = useState(null);
  const [stages, setStages] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewingStageId, setViewingStageId] = useState(null);
  
  const [forceInventoryView, setForceInventoryView] = useState(false);
  const [inventoryMode, setInventoryMode] = useState('specification'); 
  
  const [isNotesOpen, setIsNotesOpen] = useState(false);

  // СТЕЙТИ ЗАВДАНЬ ДЛЯ ІНСТРУМЕНТІВ
  const [specTask, setSpecTask] = useState(null);
  const [installTask, setInstallTask] = useState(null);
  const [surveyTask, setSurveyTask] = useState(null);
  const [contactTask, setContactTask] = useState(null);
  const [docTask, setDocTask] = useState(null);
  const [deliveryTask, setDeliveryTask] = useState(null);
  const [paymentsTask, setPaymentsTask] = useState(null);
  
  // Додано стейт для таски додаткових матеріалів
  const [addMaterialsTask, setAddMaterialsTask] = useState(null);

  // СТЕЙТИ ДЛЯ МОДАЛОК
  const [isPaymentsOpen, setIsPaymentsOpen] = useState(false);
  const [isSurveyOpen, setIsSurveyOpen] = useState(false);
  const [isSurveyViewerOpen, setIsSurveyViewerOpen] = useState(false); 
  const [isInitialContactOpen, setIsInitialContactOpen] = useState(false);
  const [isDocModalOpen, setIsDocModalOpen] = useState(false);
  const [isDeliveryOpen, setIsDeliveryOpen] = useState(false);

  const [inventoryProgress, setInventoryProgress] = useState({ total: 0, reserved: 0, mounted: 0 });
  const [taskRefreshTrigger, setTaskRefreshTrigger] = useState(0);

  useEffect(() => {
    fetchDealFullData();
  }, [id]);

  const fetchDealFullData = async () => {
    try {
      const { data: dealData } = await supabase.from('deals').select(`*, clients(*)`).eq('id', id).single();
      const { data: stData } = await supabase.from('deal_stages').select('*').order('position');
      
      setDeal(dealData);
      setStages(stData || []);
      
      if (dealData && !viewingStageId) setViewingStageId(dealData.stage_id);

      const { data: logsData } = await supabase
        .from('deal_activity_log')
        .select(`*, users(full_name)`) 
        .eq('deal_id', id)
        .order('created_at', { ascending: false })
        .limit(100); 
      setLogs(logsData || []);

    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const completeTaskAndCheckStage = async (taskObj) => {
    if (!taskObj?.id) {
      fetchDealFullData();
      return;
    }

    const { error } = await supabase.from('tasks').update({
      status: 'Виконана',
      completed_at: new Date(),
      assignee_id: taskObj.assignee_id || employeeProfile?.id 
    }).eq('id', taskObj.id);

    if (error) return;

    await supabase.from('deal_activity_log').insert([{
      deal_id: deal.id, user_id: employeeProfile?.id, stage_id: viewingStageId,
      entity_type: 'task', action: `Виконано завдання: ${taskObj.title}`
    }]);

    const { data: allStageTasks } = await supabase.from('tasks').select('status').eq('deal_id', deal.id).eq('stage_id', viewingStageId);
    const allDone = allStageTasks?.every(t => t.status === 'Виконана') || false;

    if (allDone && allStageTasks?.length > 0) {
      const currentStageObj = stages.find(s => s.id === viewingStageId);
      const nextStage = stages.find(s => s.position === (currentStageObj?.position || 0) + 1);

      if (nextStage) {
        await supabase.from('deals').update({ stage_id: nextStage.id, stage: nextStage.name, updated_at: new Date() }).eq('id', deal.id);
        await supabase.from('deal_activity_log').insert([{ deal_id: deal.id, stage_id: nextStage.id, action: `Авто-перехід на етап: ${nextStage.name}` }]);
        
        setViewingStageId(nextStage.id);
      } else {
        await supabase.from('deals').update({ status: 'Угоду виграно', updated_at: new Date() }).eq('id', deal.id);
        await supabase.from('deal_activity_log').insert([{ deal_id: deal.id, stage_id: viewingStageId, action: `🎉 Угоду переведено в статус ВИГРАНО!` }]);
      }
    }
    
    setTaskRefreshTrigger(prev => prev + 1);
    fetchDealFullData();
  };

  const renderNotesAccordion = () => {
    if (!deal?.notes) return null;
    return (
      <div className="bg-amber-50 rounded-xl md:rounded-2xl border border-amber-200 overflow-hidden transition-colors duration-300">
        <button 
          onClick={() => setIsNotesOpen(!isNotesOpen)}
          className="w-full flex items-center justify-between p-3 md:p-5 hover:bg-amber-100/60 transition-colors"
        >
          <div className="flex items-center gap-2">
             <FaInfoCircle className="text-amber-500 shrink-0" size={16}/>
             <span className="text-[10px] md:text-sm font-black text-amber-800 uppercase tracking-widest text-left">Нотатки до угоди</span>
          </div>
          <FaChevronRight className={`text-amber-500 shrink-0 transition-transform duration-300 ${isNotesOpen ? 'rotate-90' : ''}`} size={14}/>
        </button>
        <AnimatePresence>
          {isNotesOpen && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <div className="px-3 md:px-5 pb-3 md:pb-5 pt-1">
                <div className="pt-2 md:pt-4 border-t border-amber-200/50">
                   <p className="text-xs md:text-base text-slate-700 leading-relaxed italic whitespace-pre-line break-words">
                     "{deal.notes}"
                   </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  if (loading) return <div className="flex h-screen items-center justify-center"><div className="w-10 h-10 border-4 border-amber-500/30 border-t-amber-500 rounded-full animate-spin"></div></div>;

  const currentStageName = stages.find(s => s.id === viewingStageId)?.name || '';
  const isViewingHistory = viewingStageId !== deal.stage_id;
  
  const showInventory = forceInventoryView;
  const filteredLogs = logs.filter(log => log.stage_id === viewingStageId);

  return (
    <div className="max-w-[1400px] mx-auto px-2 sm:px-6 lg:px-8 py-3 md:py-8 space-y-3 md:space-y-6 bg-slate-50 min-h-screen">
      
      {/* HEADER SECTION */}
      <div className="bg-white p-4 md:p-6 rounded-xl md:rounded-3xl border border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 md:gap-8 shadow-sm">
        
        <div className="flex-1 w-full min-w-0 space-y-2 md:space-y-4">
          <div className="flex items-center flex-wrap gap-2 md:gap-4">
            <button onClick={() => navigate('/deals')} className="flex items-center gap-1.5 md:gap-2 text-slate-400 hover:text-slate-900 font-bold text-[10px] md:text-xs transition-colors py-1 pr-1 md:pr-2 rounded">
              <FaArrowLeft size={12} className="md:w-4 md:h-4" /> <span className="hidden sm:inline uppercase">Назад до воронки</span>
            </button>
            <span className="px-1.5 md:px-3 py-0.5 md:py-1.5 bg-slate-900 text-white text-[9px] md:text-xs font-black rounded-md md:rounded-lg uppercase tracking-widest shadow-sm">
              № {deal.custom_id}
            </span>
            <span className={`px-1.5 md:px-3 py-0.5 md:py-1.5 text-[9px] md:text-xs font-black rounded-md md:rounded-lg uppercase tracking-widest border shadow-sm ${
              deal.status === 'Угоду виграно' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
              deal.status === 'Угоду програно' ? 'bg-rose-50 text-rose-600 border-rose-100' : 
              'bg-amber-50 text-amber-700 border-amber-100'
            }`}>
              {deal.status}
            </span>
          </div>

          <div className="flex flex-col gap-1 md:gap-2 min-w-0 w-full">
            <h1 className="text-lg md:text-3xl font-black text-slate-900 tracking-tight leading-tight uppercase break-words line-clamp-2 md:line-clamp-none">
              {deal.title || 'СЕС без назви'}
            </h1>
            <div className="flex items-center flex-wrap gap-1 md:gap-2 text-[10px] md:text-sm font-bold text-slate-600 min-w-0">
              <FaUserTie className="text-slate-400 shrink-0" size={14}/> 
              <span className="truncate max-w-[150px] md:max-w-[400px]">{deal.clients?.name}</span>
              <span className="text-slate-400 shrink-0 whitespace-nowrap">
                ({deal.clients?.phone || 'немає телефону'})
              </span>
            </div>
          </div>
        </div>

        <div className="w-full md:w-auto flex flex-row md:flex-col items-center md:items-end justify-between md:justify-center gap-1 md:gap-2 bg-slate-50/80 md:bg-slate-50 p-3 md:p-5 rounded-lg md:rounded-2xl border border-slate-100 shrink-0">
          <div className="flex items-center gap-1.5 md:gap-2 min-w-0">
            <span className="text-[9px] md:text-xs font-black text-slate-400 uppercase tracking-widest truncate">{deal.goal}</span>
            {deal.needs_battery && <span className="shrink-0 px-1 md:px-2 py-0.5 bg-amber-100 text-amber-800 text-[8px] md:text-[10px] font-black rounded uppercase">АКБ</span>}
          </div>
          <div className="text-lg md:text-3xl font-black text-emerald-500 tracking-tighter whitespace-nowrap shrink-0">
            {Number(deal.final_budget).toLocaleString()} $
          </div>
        </div>
      </div>

      {/* STAGES BAR */}
      <div className="bg-white p-4 md:p-6 md:px-8 rounded-xl md:rounded-3xl border border-slate-200 flex overflow-x-auto md:overflow-visible gap-2 md:gap-0 snap-x custom-scrollbar shadow-sm">
        {stages.map((st, idx) => {
          const isActualCurrent = st.id === deal.stage_id; 
          const isPast = stages.findIndex(s => s.id === deal.stage_id) > idx; 
          const isSelected = st.id === viewingStageId; 
          return (
            <div key={st.id} onClick={() => { setViewingStageId(st.id); setForceInventoryView(false); setInventoryMode('specification'); }} className="flex flex-col items-center flex-1 min-w-[90px] md:min-w-0 relative cursor-pointer group snap-start">
              {idx < stages.length - 1 && (
                 <div className={`absolute top-4 md:top-5 left-1/2 w-full h-[2px] md:h-[3px] -z-0 transition-colors duration-300 ${isPast || isActualCurrent ? 'bg-emerald-500/40' : 'bg-slate-100'}`} style={{ width: '100%' }} />
              )}
              <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center text-[10px] md:text-sm font-bold transition-all duration-300 z-10 relative
                ${isSelected ? 'ring-4 ring-amber-500/30 scale-110' : 'group-hover:scale-105'}
                ${isActualCurrent ? 'bg-amber-500 text-slate-900 shadow-md scale-110' : isPast ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                {isPast && !isActualCurrent ? '✓' : idx + 1}
              </div>
              <span className={`text-[8px] md:text-xs font-black uppercase mt-2 md:mt-4 text-center leading-tight transition-colors px-1 max-w-full break-words
                 ${isSelected ? 'text-amber-600' : isActualCurrent ? 'text-slate-900' : 'text-slate-400'}`}>
                {st.name}
              </span>
            </div>
          );
        })}
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="space-y-3 md:space-y-6">
        
        {isViewingHistory && (
           <div className="bg-slate-800 text-amber-400 p-3 md:p-5 rounded-xl md:rounded-2xl flex flex-col sm:flex-row sm:items-center gap-2 md:gap-3 text-[10px] md:text-sm font-bold shadow-md transition-opacity">
              <div className="flex items-center gap-2">
                <FaEye size={16} className="shrink-0"/> 
                <span className="uppercase tracking-wider">РЕЖИМ ПЕРЕГЛЯДУ:</span>
              </div>
              <span className="opacity-90">Історія етапу «{currentStageName}»</span>
           </div>
        )}

        <div>
          {showInventory ? (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 md:gap-6">
              <div className={forceInventoryView ? "xl:col-span-3" : "xl:col-span-2 bg-white rounded-xl md:rounded-3xl border border-slate-200 shadow-sm overflow-hidden min-h-[400px]"}>
                {inventoryMode === 'specification' ? (
                  <DealSpecification 
                    dealId={id} 
                    onProgressUpdate={(progress) => setInventoryProgress(prev => ({ ...prev, ...progress }))} 
                    onBack={forceInventoryView ? () => setForceInventoryView(false) : undefined}
                    onCompleteTask={specTask ? () => {
                        setForceInventoryView(false);
                        completeTaskAndCheckStage(specTask);
                        setSpecTask(null);
                    } : undefined}
                  />
                ) : inventoryMode === 'installation' ? (
                  <DealInstallation 
                    dealId={id} 
                    onProgressUpdate={(progress) => setInventoryProgress(prev => ({ ...prev, ...progress }))} 
                    onBack={forceInventoryView ? () => setForceInventoryView(false) : undefined}
                    onCompleteTask={installTask ? () => {
                        setForceInventoryView(false);
                        completeTaskAndCheckStage(installTask);
                        setInstallTask(null);
                    } : undefined}
                  />
                ) : inventoryMode === 'additional_materials' ? (
                  <DealAdditionalMaterials 
                    dealId={id}
                    onBack={forceInventoryView ? () => setForceInventoryView(false) : undefined}
                    onCompleteTask={addMaterialsTask ? () => {
                        setForceInventoryView(false);
                        completeTaskAndCheckStage(addMaterialsTask);
                        setAddMaterialsTask(null);
                    } : undefined}
                  />
                ) : null}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-6">
              <div className="lg:col-span-2">
                <DealTasks 
                  deal={deal} 
                  stages={stages} 
                  viewingStageId={viewingStageId} 
                  onDealUpdate={fetchDealFullData}
                  refreshTrigger={taskRefreshTrigger}
                  onOpenSpecification={(task) => {
                    setSpecTask(task);
                    setInventoryMode('specification');
                    setForceInventoryView(true);
                  }}
                  onOpenInstallationJournal={(task) => {
                    setInstallTask(task);
                    setInventoryMode('installation');
                    setForceInventoryView(true);
                  }}
                  onOpenInitialContact={(task) => {
                    setContactTask(task);
                    setIsInitialContactOpen(true);
                  }}
                  onOpenSurveyModal={(task) => {
                    setSurveyTask(task);
                    setIsSurveyOpen(true);
                  }}
                  onOpenSurveyViewer={(task) => {
                    setIsSurveyViewerOpen(true);
                  }}
                  onOpenFileUpload={(task) => {
                    setDocTask(task);
                    setIsDocModalOpen(true);
                  }}
                  onOpenDelivery={(task) => {
                    setDeliveryTask(task);
                    setIsDeliveryOpen(true);
                  }}
                  onOpenPaymentsModal={(task) => {
                    setPaymentsTask(task);
                    setIsPaymentsOpen(true);
                  }}
                  onOpenAdditionalMaterials={(task) => {
                    setAddMaterialsTask(task);
                    setInventoryMode('additional_materials');
                    setForceInventoryView(true);
                  }}
                />
              </div>

              <div className="lg:col-span-1 space-y-3 md:space-y-6">
                {renderNotesAccordion()}

                <div className="bg-white p-4 md:p-6 rounded-xl md:rounded-3xl border border-slate-200 shadow-sm">
                  <h3 className="text-[10px] md:text-sm font-black text-slate-900 uppercase tracking-widest mb-4 md:mb-6 flex items-center gap-2 md:gap-3">
                    <FaHistory className="text-slate-400 shrink-0" size={16}/> Активність етапу
                  </h3>
                  <div className="space-y-4 max-h-[250px] md:max-h-[500px] overflow-y-auto pr-1 md:pr-3 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent">
                    {filteredLogs.length > 0 ? filteredLogs.map(log => (
                      <div key={log.id} className="flex gap-2.5 md:gap-4 pb-3 md:pb-5 border-b border-slate-50 last:border-0 last:pb-0">
                        <div className="w-1 md:w-1.5 bg-slate-100 rounded-full shrink-0"></div>
                        <div className="min-w-0">
                          <p className="text-[10px] md:text-sm font-bold text-slate-800 leading-tight break-words">{log.action}</p>
                          <p className="text-[8px] md:text-[10px] text-slate-400 mt-1 md:mt-1.5 font-bold uppercase tracking-wider truncate">
                            {new Date(log.created_at).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} • {log.users?.full_name || 'Система'}
                          </p>
                        </div>
                      </div>
                    )) : <p className="text-[9px] md:text-xs text-slate-400 italic font-medium text-center py-6">На цьому етапі подій ще не відбувалося</p>}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* MODALS */}
      <InitialContactModal 
        dealId={id} 
        isOpen={isInitialContactOpen} 
        onClose={() => setIsInitialContactOpen(false)} 
        onSave={() => {
          setIsInitialContactOpen(false);
          completeTaskAndCheckStage(contactTask);
        }} 
      />
      <SiteSurveyModal 
        dealId={id} 
        isOpen={isSurveyOpen} 
        onClose={() => setIsSurveyOpen(false)} 
        onSave={() => {
          setIsSurveyOpen(false);
          completeTaskAndCheckStage(surveyTask);
        }} 
      />
      
      {isDocModalOpen && (
        <DocumentUploadModal 
          dealId={id} 
          taskId={docTask?.id} 
          taskTitle={docTask?.title}
          isOpen={isDocModalOpen} 
          onClose={() => setIsDocModalOpen(false)} 
          onSave={() => {
            setIsDocModalOpen(false);
            completeTaskAndCheckStage(docTask);
          }} 
        />
      )}

      <SiteSurveyViewer dealId={id} isOpen={isSurveyViewerOpen} onClose={() => setIsSurveyViewerOpen(false)} />
      
      <DeliveryOrganizationModal
        deal={deal}
        task={deliveryTask}
        isOpen={isDeliveryOpen}
        onClose={() => setIsDeliveryOpen(false)}
        onSave={() => {
          setIsDeliveryOpen(false);
          completeTaskAndCheckStage(deliveryTask);
        }}
      />

      {isPaymentsOpen && (
        <DealPaymentsModal 
          dealId={id} 
          clientId={deal?.client_id}
          dealBudget={deal?.final_budget} 
          isOpen={isPaymentsOpen} 
          onClose={() => setIsPaymentsOpen(false)} 
          onSave={() => {
            setIsPaymentsOpen(false);
            completeTaskAndCheckStage(paymentsTask);
          }} 
        />
      )}
    </div>
  );
}