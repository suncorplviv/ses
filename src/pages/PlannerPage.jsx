import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthProvider';
import {
  FaCalendarAlt, FaChevronLeft, FaChevronRight, FaPlus, FaTimes,
  FaPhoneAlt, FaUsers, FaBell, FaBellSlash, FaTasks, FaUser,
  FaCheckCircle, FaTrash, FaExclamationTriangle, FaClock, FaLink, FaListUl,
  FaUserFriends, FaShareAlt, FaLock, FaEdit, FaBan, FaArrowRight, FaChevronDown, FaUserTie
} from 'react-icons/fa';
import ConfirmDialog from '../components/ConfirmDialog';

// Робочий діапазон сітки
const START_HOUR = 7;
const END_HOUR = 22;
const HOUR_PX = 60;
const SNAP_MIN = 15;

const EVENT_TYPES = {
  task:     { label: 'Завдання',    icon: FaTasks,    accent: 'border-l-sky-500' },
  meeting:  { label: 'Зустріч',     icon: FaUsers,    accent: 'border-l-violet-500' },
  call:     { label: 'Дзвінок',     icon: FaPhoneAlt, accent: 'border-l-emerald-500' },
  reminder: { label: 'Нагадування', icon: FaBell,     accent: 'border-l-amber-500' },
  personal: { label: 'Особисте',    icon: FaUser,     accent: 'border-l-slate-400' },
};

const PRIORITIES = {
  low:    { label: 'Низький',   card: 'bg-slate-50 border-slate-200 text-slate-700',  chip: 'bg-slate-100 text-slate-500 border-slate-200', dot: 'bg-slate-400' },
  normal: { label: 'Звичайний', card: 'bg-sky-50 border-sky-200 text-sky-900',        chip: 'bg-sky-50 text-sky-600 border-sky-200',        dot: 'bg-sky-500' },
  high:   { label: 'Важливий',  card: 'bg-amber-50 border-amber-300 text-amber-900',  chip: 'bg-amber-50 text-amber-600 border-amber-200',  dot: 'bg-amber-500' },
  urgent: { label: 'Терміново', card: 'bg-rose-50 border-rose-300 text-rose-900',     chip: 'bg-rose-50 text-rose-600 border-rose-200',     dot: 'bg-rose-500' },
};

const DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];

// --- Хелпери дат (локальний час) ---
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const addMinutes = (d, n) => new Date(new Date(d).getTime() + n * 60000);
const startOfWeek = (d) => {
  const x = startOfDay(d);
  const day = (x.getDay() + 6) % 7; // Пн = 0
  return addDays(x, -day);
};
const isSameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const toDateInput = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const toTimeInput = (d) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const fmtTime = (iso) => new Date(iso).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
const minToTimeStr = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const eventMinutes = (ev) => {
  const start = new Date(ev.start_at);
  // Нагадування без часу завершення — компактний блок ~20 хв у сітці
  const defaultDur = ev.event_type === 'reminder' ? 20 : 60;
  const end = ev.end_at ? new Date(ev.end_at) : addMinutes(start, defaultDur);
  return { startMin: start.getHours() * 60 + start.getMinutes(), durMin: Math.max((end - start) / 60000, SNAP_MIN) };
};

const emptyForm = {
  id: null, title: '', description: '', event_type: 'task',
  date: toDateInput(new Date()), start_time: '09:00', end_time: '10:00',
  priority: 'normal', can_disturb: true, status: 'planned',
  location: '', deal_id: null, task_id: null, linked_label: null,
  assignee_id: null, orig_user_id: null, orig_delegated_by: null
};

