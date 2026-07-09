import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthProvider';
import { 
  FaTasks, FaClock, FaFolderOpen, FaCheckCircle, FaRegCircle, 
  FaSearch, FaPaperclip, FaCommentDots, FaCloudUploadAlt,
  FaFileAlt, FaTrash, FaBolt, FaChevronRight, FaArrowLeft, 
  FaPaperPlane, FaUserTie, FaFilePdf, FaImage, FaFileWord, FaPhoneVolume,
  FaBoxOpen, FaHardHat, FaEye, FaLayerGroup, FaTruckLoading, FaTools, 
  FaChevronDown, FaChevronUp, FaMapMarkerAlt, FaBullseye, FaBriefcase, FaPlus,
  FaSync, FaMoneyBillWave
} from 'react-icons/fa';

import SiteSurveyViewer from '../components/SiteSurveyViewer';
import SiteSurveyModal from '../components/SiteSurveyModal';
import InitialContactModal from '../components/InitialContactModal';
import DocumentUploadModal from '../components/DocumentUploadModal';
import DealSpecification from '../components/DealSpecification';
import DealInstallation from '../components/DealInstallation';
import DealAdditionalMaterials from '../components/DealAdditionalMaterials';
import DeliveryOrganizationModal from '../modals/DeliveryOrganizationModal';
import DealPaymentsModal from '../components/DealPaymentsModal';
import ConfirmDialog from '../components/ConfirmDialog';

// Ключ localStorage для відновлення активного завдання між вкладками
const STORAGE_KEY = 'myTasks_selectedTaskId';

// ЄДИНІ НАБОРИ КАТЕГОРІЙ ДОКУМЕНТІВ — синхронізовані з DocumentUploadModal,
// щоб завантажені файли завжди відображались у відповідних завданнях
const TECH_DOC_CATEGORIES = ['Технічне креслення', '3D візуалізація', 'Схема підключення', 'Стрінгування', 'Схема'];
const SURVEY_PHOTO_CATEGORIES = ['Щитова', 'Лічильник', 'Площини', 'Інвертор', 'Дах', 'Загальне фото'];
const CP_CATEGORIES = ['Комерційна пропозиція (КП)', 'Рахунок', 'Рахунок-фактура'];
const CLOSING_CATEGORIES = ['Договір', 'Акт виконаних робіт', 'Акт', 'Видаткова накладна', 'ТТН', 'Рахунок-фактура'];
// Комерційні документи: бачить лише керівництво (КП, рахунки, договори, акти)
const COMMERCIAL_CATEGORIES = [...new Set([...CP_CATEGORIES, ...CLOSING_CATEGORIES, 'Додаток до договору'])];

