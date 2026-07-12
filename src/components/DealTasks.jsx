import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthProvider';
import {
  FaCheckCircle, FaRegCircle, FaCommentDots,
  FaExternalLinkAlt, FaClock, FaUserTie, FaPaperPlane,
  FaPhoneAlt, FaFileContract, FaRulerCombined, FaClipboardCheck,
  FaEye, FaBoxOpen, FaTruckLoading, FaHardHat, FaFolderOpen,
  FaMoneyBillWave, FaShoppingCart, FaPlus, FaTimes, FaCloudUploadAlt
} from 'react-icons/fa';

import UniversalDocumentViewer from './UniversalDocumentViewer';
import ConfirmDialog from './ConfirmDialog';

export default function DealTasks({
  deal,
  stages,
  viewingStageId,
  onDealUpdate,
  onOpenSurveyModal,
  onOpenInitialContact,
  onOpenFileUpload,
  onOpenSurveyViewer,
  onOpenSpecification,
  onOpenDelivery,
  onOpenInstallationJournal,
  onOpenPaymentsModal,
  onOpenAdditionalMaterials,
  onOpenCrewSchedule,
  refreshTrigger
}) {
  const { employeeProfile } = useAuth();
  
  const [tasks, setTasks] = useState([]);
  const [team, setTeam] = useState([]); 
  const [comments, setComments] = useState({}); 
  const [newCommentText, setNewCommentText] = useState({}); 
  
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());

  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [viewerTitle, setViewerTitle] = useState("Документи");
  const [viewerCategories, setViewerCategories] = useState([]);

  // ВЛАСНЕ (одноразове) ЗАВДАННЯ — тільки для цієї угоди, template_id лишається null
  const [isAddingCustomTask, setIsAddingCustomTask] = useState(false);
  const [customTaskForm, setCustomTaskForm] = useState({ title: '', deadline_at: '', assignee_id: '', requires_file: false, file_label: '' });
  const [isSubmittingCustomTask, setIsSubmittingCustomTask] = useState(false);

  // Підтвердження видалення нотатки у стилі CRM
  const [commentToDelete, setCommentToDelete] = useState(null);

  const isActualCurrentStage = viewingStageId === deal?.stage_id;
  const userRole = employeeProfile?.role?.toLowerCase() || '';
  const canAssign = userRole.includes('директор') || userRole.includes('менеджер');

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (deal?.id && viewingStageId) {
      fetchTasksAndTeam();
    }
  }, [deal?.id, viewingStageId, refreshTrigger]);

  const fetchTasksAndTeam = async () => {
    setLoading(true);
    const { data: teamData } = await supabase.from('users').select('id, full_name, role').eq('is_active', true);
    if (teamData) setTeam(teamData);

    const { data: tasksData, error } = await supabase
      .from('tasks')
      .select('*, users!tasks_assignee_id_fkey(full_name), task_templates(default_role, priority, position, deadline_days)')
      .eq('deal_id', deal.id)
      .eq('stage_id', viewingStageId)
      .order('created_at', { ascending: true });
      
    if (error) console.error("Помилка завантаження завдань:", error);
    
    const fetchedTasks = tasksData || [];
    setTasks(fetchedTasks);

    if (fetchedTasks.length > 0) {
      const taskIds = fetchedTasks.map(t => t.id);
      const { data: commentsData } = await supabase
        .from('task_comments')
        .select('*, users(full_name)')
        .in('task_id', taskIds)
        .order('created_at', { ascending: true });

      const groupedComments = {};
      fetchedTasks.forEach(t => groupedComments[t.id] = []);
      if (commentsData) {
        commentsData.forEach(c => { groupedComments[c.task_id].push(c); });
      }
      setComments(groupedComments);
    }
    setLoading(false);
  };

  const logAction = async (actionText) => {
    await supabase.from('deal_activity_log').insert([{ deal_id: deal.id, user_id: employeeProfile?.id, stage_id: viewingStageId, entity_type: 'task', action: actionText }]);
  };

  const handleAssignUser = async (taskId, userId) => {
    if (!canAssign) return;
    const { error } = await supabase.from('tasks').update({ assignee_id: userId || null }).eq('id', taskId);
    if (!error) {
      const assignedUser = team.find(u => u.id === userId);
      await logAction(`Призначено виконавця: ${assignedUser ? assignedUser.full_name : 'Знято призначення'}`);
      setTasks(tasks.map(t => t.id === taskId ? { ...t, assignee_id: userId, users: { full_name: assignedUser?.full_name } } : t));
    }
  };

  const handleAddCustomTask = async (e) => {
    e.preventDefault();
    if (!customTaskForm.title.trim()) return;
    if (customTaskForm.requires_file && !customTaskForm.file_label.trim()) {
      return alert('Вкажіть назву документа, який вимагається (напр. "Технічні умови").');
    }
    setIsSubmittingCustomTask(true);
    try {
      const { error } = await supabase.from('tasks').insert([{
        deal_id: deal.id,
        stage_id: viewingStageId,
        title: customTaskForm.title.trim(),
        assignee_id: customTaskForm.assignee_id || null,
        deadline_at: customTaskForm.deadline_at ? new Date(customTaskForm.deadline_at).toISOString() : null,
        status: 'Відкрита',
        priority: 'Середній',
        requires_file: customTaskForm.requires_file,
        file_label: customTaskForm.requires_file ? customTaskForm.file_label.trim() : null
      }]);
      if (error) throw error;

      await logAction(`Додано власне завдання: ${customTaskForm.title.trim()}${customTaskForm.requires_file ? ` (вимагає файл: ${customTaskForm.file_label.trim()})` : ''}`);
      setCustomTaskForm({ title: '', deadline_at: '', assignee_id: '', requires_file: false, file_label: '' });
      setIsAddingCustomTask(false);
      fetchTasksAndTeam();
    } catch (error) {
      alert('Помилка створення завдання: ' + error.message);
    } finally {
      setIsSubmittingCustomTask(false);
    }
  };

  const handleAddComment = async (taskId) => {
    const text = newCommentText[taskId];
    if (!text || !text.trim()) return;
    const { error } = await supabase.from('task_comments').insert([{ task_id: taskId, user_id: employeeProfile?.id, comment: text.trim() }]);
    if (!error) { setNewCommentText(prev => ({ ...prev, [taskId]: '' })); fetchTasksAndTeam(); }
  };

  const handleOpenDocs = (e, task) => {
    if (e) e.stopPropagation();
    let expectedCategories = [];
    const tLower = task.title.toLowerCase();

    // Власне завдання з вимогою файлу — показуємо саме його тип документа
    if (task.file_label) expectedCategories = [task.file_label];
    // ВАЖЛИВО: Виправлено перевірку кореня слова "догов"
    else if (tLower.includes('комерційн') || tLower.includes('кп')) expectedCategories = ['Комерційна пропозиція', 'КП'];
    else if (tLower.includes('догов')) expectedCategories = ['Договір', 'Додаток до договору'];
    else if (tLower.includes('3d') || tLower.includes('візуалізаці')) expectedCategories = ['3D Візуалізація', 'Розміщення панелей'];
    else if (tLower.includes('кресленн') || tLower.includes('схем') || tLower.includes('стрінгуванн')) expectedCategories = ['Технічне креслення', 'Схема підключення', 'Стрінгування'];
    else expectedCategories = ['Всі файли'];

    setViewerTitle(`Документи: ${task.title}`);
    setViewerCategories(expectedCategories); 
    setIsViewerOpen(true);
  };

  const handleTitleClick = (task) => {
    const title = task.title.toLowerCase();

    // Історія (не поточний етап) АБО вже виконане завдання —
    // відкриваємо інструменти в режимі перегляду результатів
    if (!isActualCurrentStage || task.status === 'Виконана') {
      if (task.requires_file || task.file_label) { handleOpenDocs(null, task); return; }
      if (title.match(/замір|огляд|виїзд|даних|акт/i)) { if (onOpenSurveyViewer) { onOpenSurveyViewer(task); return; } }
      // Документні завдання: клік по назві = перегляд результату (додати файли — окрема кнопка)
      if (title.match(/комерційн|кп|догов|рішенн|документ/i)) { handleOpenDocs(null, task); return; }
      if (title.match(/доставк|транспорт|завантаж/i)) { if (onOpenDelivery) { onOpenDelivery(task); return; } }
      // Графік бригади — окремий інструмент, перевіряється ДО журналу монтажу
      if (title.match(/бригад/i)) { if (onOpenCrewSchedule) { onOpenCrewSchedule(task); return; } }
      if (title.match(/монтажн|фізичн|змонтовано/i)) { if (onOpenInstallationJournal) { onOpenInstallationJournal(task); return; } }
      if (title.match(/резерв|обладнанн|специфікаці/i)) { if (onOpenSpecification) { onOpenSpecification(task); return; } }
      if (title.match(/оплат|платіж|каса|рахунок/i)) { if (onOpenPaymentsModal) { onOpenPaymentsModal(task); return; } }
      if (title.match(/зв.язатися|контакт|кваліфікаці|оперативно/i)) { if (onOpenInitialContact) { onOpenInitialContact(task); return; } }
      if (title.match(/додатков|матеріал|закупка/i)) { if (onOpenAdditionalMaterials) { onOpenAdditionalMaterials(task); return; } }
      return;
    }

    if (task.status !== 'Виконана') {
      // Власне завдання з вимогою файлу — відкриваємо завантаження документа
      if (task.requires_file) { if (onOpenFileUpload) { onOpenFileUpload(task); return; } }
      if (title.match(/оплат|платіж|каса|рахунок/i)) { if (onOpenPaymentsModal) { onOpenPaymentsModal(task); return; } }
      if (title.match(/додатков|матеріал|закупка/i)) { if (onOpenAdditionalMaterials) { onOpenAdditionalMaterials(task); return; } }
      if (title.match(/зв.язатися|контакт|кваліфікаці|оперативно/i)) { if (onOpenInitialContact) { onOpenInitialContact(task); return; } }
      if (title.match(/замір|огляд|виїзд|даних|акт/i)) { if (onOpenSurveyModal) { onOpenSurveyModal(task); return; } }
      // Виправлено регулярку на "догов", "рішенн"
      if (title.match(/комерційн|кп|догов|рішенн|документ/i)) { if (onOpenFileUpload) { onOpenFileUpload(task); return; } }
      if (title.match(/доставк|транспорт|завантаж/i)) { if (onOpenDelivery) { onOpenDelivery(task); return; } }
      // Графік бригади — окремий інструмент, перевіряється ДО журналу монтажу
      if (title.match(/бригад/i)) { if (onOpenCrewSchedule) { onOpenCrewSchedule(task); return; } }
      if (title.match(/монтажн|фізичн|змонтовано/i)) { if (onOpenInstallationJournal) { onOpenInstallationJournal(task); return; } }
      if (title.match(/резерв|обладнанн|специфікаці/i)) { if (onOpenSpecification) { onOpenSpecification(task); return; } }
    }

    // Виправлено регулярку на "догов", "рішенн"
    const isSmartTask = title.match(/замір|огляд|виїзд|зв.язатися|контакт|кваліфікаці|комерційн|кп|догов|рішенн|документ|резерв|обладнанн|специфікаці|доставк|транспорт|завантаж|монтажн|бригад|фізичн|змонтовано|оплат|платіж|каса|рахунок|додатков|матеріал/i);
    if (!isSmartTask) {
      executeTaskManually(task);
    }
  };

  const handleCheckboxClick = async (e, task) => {
    e.stopPropagation();
    if (!isActualCurrentStage) return;

    const title = task.title.toLowerCase();
    // Виправлено регулярку на "догов", "рішенн"
    const isSmartTask = title.match(/замір|огляд|виїзд|зв.язатися|контакт|кваліфікаці|комерційн|кп|догов|рішенн|документ|резерв|обладнанн|специфікаці|доставк|транспорт|завантаж|монтажн|бригад|фізичн|змонтовано|оплат|платіж|каса|рахунок|додатков|матеріал/i);

    if (isSmartTask && task.status !== 'Виконана') {
      handleTitleClick(task);
      return;
    }

    // Завдання, що вимагає файл: перевіряємо, чи документ прикріплено
    if (task.requires_file && task.status !== 'Виконана') {
      const { count } = await supabase
        .from('deal_documents')
        .select('id', { count: 'exact', head: true })
        .eq('deal_id', deal.id)
        .eq('category', task.file_label);
      if (!count) {
        alert(`Щоб виконати завдання, прикріпіть документ "${task.file_label}".`);
        if (onOpenFileUpload) onOpenFileUpload(task);
        return;
      }
    }

    executeTaskManually(task);
  };

  // Порядок за task_templates.position (для чергування дедлайнів і відображення), потім за часом створення.
  const getSortedTasks = (list) => {
    return [...list].sort((a, b) => {
      const pa = a.task_templates?.position ?? 9999;
      const pb = b.task_templates?.position ?? 9999;
      return pa !== pb ? pa - pb : new Date(a.created_at) - new Date(b.created_at);
    });
  };

  const executeTaskManually = async (task) => {
    const isCompleting = task.status !== 'Виконана';
    const newStatus = isCompleting ? 'Виконана' : 'Відкрита';
    const completedAt = new Date();

    const { error } = await supabase
      .from('tasks')
      .update({
        status: newStatus,
        completed_at: isCompleting ? completedAt : null,
        assignee_id: isCompleting && !task.assignee_id ? employeeProfile?.id : task.assignee_id
      })
      .eq('id', task.id);

    if (error) return;

    await logAction(isCompleting ? `Виконано завдання: ${task.title}` : `Скасовано виконання: ${task.title}`);

    const updatedTasks = tasks.map(t => t.id === task.id ? { ...t, status: newStatus } : t);
    setTasks(updatedTasks);

    // Завдання не блокуються — можна робити паралельно. Але дедлайн наступного завдання
    // в черзі рахується від моменту виконання ПОПЕРЕДНЬОГО, а не від початку етапу.
    if (isCompleting) {
      const sorted = getSortedTasks(updatedTasks);
      const idx = sorted.findIndex(t => t.id === task.id);
      const nextTask = sorted[idx + 1];
      if (nextTask && nextTask.status !== 'Виконана' && nextTask.task_templates?.deadline_days) {
        const newDeadline = new Date(completedAt.getTime() + nextTask.task_templates.deadline_days * 24 * 60 * 60 * 1000);
        await supabase.from('tasks').update({ deadline_at: newDeadline.toISOString() }).eq('id', nextTask.id);
      }
    }

    if (isCompleting) {
      // Завдання оплати навмисно НЕ бере участі в перевірці "всі завдання виконано" —
      // контроль оплати триває і після переходу на монтаж, тож не має блокувати етап.
      const isPaymentTask = (title) => /оплат|платіж|каса|рахунок/i.test((title || '').toLowerCase());
      const blockingTasks = updatedTasks.filter(t => !isPaymentTask(t.title));
      const allTasksDone = blockingTasks.length > 0 && blockingTasks.every(t => t.status === 'Виконана');
      if (allTasksDone) {
        const currentStageObj = stages.find(s => s.id === deal.stage_id);
        const nextStage = stages.find(s => s.position === (currentStageObj?.position || 0) + 1);

        if (nextStage) {
          const { error: dealError } = await supabase.from('deals').update({ stage_id: nextStage.id, stage: nextStage.name, updated_at: new Date() }).eq('id', deal.id);
          if (!dealError) await supabase.from('deal_activity_log').insert([{ deal_id: deal.id, stage_id: nextStage.id, action: `Авто-перехід на етап: ${nextStage.name}` }]);
        } else {
          const { error: winError } = await supabase.from('deals').update({ status: 'Угоду виграно', updated_at: new Date() }).eq('id', deal.id);
          if (!winError) await supabase.from('deal_activity_log').insert([{ deal_id: deal.id, stage_id: viewingStageId, action: `🎉 Всі завдання завершено. Угоду переведено в статус ВИГРАНО!` }]);
        }
      }
    }
    onDealUpdate();
  };

  const getDeadlineDisplay = (deadlineAt, status) => {
    if (!deadlineAt) return null;
    if (status === 'Виконана') return { text: 'Виконано', color: 'text-emerald-500 bg-emerald-50 border-emerald-100' };
    const diffMs = new Date(deadlineAt) - currentTime;
    if (diffMs <= 0) return { text: 'Прострочено!', color: 'text-rose-600 bg-rose-50 border-rose-100 animate-pulse' };
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((diffMs / (1000 * 60 * 60)) % 24);
    const diffMins = Math.floor((diffMs / 1000 / 60) % 60);
    if (diffDays > 0) return { text: `${diffDays} д : ${diffHours} г`, color: 'text-slate-600 bg-slate-50 border-slate-200' };
    return { text: `${diffHours} г : ${diffMins} хв`, color: diffHours < 4 ? 'text-amber-600 bg-amber-50 border-amber-200' : 'text-slate-600 bg-slate-50 border-slate-200' };
  };

  const getTaskIcon = (title, isDone) => {
    const t = title.toLowerCase();
    const color = isDone ? 'text-slate-400' : 'text-amber-500';
    if (t.match(/оплат|платіж|каса|рахунок/i)) return <FaMoneyBillWave className={`${color} w-3.5 h-3.5`}/>;
    if (t.match(/додатков|матеріал|закупка/i)) return <FaShoppingCart className={`${color} w-3.5 h-3.5`}/>;
    if (t.match(/зв.язатися|контакт|кваліфікаці|оперативно/i)) return <FaPhoneAlt className={`${color} w-3.5 h-3.5`}/>;
    if (t.match(/комерційн|кп|догов|документ/i)) return <FaFileContract className={`${color} w-3.5 h-3.5`}/>;
    if (t.match(/замір|огляд|розкладка|виїзд/i)) return <FaRulerCombined className={`${color} w-3.5 h-3.5`}/>;
    if (t.match(/доставк|транспорт|завантаж/i)) return <FaTruckLoading className={`${color} w-3.5 h-3.5`}/>;
    if (t.match(/монтажн|бригад|фізичн|змонтовано/i)) return <FaHardHat className={`${color} w-3.5 h-3.5`}/>;
    if (t.match(/контроль|перевірити/i)) return <FaClipboardCheck className={`${color} w-3.5 h-3.5`}/>;
    if (t.match(/резерв|обладнанн|специфікаці/i)) return <FaBoxOpen className={`${color} w-3.5 h-3.5`}/>;
    return null;
  };

  if (loading) return <div className="p-6 md:p-10 text-center text-slate-400 text-xs font-bold animate-pulse uppercase tracking-widest">Отримання завдань...</div>;

  // Показуємо в логічному порядку (task_templates.position), але жодне завдання не блокує інше —
  // виконувати можна паралельно, дедлайн наступного просто рахується від моменту виконання попереднього.
  const sortedTasks = getSortedTasks(tasks);

  return (
    <div className={`bg-white p-4 md:p-6 lg:p-8 rounded-xl md:rounded-2xl border transition-colors duration-300 shadow-sm ${!isActualCurrentStage ? 'border-dashed border-slate-300 bg-slate-50/50' : 'border-slate-200'}`}>
      <div className="flex flex-row justify-between items-center gap-3 mb-4 md:mb-6 flex-wrap">
         <h3 className="text-xs md:text-sm font-black text-slate-800 uppercase tracking-widest border-l-4 border-amber-400 pl-2.5 md:pl-3">Завдання етапу</h3>
         <div className="flex items-center gap-2">
           {isActualCurrentStage && canAssign && (
             <button onClick={() => setIsAddingCustomTask(!isAddingCustomTask)} className="text-[10px] md:text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-700 px-2.5 py-1.5 md:px-3 md:py-2 rounded-lg border border-amber-200 transition-colors flex items-center gap-1.5 whitespace-nowrap">
             <FaPlus size={10}/> Власне завдання
             </button>
           )}
           <span className="text-[10px] md:text-xs font-bold bg-slate-50 text-slate-500 px-2.5 py-1.5 md:px-3 md:py-2 rounded-lg border border-slate-200 shadow-sm whitespace-nowrap shrink-0">
             ВИКОНАНО: {tasks.filter(t => t.status === 'Виконана').length} / {tasks.length}
           </span>
         </div>
      </div>

      {isAddingCustomTask && (
        <form onSubmit={handleAddCustomTask} className="mb-4 md:mb-6 p-4 bg-amber-50/50 border border-amber-200 rounded-xl space-y-3 animate-fade-in">
          <div className="flex justify-between items-center">
            <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest">Нове одноразове завдання для цієї угоди</p>
            <button type="button" onClick={() => setIsAddingCustomTask(false)} className="text-slate-400 hover:text-rose-500 p-1"><FaTimes size={12}/></button>
          </div>
          <input
            type="text" required autoFocus placeholder="Назва завдання..."
            value={customTaskForm.title} onChange={e => setCustomTaskForm({...customTaskForm, title: e.target.value})}
            className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm font-bold outline-none focus:border-amber-500"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="datetime-local" value={customTaskForm.deadline_at}
              onChange={e => setCustomTaskForm({...customTaskForm, deadline_at: e.target.value})}
              className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-amber-500"
            />
            <select
              value={customTaskForm.assignee_id} onChange={e => setCustomTaskForm({...customTaskForm, assignee_id: e.target.value})}
              className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-amber-500 cursor-pointer"
            >
              <option value="">Не призначено</option>
              {team.map(u => <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>)}
            </select>
          </div>

          {/* КОНСТРУКТОР: ЯК ЗАКРИВАЄТЬСЯ ЗАВДАННЯ */}
          <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-3">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Умова виконання</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setCustomTaskForm({...customTaskForm, requires_file: false, file_label: ''})}
                className={`py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all ${!customTaskForm.requires_file ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}
              >
                Проста відмітка
              </button>
              <button
                type="button"
                onClick={() => setCustomTaskForm({...customTaskForm, requires_file: true})}
                className={`py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all ${customTaskForm.requires_file ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}
              >
                Вимагає файл
              </button>
            </div>
            {customTaskForm.requires_file && (
              <div className="animate-fade-in">
                <input
                  type="text" required
                  placeholder="Назва документа (напр: Технічні умови)"
                  value={customTaskForm.file_label}
                  onChange={e => setCustomTaskForm({...customTaskForm, file_label: e.target.value})}
                  className="w-full px-3 py-2.5 bg-indigo-50/50 border border-indigo-200 rounded-lg text-xs font-bold outline-none focus:border-indigo-500"
                />
                <p className="text-[9px] font-bold text-slate-400 mt-1.5 ml-1">
                  Завдання закриється після прикріплення файлу. Ім'я файлу: <span className="text-indigo-600">{customTaskForm.file_label || 'Тип'}_{deal?.title || 'Угода'}_дата_№</span>
                </p>
              </div>
            )}
          </div>

          <button type="submit" disabled={isSubmittingCustomTask || !customTaskForm.title.trim()} className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-900 rounded-lg text-xs font-black uppercase tracking-widest transition-colors disabled:opacity-50">
            {isSubmittingCustomTask ? 'Створення...' : 'Додати завдання'}
          </button>
        </form>
      )}

      <div className="space-y-3 md:space-y-4">
        {tasks.length === 0 && (
          <div className="py-8 md:py-12 px-4 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">На цьому етапі задач не знайдено</p>
            {!isActualCurrentStage && (
              <p className="text-[10px] md:text-xs font-medium text-slate-400 mt-1.5 max-w-md mx-auto">
                Історію етапу можна переглядати, коли задачі або події були створені з прив'язкою до цього етапу.
              </p>
            )}
          </div>
        )}

        {sortedTasks.map(task => {
          const isDone = task.status === 'Виконана';
          const deadlineInfo = getDeadlineDisplay(task.deadline_at, task.status);
          const priority = task.priority || task.task_templates?.priority;
          const taskComments = comments[task.id] || [];
          
          const tLower = task.title.toLowerCase();
          
          // Виправлено регулярку на "догов", "рішенн"
          const isSmartTask = tLower.match(/замір|огляд|виїзд|зв.язатися|контакт|кваліфікаці|комерційн|кп|догов|рішенн|документ|резерв|обладнанн|специфікаці|доставк|транспорт|завантаж|монтажн|бригад|фізичн|змонтовано|оплат|платіж|каса|рахунок|додатков|матеріал/i)
            || task.requires_file;
          const isSurveyTask = tLower.match(/замір|огляд|виїзд|даних|акт/i);
          const isDocTask = tLower.match(/комерційн|кп|догов|рішенн|документ|кресленн|схем|стрінгуванн|візуалізаці/i)
            || !!task.file_label;

          let smartHint = "Потребує даних / файлу";
          if (tLower.match(/оплат|платіж|каса|рахунок/i)) smartHint = "Фінансовий контроль";
          if (tLower.match(/додатков|матеріал|закупка/i)) smartHint = "Замовити матеріали";
          if (tLower.match(/резерв|обладнанн|специфікаці/i)) smartHint = "Відкрити комплектацію";
          if (tLower.match(/доставк|транспорт|завантаж/i)) smartHint = "Заповнити доставку";
          if (tLower.match(/монтажн|фізичн|змонтовано/i)) smartHint = "Журнал монтажу";
          if (tLower.match(/бригад/i)) smartHint = "Графік бригади";
          if (task.requires_file) smartHint = `Прикріпити файл: ${task.file_label}`;

          return (
            <div key={task.id} className={`p-4 rounded-xl border transition-colors ${isDone ? 'bg-slate-50 border-slate-100 opacity-80' : 'bg-white border-slate-200 shadow-sm hover:border-amber-300'}`}>
              <div className="flex items-start gap-3 md:gap-4">

                <button
                  onClick={(e) => handleCheckboxClick(e, task)}
                  disabled={!isActualCurrentStage}
                  className={`pt-1 shrink-0 transition-transform active:scale-90 ${!isActualCurrentStage ? 'cursor-not-allowed opacity-30' : ''}`}
                >
                  {isDone ? <FaCheckCircle className="text-emerald-500 w-5 h-5" /> : <FaRegCircle className="text-slate-300 hover:text-amber-500 w-5 h-5" />}
                </button>

                <div className="flex-1 min-w-0">
                   <div className="flex items-start justify-between gap-3 cursor-pointer group/title" onClick={() => handleTitleClick(task)}>
                     <div className="flex items-start gap-3 flex-1 min-w-0">
                       <div className="mt-1 shrink-0 opacity-70 group-hover/title:opacity-100 transition-opacity">
                          {getTaskIcon(task.title, isDone)}
                       </div>
                       <div className="flex-1 min-w-0">
                          <p className={`text-sm md:text-base font-bold transition-colors leading-tight break-words ${isDone ? 'line-through text-slate-400' : 'text-slate-800 group-hover/title:text-amber-600'}`}>
                            {task.title}
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                            {!task.template_id && !isDone && (
                              <span className="inline-block text-[9px] font-black uppercase text-sky-600 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-100">Власне</span>
                            )}
                            {task.requires_file && task.file_label && (
                              <span className="inline-block text-[9px] font-black uppercase text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                                Документ: {task.file_label}
                              </span>
                            )}
                          </div>
                          {isSmartTask && !isDone && isActualCurrentStage && (
                            <div className="flex items-center gap-1.5 mt-2 text-[9px] md:text-[10px] font-black uppercase text-amber-600 bg-amber-50 px-2 py-1 rounded w-fit max-w-full truncate border border-amber-100">
                               <FaExternalLinkAlt className="shrink-0" size={10}/> <span className="truncate">{smartHint}</span>
                            </div>
                          )}
                          {isSmartTask && isDone && (
                            <div className="flex items-center gap-1.5 mt-2 text-[9px] md:text-[10px] font-black uppercase text-emerald-600 bg-emerald-50 px-2 py-1 rounded w-fit max-w-full truncate border border-emerald-100">
                               <FaEye className="shrink-0" size={10}/> <span className="truncate">Переглянути результат</span>
                            </div>
                          )}
                       </div>
                     </div>

                     <div className="flex gap-1.5 shrink-0">
                       {isSurveyTask && (
                         <button onClick={(e) => { e.stopPropagation(); if (onOpenSurveyViewer) onOpenSurveyViewer(task); }} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 border border-transparent hover:border-indigo-100 rounded-lg transition-colors" title="Переглянути результати заміру">
                           <FaEye className="w-4 h-4" />
                         </button>
                       )}
                       {isDocTask && (
                         <button onClick={(e) => handleOpenDocs(e, task)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 border border-transparent hover:border-indigo-100 rounded-lg transition-colors" title="Переглянути завантажені документи">
                           <FaFolderOpen className="w-4 h-4" />
                         </button>
                       )}
                       {isDocTask && isDone && (
                         <button onClick={(e) => { e.stopPropagation(); if (onOpenFileUpload) onOpenFileUpload(task); }} className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 border border-transparent hover:border-emerald-100 rounded-lg transition-colors" title="Додати нові файли (нова версія документа)">
                           <FaCloudUploadAlt className="w-4 h-4" />
                         </button>
                       )}
                     </div>
                   </div>

                   <div className="flex flex-wrap items-center gap-2 mt-3">
                     {deadlineInfo && (
                       <span className={`text-[10px] md:text-xs font-bold uppercase px-2 py-1 rounded-md border flex items-center gap-1.5 ${deadlineInfo.color}`}>
                         <FaClock size={10} /> {deadlineInfo.text}
                       </span>
                     )}

                     <div className="flex items-center bg-white border border-slate-200 rounded-md max-w-full min-w-0">
                       <div className={`pl-2 pr-1.5 py-1 shrink-0 ${isDone ? 'text-slate-300' : 'text-amber-500'}`}><FaUserTie size={10}/></div>
                       <select 
                         className={`text-[10px] md:text-xs font-bold uppercase bg-transparent outline-none py-1 pr-2 cursor-pointer w-full max-w-[140px] md:max-w-[200px] truncate ${isDone || !canAssign ? 'text-slate-400 opacity-70 cursor-not-allowed' : 'text-slate-600'}`}
                         value={task.assignee_id || ''}
                         onChange={(e) => handleAssignUser(task.id, e.target.value)}
                         disabled={!isActualCurrentStage || isDone || !canAssign}
                       >
                         <option value="">Не призначено</option>
                         {team.map(u => <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option> )}
                       </select>
                     </div>

                     {priority && !isDone && (
                       <span className={`text-[9px] md:text-[10px] font-bold uppercase px-2 py-1 rounded-md border ${priority.includes('🔴') ? 'bg-rose-50 border-rose-100 text-rose-600' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>
                         {priority}
                       </span>
                     )}
                   </div>

                   <div className="mt-3 pt-3 border-t border-slate-100">
                     <h4 className="text-[10px] md:text-xs font-bold uppercase text-slate-400 mb-2 flex items-center gap-1.5"><FaCommentDots size={12}/> Примітки</h4>
                     <div className="space-y-2 mb-2.5">
                       {taskComments.length === 0 ? ( <p className="text-[10px] md:text-xs text-slate-400 italic">Немає приміток.</p> ) : (
                         taskComments.map(c => (
                           <div key={c.id} className="bg-slate-50 p-2.5 md:p-3 rounded-lg border border-slate-200/60 group/note">
                             <div className="flex justify-between items-center mb-1 gap-3">
                               <span className="text-[10px] md:text-xs font-bold text-slate-700 truncate">{c.users?.full_name || 'Невідомий'}</span>
                               <div className="flex items-center gap-1.5 shrink-0">
                                 <span className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase">{new Date(c.created_at).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute:'2-digit' })}</span>
                                 {(c.user_id === employeeProfile?.id || canAssign) && (
                                   <button onClick={() => setCommentToDelete(c)}
                                     className="p-1 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded opacity-0 group-hover/note:opacity-100 transition-all"
                                     title="Видалити примітку">
                                     <FaTimes size={10}/>
                                   </button>
                                 )}
                               </div>
                             </div>
                             <p className="text-xs md:text-sm text-slate-600 whitespace-pre-line break-words leading-relaxed">{c.comment}</p>
                           </div>
                         ))
                       )}
                     </div>

                     {isActualCurrentStage && (
                       <div className="relative flex items-center mt-2">
                         <input 
                           type="text" className="w-full bg-white border border-slate-200 rounded-lg py-1.5 md:py-2 pl-3 pr-8 md:pr-10 text-xs outline-none focus:border-amber-400 placeholder:text-slate-300 min-w-0 transition-colors"
                           placeholder="Додати примітку..." value={newCommentText[task.id] || ''}
                           onChange={e => setNewCommentText(prev => ({ ...prev, [task.id]: e.target.value }))}
                           onKeyDown={e => { if (e.key === 'Enter') handleAddComment(task.id); }}
                         />
                         <button 
                           onClick={() => handleAddComment(task.id)} disabled={!newCommentText[task.id]}
                           className="absolute right-1 p-1.5 text-amber-500 hover:text-amber-600 hover:bg-amber-50 rounded-md disabled:opacity-30 shrink-0 transition-colors"
                         >
                           <FaPaperPlane className="w-3.5 h-3.5"/>
                         </button>
                       </div>
                     )}
                   </div>

                </div>
              </div>
            </div>
          );
        })}
      </div>

      <UniversalDocumentViewer
        dealId={deal?.id}
        title={viewerTitle}
        isOpen={isViewerOpen}
        onClose={() => setIsViewerOpen(false)}
        initialCategories={viewerCategories}
      />

      <ConfirmDialog
        isOpen={!!commentToDelete}
        title="Видалити примітку?"
        message={commentToDelete?.comment ? `«${commentToDelete.comment.substring(0, 80)}»` : ''}
        onConfirm={async () => {
          await supabase.from('task_comments').delete().eq('id', commentToDelete.id);
          setCommentToDelete(null);
          fetchTasksAndTeam();
        }}
        onCancel={() => setCommentToDelete(null)}
      />
    </div>
  );
}