export default function PlannerPage() {
  const { employeeProfile } = useAuth();
  const myId = employeeProfile?.id;

  const userRole = employeeProfile?.role?.toLowerCase() || '';
  const isManagement = userRole.includes('директор') || userRole.includes('засновник') || userRole.includes('менеджер');

  const [viewMode, setViewMode] = useState('week'); // 'day' | 'week' | 'month' | 'team'
  const [anchorDate, setAnchorDate] = useState(startOfDay(new Date()));
  const [viewUserId, setViewUserId] = useState(null); // null = мій календар
  const [events, setEvents] = useState([]);
  const [dealTasks, setDealTasks] = useState([]);
  const [teamUsers, setTeamUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isTasksPanelOpen, setIsTasksPanelOpen] = useState(false);

  // Шеринг
  const [sharedWithMe, setSharedWithMe] = useState([]); // [{owner_id, owner:{full_name}}]
  const [myShares, setMyShares] = useState([]);         // [{id, viewer_id, viewer:{full_name}}]
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [shareSelectId, setShareSelectId] = useState('');
  const [isCalendarPickerOpen, setIsCalendarPickerOpen] = useState(false);
  const calendarPickerRef = useRef(null);

  // Доручені мною події (делегування)
  const [myDelegated, setMyDelegated] = useState([]);
  const [isDelegatedOpen, setIsDelegatedOpen] = useState(false);

  // Підтвердження видалення у стилі CRM
  const [confirmDel, setConfirmDel] = useState(null); // {kind: 'form-event'|'event'|'delegation', id, title}

  // Модалка події
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [isSaving, setIsSaving] = useState(false);

  // Контекстне меню події
  const [ctxMenu, setCtxMenu] = useState(null); // {x, y, ev}

  // Drag & Drop
  const dayColRefs = useRef({});
  const dragRef = useRef(null);
  const [dragPreview, setDragPreview] = useState(null); // {mode, dayIdx, startMin, durMin, eventId}
  const suppressClickRef = useRef(false);

  const isOwnView = !viewUserId && viewMode !== 'team';
  const isMaskedUser = (uid) => uid !== myId;

  const days = useMemo(() => {
    if (viewMode === 'day' || viewMode === 'team') return [anchorDate];
    if (viewMode === 'week') {
      const monday = startOfWeek(anchorDate);
      return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
    }
    // month: 6 тижнів сітки
    const first = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
    const gridStart = startOfWeek(first);
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [viewMode, anchorDate]);

  // Діапазон вибірки (team тягне весь тиждень для смуги завантаженості)
  const range = useMemo(() => {
    if (viewMode === 'team' || viewMode === 'week') {
      const monday = startOfWeek(anchorDate);
      return { from: monday, to: addDays(monday, 7) };
    }
    if (viewMode === 'day') return { from: anchorDate, to: addDays(anchorDate, 1) };
    return { from: days[0], to: addDays(days[days.length - 1], 1) };
  }, [viewMode, anchorDate, days]);

  // --- ЗАВАНТАЖЕННЯ ДАНИХ ---
  const fetchShares = useCallback(async () => {
    if (!myId) return;
    const [sharedRes, mineRes, usersRes, delegatedRes] = await Promise.all([
      supabase.from('planner_shares').select('owner_id, owner:users!planner_shares_owner_id_fkey(full_name)').eq('viewer_id', myId),
      supabase.from('planner_shares').select('id, viewer_id, viewer:users!planner_shares_viewer_id_fkey(full_name)').eq('owner_id', myId),
      supabase.from('users').select('id, full_name, role').eq('is_active', true).order('full_name'),
      supabase.from('planner_events')
        .select('id, title, event_type, start_at, end_at, status, assignee:users!planner_events_user_id_fkey(full_name)')
        .eq('delegated_by', myId)
        .neq('user_id', myId)
        .order('start_at', { ascending: false })
        .limit(50)
    ]);
    setSharedWithMe(sharedRes.data || []);
    setMyShares(mineRes.data || []);
    setAllUsers(usersRes.data || []);
    setMyDelegated(delegatedRes.data || []);
  }, [myId]);

  const fetchData = useCallback(async () => {
    if (!myId) return;
    setLoading(true);
    try {
      let query = supabase
        .from('planner_events')
        .select('*, deals(custom_id, title), linked_task:tasks(id, status, title), delegator:users!planner_events_delegated_by_fkey(full_name)')
        .gte('start_at', range.from.toISOString())
        .lt('start_at', range.to.toISOString())
        .order('start_at');

      if (viewMode === 'team') {
        // всі активні користувачі — маскування нижче на рендері
      } else {
        query = query.eq('user_id', viewUserId || myId);
      }

      const { data: evData, error } = await query;
      if (error) throw error;
      let loaded = evData || [];

      // Синхронізація: CRM-таска виконана → подія автоматично "виконана"
      if (isOwnView) {
        const toSync = loaded.filter(ev => ev.task_id && ev.linked_task?.status === 'Виконана' && ev.status === 'planned');
        if (toSync.length > 0) {
          await supabase.from('planner_events')
            .update({ status: 'done', updated_at: new Date().toISOString() })
            .in('id', toSync.map(e => e.id));
          loaded = loaded.map(ev => toSync.find(s => s.id === ev.id) ? { ...ev, status: 'done' } : ev);
        }
      }
      setEvents(loaded);

      if (isOwnView) {
        const { data: taskData } = await supabase
          .from('tasks')
          .select('id, title, deadline_at, status, deal_id, priority, deals(custom_id, title, status)')
          .eq('assignee_id', myId)
          .neq('status', 'Виконана')
          .order('deadline_at', { ascending: true, nullsFirst: false });
        setDealTasks((taskData || []).filter(t => !['Угоду програно', 'Клієнт на паузі'].includes(t.deals?.status)));
      } else {
        setDealTasks([]);
      }

      if (viewMode === 'team') {
        const { data: usersData } = await supabase.from('users').select('id, full_name, role').eq('is_active', true).order('full_name');
        setTeamUsers(usersData || []);
      }
    } catch (err) {
      console.error('Помилка завантаження планера:', err);
    } finally {
      setLoading(false);
    }
  }, [myId, viewMode, viewUserId, range.from.getTime(), range.to.getTime()]);

  useEffect(() => { fetchShares(); }, [fetchShares]);
  useEffect(() => { fetchData(); }, [fetchData]);

  // Закриття випадаючих елементів
  useEffect(() => {
    const close = (e) => {
      if (calendarPickerRef.current && !calendarPickerRef.current.contains(e.target)) setIsCalendarPickerOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const plannedTaskIds = useMemo(() => new Set(events.map(e => e.task_id).filter(Boolean)), [events]);
  const unplannedTasks = useMemo(
    () => dealTasks.filter(t => !plannedTaskIds.has(t.id)),
    [dealTasks, plannedTaskIds]
  );

  // --- CRUD подій ---
  const openCreateModal = (day, startMin = null, endMin = null, linkedTask = null) => {
    const d = day || new Date();
    const s = startMin ?? Math.max(START_HOUR, Math.min(new Date().getHours() + 1, END_HOUR - 1)) * 60;
    const e = endMin ?? Math.min(s + 60, END_HOUR * 60);
    setForm({
      ...emptyForm,
      date: toDateInput(d),
      start_time: minToTimeStr(s),
      end_time: minToTimeStr(e),
      title: linkedTask ? linkedTask.title : '',
      task_id: linkedTask?.id || null,
      deal_id: linkedTask?.deal_id || null,
      priority: linkedTask?.priority?.includes('🔴') ? 'urgent' : 'normal',
      linked_label: linkedTask?.deals ? `СЕС №${linkedTask.deals.custom_id} — ${linkedTask.deals.title || ''}` : null,
      assignee_id: myId
    });
    setIsModalOpen(true);
  };

  const openEditModal = (ev) => {
    const start = new Date(ev.start_at);
    const end = ev.end_at ? new Date(ev.end_at) : null;
    setForm({
      id: ev.id,
      title: ev.title,
      description: ev.description || '',
      event_type: ev.event_type,
      date: toDateInput(start),
      start_time: toTimeInput(start),
      end_time: end ? toTimeInput(end) : '',
      priority: ev.priority,
      can_disturb: ev.can_disturb,
      status: ev.status,
      location: ev.location || '',
      deal_id: ev.deal_id,
      task_id: ev.task_id,
      linked_label: ev.deals ? `СЕС №${ev.deals.custom_id} — ${ev.deals.title || ''}` : null,
      assignee_id: ev.user_id,
      orig_user_id: ev.user_id,
      orig_delegated_by: ev.delegated_by || null
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return alert('Вкажіть назву події.');

    const isReminder = form.event_type === 'reminder';
    const startAt = new Date(`${form.date}T${form.start_time || '09:00'}`);
    const endAt = !isReminder && form.end_time ? new Date(`${form.date}T${form.end_time}`) : null;
    if (endAt && endAt <= startAt) return alert('Час завершення має бути пізніше початку.');

    // Робочі години планера: 07:00–22:00. Поза ними ставити не можна.
    const startMin = startAt.getHours() * 60 + startAt.getMinutes();
    if (startMin < START_HOUR * 60 || startMin > (END_HOUR - 1) * 60) {
      return alert(`Початок події має бути в межах робочої сітки: ${String(START_HOUR).padStart(2, '0')}:00 – ${END_HOUR - 1}:00.`);
    }
    if (endAt) {
      const endMin = endAt.getHours() * 60 + endAt.getMinutes();
      if (endMin > END_HOUR * 60 || (endMin === 0 && endAt.getHours() === 0)) {
        return alert(`Завершення події має бути не пізніше ${END_HOUR}:00.`);
      }
    }

    // Делегування: подія лягає в календар виконавця, delegated_by — хто доручив
    const targetUserId = form.assignee_id || myId;
    let delegatedBy = null;
    if (form.id) {
      // При редагуванні зберігаємо історію доручення, якщо виконавець не змінився
      delegatedBy = targetUserId === form.orig_user_id
        ? form.orig_delegated_by
        : (targetUserId !== myId ? myId : null);
    } else {
      delegatedBy = targetUserId !== myId ? myId : null;
    }

    setIsSaving(true);
    try {
      const payload = {
        user_id: targetUserId,
        delegated_by: delegatedBy,
        title: form.title.trim(),
        description: form.description || null,
        event_type: form.event_type,
        start_at: startAt.toISOString(),
        end_at: endAt ? endAt.toISOString() : null,
        priority: form.priority,
        can_disturb: form.can_disturb,
        status: form.status,
        location: form.location || null,
        deal_id: form.deal_id,
        task_id: form.task_id,
        updated_at: new Date().toISOString()
      };

      const { error } = form.id
        ? await supabase.from('planner_events').update(payload).eq('id', form.id)
        : await supabase.from('planner_events').insert([payload]);
      if (error) throw error;

      setIsModalOpen(false);
      fetchData();
      fetchShares(); // оновлюємо список доручених
    } catch (err) {
      alert('Помилка збереження: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    if (!form.id) return;
    setConfirmDel({ kind: 'form-event', id: form.id, title: form.title });
  };

  // Єдина точка видалення після підтвердження у CRM-діалозі
  const executeConfirmDel = async () => {
    if (!confirmDel) return;
    const { error } = await supabase.from('planner_events').delete().eq('id', confirmDel.id);
    if (error) alert('Помилка видалення: ' + error.message);
    if (confirmDel.kind === 'form-event') setIsModalOpen(false);
    setConfirmDel(null);
    fetchData();
    fetchShares();
  };

  // Зміна статусу події (+ синк з CRM-таскою)
  const setEventStatus = async (ev, newStatus) => {
    const { error } = await supabase.from('planner_events')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', ev.id);
    if (error) return alert('Помилка: ' + error.message);
    setEvents(prev => prev.map(x => x.id === ev.id ? { ...x, status: newStatus } : x));

    // Подію виконано → пропонуємо закрити прив'язану CRM-таску
    if (newStatus === 'done' && ev.task_id && ev.linked_task?.status !== 'Виконана') {
      if (window.confirm(`Закрити також CRM-завдання "${ev.linked_task?.title || ev.title}" в угоді?`)) {
        const { error: taskErr } = await supabase.from('tasks')
          .update({ status: 'Виконана', completed_at: new Date(), assignee_id: myId })
          .eq('id', ev.task_id);
        if (!taskErr && ev.deal_id) {
          await supabase.from('deal_activity_log').insert([{
            deal_id: ev.deal_id, user_id: myId, entity_type: 'task',
            action: `Виконано завдання (з планера): ${ev.linked_task?.title || ev.title}`
          }]);
        }
        fetchData();
      }
    }
  };

  const rescheduleEvent = async (ev, addDaysCount) => {
    const newStart = addDays(new Date(ev.start_at), addDaysCount);
    newStart.setHours(new Date(ev.start_at).getHours(), new Date(ev.start_at).getMinutes());
    const newEnd = ev.end_at ? addDays(new Date(ev.end_at), addDaysCount) : null;
    const { error } = await supabase.from('planner_events')
      .update({ start_at: newStart.toISOString(), end_at: newEnd ? newEnd.toISOString() : null, status: 'planned', updated_at: new Date().toISOString() })
      .eq('id', ev.id);
    if (error) return alert('Помилка: ' + error.message);
    fetchData();
  };

  // --- ШЕРИНГ ---
  const handleAddShare = async () => {
    if (!shareSelectId) return;
    const { error } = await supabase.from('planner_shares').insert([{ owner_id: myId, viewer_id: shareSelectId }]);
    if (error && !error.message.includes('duplicate')) return alert('Помилка: ' + error.message);
    setShareSelectId('');
    fetchShares();
  };

  const handleRemoveShare = async (shareId) => {
    await supabase.from('planner_shares').delete().eq('id', shareId);
    fetchShares();
  };

  // --- DRAG & DROP ---
  const pointToSlot = (clientX, clientY) => {
    let dayIdx = null; let rect = null;
    Object.entries(dayColRefs.current).forEach(([idx, el]) => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right) { dayIdx = Number(idx); rect = r; }
    });
    if (dayIdx === null) return null;
    const y = clientY - rect.top;
    let minutes = START_HOUR * 60 + (y / HOUR_PX) * 60;
    minutes = Math.max(START_HOUR * 60, Math.min(END_HOUR * 60, Math.round(minutes / SNAP_MIN) * SNAP_MIN));
    return { dayIdx, minutes };
  };

  // Розрахунок прев'ю з координат вказівника (спільний для move та up)
  const computePreview = (d, clientX, clientY) => {
    const slot = pointToSlot(clientX, clientY);
    if (!slot) return null;

    if (d.mode === 'move') {
      let newStart = slot.minutes - d.grabOffsetMin;
      newStart = Math.round(newStart / SNAP_MIN) * SNAP_MIN;
      newStart = Math.max(START_HOUR * 60, Math.min(newStart, END_HOUR * 60 - d.durMin));
      return { mode: 'move', eventId: d.ev.id, dayIdx: slot.dayIdx, startMin: newStart, durMin: d.durMin };
    }
    if (d.mode === 'resize') {
      const newEnd = Math.max(d.startMin + SNAP_MIN, slot.minutes);
      return { mode: 'resize', eventId: d.ev.id, dayIdx: d.dayIdx, startMin: d.startMin, durMin: newEnd - d.startMin };
    }
    // create
    const a = Math.min(d.anchorMin, slot.minutes);
    const b = Math.max(d.anchorMin, slot.minutes);
    return { mode: 'create', dayIdx: d.dayIdx, startMin: a, durMin: Math.max(b - a, SNAP_MIN) };
  };

  const onDragMove = useCallback((e) => {
    const d = dragRef.current;
    if (!d) return;
    if (Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) > 6) d.moved = true;
    if (!d.moved) return;
    const preview = computePreview(d, e.clientX, e.clientY);
    if (preview) setDragPreview(preview);
  }, []);

  const onDragEnd = useCallback(async (e) => {
    const d = dragRef.current;
    dragRef.current = null;
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', onDragEnd);

    // Розраховуємо фінальну позицію з координат відпускання —
    // не покладаємось на state, який міг не встигнути оновитись
    const preview = d && d.moved ? (computePreview(d, e.clientX, e.clientY) || dragPreviewRef.current) : null;
    setDragPreview(null);

    if (!d) return;

    if (!d.moved) {
      // Клік без перетягування
      if (d.mode === 'create') {
        const slot = pointToSlot(e.clientX, e.clientY);
        if (slot) {
          const startMin = Math.floor(slot.minutes / 60) * 60;
          openCreateModal(daysRef.current[slot.dayIdx], startMin, Math.min(startMin + 60, END_HOUR * 60));
        }
      } else if (d.mode === 'move') {
        setCtxMenu({ x: e.clientX, y: e.clientY, ev: d.ev });
      }
      return;
    }

    suppressClickRef.current = true;
    setTimeout(() => { suppressClickRef.current = false; }, 100);

    if (!preview) return;

    if (preview.mode === 'create') {
      openCreateModal(daysRef.current[preview.dayIdx], preview.startMin, preview.startMin + preview.durMin);
      return;
    }

    // move / resize → запис у БД
    const day = daysRef.current[preview.dayIdx];
    const newStart = new Date(day);
    newStart.setHours(Math.floor(preview.startMin / 60), preview.startMin % 60, 0, 0);
    const newEnd = addMinutes(newStart, preview.durMin);

    const { error } = await supabase.from('planner_events')
      .update({ start_at: newStart.toISOString(), end_at: newEnd.toISOString(), updated_at: new Date().toISOString() })
      .eq('id', preview.eventId);
    if (error) alert('Помилка переміщення: ' + error.message);
    fetchData();
  }, [onDragMove, fetchData]);

  // Рефи для доступу з колбеків без переприв'язки
  const dragPreviewRef = useRef(null);
  useEffect(() => { dragPreviewRef.current = dragPreview; }, [dragPreview]);
  const daysRef = useRef(days);
  useEffect(() => { daysRef.current = days; }, [days]);

  const beginDrag = (e, mode, payload) => {
    if (!isOwnView) return;
    if (e.target.closest('button')) return;
    if (mode === 'create' && e.pointerType !== 'mouse') return; // на тачі — простий тап
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { mode, startX: e.clientX, startY: e.clientY, moved: false, ...payload };
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', onDragEnd);
  };

  // --- РОЗКЛАДКА ПОДІЙ ---
  const layoutDayEvents = (day, evList) => {
    const dayEvents = (evList || events)
      .filter(ev => !ev.all_day && isSameDay(new Date(ev.start_at), day))
      .sort((a, b) => new Date(a.start_at) - new Date(b.start_at));

    const lanes = [];
    const placed = dayEvents.map(ev => {
      const { startMin, durMin } = eventMinutes(ev);
      const start = Math.max(startMin, START_HOUR * 60);
      const end = Math.min(Math.max(startMin + durMin, start + 25), END_HOUR * 60);
      let lane = 0;
      while (lanes[lane] && lanes[lane] > start) lane++;
      lanes[lane] = end;
      return { ev, lane, top: (start - START_HOUR * 60) / 60 * HOUR_PX, height: Math.max((end - start) / 60 * HOUR_PX, 26) };
    });
    return { placed, laneCount: Math.max(lanes.length, 1) };
  };

  const deadlinesForDay = (day) =>
    dealTasks.filter(t => t.deadline_at && isSameDay(new Date(t.deadline_at), day));

  const navigate = (dir) => {
    if (viewMode === 'month') {
      setAnchorDate(prev => new Date(prev.getFullYear(), prev.getMonth() + dir, 1));
    } else {
      setAnchorDate(prev => addDays(prev, dir * (viewMode === 'week' ? 7 : 1)));
    }
  };

  const headerLabel = viewMode === 'month'
    ? anchorDate.toLocaleDateString('uk-UA', { month: 'long', year: 'numeric' })
    : viewMode === 'week'
      ? `${days[0].toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' })} — ${days[6].toLocaleDateString('uk-UA', { day: 'numeric', month: 'short', year: 'numeric' })}`
      : anchorDate.toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' });

  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
  const now = new Date();

  const viewedUserName = viewUserId ? (allUsers.find(u => u.id === viewUserId)?.full_name || 'Колега') : null;

  // Календарі, доступні для перегляду — ЛИШЕ ті, якими явно поділилися.
  // Загальну завантаженість команди керівництво дивиться в режимі "Команда".
  const viewableCalendars = useMemo(() => {
    return sharedWithMe.map(s => ({ id: s.owner_id, name: s.owner?.full_name || 'Колега', shared: true }));
  }, [sharedWithMe]);

  // --- КАРТКА ПОДІЇ ---
  const EventCard = ({ ev, top, height, lane, laneCount, masked, onCardClick }) => {
    const typeInfo = EVENT_TYPES[ev.event_type] || EVENT_TYPES.task;
    const prioInfo = PRIORITIES[ev.priority] || PRIORITIES.normal;
    const TypeIcon = typeInfo.icon;
    const isDone = ev.status === 'done';
    const isCancelled = ev.status === 'cancelled';
    const width = 100 / laneCount;
    const isDragging = dragPreview && dragPreview.eventId === ev.id;

    const cardStyle = masked
      ? 'bg-slate-100 border-slate-200 text-slate-500'
      : isCancelled ? 'bg-slate-50 border-slate-200 text-slate-400' : prioInfo.card;

    return (
      <div
        onPointerDown={masked ? undefined : (e) => {
          const { startMin, durMin } = eventMinutes(ev);
          const rect = e.currentTarget.getBoundingClientRect();
          const grabOffsetMin = ((e.clientY - rect.top) / HOUR_PX) * 60;
          beginDrag(e, 'move', { ev, durMin, grabOffsetMin: Math.round(grabOffsetMin / SNAP_MIN) * SNAP_MIN, startMin });
        }}
        onClick={masked ? undefined : (e) => { e.stopPropagation(); if (onCardClick) onCardClick(ev); }}
        title={masked
          ? `${ev.title}\n${typeInfo.label} · ${fmtTime(ev.start_at)}${ev.end_at ? ` – ${fmtTime(ev.end_at)}` : ''}${ev.status === 'done' ? '\n✓ Виконано' : ev.status === 'cancelled' ? '\n✕ Скасовано' : ''}`
          : `${ev.title}\n${fmtTime(ev.start_at)}${ev.end_at ? ` – ${fmtTime(ev.end_at)}` : ''}${ev.location ? `\n📍 ${ev.location}` : ''}${ev.description ? `\n${ev.description}` : ''}`}
        className={`absolute z-[15] rounded-lg border border-l-4 ${typeInfo.accent} ${cardStyle} shadow-sm px-1.5 py-1 overflow-hidden hover:shadow-md hover:z-20 transition-shadow select-none
          ${masked ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}
          ${isDone ? 'opacity-50' : ''} ${isCancelled ? 'opacity-60' : ''} ${isDragging ? 'opacity-30' : ''}`}
        style={{ top, height, left: `calc(${lane * width}% + 2px)`, width: `calc(${width}% - 4px)`, touchAction: masked ? 'auto' : 'none' }}
      >
        <div className="flex items-center gap-1 min-w-0 pointer-events-none">
          {masked && <FaLock size={8} className="shrink-0 opacity-50"/>}
          {isDone ? <FaCheckCircle size={10} className="text-emerald-500 shrink-0"/> :
           isCancelled ? <FaBan size={9} className="text-slate-400 shrink-0"/> : null}
          <TypeIcon size={9} className="shrink-0 opacity-60"/>
          <span className={`text-[10px] font-black truncate leading-tight ${isDone || isCancelled ? 'line-through' : ''}`}>
            {ev.title}
          </span>
          {!masked && ev.delegated_by && ev.delegator?.full_name && (
            <FaUserFriends size={9} className="shrink-0 text-indigo-400" title={`Доручено від: ${ev.delegator.full_name}`}/>
          )}
          {!ev.can_disturb && <FaBellSlash size={9} className="shrink-0 text-slate-400" title="Не турбувати"/>}
        </div>
        {height >= 40 && (
          <p className="text-[9px] font-bold opacity-60 leading-tight pointer-events-none">
            {fmtTime(ev.start_at)}{ev.end_at ? ` – ${fmtTime(ev.end_at)}` : ''}
            {masked ? ` · ${typeInfo.label}` : ev.deals?.custom_id ? ` · №${ev.deals.custom_id}` : ''}
          </p>
        )}
        {/* Ручка розтягування тривалості */}
        {!masked && !isDone && !isCancelled && height >= 36 && (
          <div
            onPointerDown={(e) => {
              const { startMin } = eventMinutes(ev);
              const dayIdx = daysRef.current.findIndex(dd => isSameDay(dd, new Date(ev.start_at)));
              beginDrag(e, 'resize', { ev, startMin, dayIdx });
            }}
            className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-slate-900/10"
            style={{ touchAction: 'none' }}
          />
        )}
      </div>
    );
  };

  // Прев'ю перетягування
  const DragGhost = ({ dayIdx }) => {
    if (!dragPreview || dragPreview.dayIdx !== dayIdx) return null;
    const top = (dragPreview.startMin - START_HOUR * 60) / 60 * HOUR_PX;
    const height = Math.max(dragPreview.durMin / 60 * HOUR_PX, 20);
    return (
      <div
        className="absolute left-0.5 right-0.5 z-30 rounded-lg border-2 border-dashed border-amber-500 bg-amber-100/60 pointer-events-none flex items-start justify-center"
        style={{ top, height }}
      >
        <span className="text-[9px] font-black text-amber-700 mt-0.5">
          {minToTimeStr(dragPreview.startMin)} – {minToTimeStr(dragPreview.startMin + dragPreview.durMin)}
        </span>
      </div>
    );
  };

  // --- КОЛОНКА ДНЯ (тижневий/денний режим) ---
  const renderDayColumn = (day, dayIdx, evList, masked = false) => {
    const { placed, laneCount } = layoutDayEvents(day, evList);
    const isToday = isSameDay(day, now);
    const nowOffset = (now.getHours() * 60 + now.getMinutes() - START_HOUR * 60) / 60 * HOUR_PX;
    return (
      <div
        key={dayIdx}
        ref={el => { dayColRefs.current[dayIdx] = el; }}
        className={`relative border-l border-slate-200 ${isToday ? 'bg-amber-50/70' : ''}`}
        onPointerDown={masked ? undefined : (e) => {
          if (e.target !== e.currentTarget && !e.target.dataset?.slot) return;
          const slot = pointToSlot(e.clientX, e.clientY);
          if (slot) beginDrag(e, 'create', { anchorMin: slot.minutes, dayIdx: slot.dayIdx });
        }}
      >
        {hours.map(h => (
          <div key={h} data-slot="1" style={{ height: HOUR_PX }}
            className={`border-b border-slate-100 transition-colors ${masked ? '' : 'hover:bg-amber-100/70 cursor-pointer'}`}
            onClick={masked ? undefined : (e) => {
              if (suppressClickRef.current || dragRef.current) return;
              e.stopPropagation();
            }}
          />
        ))}

        {isToday && nowOffset >= 0 && nowOffset <= (END_HOUR - START_HOUR) * HOUR_PX && (
          <div className="absolute left-0 right-0 z-10 pointer-events-none" style={{ top: nowOffset }}>
            <div className="h-[2px] bg-rose-500/70"></div>
          </div>
        )}

        {!masked && isOwnView && deadlinesForDay(day).map(t => {
          const d = new Date(t.deadline_at);
          const min = d.getHours() * 60 + d.getMinutes();
          if (min < START_HOUR * 60 || min > END_HOUR * 60) return null;
          return (
            <div key={t.id} className="absolute left-0.5 right-0.5 z-10 pointer-events-none" style={{ top: (min - START_HOUR * 60) / 60 * HOUR_PX }}>
              <div className="border-t-2 border-dashed border-rose-400"></div>
              <span className="text-[8px] font-black text-rose-500 uppercase bg-white/80 px-1 rounded truncate inline-block max-w-full">
                {fmtTime(t.deadline_at)} Дедлайн: {t.title}
              </span>
            </div>
          );
        })}

        {placed.map(({ ev, lane, top, height }) => (
          <EventCard key={ev.id} ev={ev} top={top} height={height} lane={lane} laneCount={laneCount} masked={masked}/>
        ))}

        <DragGhost dayIdx={dayIdx}/>
      </div>
    );
  };

  // --- МІСЯЧНИЙ РЕЖИМ ---
  const renderMonthView = () => {
    const weeks = [];
    for (let i = 0; i < 42; i += 7) weeks.push(days.slice(i, i + 7));
    return (
      <div className="p-3 md:p-4">
        <div className="grid grid-cols-7 mb-1">
          {DAY_NAMES.map(n => <div key={n} className="text-center text-[9px] font-black text-slate-400 uppercase tracking-widest py-1">{n}</div>)}
        </div>
        <div className="grid grid-cols-7 border-t border-l border-slate-200 rounded-xl overflow-hidden bg-white">
          {weeks.flat().map((day, i) => {
            const inMonth = day.getMonth() === anchorDate.getMonth();
            const isToday = isSameDay(day, now);
            const dayEvents = events
              .filter(ev => isSameDay(new Date(ev.start_at), day))
              .sort((a, b) => new Date(a.start_at) - new Date(b.start_at));
            const deadlines = isOwnView ? deadlinesForDay(day) : [];
            const masked = !isOwnView;
            return (
              <div key={i}
                onClick={() => { setAnchorDate(startOfDay(day)); setViewMode('day'); }}
                className={`min-h-[92px] md:min-h-[110px] border-r border-b border-slate-100 p-1.5 cursor-pointer transition-colors hover:bg-amber-50/50
                  ${inMonth ? 'bg-white' : 'bg-slate-50/70'} ${isToday ? 'bg-amber-50' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-[11px] font-black ${isToday ? 'bg-amber-500 text-white w-5 h-5 rounded-full flex items-center justify-center' : inMonth ? 'text-slate-700' : 'text-slate-300'}`}>
                    {day.getDate()}
                  </span>
                  {deadlines.length > 0 && (
                    <span className="text-[8px] font-black text-rose-500 flex items-center gap-0.5"><FaExclamationTriangle size={7}/>{deadlines.length}</span>
                  )}
                </div>
                <div className="mt-1 space-y-0.5">
                  {dayEvents.slice(0, 3).map(ev => {
                    const prio = PRIORITIES[ev.priority] || PRIORITIES.normal;
                    const isDoneEv = ev.status === 'done';
                    const isCancEv = ev.status === 'cancelled';
                    const typeInfo = EVENT_TYPES[ev.event_type] || EVENT_TYPES.task;
                    return (
                      <div key={ev.id} className="flex items-center gap-1 min-w-0">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isDoneEv ? 'bg-emerald-400' : isCancEv ? 'bg-slate-300' : prio.dot}`}></span>
                        <span className={`text-[8px] font-bold truncate ${isDoneEv || isCancEv ? 'line-through text-slate-400' : 'text-slate-600'}`}>
                          {fmtTime(ev.start_at)} {ev.title}
                        </span>
                      </div>
                    );
                  })}
                  {dayEvents.length > 3 && (
                    <span className="text-[8px] font-black text-slate-400">+{dayEvents.length - 3} ще</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // --- РЕЖИМ КОМАНДИ ---
  const renderTeamView = () => {
    const weekDays = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchorDate), i));
    const eventsByUser = {};
    events.forEach(ev => {
      if (!eventsByUser[ev.user_id]) eventsByUser[ev.user_id] = [];
      eventsByUser[ev.user_id].push(ev);
    });

    const hoursForUserDay = (uid, day) => {
      return (eventsByUser[uid] || [])
        .filter(ev => isSameDay(new Date(ev.start_at), day) && ev.status !== 'cancelled')
        .reduce((sum, ev) => sum + eventMinutes(ev).durMin, 0) / 60;
    };

    return (
      <div className="min-w-[760px]">
        <div className="grid sticky top-0 bg-white z-20 border-b border-slate-200 shadow-sm"
          style={{ gridTemplateColumns: `56px repeat(${teamUsers.length}, minmax(150px, 1fr))` }}>
          <div></div>
          {teamUsers.map(u => {
            const todayHours = hoursForUserDay(u.id, anchorDate);
            return (
              <div key={u.id} className={`py-2.5 px-2 border-l border-slate-100 ${u.id === myId ? 'bg-amber-50/70' : ''}`}>
                <p className="text-[10px] font-black text-slate-800 truncate text-center">{u.full_name}</p>
                <p className="text-[8px] font-bold text-slate-400 uppercase text-center truncate">{u.role}</p>
                <p className={`text-[9px] font-black text-center mt-0.5 ${todayHours >= 8 ? 'text-rose-500' : todayHours >= 5 ? 'text-amber-600' : 'text-emerald-600'}`}>
                  {todayHours.toFixed(1).replace('.0', '')} год сьогодні
                </p>
                {/* Теплова смуга тижня */}
                <div className="flex gap-0.5 mt-1.5 justify-center" title="Завантаженість по днях тижня (Пн–Нд)">
                  {weekDays.map((wd, i) => {
                    const h = hoursForUserDay(u.id, wd);
                    const intensity = h === 0 ? 'bg-slate-100' : h < 3 ? 'bg-emerald-200' : h < 6 ? 'bg-amber-300' : 'bg-rose-400';
                    return (
                      <div key={i}
                        onClick={() => setAnchorDate(startOfDay(wd))}
                        title={`${DAY_NAMES[i]}: ${h.toFixed(1)} год`}
                        className={`w-4 h-3 rounded-sm cursor-pointer border ${isSameDay(wd, anchorDate) ? 'border-slate-700' : 'border-transparent'} ${intensity}`}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid" style={{ gridTemplateColumns: `56px repeat(${teamUsers.length}, minmax(150px, 1fr))` }}>
          <div>
            {hours.map(h => (
              <div key={h} style={{ height: HOUR_PX }} className={`text-right pr-2 text-[11px] font-black text-slate-500 ${h === START_HOUR ? 'pt-0.5' : '-translate-y-2'}`}>
                {String(h).padStart(2, '0')}<span className="text-[8px] text-slate-400">:00</span>
              </div>
            ))}
          </div>
          {teamUsers.map(u => {
            const userDayEvents = (eventsByUser[u.id] || []).filter(ev => isSameDay(new Date(ev.start_at), anchorDate));
            const { placed, laneCount } = layoutDayEvents(anchorDate, userDayEvents);
            const masked = isMaskedUser(u.id);
            return (
              <div key={u.id} className={`relative border-l border-slate-200 ${u.id === myId ? 'bg-amber-50/50' : ''}`}>
                {hours.map(h => <div key={h} style={{ height: HOUR_PX }} className="border-b border-slate-100"/>)}
                {placed.map(({ ev, lane, top, height }) => (
                  <EventCard key={ev.id} ev={ev} top={top} height={height} lane={lane} laneCount={laneCount} masked={masked}
                    onCardClick={masked ? undefined : openEditModal}/>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-slate-100 overflow-hidden">

      {/* ХЕДЕР: два стабільні рядки — заголовок і панель інструментів */}
      <div className="bg-white border-b border-slate-200 shrink-0 shadow-sm z-40">

        {/* Рядок 1: назва + дата | навігація по датах + нова подія */}
        <div className="px-4 md:px-6 pt-3 pb-2.5 flex flex-wrap justify-between items-center gap-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-slate-900 text-amber-500 rounded-xl shadow-md"><FaCalendarAlt size={18}/></div>
            <div>
              <h1 className="text-lg md:text-xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                Планер
                {viewUserId && (
                  <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-1 rounded-lg border border-indigo-200 flex items-center gap-1.5 normal-case tracking-normal">
                    <FaLock size={9}/> {viewedUserName}
                  </span>
                )}
              </h1>
              <p className="text-[10px] md:text-xs text-slate-500 font-bold uppercase tracking-wider capitalize">{headerLabel}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <button onClick={() => navigate(-1)} className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-colors"><FaChevronLeft size={12}/></button>
              <button onClick={() => setAnchorDate(startOfDay(new Date()))} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors">Сьогодні</button>
              <button onClick={() => navigate(1)} className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-colors"><FaChevronRight size={12}/></button>
            </div>
            {isOwnView && (
              <button onClick={() => openCreateModal(anchorDate)}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 shadow-md active:scale-95">
                <FaPlus size={11}/> Подія
              </button>
            )}
          </div>
        </div>

        {/* Рядок 2: вибір календаря, режими, доступи, доручені, завдання */}
        <div className="px-4 md:px-6 py-2.5 flex flex-wrap items-center gap-2">
          {/* Перемикач календаря */}
          <div className="relative" ref={calendarPickerRef}>
            <button onClick={() => setIsCalendarPickerOpen(p => !p)}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 border ${viewUserId ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'}`}>
              <FaUserFriends size={11}/> {viewUserId ? viewedUserName : 'Мій календар'} <FaChevronDown size={8}/>
            </button>
            {isCalendarPickerOpen && (
              <div className="absolute z-[80] top-full left-0 mt-2 w-64 bg-white border border-slate-200 rounded-xl shadow-2xl max-h-72 overflow-y-auto custom-scrollbar">
                <div onClick={() => { setViewUserId(null); setIsCalendarPickerOpen(false); if (viewMode === 'team') setViewMode('week'); }}
                  className={`px-4 py-3 text-xs font-bold cursor-pointer border-b border-slate-50 hover:bg-amber-50 ${!viewUserId ? 'text-amber-600' : 'text-slate-700'}`}>
                  Мій календар
                </div>
                {viewableCalendars.length === 0 && (
                  <p className="px-4 py-3 text-[10px] font-bold text-slate-400">Ніхто ще не поділився з вами календарем</p>
                )}
                {viewableCalendars.map(c => (
                  <div key={c.id} onClick={() => { setViewUserId(c.id); setIsCalendarPickerOpen(false); if (viewMode === 'team') setViewMode('week'); }}
                    className={`px-4 py-3 text-xs font-bold cursor-pointer border-b border-slate-50 last:border-0 hover:bg-amber-50 flex items-center justify-between gap-2 ${viewUserId === c.id ? 'text-amber-600' : 'text-slate-700'}`}>
                    <span className="truncate">{c.name}</span>
                    <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded shrink-0 bg-emerald-50 text-emerald-600">
                      Відкрито вам
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
            {[['day', 'День'], ['week', 'Тиждень'], ['month', 'Місяць'], ...(isManagement ? [['team', 'Команда']] : [])].map(([mode, label]) => (
              <button key={mode}
                onClick={() => { setViewMode(mode); if (mode === 'team') setViewUserId(null); }}
                className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${viewMode === mode ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
                {label}
              </button>
            ))}
          </div>

          {isOwnView && (
            <>
              <div className="w-px h-6 bg-slate-200 mx-1 hidden sm:block"></div>

              <button onClick={() => setIsShareModalOpen(true)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 border border-slate-200"
                title="Надати колегам перегляд вашого календаря">
                <FaShareAlt size={11}/> Доступ {myShares.length > 0 && <span className="bg-emerald-500 text-white px-1.5 py-0.5 rounded-full text-[9px]">{myShares.length}</span>}
              </button>

              {myDelegated.length > 0 && (
                <button onClick={() => { fetchShares(); setIsDelegatedOpen(true); }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 border border-slate-200"
                  title="Події, які ви доручили колегам">
                  <FaUserFriends size={11}/> Доручені
                  {myDelegated.filter(d => d.status === 'planned').length > 0 && (
                    <span className="bg-indigo-500 text-white px-1.5 py-0.5 rounded-full text-[9px]">{myDelegated.filter(d => d.status === 'planned').length}</span>
                  )}
                </button>
              )}

              <button onClick={() => setIsTasksPanelOpen(p => !p)}
                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 border ${isTasksPanelOpen ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'}`}>
                <FaListUl size={11}/> Завдання
                {unplannedTasks.length > 0 && <span className="bg-rose-500 text-white px-1.5 py-0.5 rounded-full text-[9px]">{unplannedTasks.length}</span>}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">

        {/* ОСНОВНА ОБЛАСТЬ */}
        <div className="flex-1 overflow-auto custom-scrollbar bg-white">
          {loading ? (
            <div className="p-10 text-center font-black text-slate-400 uppercase text-xs animate-pulse">Завантаження...</div>
          ) : viewMode === 'month' ? (
            renderMonthView()
          ) : viewMode === 'team' ? (
            renderTeamView()
          ) : (
            <div className="min-w-[640px]">
              {/* Шапка днів */}
              <div className="grid sticky top-0 bg-white z-20 border-b border-slate-200 shadow-sm"
                style={{ gridTemplateColumns: `56px repeat(${days.length}, 1fr)` }}>
                <div></div>
                {days.map(day => {
                  const isToday = isSameDay(day, now);
                  const deadlines = isOwnView ? deadlinesForDay(day) : [];
                  return (
                    <div key={day.toISOString()}
                      onClick={() => { setAnchorDate(startOfDay(day)); setViewMode('day'); }}
                      className={`py-2.5 px-2 text-center border-l border-slate-200 cursor-pointer hover:bg-amber-50/60 transition-colors ${isToday ? 'bg-amber-100/80' : ''}`}>
                      <p className={`text-[9px] font-black uppercase tracking-widest ${isToday ? 'text-amber-600' : 'text-slate-400'}`}>
                        {DAY_NAMES[(day.getDay() + 6) % 7]}
                      </p>
                      <p className={`text-lg font-black leading-tight ${isToday ? 'text-amber-600' : 'text-slate-800'}`}>{day.getDate()}</p>
                      {deadlines.length > 0 && (
                        <p className="text-[8px] font-black text-rose-500 uppercase flex items-center justify-center gap-1">
                          <FaExclamationTriangle size={8}/> {deadlines.length} дедлайн(и)
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Тіло сітки */}
              <div className="grid" style={{ gridTemplateColumns: `56px repeat(${days.length}, 1fr)` }}>
                <div>
                  {hours.map(h => (
                    <div key={h} style={{ height: HOUR_PX }} className="text-right pr-2 text-[9px] font-black text-slate-300 uppercase -translate-y-1.5">
                      {String(h).padStart(2, '0')}:00
                    </div>
                  ))}
                </div>
                {days.map((day, dayIdx) => renderDayColumn(day, dayIdx, null, !isOwnView))}
              </div>
            </div>
          )}
        </div>

        {/* ПАНЕЛЬ: ЗАВДАННЯ З УГОД */}
        {isTasksPanelOpen && isOwnView && (
          <div className="w-80 shrink-0 border-l border-slate-200 bg-slate-50 overflow-y-auto custom-scrollbar animate-fade-in hidden md:block">
            <div className="p-4 border-b border-slate-200 bg-white sticky top-0 z-10">
              <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <FaTasks className="text-amber-500"/> Мої відкриті завдання
              </h3>
              <p className="text-[9px] font-bold text-slate-400 mt-1">«У план» — виділити час у календарі. Прострочені зверху.</p>
            </div>
            <div className="p-3 space-y-2">
              {unplannedTasks.length === 0 ? (
                <p className="text-center text-[10px] font-black text-slate-400 uppercase py-8">Все заплановано 🎉</p>
              ) : [...unplannedTasks].sort((a, b) => {
                const aOver = a.deadline_at && new Date(a.deadline_at) < now;
                const bOver = b.deadline_at && new Date(b.deadline_at) < now;
                if (aOver !== bOver) return aOver ? -1 : 1;
                return new Date(a.deadline_at || '2099-01-01') - new Date(b.deadline_at || '2099-01-01');
              }).map(t => {
                const overdue = t.deadline_at && new Date(t.deadline_at) < now;
                return (
                  <div key={t.id} className={`bg-white border rounded-xl p-3 shadow-sm ${overdue ? 'border-rose-300 ring-2 ring-rose-500/10' : 'border-slate-200'}`}>
                    <p className="text-xs font-bold text-slate-800 leading-snug">{t.title}</p>
                    <div className="flex items-center justify-between mt-2 gap-2">
                      <div className="min-w-0">
                        {t.deals && <p className="text-[9px] font-black text-slate-400 uppercase truncate">СЕС №{t.deals.custom_id} · {t.deals.title}</p>}
                        {t.deadline_at && (
                          <p className={`text-[9px] font-black uppercase flex items-center gap-1 ${overdue ? 'text-rose-500' : 'text-slate-400'}`}>
                            <FaClock size={8}/> {overdue ? 'Прострочено: ' : ''}{new Date(t.deadline_at).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          const base = t.deadline_at && new Date(t.deadline_at) > now ? new Date(t.deadline_at) : now;
                          const h = Math.min(Math.max(base.getHours(), START_HOUR), END_HOUR - 1);
                          openCreateModal(startOfDay(base < now ? now : base), h * 60, (h + 1) * 60, t);
                        }}
                        className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[9px] font-black uppercase tracking-widest transition-colors shrink-0">
                        У план
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* КОНТЕКСТНЕ МЕНЮ ПОДІЇ */}
      {ctxMenu && (
        <>
          <div className="fixed inset-0 z-[140]" onClick={() => setCtxMenu(null)} onContextMenu={(e) => { e.preventDefault(); setCtxMenu(null); }}/>
          <div className="fixed z-[150] w-56 bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden animate-fade-in"
            style={{ top: Math.min(ctxMenu.y, window.innerHeight - 320), left: Math.min(ctxMenu.x, window.innerWidth - 240) }}>
            <div className="px-4 py-3 bg-slate-900 text-white">
              <p className="text-[10px] font-black uppercase tracking-widest truncate">{ctxMenu.ev.title}</p>
              <p className="text-[9px] font-bold text-slate-400 mt-0.5">{fmtTime(ctxMenu.ev.start_at)}{ctxMenu.ev.end_at ? ` – ${fmtTime(ctxMenu.ev.end_at)}` : ''}</p>
            </div>
            <div className="py-1">
              {ctxMenu.ev.status !== 'done' ? (
                <button onClick={() => { setEventStatus(ctxMenu.ev, 'done'); setCtxMenu(null); }}
                  className="w-full px-4 py-2.5 text-left text-xs font-bold text-emerald-600 hover:bg-emerald-50 flex items-center gap-2.5 transition-colors">
                  <FaCheckCircle size={12}/> Виконано
                </button>
              ) : (
                <button onClick={() => { setEventStatus(ctxMenu.ev, 'planned'); setCtxMenu(null); }}
                  className="w-full px-4 py-2.5 text-left text-xs font-bold text-slate-600 hover:bg-slate-50 flex items-center gap-2.5 transition-colors">
                  <FaClock size={12}/> Повернути в план
                </button>
              )}
              {ctxMenu.ev.status !== 'cancelled' ? (
                <button onClick={() => { setEventStatus(ctxMenu.ev, 'cancelled'); setCtxMenu(null); }}
                  className="w-full px-4 py-2.5 text-left text-xs font-bold text-slate-500 hover:bg-slate-50 flex items-center gap-2.5 transition-colors">
                  <FaBan size={12}/> Скасовано
                </button>
              ) : (
                <button onClick={() => { setEventStatus(ctxMenu.ev, 'planned'); setCtxMenu(null); }}
                  className="w-full px-4 py-2.5 text-left text-xs font-bold text-slate-600 hover:bg-slate-50 flex items-center gap-2.5 transition-colors">
                  <FaClock size={12}/> Відновити
                </button>
              )}
              <button onClick={() => { rescheduleEvent(ctxMenu.ev, 1); setCtxMenu(null); }}
                className="w-full px-4 py-2.5 text-left text-xs font-bold text-sky-600 hover:bg-sky-50 flex items-center gap-2.5 transition-colors">
                <FaArrowRight size={12}/> Перенести на завтра
              </button>
              <button onClick={() => { openEditModal(ctxMenu.ev); setCtxMenu(null); }}
                className="w-full px-4 py-2.5 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 transition-colors border-t border-slate-100">
                <FaEdit size={12}/> Редагувати
              </button>
              <button onClick={() => {
                  setConfirmDel({ kind: 'event', id: ctxMenu.ev.id, title: ctxMenu.ev.title });
                  setCtxMenu(null);
                }}
                className="w-full px-4 py-2.5 text-left text-xs font-bold text-rose-500 hover:bg-rose-50 flex items-center gap-2.5 transition-colors">
                <FaTrash size={12}/> Видалити
              </button>
            </div>
          </div>
        </>
      )}

      {/* МОДАЛКА ШЕРИНГУ */}
      {isShareModalOpen && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden">
            <div className="p-6 border-b border-slate-100 bg-slate-900 text-white flex justify-between items-center">
              <div>
                <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                  <FaShareAlt className="text-amber-400"/> Доступ до календаря
                </h3>
                <p className="text-[10px] font-medium mt-1 text-slate-400">Колеги побачать лише тип події та час — без назв і деталей</p>
              </div>
              <button onClick={() => setIsShareModalOpen(false)} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"><FaTimes size={16}/></button>
            </div>

            <div className="p-6 space-y-5 bg-slate-50/50">
              <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Кому відкрити перегляд?
                </label>
                <select value={shareSelectId} onChange={e => setShareSelectId(e.target.value)}
                  className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-amber-500 cursor-pointer">
                  <option value="">Оберіть співробітника...</option>
                  {allUsers.filter(u => u.id !== myId && !myShares.find(s => s.viewer_id === u.id)).map(u => (
                    <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>
                  ))}
                </select>
                <button onClick={handleAddShare} disabled={!shareSelectId}
                  className="w-full py-3.5 bg-amber-400 hover:bg-amber-500 disabled:bg-slate-200 disabled:text-slate-400 text-slate-900 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-md shadow-amber-400/30 flex items-center justify-center gap-2 active:scale-95">
                  <FaPlus size={11}/> Надати доступ
                </button>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Мають доступ ({myShares.length})</p>
                {myShares.length === 0 ? (
                  <p className="text-center text-[10px] font-bold text-slate-400 py-6 bg-white border-2 border-dashed border-slate-200 rounded-xl">
                    Ви ще нікому не відкривали календар
                  </p>
                ) : myShares.map(s => (
                  <div key={s.id} className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
                    <span className="text-xs font-bold text-slate-800">{s.viewer?.full_name || 'Співробітник'}</span>
                    <button onClick={() => handleRemoveShare(s.id)}
                      className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors" title="Забрати доступ">
                      <FaTimes size={12}/>
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-white">
              <button onClick={() => setIsShareModalOpen(false)}
                className="w-full py-3 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors">
                Закрити
              </button>
            </div>
          </div>
        </div>
      )}

      {/* МОДАЛКА: ДОРУЧЕНІ МНОЮ ПОДІЇ */}
      {isDelegatedOpen && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden max-h-[85vh]">
            <div className="p-6 border-b border-slate-100 bg-slate-900 text-white flex justify-between items-center shrink-0">
              <div>
                <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                  <FaUserFriends className="text-amber-400"/> Доручені події
                </h3>
                <p className="text-[10px] font-medium mt-1 text-slate-400">Що ви делегували колегам і в якому це статусі</p>
              </div>
              <button onClick={() => setIsDelegatedOpen(false)} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"><FaTimes size={16}/></button>
            </div>

            <div className="p-4 space-y-2 bg-slate-50/50 overflow-y-auto custom-scrollbar flex-1">
              {myDelegated.length === 0 ? (
                <p className="text-center text-[10px] font-black text-slate-400 uppercase py-10">Ви ще нічого не доручали</p>
              ) : myDelegated.map(d => {
                const typeInfo = EVENT_TYPES[d.event_type] || EVENT_TYPES.task;
                const TypeIcon = typeInfo.icon;
                const statusChip = d.status === 'done'
                  ? { label: 'Виконано', cls: 'bg-emerald-50 text-emerald-600 border-emerald-200' }
                  : d.status === 'cancelled'
                    ? { label: 'Скасовано', cls: 'bg-slate-100 text-slate-500 border-slate-200' }
                    : { label: 'В плані', cls: 'bg-sky-50 text-sky-600 border-sky-200' };
                return (
                  <div key={d.id} className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm flex items-center gap-3">
                    <TypeIcon size={14} className="text-slate-400 shrink-0"/>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-bold text-slate-800 truncate ${d.status !== 'planned' ? 'line-through opacity-60' : ''}`}>{d.title}</p>
                      <p className="text-[9px] font-bold text-slate-400 mt-0.5">
                        <FaUserTie className="inline mb-0.5 mr-1" size={8}/>{d.assignee?.full_name || 'Колега'}
                        {' · '}{new Date(d.start_at).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        {d.end_at ? ` – ${fmtTime(d.end_at)}` : ''}
                      </p>
                    </div>
                    <span className={`text-[9px] font-black uppercase px-2 py-1 rounded-lg border shrink-0 ${statusChip.cls}`}>{statusChip.label}</span>
                    {d.status === 'planned' && (
                      <button
                        onClick={() => setConfirmDel({ kind: 'delegation', id: d.id, title: d.title })}
                        className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors shrink-0" title="Скасувати доручення">
                        <FaTrash size={11}/>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="p-4 border-t border-slate-100 bg-white shrink-0">
              <button onClick={() => setIsDelegatedOpen(false)}
                className="w-full py-3 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors">
                Закрити
              </button>
            </div>
          </div>
        </div>
      )}

      {/* МОДАЛКА ПОДІЇ */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in overflow-y-auto custom-scrollbar">
          <form onSubmit={handleSave} className="bg-white rounded-3xl shadow-2xl w-full max-w-lg flex flex-col my-auto overflow-hidden">
            <div className="p-6 border-b border-slate-100 bg-slate-900 text-white flex justify-between items-center shrink-0">
              <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                <FaCalendarAlt className="text-amber-400"/> {form.id ? 'Редагувати подію' : 'Нова подія'}
              </h3>
              <button type="button" onClick={() => setIsModalOpen(false)} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"><FaTimes size={16}/></button>
            </div>

            <div className="p-6 space-y-4 bg-slate-50/50 max-h-[70vh] overflow-y-auto custom-scrollbar">
              {form.linked_label && (
                <div className="bg-sky-50 border border-sky-200 rounded-xl px-4 py-2.5 flex items-center gap-2 text-xs font-bold text-sky-700">
                  <FaLink size={10}/> Прив'язано: {form.linked_label}
                </div>
              )}

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Назва *</label>
                <input autoFocus type="text" value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                  placeholder="Напр: дзвінок клієнту, планерка, виїзд..."
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-amber-500 transition-colors"/>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Тип події</label>
                <div className="grid grid-cols-5 gap-1.5">
                  {Object.entries(EVENT_TYPES).map(([key, info]) => {
                    const Icon = info.icon;
                    return (
                      <button key={key} type="button"
                        onClick={() => setForm({ ...form, event_type: key, end_time: key === 'reminder' ? '' : form.end_time })}
                        className={`py-2.5 rounded-xl text-[8px] font-black uppercase flex flex-col items-center gap-1.5 border transition-all ${form.event_type === key ? 'bg-slate-900 text-white border-slate-900 shadow-md' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}>
                        <Icon size={13}/> {info.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ВИКОНАВЕЦЬ: своя подія або доручення колезі */}
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Виконавець</label>
                <select
                  value={form.assignee_id || myId || ''}
                  onChange={e => setForm({ ...form, assignee_id: e.target.value })}
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-amber-500 cursor-pointer"
                >
                  <option value={myId}>Я ({employeeProfile?.full_name})</option>
                  {allUsers.filter(u => u.id !== myId).map(u => (
                    <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>
                  ))}
                </select>
                {form.assignee_id && form.assignee_id !== myId && (
                  <p className="text-[9px] font-bold text-indigo-500 mt-1.5 ml-1 flex items-center gap-1.5">
                    <FaUserFriends size={9}/> Подія з'явиться в календарі колеги. Статус виконання ви побачите в «Доручені».
                  </p>
                )}
              </div>

              <div className={`grid gap-3 ${form.event_type === 'reminder' ? 'grid-cols-2' : 'grid-cols-3'}`}>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Дата *</label>
                  <input type="date" required value={form.date} onChange={e => setForm({ ...form, date: e.target.value })}
                    className="w-full px-3 py-3 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-amber-500 cursor-pointer"/>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">
                    {form.event_type === 'reminder' ? 'Час нагадування *' : 'Початок *'}
                  </label>
                  <input type="time" required value={form.start_time}
                    min={`${String(START_HOUR).padStart(2, '0')}:00`} max={`${END_HOUR - 1}:00`}
                    onChange={e => setForm({ ...form, start_time: e.target.value })}
                    className="w-full px-3 py-3 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-amber-500 cursor-pointer"/>
                </div>
                {form.event_type !== 'reminder' && (
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Кінець</label>
                    <input type="time" value={form.end_time}
                      min={`${String(START_HOUR).padStart(2, '0')}:15`} max={`${END_HOUR}:00`}
                      onChange={e => setForm({ ...form, end_time: e.target.value })}
                      className="w-full px-3 py-3 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-amber-500 cursor-pointer"/>
                  </div>
                )}
              </div>
              <p className="text-[9px] font-bold text-slate-400 -mt-2 ml-1">
                Робоча сітка планера: {String(START_HOUR).padStart(2, '0')}:00 – {END_HOUR}:00.
                {form.event_type === 'reminder' ? ' Нагадування — коротка позначка в часі, без тривалості.' : ''}
              </p>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Пріоритет / Терміновість</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {Object.entries(PRIORITIES).map(([key, info]) => (
                    <button key={key} type="button" onClick={() => setForm({ ...form, priority: key })}
                      className={`py-2.5 rounded-xl text-[9px] font-black uppercase border transition-all ${form.priority === key ? `${info.chip} ring-2 ring-offset-1 ring-slate-300` : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'}`}>
                      {info.label}
                    </button>
                  ))}
                </div>
              </div>

              <button type="button" onClick={() => setForm({ ...form, can_disturb: !form.can_disturb })}
                className={`w-full py-3 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 border transition-all ${form.can_disturb ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-slate-900 text-white border-slate-900'}`}>
                {form.can_disturb ? <><FaBell size={12}/> Можна турбувати</> : <><FaBellSlash size={12}/> Не турбувати</>}
              </button>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Місце / посилання</label>
                <input type="text" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })}
                  placeholder="Офіс, адреса об'єкта, Zoom..."
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-amber-500 transition-colors"/>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Опис / нотатки</label>
                <textarea rows="2" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                  placeholder="Деталі події..."
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-amber-500 resize-none transition-colors"/>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 flex gap-3 bg-white shrink-0">
              {form.id && (
                <button type="button" onClick={handleDelete}
                  className="px-4 py-3 text-rose-500 hover:bg-rose-50 rounded-xl text-xs font-black uppercase tracking-widest transition-colors flex items-center gap-2">
                  <FaTrash size={12}/>
                </button>
              )}
              <button type="button" onClick={() => setIsModalOpen(false)}
                className="flex-1 py-3.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors">
                Скасувати
              </button>
              <button type="submit" disabled={isSaving}
                className="flex-1 py-3.5 text-xs font-black text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 uppercase tracking-widest rounded-xl transition-colors shadow-lg shadow-slate-900/20">
                {isSaving ? 'Зберігаємо...' : form.id ? 'Зберегти зміни' : 'Створити подію'}
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!confirmDel}
        title={confirmDel?.kind === 'delegation' ? 'Скасувати доручення?' : 'Видалити подію?'}
        message={confirmDel?.kind === 'delegation'
          ? `«${confirmDel?.title || ''}» зникне з календаря колеги.`
          : confirmDel?.title ? `«${confirmDel.title}»` : ''}
        confirmLabel={confirmDel?.kind === 'delegation' ? 'Так, скасувати' : 'Так, видалити'}
        onConfirm={executeConfirmDel}
        onCancel={() => setConfirmDel(null)}
      />
    </div>
  );
}