export default function MyTasks() {
  const { employeeProfile } = useAuth();

  // Рівень доступу: комерційні документи (КП, рахунки, договори) бачить лише керівництво
  const roleLower = employeeProfile?.role?.toLowerCase() || '';
  const canViewCommercial = roleLower.includes('директор') || roleLower.includes('засновник') || roleLower.includes('менеджер');

  // Список та фільтрація
  const [tasks, setTasks]               = useState([]);
  const [loading, setLoading]           = useState(true);
  const [currentTime, setCurrentTime]   = useState(new Date());
  const [activeTab, setActiveTab]       = useState('active');
  const [searchTerm, setSearchTerm]     = useState('');

  // Робоча зона
  const [selectedTask, setSelectedTask]             = useState(null);
  const [attachments, setAttachments]               = useState([]);
  const [dealContextFiles, setDealContextFiles]     = useState([]);
  const [isContextFilesOpen, setIsContextFilesOpen] = useState(false);
  const [deliveries, setDeliveries]                 = useState([]);
  const [payments, setPayments]                     = useState([]); 
  const [taskSurveyData, setTaskSurveyData]         = useState(null);
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(false);

  // Коментарі
  const [comments, setComments]             = useState([]);
  const [newComment, setNewComment]         = useState('');
  const [isCommentAdding, setIsCommentAdding] = useState(false);

  // Модальні вікна
  const [isSurveyOpen, setIsSurveyOpen]             = useState(false);
  const [surveyDealId, setSurveyDealId]             = useState(null);
  const [isSurveyViewerOpen, setIsSurveyViewerOpen] = useState(false);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [contactTaskId, setContactTaskId]           = useState(null);
  const [contactDealId, setContactDealId]           = useState(null);
  const [isDocModalOpen, setIsDocModalOpen]         = useState(false);
  const [uploadCategory, setUploadCategory]         = useState(null);
  const [isInventoryOpen, setIsInventoryOpen]       = useState(false);
  const [inventoryMode, setInventoryMode]           = useState('specification');
  const [isDeliveryModalOpen, setIsDeliveryModalOpen] = useState(false);
  const [isPaymentsModalOpen, setIsPaymentsModalOpen] = useState(false); 

  // РЕГУЛЯРНІ ВИРАЗИ ДЛЯ ТИПІВ ЗАВДАНЬ (Розширено)
  const surveyRegex             = /замір|огляд|виїзд/i;
  const contactRegex            = /зв.язатися|контакт|кваліфікаці|оперативно/i;
  const techSolutionRegex       = /рішення|розкладка|фем|схема|креслення|візуалізація/i;
  const cpRegex                 = /комерційн|кп/i;
  const documentCloseRegex      = /підписання|закриття угоди|договір|документ/i;
  const deliveryRegex           = /доставк|транспорт|відвантаж|завантаж/i;
  const installRegex            = /монтажн|бригад|фізичн|змонтовано/i;
  const inventoryRegex          = /резерв|обладнан|специфікаці/i;
  const additionalMaterialsRegex = /додатков.*матеріал|розхідник|закупка/i;
  const paymentRegex            = /оплат|платіж|каса|рахунок|фінанс/i; 

  // Похідні флаги
  const isSelectedTaskSmart = selectedTask ? (
    selectedTask.title.match(surveyRegex)    || selectedTask.title.match(contactRegex) ||
    selectedTask.title.match(inventoryRegex) || selectedTask.title.match(deliveryRegex) ||
    selectedTask.title.match(installRegex)   || selectedTask.title.match(additionalMaterialsRegex) ||
    selectedTask.title.match(paymentRegex)
  ) : false;

  const requiresFileUpload = selectedTask ? (
    selectedTask.title.match(techSolutionRegex) || selectedTask.title.match(cpRegex) ||
    selectedTask.title.match(documentCloseRegex) || selectedTask.requires_file
  ) : false;

  // Вбудований SiteSurveyViewer для Тех.рішення та КП
  const hasInlineSurveyViewer = selectedTask ? (
    selectedTask.title.match(techSolutionRegex) || selectedTask.title.match(cpRegex)
  ) : false;

  // Таймер дедлайнів
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Перше завантаження + відновлення стану
  useEffect(() => {
    if (employeeProfile?.id) fetchMyTasks(true);
  }, [employeeProfile]);

  // При зміні вкладки або статусу завдання — скидаємо вибране завдання,
  // якщо воно більше не належить до поточної вкладки (щоб не "залипав" старий екран)
  useEffect(() => {
    if (selectedTask) {
      const isCompleted = selectedTask.status === 'Виконана';
      const belongsToTab = activeTab === 'completed' ? isCompleted : !isCompleted;
      if (!belongsToTab) {
        setSelectedTask(null);
        setIsInventoryOpen(false);
        setIsSurveyViewerOpen(false);
        setIsContextFilesOpen(false);
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, [activeTab, selectedTask?.status]);

  // Перемикання вкладки завжди згортає відкриті оверлеї
  useEffect(() => {
    setIsInventoryOpen(false);
    setIsSurveyViewerOpen(false);
    setIsContextFilesOpen(false);
  }, [activeTab]);

  // Синхронізація при поверненні на вкладку
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && employeeProfile?.id) {
        fetchMyTasks(false);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [employeeProfile]);

  // Зберігаємо ID вибраного завдання в localStorage
  useEffect(() => {
    if (selectedTask?.id) localStorage.setItem(STORAGE_KEY, selectedTask.id);
  }, [selectedTask?.id]);

  const fetchMyTasks = async (restoreSelected = false) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select(`
          *,
          deals(id, custom_id, title, stage, status, needs_battery, goal, company_name, niche, notes, final_budget, client_id),
          deal_stages(name),
          task_templates(default_role),
          assignee:users!tasks_assignee_id_fkey(full_name)
        `)
        .or(`assignee_id.eq.${employeeProfile.id},and(assignee_id.is.null,stage_id.not.is.null)`)
        .order('deadline_at', { ascending: true });

      if (error) throw error;

      const profileRole = employeeProfile.role;
      const cleanTasks = (data || []).filter(t => {
        if (t.assignee_id === employeeProfile.id) return true;
        return t.task_templates?.default_role === profileRole;
      });

      setTasks(cleanTasks);

      if (restoreSelected) {
        const savedId = localStorage.getItem(STORAGE_KEY);
        if (savedId) {
          const found = cleanTasks.find(t => t.id === savedId);
          if (found) {
            // Синхронізуємо вкладку зі статусом відновленого завдання,
            // щоб виконане завдання не "висіло" у вкладці "В роботі"
            setActiveTab(found.status === 'Виконана' ? 'completed' : 'active');
            setSelectedTask(found);
            setIsSurveyViewerOpen(false);
            fetchTaskData(found);
          } else {
            localStorage.removeItem(STORAGE_KEY);
          }
        }
      } else {
        setSelectedTask(prev => {
          if (!prev) return prev;
          const updated = cleanTasks.find(t => t.id === prev.id);
          return updated || prev;
        });
      }
    } catch (err) {
      console.error('Помилка завантаження завдань:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTaskData = async (task) => {
    setIsWorkspaceLoading(true);
    try {
      // 1. Коментарі
      const { data: comms } = await supabase
        .from('task_comments')
        .select('*, users(full_name, role)')
        .eq('task_id', task.id)
        .order('created_at', { ascending: true });
      setComments(comms || []);

      // 2. Доставки
      if (task.title.match(deliveryRegex)) {
        const { data: delivs } = await supabase
          .from('deal_deliveries')
          .select('*, carriers(name)')
          .eq('deal_id', task.deal_id)
          .order('created_at', { ascending: false });
        setDeliveries(delivs || []);
      } else {
        setDeliveries([]);
      }

      // 3. Платежі (Клієнтські) - ВИПРАВЛЕНО ТАБЛИЦЮ НА 'payments'
      if (task.title.match(paymentRegex)) {
        const { data: pays } = await supabase
          .from('payments')
          .select('*, users(full_name)')
          .eq('deal_id', task.deal_id)
          .order('created_at', { ascending: false });
        setPayments(pays || []);
      } else {
        setPayments([]);
      }

      // 4. Документи з deal_documents
      const { data: allDocs } = await supabase
        .from('deal_documents')
        .select('*')
        .eq('deal_id', task.deal_id)
        .order('created_at', { ascending: false });
      const docs = allDocs || [];

      let currentTaskDocs = [];
      let contextDocs     = [];

      if (task.requires_file && task.file_label) {
        // Власне завдання з вимогою документа: показуємо файли саме його типу
        currentTaskDocs = docs.filter(d => d.category === task.file_label);
      } else if (task.title.match(techSolutionRegex)) {
        currentTaskDocs = docs.filter(d => TECH_DOC_CATEGORIES.includes(d.category));
        // Контекст для проєктанта: фото з виїзного заміру (щитова, лічильник, площини, інвертор)
        contextDocs     = docs.filter(d => SURVEY_PHOTO_CATEGORIES.includes(d.category));
      } else if (task.title.match(cpRegex)) {
        currentTaskDocs = docs.filter(d => CP_CATEGORIES.includes(d.category));
        contextDocs     = docs.filter(d => TECH_DOC_CATEGORIES.includes(d.category));
      } else if (task.title.match(documentCloseRegex)) {
        currentTaskDocs = docs.filter(d => CLOSING_CATEGORIES.includes(d.category));
        contextDocs     = docs.filter(d => CP_CATEGORIES.includes(d.category));
      } else if (task.title.match(installRegex)) {
        contextDocs = docs.filter(d => TECH_DOC_CATEGORIES.includes(d.category));
      } else if (task.title.match(deliveryRegex)) {
        contextDocs = docs.filter(d => ['Комерційна пропозиція (КП)', 'Рахунок', 'Видаткова накладна'].includes(d.category));
      } else {
        contextDocs = docs.filter(d => d.category === 'Інше');
      }

      // Рівні доступу: комерційні документи з контексту попередніх етапів
      // показуємо лише керівництву. Файли ВЛАСНОГО завдання виконавець бачить завжди.
      if (!canViewCommercial) {
        contextDocs = contextDocs.filter(d => !COMMERCIAL_CATEGORIES.includes(d.category));
      }

      setAttachments(currentTaskDocs);
      setDealContextFiles(contextDocs);

      // 5. Дані опитувальника
      const { data: surveyData } = await supabase
        .from('site_surveys')
        .select('*')
        .eq('deal_id', task.deal_id)
        .order('created_at', { ascending: false })
        .limit(1);
      setTaskSurveyData(surveyData?.[0] || null);

    } catch (err) {
      console.error('Помилка завантаження даних завдання:', err);
    } finally {
      setIsWorkspaceLoading(false);
    }
  };

  const handleOpenWorkspace = async (task) => {
    if (selectedTask?.id === task.id) return; 
    setSelectedTask(task);
    setIsContextFilesOpen(false);
    setDealContextFiles([]);
    setIsInventoryOpen(false);
    setIsSurveyViewerOpen(false); 
    await fetchTaskData(task);
  };

  const handleCompleteTask = async (e, taskToComplete) => {
    if (e) e.stopPropagation();
    const t = taskToComplete || selectedTask;
    if (!t || t.status === 'Виконана') return;

    const { error } = await supabase
      .from('tasks')
      .update({ status: 'Виконана', completed_at: new Date(), assignee_id: employeeProfile.id })
      .eq('id', t.id);
    if (error) { alert('Помилка виконання'); return; }

    await supabase.from('deal_activity_log').insert([{
      deal_id: t.deal_id, user_id: employeeProfile.id, stage_id: t.stage_id,
      entity_type: 'task', action: `Виконано завдання: ${t.title}`
    }]);

    const { data: allStageTasks } = await supabase
      .from('tasks').select('status')
      .eq('deal_id', t.deal_id).eq('stage_id', t.stage_id);
    const allDone = allStageTasks?.every(task => task.status === 'Виконана') || false;

    if (allDone && allStageTasks?.length > 0) {
      const { data: stagesData } = await supabase.from('deal_stages').select('*').order('position');
      const currentStageObj = stagesData.find(s => s.id === t.stage_id);
      const nextStage = stagesData.find(s => s.position === (currentStageObj?.position || 0) + 1);
      if (nextStage) {
        await supabase.from('deals').update({ stage_id: nextStage.id, stage: nextStage.name, updated_at: new Date() }).eq('id', t.deal_id);
      } else {
        await supabase.from('deals').update({ status: 'Угоду виграно', updated_at: new Date() }).eq('id', t.deal_id);
      }
    }

    setSelectedTask(prev => prev?.id === t.id ? { ...prev, status: 'Виконана' } : prev);
    fetchMyTasks(false);
  };

  const handleAddComment = async () => {
    if (!newComment.trim() || !selectedTask) return;
    setIsCommentAdding(true);
    const { error } = await supabase.from('task_comments').insert([{
      task_id: selectedTask.id, user_id: employeeProfile.id, comment: newComment.trim()
    }]);
    if (!error) { setNewComment(''); await fetchTaskData(selectedTask); }
    setIsCommentAdding(false);
  };

  // Підтвердження видалення у стилі CRM (замість браузерного window.confirm)
  const [confirmState, setConfirmState] = useState(null); // {type: 'attachment'|'comment', id, label}

  const handleDeleteAttachment = (id, label) => {
    setConfirmState({ type: 'attachment', id, label: label || 'файл' });
  };

  const handleDeleteComment = (comment) => {
    setConfirmState({ type: 'comment', id: comment.id, label: comment.comment?.substring(0, 80) });
  };

  const executeConfirmedDelete = async () => {
    if (!confirmState) return;
    try {
      if (confirmState.type === 'attachment') {
        await supabase.from('deal_documents').delete().eq('id', confirmState.id);
      } else if (confirmState.type === 'comment') {
        await supabase.from('task_comments').delete().eq('id', confirmState.id);
      }
      await fetchTaskData(selectedTask);
    } finally {
      setConfirmState(null);
    }
  };

  const handleDocumentUploadClick = (category) => {
    setUploadCategory(category);
    setIsDocModalOpen(true);
  };

  const getDeadlineDisplay = (deadlineAt, status) => {
    if (status === 'Виконана') return { text: 'Виконано', color: 'text-emerald-600 bg-emerald-50 border-emerald-100' };
    if (!deadlineAt) return { text: 'Без дедлайну', color: 'text-slate-400 bg-slate-50 border-slate-100' };
    const diffMs    = new Date(deadlineAt) - currentTime;
    if (diffMs <= 0) return { text: 'Прострочено', color: 'text-rose-600 bg-rose-50 border-rose-200 animate-pulse font-black' };
    const diffDays  = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((diffMs / (1000 * 60 * 60)) % 24);
    const diffMins  = Math.floor((diffMs / 1000 / 60) % 60);
    if (diffDays > 0) return { text: `${diffDays} д : ${diffHours} г`, color: 'text-slate-600 bg-slate-100 border-slate-200' };
    return { text: `${diffHours} г : ${diffMins} хв`, color: diffHours < 4 ? 'text-amber-600 bg-amber-50 border-amber-200 font-bold' : 'text-slate-600 bg-slate-100 border-slate-200' };
  };

  const getFileIcon = (filename) => {
    const n = filename?.toLowerCase() || '';
    if (n.includes('.pdf'))                 return <FaFilePdf  className="text-rose-500"  size={18}/>;
    if (n.match(/\.(jpg|jpeg|png|gif)$/i)) return <FaImage    className="text-sky-500"   size={18}/>;
    if (n.match(/\.(doc|docx)$/i))         return <FaFileWord className="text-blue-600"  size={18}/>;
    return <FaFileAlt className="text-amber-500" size={18}/>;
  };

  const filteredTasks = tasks.filter(t => {
    if (t.deals?.status === 'Угоду програно' || t.deals?.status === 'Клієнт на паузі') return false;
    const isCompleted  = t.status === 'Виконана';
    const isDealClosed = t.deal_stages?.name === 'Закриття Угоди' || t.deals?.status === 'Угоду виграно';
    if (isCompleted && isDealClosed) return false;
    const matchesTab    = activeTab === 'completed' ? isCompleted : !isCompleted;
    const matchesSearch = t.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.deals?.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.deals?.custom_id?.toString().includes(searchTerm);
    return matchesTab && matchesSearch;
  });

  const showAttachmentsBlock = requiresFileUpload || attachments.length > 0;

  // Картка файлу
  const FileCard = ({ file, onDelete }) => (
    <div className="bg-white p-3.5 rounded-2xl border border-slate-200 flex justify-between items-center shadow-sm hover:shadow-md transition-shadow group">
      <a href={file.public_url || file.file_url} target="_blank" rel="noreferrer"
        className="flex items-center gap-3 text-xs font-bold text-slate-700 hover:text-amber-600 truncate flex-1 pr-3 transition-colors">
        <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center shrink-0 border border-slate-100">
          {getFileIcon(file.file_name)}
        </div>
        <div className="flex flex-col truncate">
          <span className="truncate text-sm">{file.file_name?.includes('_') ? file.file_name.split('_')[0] : file.file_name || 'Файл'}</span>
          <span className="text-[9px] font-black text-indigo-500 uppercase mt-1 tracking-wider">{file.category || 'Документ'}</span>
        </div>
      </a>
      {onDelete && (
        <button type="button" onClick={() => onDelete(file.id, file.file_name)}
          className="text-slate-300 hover:text-rose-500 p-2.5 opacity-0 group-hover:opacity-100 transition-all bg-slate-50 rounded-xl hover:bg-rose-50">
          <FaTrash size={14}/>
        </button>
      )}
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-slate-100 relative overflow-hidden">

      {/* ХЕДЕР */}
      <div className="bg-white px-6 py-5 border-b border-slate-200 shrink-0 z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-slate-900 text-amber-500 rounded-xl shadow-md"><FaTasks size={20}/></div>
          <div>
            <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight">Мої завдання</h1>
            <p className="text-xs text-slate-500 font-bold mt-0.5 uppercase tracking-wider">Персональний робочий простір</p>
          </div>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 size-3"/>
            <input type="text" placeholder="Пошук..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-amber-500 transition-all shadow-inner"/>
          </div>
          <div className="flex bg-slate-100 p-1.5 rounded-xl border border-slate-200 shadow-sm">
            <button onClick={() => setActiveTab('active')}
              className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${activeTab === 'active' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              В роботі
            </button>
            <button onClick={() => setActiveTab('completed')}
              className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${activeTab === 'completed' ? 'bg-slate-900 text-amber-400 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              Виконані
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden relative">

        {/* ЛІВА КОЛОНКА: СПИСОК */}
        <div className={`w-full lg:w-[420px] bg-slate-50 border-r border-slate-200 overflow-y-auto custom-scrollbar flex flex-col shrink-0 ${selectedTask ? 'hidden lg:flex' : 'flex'}`}>
          {loading ? (
            <div className="p-10 text-center font-black text-slate-400 uppercase text-xs animate-pulse">Завантаження...</div>
          ) : filteredTasks.length === 0 ? (
            <div className="p-10 text-center flex flex-col items-center justify-center h-full">
              <div className="w-20 h-20 bg-white shadow-sm border border-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <FaCheckCircle className="text-slate-300" size={32}/>
              </div>
              <p className="font-black text-slate-500 uppercase tracking-widest text-xs">Список порожній</p>
            </div>
          ) : (
            <div className="p-4 space-y-3">
              {filteredTasks.map(task => {
                const deadline   = getDeadlineDisplay(task.deadline_at, task.status);
                const isSelected = selectedTask?.id === task.id;
                const isDone     = task.status === 'Виконана';
                return (
                  <div key={task.id} onClick={() => handleOpenWorkspace(task)}
                    className={`p-5 rounded-2xl border transition-all cursor-pointer group flex items-start gap-4
                      ${isSelected ? 'bg-amber-50 border-amber-300 shadow-md ring-4 ring-amber-500/10' : 'bg-white border-slate-200 hover:border-amber-300 hover:shadow-sm'}
                      ${isDone && !isSelected ? 'opacity-60 grayscale-[50%]' : ''}`}>
                    <div className="mt-0.5 shrink-0">
                      {isDone ? <FaCheckCircle className="text-emerald-500" size={22}/> : <FaRegCircle className="text-slate-300 group-hover:text-amber-500" size={22}/>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[9px] font-black uppercase bg-slate-900 text-white px-2 py-0.5 rounded-md shadow-sm">№{task.deals?.custom_id || '00'}</span>
                        <span className="text-[10px] font-bold text-slate-500 truncate">{task.deals?.title}</span>
                      </div>
                      <h4 className={`text-sm font-bold leading-snug mb-3 ${isDone ? 'line-through text-slate-500' : 'text-slate-900'}`}>{task.title}</h4>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {isDone && task.completed_at ? (
                          <span className="text-[9px] font-black uppercase px-2 py-1.5 rounded-md border flex items-center gap-1.5 w-max text-emerald-600 bg-emerald-50 border-emerald-100">
                            <FaCheckCircle size={10}/> {new Date(task.completed_at).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        ) : (
                          <span className={`text-[9px] font-black uppercase px-2 py-1.5 rounded-md border flex items-center gap-1.5 w-max ${deadline.color}`}>
                            <FaClock size={10}/> {deadline.text}
                          </span>
                        )}
                        {isDone && task.assignee?.full_name && (
                          <span className="text-[9px] font-black uppercase px-2 py-1.5 rounded-md border flex items-center gap-1.5 w-max text-slate-500 bg-slate-50 border-slate-200">
                            <FaUserTie size={9}/> {task.assignee.full_name}
                          </span>
                        )}
                        {task.requires_file && task.file_label && !isDone && (
                          <span className="text-[9px] font-black uppercase px-2 py-1.5 rounded-md border flex items-center gap-1.5 w-max text-indigo-600 bg-indigo-50 border-indigo-100">
                            <FaPaperclip size={9}/> {task.file_label}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ПРАВА КОЛОНКА: РОБОЧА ЗОНА */}
        <div className={`flex-1 flex flex-col bg-white overflow-hidden relative ${!selectedTask ? 'hidden lg:flex items-center justify-center bg-slate-50' : 'flex'}`}>

          {/* Оверлей інвентаря / монтажу / матеріалів */}
          {selectedTask && isInventoryOpen && (
            <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col overflow-y-auto">
              {inventoryMode === 'specification' ? (
                <DealSpecification dealId={selectedTask.deal_id} onBack={() => setIsInventoryOpen(false)}
                  onCompleteTask={() => { setIsInventoryOpen(false); handleCompleteTask(null, selectedTask); }}/>
              ) : inventoryMode === 'additional_materials' ? (
                <DealAdditionalMaterials dealId={selectedTask.deal_id} onBack={() => setIsInventoryOpen(false)}
                  onCompleteTask={() => { setIsInventoryOpen(false); handleCompleteTask(null, selectedTask); }}/>
              ) : (
                <DealInstallation dealId={selectedTask.deal_id} onBack={() => setIsInventoryOpen(false)}
                  onCompleteTask={() => { setIsInventoryOpen(false); handleCompleteTask(null, selectedTask); }}/>
              )}
            </div>
          )}

          {/* Заглушка */}
          {!selectedTask ? (
            <div className="text-center opacity-50 m-auto flex flex-col items-center">
              <div className="w-24 h-24 bg-slate-200 rounded-full flex items-center justify-center mb-6">
                <FaFolderOpen size={40} className="text-slate-400"/>
              </div>
              <p className="text-sm font-black uppercase tracking-widest text-slate-500">Оберіть завдання зі списку</p>
            </div>
          ) : (
            <>
              {/* ТІЛО ЗАВДАННЯ */}
              <div className="flex-1 overflow-y-auto custom-scrollbar p-5 md:p-10">
                {isWorkspaceLoading ? (
                  <div className="flex items-center justify-center h-40">
                    <div className="flex flex-col items-center gap-3 text-slate-400">
                      <FaSync className="animate-spin" size={24}/>
                      <p className="text-xs font-black uppercase tracking-widest">Завантаження...</p>
                    </div>
                  </div>
                ) : (
                  <div className="max-w-4xl mx-auto space-y-8 animate-fade-in pb-10">

                    {/* Кнопка назад (мобільна) */}
                    <button type="button" onClick={() => { setSelectedTask(null); localStorage.removeItem(STORAGE_KEY); }}
                      className="lg:hidden inline-flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors">
                      <FaArrowLeft size={12}/> До списку
                    </button>

                    {/* ЗАГОЛОВОК */}
                    <div>
                      <div className="flex items-center gap-3 mb-4">
                        <span className="px-3 py-1.5 bg-amber-100 text-amber-800 text-[10px] font-black uppercase tracking-widest rounded-lg border border-amber-200 shadow-sm">
                          Етап: {selectedTask.deal_stages?.name}
                        </span>
                        {selectedTask.requires_file && selectedTask.file_label && (
                          <span className="px-3 py-1.5 bg-indigo-100 text-indigo-700 text-[10px] font-black uppercase tracking-widest rounded-lg border border-indigo-200 shadow-sm">
                            Документ: {selectedTask.file_label}
                          </span>
                        )}
                        <span className="text-xs font-bold text-slate-400">
                          СЕС №{selectedTask.deals?.custom_id} — {selectedTask.deals?.title}
                        </span>
                      </div>
                      <h2 className="text-2xl md:text-3xl font-black text-slate-900 leading-tight mb-4 tracking-tight">{selectedTask.title}</h2>

                    </div>

                    {/* АКОРДЕОН: ФАЙЛИ З ПОПЕРЕДНІХ ЕТАПІВ (для тех.рішення — фото з заміру) */}
                    {dealContextFiles.length > 0
                      && !selectedTask.title.match(deliveryRegex)
                      && (
                      <div className="bg-amber-50/50 border border-amber-100 rounded-3xl shadow-sm overflow-hidden">
                        <button onClick={() => setIsContextFilesOpen(p => !p)}
                          className="w-full flex items-center justify-between p-5 md:p-6 text-left outline-none">
                          <h3 className="text-[10px] font-black text-amber-700 uppercase tracking-widest flex items-center gap-2">
                            <FaLayerGroup size={14}/>
                            Файли з попередніх етапів
                            <span className="bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full text-[9px]">{dealContextFiles.length}</span>
                          </h3>
                          <div className="text-amber-500">{isContextFilesOpen ? <FaChevronUp size={14}/> : <FaChevronDown size={14}/>}</div>
                        </button>
                        {isContextFilesOpen && (
                          <div className="p-5 md:p-6 pt-0 border-t border-amber-100/50">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2 animate-fade-in">
                              {dealContextFiles.map(file => (
                                <a key={file.id} href={file.public_url || file.file_url} target="_blank" rel="noreferrer"
                                  className="bg-white p-3.5 rounded-2xl border border-amber-200 flex items-center gap-4 text-xs font-bold text-slate-700 hover:text-amber-600 shadow-sm hover:shadow-md transition-all group">
                                  <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center shrink-0 border border-amber-100">{getFileIcon(file.file_name)}</div>
                                  <div className="flex flex-col truncate">
                                    <span className="truncate group-hover:underline text-sm">{file.file_name?.includes('_') ? file.file_name.split('_')[0] : file.file_name || 'Файл'}</span>
                                    <span className="text-[9px] font-black text-amber-500 uppercase mt-1 tracking-wider">{file.category || 'Документ'}</span>
                                  </div>
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* ВБУДОВАНИЙ ПЕРЕГЛЯДАЧ ЗАМІРІВ */}
                    {hasInlineSurveyViewer && (
                      <div className="border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
                        <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center justify-between">
                          <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                            <FaBolt size={12}/> Дані технічного огляду об'єкта
                          </h3>
                          <div className="flex items-center gap-2">
                            {taskSurveyData ? (
                              <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200 uppercase tracking-wider">
                                Акт сформовано
                              </span>
                            ) : (
                              <span className="text-[9px] font-black text-amber-600 bg-amber-50 px-3 py-1 rounded-full border border-amber-200 uppercase tracking-wider">
                                Очікується
                              </span>
                            )}
                            {taskSurveyData && (
                              <button
                                onClick={() => setIsSurveyViewerOpen(v => !v)}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-[9px] font-black uppercase tracking-widest rounded-lg transition-colors active:scale-95">
                                <FaEye size={10}/>
                                {isSurveyViewerOpen ? 'Згорнути' : 'Переглянути'}
                              </button>
                            )}
                          </div>
                        </div>
                        {taskSurveyData && isSurveyViewerOpen ? (
                          <SiteSurveyViewer
                            dealId={selectedTask.deal_id}
                            isOpen={true}
                            inline={true}
                            onClose={() => setIsSurveyViewerOpen(false)}
                          />
                        ) : !taskSurveyData ? (
                          <div className="p-8 text-center bg-slate-50/50">
                            <FaBolt className="text-slate-200 mx-auto mb-3" size={32}/>
                            <p className="text-sm font-bold text-slate-400 mb-1">Технічний акт огляду ще не заповнено</p>
                            <p className="text-xs text-slate-400">Дані з'являться після завершення виїзного замірного завдання.</p>
                          </div>
                        ) : null}
                      </div>
                    )}

                    {/* ВБУДОВАНИЙ ПЕРЕГЛЯДАЧ КП */}
                    {selectedTask.title.match(cpRegex) && attachments.length > 0 && (
                      <div className="border border-indigo-200 rounded-3xl overflow-hidden shadow-sm">
                        <div className="bg-indigo-50 border-b border-indigo-100 px-6 py-4 flex items-center justify-between">
                          <h3 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest flex items-center gap-2">
                            <FaFileAlt size={12}/> Комерційна пропозиція / Рахунок
                          </h3>
                          <span className="text-[9px] font-black text-indigo-500 bg-white px-3 py-1 rounded-full border border-indigo-200 uppercase tracking-wider">
                            {attachments.length} файл(ів)
                          </span>
                        </div>
                        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white">
                          {attachments.map(file => <FileCard key={file.id} file={file} onDelete={handleDeleteAttachment}/>)}
                        </div>
                        <div className="px-5 pb-5">
                          <button onClick={() => handleDocumentUploadClick(selectedTask.title.match(/рахунок/i) ? 'Рахунок' : 'Комерційна пропозиція (КП)')}
                            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors shadow-sm active:scale-95">
                            <FaPlus size={10}/> Додати файл
                          </button>
                        </div>
                      </div>
                    )}

                    {/* БЛОКИ ІНСТРУМЕНТІВ */}
                    <div className="grid grid-cols-1 gap-5">

                      {/* КОНТРОЛЬ ОПЛАТ */}
                      {selectedTask.title.match(paymentRegex) && (
                        <div className="border p-6 rounded-3xl flex flex-col items-start gap-4 shadow-sm bg-teal-50 border-teal-200">
                          <div className="flex flex-col md:flex-row items-center justify-between gap-6 w-full">
                            <div className="flex items-center gap-5 flex-1">
                              <div className="w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 shadow-sm bg-teal-100 text-teal-600"><FaMoneyBillWave size={28}/></div>
                              <div className="flex-1">
                                <h3 className="text-sm font-black uppercase tracking-widest mb-1.5 text-teal-900">Контроль оплат</h3>
                                <p className="text-xs font-medium leading-relaxed text-teal-700">Перегляд історії платежів та фіксація нових транзакцій.</p>
                              </div>
                            </div>
                            <button onClick={() => setIsPaymentsModalOpen(true)}
                              className="w-full md:w-auto text-white px-8 py-4 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg active:scale-95 bg-teal-500 hover:bg-teal-400 shadow-teal-500/20">
                              Відкрити касу
                            </button>
                          </div>
                          
                          {/* Історія платежів */}
                          {payments.length > 0 && (
                            <div className="w-full mt-2 space-y-3 animate-fade-in border-t border-teal-100 pt-4">
                              <div className="flex justify-between items-center">
                                <p className="text-[9px] font-black text-teal-600 uppercase tracking-widest">Історія транзакцій клієнта</p>
                                <p className="text-[10px] font-black text-slate-700 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm flex items-center gap-2">
                                  Вартість угоди: <span className="text-emerald-600 text-xs">${selectedTask.deals?.final_budget?.toLocaleString() || 0}</span>
                                </p>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {payments.map((pay) => (
                                  <div key={pay.id} className="bg-white border border-teal-100 p-4 rounded-2xl shadow-sm flex justify-between items-center hover:border-teal-300 transition-colors">
                                    <div>
                                      {/* ДВО-ВАЛЮТНИЙ ДИСПЛЕЙ ОПЛАТИ (ОНОВЛЕНО) */}
                                      <div className="font-bold text-slate-800 text-sm flex flex-col gap-0.5 mb-1.5">
                                        <span className="text-emerald-600 flex items-center gap-1">+ ${Number(pay.amount_usd || 0).toLocaleString('uk-UA')}</span>
                                        {pay.amount_uah > 0 && (
                                          <span className="text-[10px] text-slate-500 font-bold border-l border-slate-200 pl-2">
                                            +{Number(pay.amount_uah).toLocaleString('uk-UA')} ₴
                                          </span>
                                        )}
                                      </div>
                                      
                                      <div className="flex gap-1.5 mt-1">
                                        <span className="text-[9px] text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded font-black uppercase tracking-wider border border-teal-100">
                                          {pay.payment_category || 'Оплата'}
                                        </span>
                                        <span className="text-[9px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded font-bold uppercase border border-slate-200">
                                          {pay.payment_method || 'Готівка / Рахунок'}
                                        </span>
                                      </div>
                                      {pay.notes && <div className="text-[10px] text-slate-500 mt-1.5 italic line-clamp-1" title={pay.notes}>"{pay.notes}"</div>}
                                    </div>
                                    <div className="text-right">
                                      <div className="text-[10px] font-black text-slate-400">{new Date(pay.payment_date || pay.created_at).toLocaleDateString('uk-UA')}</div>
                                      <div className="text-[8px] font-bold text-slate-400 mt-1 uppercase tracking-widest">{pay.users?.full_name || 'Менеджер'}</div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* ПЕРШИЙ КОНТАКТ / КВАЛІФІКАЦІЯ */}
                      {selectedTask.title.match(contactRegex) && (
                        <div className="border p-6 rounded-3xl flex flex-col items-start gap-4 shadow-sm bg-sky-50 border-sky-200">
                          <div className="flex flex-col md:flex-row items-center justify-between gap-6 w-full">
                            <div className="flex items-center gap-5 flex-1">
                              <div className="w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 shadow-sm bg-sky-100 text-sky-500"><FaPhoneVolume size={28}/></div>
                              <div className="flex-1">
                                <h3 className="text-sm font-black uppercase tracking-widest mb-1.5 text-sky-900">Базова кваліфікація</h3>
                                <p className="text-xs font-medium leading-relaxed text-sky-700">Внесіть або перегляньте базові дані про клієнта та об'єкт.</p>
                              </div>
                            </div>
                            <button onClick={() => { setContactDealId(selectedTask.deal_id); setContactTaskId(selectedTask.id); setIsContactModalOpen(true); }}
                              className="w-full md:w-auto text-white px-8 py-4 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg active:scale-95 bg-sky-500 hover:bg-sky-400 shadow-sky-500/20">
                              {selectedTask.status === 'Виконана' ? 'Переглянути дані' : 'Відкрити форму'}
                            </button>
                          </div>
                          {(selectedTask.deals?.goal || selectedTask.deals?.needs_battery !== undefined || taskSurveyData?.region || selectedTask.deals?.company_name || selectedTask.deals?.notes || selectedTask.deals?.niche) && (
                            <div className="w-full mt-2 grid grid-cols-1 md:grid-cols-2 gap-3 animate-fade-in">
                              {selectedTask.deals?.goal && (
                                <div className="bg-white p-4 rounded-2xl border border-sky-100 shadow-sm">
                                  <p className="text-[9px] font-black text-sky-500 uppercase tracking-widest flex items-center gap-1.5 mb-1"><FaBullseye size={10}/> Ціль клієнта</p>
                                  <p className="text-sm font-bold text-slate-800">{selectedTask.deals.goal}</p>
                                </div>
                              )}
                              {(taskSurveyData?.region || taskSurveyData?.city) && (
                                <div className="bg-white p-4 rounded-2xl border border-sky-100 shadow-sm">
                                  <p className="text-[9px] font-black text-sky-500 uppercase tracking-widest flex items-center gap-1.5 mb-1"><FaMapMarkerAlt size={10}/> Локація</p>
                                  <p className="text-sm font-bold text-slate-800">{taskSurveyData?.region || '—'}, {taskSurveyData?.city || '—'}</p>
                                </div>
                              )}
                              {selectedTask.deals?.needs_battery !== undefined && selectedTask.deals?.needs_battery !== null && (
                                <div className="bg-white p-4 rounded-2xl border border-sky-100 shadow-sm">
                                  <p className="text-[9px] font-black text-sky-500 uppercase tracking-widest flex items-center gap-1.5 mb-1"><FaBolt size={10}/> Акумулятор</p>
                                  <p className="text-sm font-bold text-slate-800">{selectedTask.deals.needs_battery ? 'Потрібен' : 'Не потрібен'}</p>
                                </div>
                              )}
                              {selectedTask.deals?.company_name && (
                                <div className="bg-white p-4 rounded-2xl border border-sky-100 shadow-sm col-span-1 md:col-span-2">
                                  <p className="text-[9px] font-black text-sky-500 uppercase tracking-widest flex items-center gap-1.5 mb-1"><FaBriefcase size={10}/> Комерційний об'єкт</p>
                                  <p className="text-sm font-bold text-slate-800">{selectedTask.deals.company_name} <span className="text-slate-400 text-xs font-medium ml-2">({selectedTask.deals.niche || 'Ніша не вказана'})</span></p>
                                </div>
                              )}
                              {selectedTask.deals?.notes && (
                                <div className="bg-white p-4 rounded-2xl border border-sky-100 shadow-sm col-span-1 md:col-span-2">
                                  <p className="text-[9px] font-black text-sky-500 uppercase tracking-widest mb-1">Специфіка / Коментарі</p>
                                  <p className="text-sm font-medium text-slate-700 whitespace-pre-wrap">{selectedTask.deals.notes}</p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* АКТ ЗАМІРІВ */}
                      {selectedTask.title.match(surveyRegex) && (
                        <div className="border p-6 rounded-3xl flex flex-col items-start gap-4 shadow-sm bg-amber-50 border-amber-200">
                          <div className="flex flex-col md:flex-row items-center justify-between gap-6 w-full">
                            <div className="flex items-center gap-5">
                              <div className="w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 shadow-sm bg-amber-200 text-amber-600"><FaBolt size={28}/></div>
                              <div>
                                <h3 className="text-sm font-black uppercase tracking-widest mb-1.5 text-amber-900">Технічний акт огляду</h3>
                                <p className="text-xs font-medium leading-relaxed text-amber-700">Робота з даними про дах, електрику та загальні заміри.</p>
                              </div>
                            </div>
                            <button onClick={() => { setSurveyDealId(selectedTask.deal_id); setIsSurveyOpen(true); }}
                              className="w-full md:w-auto px-8 py-4 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg active:scale-95 bg-amber-500 hover:bg-amber-400 text-slate-900 shadow-amber-500/20">
                              {taskSurveyData ? 'Редагувати акт' : 'Відкрити форму'}
                            </button>
                          </div>
                          {taskSurveyData && (
                            <div className="w-full grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 animate-fade-in border-t border-amber-100 pt-4 mt-1">
                              {taskSurveyData.region && (
                                <div className="bg-white p-4 rounded-2xl border border-amber-100 shadow-sm">
                                  <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest flex items-center gap-1.5 mb-1"><FaMapMarkerAlt size={10}/> Регіон / Місто</p>
                                  <p className="text-sm font-bold text-slate-800">{taskSurveyData.region}{taskSurveyData.city ? `, ${taskSurveyData.city}` : ''}</p>
                                </div>
                              )}
                              {taskSurveyData.roof_type && (
                                <div className="bg-white p-4 rounded-2xl border border-amber-100 shadow-sm">
                                  <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest mb-1">Тип даху</p>
                                  <p className="text-sm font-bold text-slate-800">{taskSurveyData.roof_type}</p>
                                </div>
                              )}
                              {taskSurveyData.panel_count && (
                                <div className="bg-white p-4 rounded-2xl border border-amber-100 shadow-sm">
                                  <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest mb-1">К-сть панелей</p>
                                  <p className="text-sm font-bold text-slate-800">{taskSurveyData.panel_count} шт.</p>
                                </div>
                              )}
                              {taskSurveyData.system_power && (
                                <div className="bg-white p-4 rounded-2xl border border-amber-100 shadow-sm">
                                  <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest mb-1">Потужність системи</p>
                                  <p className="text-sm font-bold text-slate-800">{taskSurveyData.system_power} кВт</p>
                                </div>
                              )}
                              {taskSurveyData.notes && (
                                <div className="bg-white p-4 rounded-2xl border border-amber-100 shadow-sm col-span-1 sm:col-span-2 md:col-span-3">
                                  <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest mb-1">Нотатки з виїзду</p>
                                  <p className="text-sm font-medium text-slate-700 whitespace-pre-wrap">{taskSurveyData.notes}</p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* СКЛАД / РЕЗЕРВ */}
                      {selectedTask.title.match(inventoryRegex) && !selectedTask.title.match(deliveryRegex) && !selectedTask.title.match(additionalMaterialsRegex) && (
                        <div className="border p-6 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm bg-orange-50 border-orange-200">
                          <div className="flex items-center gap-5">
                            <div className="w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 shadow-sm bg-orange-100 text-orange-500"><FaBoxOpen size={28}/></div>
                            <div>
                              <h3 className="text-sm font-black uppercase tracking-widest mb-1.5 text-orange-900">Специфікація та резерв</h3>
                              <p className="text-xs font-medium leading-relaxed text-orange-700">Формування основної специфікації та бронювання на складі.</p>
                            </div>
                          </div>
                          <button onClick={() => { setInventoryMode('specification'); setIsInventoryOpen(true); }}
                            className="w-full md:w-auto text-white px-8 py-4 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg active:scale-95 bg-orange-500 hover:bg-orange-400 shadow-orange-500/20">
                            Відкрити склад
                          </button>
                        </div>
                      )}

                      {/* ДОДАТКОВІ МАТЕРІАЛИ */}
                      {selectedTask.title.match(additionalMaterialsRegex) && (
                        <div className="border p-6 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm bg-purple-50 border-purple-200">
                          <div className="flex items-center gap-5">
                            <div className="w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 shadow-sm bg-purple-100 text-purple-500"><FaTools size={28}/></div>
                            <div>
                              <h3 className="text-sm font-black uppercase tracking-widest mb-1.5 text-purple-900">Закупівля матеріалів</h3>
                              <p className="text-xs font-medium leading-relaxed text-purple-700">Список розхідників, кріплень та кабелів для монтажу.</p>
                            </div>
                          </div>
                          <button onClick={() => { setInventoryMode('additional_materials'); setIsInventoryOpen(true); }}
                            className="w-full md:w-auto text-white px-8 py-4 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg active:scale-95 bg-purple-500 hover:bg-purple-400 shadow-purple-500/20">
                            Список матеріалів
                          </button>
                        </div>
                      )}

                      {/* ОРГАНІЗАЦІЯ ДОСТАВКИ */}
                      {selectedTask.title.match(deliveryRegex) && (
                        <div className="border p-6 rounded-3xl flex flex-col items-start gap-4 shadow-sm bg-blue-50 border-blue-200">
                          <div className="flex flex-col md:flex-row items-center justify-between gap-6 w-full">
                            <div className="flex items-center gap-5">
                              <div className="w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 shadow-sm bg-blue-100 text-blue-500"><FaTruckLoading size={28}/></div>
                              <div>
                                <h3 className="text-sm font-black uppercase tracking-widest mb-1.5 text-blue-900">Організація логістики</h3>
                                <p className="text-xs font-medium leading-relaxed text-blue-700">Створення накладних, бронювання транспорту.</p>
                              </div>
                            </div>
                            <button onClick={() => setIsDeliveryModalOpen(true)}
                              className="w-full md:w-auto text-white px-8 py-4 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg active:scale-95 bg-blue-500 hover:bg-blue-400 shadow-blue-500/20">
                              {selectedTask.status === 'Виконана' ? 'Створити ще доставку' : 'Оформити доставку'}
                            </button>
                          </div>
                          {deliveries.length > 0 && (
                            <div className="w-full mt-2 space-y-3 animate-fade-in border-t border-blue-100 pt-4">
                              <p className="text-[9px] font-black text-blue-500 uppercase tracking-widest">Оформлені доставки</p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {deliveries.map((del, idx) => (
                                  <div key={del.id} className="bg-white border border-blue-100 p-4 rounded-2xl shadow-sm">
                                    <div className="text-[10px] font-black uppercase tracking-widest text-blue-500 mb-2">Накладна #{deliveries.length - idx}</div>
                                    <div className="font-bold text-slate-800 text-sm flex items-center gap-2 mb-2">
                                      <FaTruckLoading className="text-slate-400"/> {del.carriers?.name || 'Перевізник не вказаний'}
                                    </div>
                                    {del.address && <p className="text-xs text-slate-500 flex items-center gap-1.5"><FaMapMarkerAlt size={10}/> {del.address}</p>}
                                    {del.status && (
                                      <span className={`inline-block mt-2 text-[9px] font-black uppercase px-2 py-1 rounded-lg border ${del.status === 'Доставлено' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-amber-50 text-amber-600 border-amber-200'}`}>
                                        {del.status}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* ЖУРНАЛ МОНТАЖУ */}
                      {selectedTask.title.match(installRegex) && (
                        <div className="border p-6 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm bg-emerald-50 border-emerald-200">
                          <div className="flex items-center gap-5">
                            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center shrink-0 shadow-sm"><FaHardHat size={28}/></div>
                            <div>
                              <h3 className="text-sm font-black text-emerald-900 uppercase tracking-widest mb-1.5">Журнал монтажу</h3>
                              <p className="text-xs text-emerald-700 font-medium leading-relaxed">Фіксація факту встановлення обладнання на об'єкті.</p>
                            </div>
                          </div>
                          <button onClick={() => { setInventoryMode('installation'); setIsInventoryOpen(true); }}
                            className="w-full md:w-auto bg-emerald-500 hover:bg-emerald-400 text-white px-8 py-4 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-emerald-500/20 active:scale-95">
                            Відкрити журнал
                          </button>
                        </div>
                      )}
                    </div>

                    {/* ПРИКРІПЛЕНІ ФАЙЛИ */}
                    {showAttachmentsBlock && !(selectedTask.title.match(cpRegex) && attachments.length > 0) && (
                      <div className="space-y-4 pt-2">
                        <div className="flex justify-between items-center">
                          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <FaPaperclip size={12}/> Прикріплені файли
                            {attachments.length > 0 && (
                              <span className="bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full text-[9px]">{attachments.length}</span>
                            )}
                          </h3>
                          <button onClick={() => handleDocumentUploadClick(selectedTask.file_label || 'Інше')}
                            className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors shadow-sm active:scale-95">
                            <FaPlus size={10}/> Завантажити
                          </button>
                        </div>
                        {attachments.length === 0 ? (
                          <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50/50">
                            <FaCloudUploadAlt className="text-slate-300 mx-auto mb-3" size={32}/>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Немає прикріплених файлів</p>
                            {requiresFileUpload && (
                              <p className="text-[9px] font-bold text-rose-400 uppercase">
                                Це завдання вимагає завантаження документів{selectedTask.file_label ? `: "${selectedTask.file_label}"` : '!'}
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {attachments.map(file => <FileCard key={file.id} file={file} onDelete={handleDeleteAttachment}/>)}
                          </div>
                        )}
                      </div>
                    )}

                    <hr className="border-slate-100"/>

                    {/* ЖУРНАЛ НОТАТОК */}
                    <div className="space-y-4 pb-6">
                      <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><FaCommentDots size={12}/> Робочі нотатки</h3>
                      {comments.length > 0 && (
                        <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar p-5 rounded-3xl bg-slate-50 border border-slate-100">
                          {comments.map(c => (
                            <div key={c.id} className="bg-white p-5 rounded-2xl border border-slate-100 flex gap-4 shadow-sm animate-fade-in group/comment">
                              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0 mt-0.5 border border-slate-200"><FaUserTie className="text-slate-400" size={16}/></div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-baseline gap-3 mb-1.5">
                                  <span className="text-sm font-black text-slate-800">{c.users?.full_name || 'Невідомий'}</span>
                                  <span className="text-[9px] font-bold text-slate-400 uppercase">{new Date(c.created_at).toLocaleString('uk-UA')}</span>
                                </div>
                                <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed break-words">{c.comment}</p>
                              </div>
                              {(c.user_id === employeeProfile?.id || canViewCommercial) && (
                                <button onClick={() => handleDeleteComment(c)}
                                  className="self-start p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg opacity-0 group-hover/comment:opacity-100 transition-all shrink-0"
                                  title="Видалити нотатку">
                                  <FaTrash size={12}/>
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="relative mt-3">
                        <textarea rows="2" value={newComment} onChange={e => setNewComment(e.target.value)}
                          className="w-full p-5 pr-16 bg-white border border-slate-200 rounded-3xl text-sm font-medium text-slate-800 outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 resize-none shadow-sm transition-all"
                          placeholder="Залишити примітку або коментар до завдання..."
                          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddComment(); } }}/>
                        <button onClick={handleAddComment} disabled={isCommentAdding || !newComment.trim()}
                          className="absolute right-4 bottom-4 p-3 bg-amber-500 hover:bg-amber-400 text-slate-900 rounded-xl disabled:opacity-30 transition-all shadow-md active:scale-95">
                          <FaPaperPlane size={16}/>
                        </button>
                      </div>
                    </div>

                  </div>
                )}
              </div>

              {/* ФУТЕР */}
              <div className="shrink-0 bg-white border-t border-slate-200 p-5 md:p-6 flex justify-between items-center z-10 shadow-[0_-10px_30px_-15px_rgba(0,0,0,0.1)]">
                <span className={`text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl flex items-center gap-2 ${selectedTask.status === 'Виконана' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                  {selectedTask.status === 'Виконана' ? <><FaCheckCircle size={14}/> Завдання виконано</> : <><FaClock size={14}/> В процесі</>}
                </span>
                <div className="flex gap-3">
                  {!isSelectedTaskSmart && !requiresFileUpload && selectedTask.status !== 'Виконана' && (
                    <button onClick={e => handleCompleteTask(e, selectedTask)}
                      className="px-8 py-3.5 text-xs font-black text-white bg-emerald-500 hover:bg-emerald-400 uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-emerald-500/20 active:scale-95 flex items-center gap-2">
                      <FaCheckCircle size={16}/> Завершити завдання
                    </button>
                  )}
                  {isSelectedTaskSmart && !requiresFileUpload && selectedTask.status !== 'Виконана' && (
                    <span className="text-[10px] font-black text-slate-400 uppercase bg-slate-50 px-4 py-2.5 rounded-xl border border-slate-100">
                      * Використайте інструмент вище
                    </span>
                  )}
                  {requiresFileUpload && selectedTask.status !== 'Виконана' && (
                    <span className="text-[10px] font-black text-indigo-500 uppercase bg-indigo-50 px-4 py-2.5 rounded-xl border border-indigo-100">
                      * Завдання закриється автоматично після завантаження
                    </span>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* МОДАЛЬНІ ВІКНА */}
      
      <SiteSurveyModal 
        dealId={surveyDealId} 
        isOpen={isSurveyOpen}
        onClose={() => { setIsSurveyOpen(false); fetchTaskData(selectedTask); }}
        onSave={() => {
          setIsSurveyOpen(false);
          fetchTaskData(selectedTask);
          if (selectedTask?.status !== 'Виконана') handleCompleteTask(null, selectedTask);
        }}
      />
      
      <InitialContactModal 
        dealId={contactDealId} 
        taskId={contactTaskId} 
        isOpen={isContactModalOpen}
        onClose={() => { setIsContactModalOpen(false); fetchTaskData(selectedTask); }}
        onSave={() => {
          setIsContactModalOpen(false);
          fetchTaskData(selectedTask);
          if (selectedTask?.status !== 'Виконана') handleCompleteTask(null, selectedTask);
        }}
      />
      
      <DeliveryOrganizationModal deal={selectedTask?.deals} task={selectedTask} isOpen={isDeliveryModalOpen}
        onClose={() => setIsDeliveryModalOpen(false)}
        onSave={() => { setIsDeliveryModalOpen(false); handleCompleteTask(null, selectedTask); }}/>
      
      <DocumentUploadModal
        dealId={selectedTask?.deals?.id || selectedTask?.deal_id}
        dealLabel={selectedTask?.deals?.title || `СЕС-${selectedTask?.deals?.custom_id || ''}`}
        taskId={selectedTask?.id}
        taskTitle={selectedTask?.title}
        category={uploadCategory}
        isOpen={isDocModalOpen}
        onClose={() => setIsDocModalOpen(false)}
        onSave={() => {
          setIsDocModalOpen(false);
          fetchTaskData(selectedTask);
          if (requiresFileUpload && selectedTask?.status !== 'Виконана') handleCompleteTask(null, selectedTask);
        }}/>
        
      <DealPaymentsModal
        dealId={selectedTask?.deals?.id || selectedTask?.deal_id}
        clientId={selectedTask?.deals?.client_id}
        dealBudget={selectedTask?.deals?.final_budget}
        isOpen={isPaymentsModalOpen}
        onClose={() => { setIsPaymentsModalOpen(false); fetchTaskData(selectedTask); }}
        onSave={() => {
          setIsPaymentsModalOpen(false);
          fetchTaskData(selectedTask);
          if (selectedTask?.status !== 'Виконана') handleCompleteTask(null, selectedTask);
        }}
      />

      <ConfirmDialog
        isOpen={!!confirmState}
        title={confirmState?.type === 'comment' ? 'Видалити нотатку?' : 'Видалити файл?'}
        message={confirmState?.label ? `«${confirmState.label}»` : 'Дію неможливо буде скасувати.'}
        onConfirm={executeConfirmedDelete}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}