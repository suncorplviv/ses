import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import {
  FaChartLine, FaSolarPanel, FaTrophy, FaHandHoldingUsd, FaTruckLoading,
  FaExclamationTriangle, FaClock, FaHistory, FaUserTie,
  FaChevronRight, FaFilter, FaHardHat, FaCalendarAlt, FaMapMarkerAlt
} from 'react-icons/fa';

// ОГЛЯД КОМПАНІЇ: воронка, прострочені завдання, борги, монтажі, активність.
// Фінансова аналітика прибутковості переїхала у Фінанси → вкладка "Аналітика".
export default function FinanceDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  const [deals, setDeals] = useState([]);
  const [stages, setStages] = useState([]);
  const [overdueTasks, setOverdueTasks] = useState([]);
  const [paymentsByDeal, setPaymentsByDeal] = useState({});
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [installations, setInstallations] = useState([]);
  const [activity, setActivity] = useState([]);

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    setLoading(true);
    try {
      const nowIso = new Date().toISOString();
      const todayStr = new Date().toISOString().split('T')[0];
      const [dealsRes, stagesRes, tasksRes, paysRes, poRes, instRes, actRes] = await Promise.all([
        supabase.from('deals').select('id, custom_id, title, status, stage_id, final_budget, created_at, clients(name)'),
        supabase.from('deal_stages').select('id, name, position, color').order('position'),
        supabase.from('tasks')
          .select('id, title, deadline_at, status, deal_id, deals(custom_id, title, status), assignee:users!tasks_assignee_id_fkey(full_name)')
          .neq('status', 'Виконана')
          .not('deadline_at', 'is', null)
          .lt('deadline_at', nowIso)
          .order('deadline_at', { ascending: true })
          .limit(30),
        supabase.from('payments').select('deal_id, amount_usd').not('deal_id', 'is', null),
        supabase.from('purchase_orders').select('id, custom_id, total_amount, amount_paid, payment_status, status, suppliers(name)'),
        // Монтажі: сьогодні та найближчі (графік з календаря монтажів)
        supabase.from('installations')
          .select('id, scheduled_date, is_ready, deals(id, custom_id, title, clients(name), site_surveys(region, city)), installation_workers(users(full_name))')
          .gte('scheduled_date', todayStr)
          .order('scheduled_date', { ascending: true })
          .limit(8),
        supabase.from('deal_activity_log').select('id, action, created_at, users(full_name), deals(custom_id)').order('created_at', { ascending: false }).limit(10)
      ]);

      setDeals(dealsRes.data || []);
      setStages(stagesRes.data || []);
      setOverdueTasks((tasksRes.data || []).filter(t => !['Угоду програно', 'Клієнт на паузі', 'Угоду виграно'].includes(t.deals?.status)));

      const payMap = {};
      (paysRes.data || []).forEach(p => {
        payMap[p.deal_id] = (payMap[p.deal_id] || 0) + Number(p.amount_usd || 0);
      });
      setPaymentsByDeal(payMap);

      setPurchaseOrders(poRes.data || []);
      setInstallations(instRes.data || []);
      setActivity(actRes.data || []);
    } catch (err) {
      console.error('Помилка завантаження огляду:', err);
    } finally {
      setLoading(false);
    }
  };

  const activeDeals = useMemo(
    () => deals.filter(d => !['Угоду виграно', 'Угоду програно'].includes(d.status)),
    [deals]
  );
  const wonDeals = useMemo(() => deals.filter(d => d.status === 'Угоду виграно'), [deals]);

  const kpi = useMemo(() => {
    const pipelineSum = activeDeals.reduce((s, d) => s + Number(d.final_budget || 0), 0);
    const wonSum = wonDeals.reduce((s, d) => s + Number(d.final_budget || 0), 0);

    // Дебіторка: скільки клієнти ще винні по активних та виграних угодах
    let receivables = 0;
    let debtorsCount = 0;
    [...activeDeals, ...wonDeals].forEach(d => {
      const debt = Number(d.final_budget || 0) - (paymentsByDeal[d.id] || 0);
      if (debt > 0.01 && Number(d.final_budget || 0) > 0) {
        receivables += debt;
        debtorsCount++;
      }
    });

    // Кредиторка: скільки ми винні постачальникам
    let payables = 0;
    let unpaidPoCount = 0;
    purchaseOrders.forEach(po => {
      if (po.status === 'cancelled' || po.payment_status === 'paid') return;
      const rest = Number(po.total_amount || 0) - Number(po.amount_paid || 0);
      if (rest > 0.01) {
        payables += rest;
        unpaidPoCount++;
      }
    });

    return { pipelineSum, wonSum, receivables, debtorsCount, payables, unpaidPoCount };
  }, [activeDeals, wonDeals, paymentsByDeal, purchaseOrders]);

  const funnel = useMemo(() => {
    const byStage = stages.map(st => {
      const stDeals = activeDeals.filter(d => d.stage_id === st.id);
      return {
        ...st,
        count: stDeals.length,
        sum: stDeals.reduce((s, d) => s + Number(d.final_budget || 0), 0)
      };
    });
    const maxCount = Math.max(...byStage.map(s => s.count), 1);
    return { byStage, maxCount };
  }, [stages, activeDeals]);

  // Боржники (топ)
  const topDebtors = useMemo(() => {
    return [...activeDeals, ...wonDeals]
      .map(d => ({ ...d, debt: Number(d.final_budget || 0) - (paymentsByDeal[d.id] || 0) }))
      .filter(d => d.debt > 0.01 && Number(d.final_budget || 0) > 0)
      .sort((a, b) => b.debt - a.debt)
      .slice(0, 6);
  }, [activeDeals, wonDeals, paymentsByDeal]);

  const overdueDays = (iso) => Math.floor((Date.now() - new Date(iso)) / 86400000);

  if (loading) {
    return (
      <div className="flex h-full min-h-[60vh] items-center justify-center">
        <div className="w-12 h-12 border-4 border-amber-500/30 border-t-amber-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="max-w-[1500px] mx-auto px-3 sm:px-6 lg:px-8 py-4 md:py-6 space-y-4 md:space-y-6 bg-slate-50 min-h-full pb-10">

      {/* ХЕДЕР */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-slate-900 text-amber-500 rounded-xl shadow-md"><FaChartLine size={20}/></div>
          <div>
            <h1 className="text-xl md:text-2xl font-black text-slate-900 uppercase tracking-tight">Огляд компанії</h1>
            <p className="text-[10px] md:text-xs text-slate-500 font-bold uppercase tracking-wider">
              {new Date().toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>
        </div>
        <button onClick={() => navigate('/finance')}
          className="px-5 py-2.5 bg-white border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 shadow-sm">
          <FaChartLine size={11}/> Фінансова аналітика <FaChevronRight size={9}/>
        </button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div onClick={() => navigate('/deals')} className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm cursor-pointer hover:border-amber-300 hover:shadow-md transition-all">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-2"><FaSolarPanel className="text-amber-500"/> Угоди в роботі</p>
          <p className="text-2xl md:text-3xl font-black text-slate-800">{activeDeals.length}</p>
          <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase">Потенціал: <span className="text-slate-700">${kpi.pipelineSum.toLocaleString('uk-UA', { maximumFractionDigits: 0 })}</span></p>
        </div>

        <div className="bg-emerald-500 p-5 rounded-3xl border border-emerald-600 shadow-lg shadow-emerald-500/20 text-white">
          <p className="text-[10px] font-black text-emerald-100 uppercase tracking-widest mb-1 flex items-center gap-2"><FaTrophy/> Виграні угоди</p>
          <p className="text-2xl md:text-3xl font-black">{wonDeals.length}</p>
          <p className="text-[10px] font-bold text-emerald-100 mt-1 uppercase">На суму: ${kpi.wonSum.toLocaleString('uk-UA', { maximumFractionDigits: 0 })}</p>
        </div>

        <div onClick={() => navigate('/finance')} className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm cursor-pointer hover:border-rose-300 hover:shadow-md transition-all">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-2"><FaHandHoldingUsd className="text-rose-500"/> Клієнти винні</p>
          <p className="text-2xl md:text-3xl font-black text-rose-600">${kpi.receivables.toLocaleString('uk-UA', { maximumFractionDigits: 0 })}</p>
          <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase">Об'єктів з боргом: {kpi.debtorsCount}</p>
        </div>

        <div onClick={() => navigate('/inventory')} className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm cursor-pointer hover:border-sky-300 hover:shadow-md transition-all">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-2"><FaTruckLoading className="text-sky-500"/> Ми винні постачальникам</p>
          <p className="text-2xl md:text-3xl font-black text-slate-800">${kpi.payables.toLocaleString('uk-UA', { maximumFractionDigits: 0 })}</p>
          <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase">Незакритих закупівель: {kpi.unpaidPoCount}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 md:gap-6">

        {/* ВОРОНКА ПО ЕТАПАХ */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
              <FaFilter className="text-amber-500"/> Воронка угод
            </h3>
            <span className="text-[9px] font-black text-slate-400 uppercase bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">
              {activeDeals.length} в роботі
            </span>
          </div>
          <div className="p-5 space-y-3">
            {funnel.byStage.map(st => (
              <div key={st.id} onClick={() => navigate('/deals')} className="cursor-pointer group">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[10px] font-black text-slate-600 uppercase tracking-wide group-hover:text-amber-600 transition-colors truncate pr-2">{st.name}</span>
                  <span className="text-[10px] font-black text-slate-800 shrink-0">
                    {st.count} <span className="text-slate-400 font-bold">· ${st.sum.toLocaleString('uk-UA', { maximumFractionDigits: 0 })}</span>
                  </span>
                </div>
                <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-500 transition-all"
                    style={{ width: `${Math.max((st.count / funnel.maxCount) * 100, st.count > 0 ? 8 : 0)}%` }}
                  />
                </div>
              </div>
            ))}
            {funnel.byStage.length === 0 && (
              <p className="text-center text-[10px] font-black text-slate-400 uppercase py-6">Немає даних</p>
            )}
          </div>

          {/* ТОП БОРЖНИКІВ */}
          {topDebtors.length > 0 && (
            <div className="border-t border-slate-100">
              <div className="px-5 pt-4 pb-2">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <FaHandHoldingUsd className="text-rose-400"/> Найбільші борги клієнтів
                </h4>
              </div>
              <div className="px-5 pb-5 space-y-2">
                {topDebtors.map(d => (
                  <div key={d.id} onClick={() => navigate(`/deals/${d.id}`)}
                    className="flex items-center justify-between gap-2 bg-slate-50 hover:bg-rose-50 border border-slate-100 hover:border-rose-200 rounded-xl px-3 py-2 cursor-pointer transition-colors">
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-slate-800 truncate">№{d.custom_id} · {d.title}</p>
                      <p className="text-[9px] font-bold text-slate-400 truncate">{d.clients?.name}</p>
                    </div>
                    <span className="text-xs font-black text-rose-600 shrink-0">${d.debt.toLocaleString('uk-UA', { maximumFractionDigits: 0 })}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ПРОСТРОЧЕНІ ЗАВДАННЯ */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
              <FaExclamationTriangle className="text-rose-500"/> Прострочені завдання
            </h3>
            <span className={`text-[9px] font-black uppercase px-2 py-1 rounded-lg border ${overdueTasks.length > 0 ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
              {overdueTasks.length}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar max-h-[480px]">
            {overdueTasks.length === 0 ? (
              <div className="py-16 text-center">
                <FaClock className="mx-auto text-slate-200 mb-3" size={32}/>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Прострочень немає 🎉</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {overdueTasks.map(t => (
                  <div key={t.id} onClick={() => t.deal_id && navigate(`/deals/${t.deal_id}`)}
                    className="px-5 py-3.5 hover:bg-rose-50/40 cursor-pointer transition-colors">
                    <p className="text-xs font-bold text-slate-800 leading-snug">{t.title}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-1.5">
                      <span className="text-[9px] font-black text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded uppercase">№{t.deals?.custom_id}</span>
                      <span className="text-[9px] font-black text-rose-500 uppercase flex items-center gap-1">
                        <FaClock size={8}/> {overdueDays(t.deadline_at)} дн. тому
                      </span>
                      <span className="text-[9px] font-bold text-slate-400 uppercase flex items-center gap-1 truncate">
                        <FaUserTie size={8}/> {t.assignee?.full_name || 'Не призначено'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* МОНТАЖІ + АКТИВНІСТЬ */}
        <div className="space-y-4 md:space-y-6">

          {/* ОБ'ЄКТИ В РОБОТІ: ГРАФІК МОНТАЖІВ */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between gap-2">
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                <FaHardHat className="text-amber-500"/> Об'єкти в роботі
              </h3>
              <button onClick={() => navigate('/calendar')}
                className="text-[9px] font-black uppercase px-2.5 py-1.5 rounded-lg border bg-slate-50 text-slate-600 border-slate-200 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-200 transition-colors flex items-center gap-1.5">
                <FaCalendarAlt size={9}/> Весь графік <FaChevronRight size={7}/>
              </button>
            </div>
            <div className="max-h-[260px] overflow-y-auto custom-scrollbar">
              {installations.length === 0 ? (
                <div className="py-10 text-center">
                  <FaHardHat className="mx-auto text-slate-200 mb-2" size={28}/>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Запланованих монтажів немає</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {installations.map(inst => {
                    const survey = Array.isArray(inst.deals?.site_surveys) ? inst.deals.site_surveys[0] : inst.deals?.site_surveys;
                    const location = [survey?.region, survey?.city].filter(Boolean).join(', ');
                    const workers = (inst.installation_workers || []).map(w => w.users?.full_name).filter(Boolean);
                    const d = new Date(inst.scheduled_date);
                    const today = new Date(); today.setHours(0, 0, 0, 0);
                    const diffDays = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - today) / 86400000);
                    const dateLabel = diffDays === 0 ? 'Сьогодні' : diffDays === 1 ? 'Завтра' : d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' });
                    return (
                      <div key={inst.id} onClick={() => inst.deals?.id && navigate(`/deals/${inst.deals.id}`)}
                        className="px-5 py-3 flex items-center gap-3 hover:bg-amber-50/40 cursor-pointer transition-colors">
                        <span className={`text-[9px] font-black uppercase px-2 py-1 rounded-lg border shrink-0 ${diffDays === 0 ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : diffDays === 1 ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                          {dateLabel}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-slate-800 truncate">№{inst.deals?.custom_id} · {inst.deals?.title || inst.deals?.clients?.name}</p>
                          <div className="flex flex-wrap items-center gap-x-2 mt-0.5">
                            {location && (
                              <span className="text-[9px] font-bold text-slate-400 flex items-center gap-1 truncate">
                                <FaMapMarkerAlt size={8}/> {location}
                              </span>
                            )}
                            {workers.length > 0 && (
                              <span className="text-[9px] font-bold text-slate-400 flex items-center gap-1 truncate" title={workers.join(', ')}>
                                <FaHardHat size={8}/> {workers.length === 1 ? workers[0] : `${workers.length} монтажники`}
                              </span>
                            )}
                          </div>
                        </div>
                        {inst.is_ready && <span className="text-[8px] font-black uppercase text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded shrink-0">Готово</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ОСТАННЯ АКТИВНІСТЬ */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100">
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                <FaHistory className="text-slate-400"/> Остання активність
              </h3>
            </div>
            <div className="max-h-[300px] overflow-y-auto custom-scrollbar divide-y divide-slate-50">
              {activity.length === 0 ? (
                <p className="text-center text-[10px] font-black text-slate-400 uppercase py-8">Подій ще немає</p>
              ) : activity.map(log => (
                <div key={log.id} className="px-5 py-3">
                  <p className="text-[11px] font-bold text-slate-700 leading-snug break-words">{log.action}</p>
                  <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-wider">
                    {log.deals?.custom_id ? `№${log.deals.custom_id} · ` : ''}
                    {new Date(log.created_at).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · {log.users?.full_name || 'Система'}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
