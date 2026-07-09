import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FaChartLine, FaSearch, FaDollarSign, FaPercentage,
  FaBoxOpen, FaHardHat, FaTruckLoading, FaCalculator,
  FaCheckCircle, FaTimes, FaUserTag, FaInfoCircle, FaCalendarAlt
} from 'react-icons/fa';

// Аналітика прибутковості угод (перенесено зі сторінки "Огляд" у Фінанси)
export default function ProfitabilityTab() {
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all'); // all, active, won
  const [dateRange, setDateRange] = useState({ start: '', end: '' });

  // Стейти для модального вікна деталізації
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [activeDeal, setActiveDeal] = useState(null);
  const [bomDetails, setBomDetails] = useState([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  useEffect(() => {
    fetchProfitabilityData();
  }, []);

  const fetchProfitabilityData = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('v_deal_profitability')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error("Помилка завантаження фінансів:", error);
    } else {
      setDeals(data || []);
    }
    setLoading(false);
  };

  // Завантаження деталей специфікації при кліку на угоду
  const openDealDetails = async (deal) => {
    setActiveDeal(deal);
    setIsDetailModalOpen(true);
    setLoadingDetails(true);

    const { data, error } = await supabase
      .from('deal_bom')
      .select(`
        id,
        line_type,
        custom_name,
        quantity_planned,
        unit_price_usd,
        unit_sale_price_usd,
        currency,
        status,
        products ( name, sku ),
        users ( full_name )
      `)
      .eq('deal_id', deal.id)
      .neq('status', 'cancelled')
      .order('line_type', { ascending: true });

    if (!error && data) {
      setBomDetails(data);
    } else if (error) {
      console.error("Помилка завантаження деталей:", error);
    }
    setLoadingDetails(false);
  };

  const handlePercentageChange = (dealId, field, value) => {
    const numValue = value === '' ? '' : parseFloat(value);
    setDeals(prev => prev.map(d =>
      d.id === dealId ? { ...d, [field]: numValue } : d
    ));
  };

  const handleSavePercentage = async (dealId, field, value) => {
    const numValue = parseFloat(value) || 0;
    await supabase.from('deals').update({ [field]: numValue }).eq('id', dealId);
  };

  const filteredDeals = useMemo(() => {
    return deals.filter(d => {
      const matchesSearch = d.title?.toLowerCase().includes(searchTerm.toLowerCase()) || d.custom_id?.toString().includes(searchTerm);

      let matchesStatus = true;
      if (filterStatus === 'active') matchesStatus = !['Угоду виграно', 'Угоду програно'].includes(d.status);
      if (filterStatus === 'won') matchesStatus = d.status === 'Угоду виграно';
      if (filterStatus === 'all') matchesStatus = d.status !== 'Угоду програно';

      let matchesDate = true;
      if (dateRange.start || dateRange.end) {
        const dealDate = new Date(d.created_at);
        if (dateRange.start) {
          matchesDate = matchesDate && dealDate >= new Date(dateRange.start);
        }
        if (dateRange.end) {
          const endDate = new Date(dateRange.end);
          endDate.setHours(23, 59, 59, 999);
          matchesDate = matchesDate && dealDate <= endDate;
        }
      }

      return matchesSearch && matchesStatus && matchesDate;
    });
  }, [deals, searchTerm, filterStatus, dateRange]);

  const kpi = useMemo(() => {
    let totalRevenue = 0;
    let totalNetProfit = 0;
    let totalTaxes = 0;

    filteredDeals.forEach(d => {
      const rev = Number(d.revenue || 0);
      const cogsEq = Number(d.cogs_equipment || 0);
      const cogsSvc = Number(d.cogs_services || 0);
      const logCost = Number(d.logistics_cost || 0);
      const taxRate = Number(d.tax_percentage || 0);
      const adminRate = Number(d.admin_percentage || 0);

      const gross = rev - cogsEq - cogsSvc - logCost;
      const taxAmount = rev * (taxRate / 100);
      const adminAmount = rev * (adminRate / 100);
      const net = gross - taxAmount - adminAmount;

      totalRevenue += rev;
      totalNetProfit += net;
      totalTaxes += taxAmount;
    });

    const avgMargin = totalRevenue > 0 ? (totalNetProfit / totalRevenue) * 100 : 0;

    return { totalRevenue, totalNetProfit, totalTaxes, avgMargin };
  }, [filteredDeals]);

  const clearDateFilter = () => {
    setDateRange({ start: '', end: '' });
  };

  return (
    <div className="flex flex-col relative space-y-4">

      {/* ПАНЕЛЬ ФІЛЬТРІВ ВКЛАДКИ */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2 shrink-0">
          <FaChartLine className="text-emerald-500"/> Прибутковість угод
        </h2>

        <div className="flex items-center gap-3 w-full sm:w-auto overflow-x-auto custom-scrollbar pb-1 sm:pb-0">
          <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 shadow-inner shrink-0">
            <FaCalendarAlt className="text-slate-400 mr-2" size={14} />
            <input
              type="date"
              value={dateRange.start}
              onChange={e => setDateRange({...dateRange, start: e.target.value})}
              className="bg-transparent text-[11px] font-bold text-slate-700 outline-none cursor-pointer"
            />
            <span className="mx-2 text-slate-300">-</span>
            <input
              type="date"
              value={dateRange.end}
              onChange={e => setDateRange({...dateRange, end: e.target.value})}
              className="bg-transparent text-[11px] font-bold text-slate-700 outline-none cursor-pointer"
            />
            {(dateRange.start || dateRange.end) && (
              <button onClick={clearDateFilter} className="ml-2 p-1 text-slate-400 hover:text-rose-500 transition-colors">
                <FaTimes size={10} />
              </button>
            )}
          </div>

          <div className="relative w-48 shrink-0">
            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 size-3"/>
            <input
              type="text" placeholder="Пошук угоди..."
              value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-emerald-500 transition-all shadow-inner"
            />
          </div>

          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-sm shrink-0">
            <button onClick={() => setFilterStatus('all')} className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${filterStatus === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Всі</button>
            <button onClick={() => setFilterStatus('active')} className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${filterStatus === 'active' ? 'bg-amber-100 text-amber-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>В роботі</button>
            <button onClick={() => setFilterStatus('won')} className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${filterStatus === 'won' ? 'bg-emerald-100 text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Виграні</button>
          </div>
        </div>
      </div>

      {/* KPI КАРТКИ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-center">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-2"><FaDollarSign/> Сумарний дохід</p>
          <p className="text-2xl md:text-3xl font-black text-slate-800">${kpi.totalRevenue.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-emerald-500 p-5 rounded-3xl border border-emerald-600 shadow-lg shadow-emerald-500/20 flex flex-col justify-center text-white">
          <p className="text-[10px] font-black text-emerald-100 uppercase tracking-widest mb-1 flex items-center gap-2"><FaChartLine/> Чистий прибуток</p>
          <p className="text-2xl md:text-3xl font-black">${kpi.totalNetProfit.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-center">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-2"><FaPercentage/> Середня маржинальність</p>
          <p className={`text-2xl md:text-3xl font-black ${kpi.avgMargin > 20 ? 'text-emerald-500' : kpi.avgMargin > 10 ? 'text-amber-500' : 'text-rose-500'}`}>
            {kpi.avgMargin.toFixed(1)}%
          </p>
        </div>
        <div className="bg-rose-50 p-5 rounded-3xl border border-rose-100 shadow-sm flex flex-col justify-center">
          <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest mb-1 flex items-center gap-2"><FaCalculator/> Розрахункові податки</p>
          <p className="text-2xl md:text-3xl font-black text-rose-600">${kpi.totalTaxes.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
      </div>

      {/* ТАБЛИЦЯ УГОД */}
      <div className="flex-1">
        <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden flex flex-col h-full">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                  <th className="py-4 px-5">Угода / Дата</th>
                  <th className="py-4 px-4 text-right">Вартість (Дохід)</th>
                  <th className="py-4 px-4 text-center">Собівартість (COGS)</th>
                  <th className="py-4 px-4 text-right bg-slate-100/50">Валовий прибуток</th>
                  <th className="py-4 px-2 text-center w-24">Податок %</th>
                  <th className="py-4 px-2 text-center w-24">Адмін %</th>
                  <th className="py-4 px-5 text-right bg-emerald-50/50 text-emerald-700">Чистий Прибуток</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan="7" className="py-16 text-center text-slate-400 font-bold animate-pulse uppercase tracking-widest text-xs">Завантаження розрахунків...</td></tr>
                ) : filteredDeals.length === 0 ? (
                  <tr><td colSpan="7" className="py-16 text-center text-slate-400 font-bold uppercase tracking-widest text-xs">Угод не знайдено за цими критеріями</td></tr>
                ) : (
                  filteredDeals.map((deal) => {
                    const rev = Number(deal.revenue || 0);
                    const cogsEq = Number(deal.cogs_equipment || 0);
                    const cogsSvc = Number(deal.cogs_services || 0);
                    const logCost = Number(deal.logistics_cost || 0);
                    const taxRate = Number(deal.tax_percentage || 0);
                    const adminRate = Number(deal.admin_percentage || 0);

                    const totalCogs = cogsEq + cogsSvc + logCost;
                    const grossProfit = rev - totalCogs;
                    const taxAmount = rev * (taxRate / 100);
                    const adminAmount = rev * (adminRate / 100);
                    const netProfit = grossProfit - taxAmount - adminAmount;
                    const netMargin = rev > 0 ? (netProfit / rev) * 100 : 0;

                    return (
                      <tr key={deal.id} className="hover:bg-slate-50 transition-colors group">
                        <td
                          className="py-4 px-5 border-r border-slate-50 cursor-pointer hover:bg-emerald-50/50 transition-colors"
                          onClick={() => openDealDetails(deal)}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[9px] font-black uppercase bg-slate-900 text-white px-2 py-0.5 rounded shadow-sm">№{deal.custom_id}</span>
                            <span className="text-[9px] font-bold text-slate-400">{new Date(deal.created_at).toLocaleDateString('uk-UA')}</span>
                            {deal.status === 'Угоду виграно' && <FaCheckCircle className="text-emerald-500" size={12}/>}
                            <span className="opacity-0 group-hover:opacity-100 text-[9px] text-emerald-600 font-bold flex items-center gap-1 transition-opacity ml-auto">
                              <FaInfoCircle/> деталі
                            </span>
                          </div>
                          <p className="font-bold text-sm text-slate-800 truncate max-w-[200px] group-hover:text-emerald-700 transition-colors" title={deal.title}>{deal.title}</p>
                        </td>

                        <td className="py-4 px-4 text-right">
                          <p className="text-sm font-black text-slate-900">${rev.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                          <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase">Сплачено: ${Number(deal.total_paid || 0).toLocaleString('uk-UA')}</p>
                        </td>

                        <td className="py-4 px-4 text-center">
                          <div className="flex items-center justify-center gap-3">
                            <div className="flex flex-col items-center" title="Обладнання та матеріали">
                              <FaBoxOpen className="text-slate-300 mb-1" size={12}/>
                              <span className="text-[10px] font-bold text-slate-600">${cogsEq.toLocaleString('uk-UA', {maximumFractionDigits: 0})}</span>
                            </div>
                            <div className="flex flex-col items-center" title="Послуги / Роботи">
                              <FaHardHat className="text-emerald-300 mb-1" size={12}/>
                              <span className="text-[10px] font-bold text-slate-600">${cogsSvc.toLocaleString('uk-UA', {maximumFractionDigits: 0})}</span>
                            </div>
                            <div className="flex flex-col items-center" title="Логістика">
                              <FaTruckLoading className="text-blue-300 mb-1" size={12}/>
                              <span className="text-[10px] font-bold text-slate-600">${logCost.toLocaleString('uk-UA', {maximumFractionDigits: 0})}</span>
                            </div>
                          </div>
                        </td>

                        <td className="py-4 px-4 text-right bg-slate-50/50">
                          <p className="text-sm font-black text-slate-700">${grossProfit.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        </td>

                        <td className="py-4 px-2 text-center">
                          <div className="relative w-16 mx-auto">
                            <input
                              type="number" min="0" max="100" step="1"
                              value={deal.tax_percentage === '' ? '' : deal.tax_percentage}
                              onChange={(e) => handlePercentageChange(deal.id, 'tax_percentage', e.target.value)}
                              onBlur={(e) => handleSavePercentage(deal.id, 'tax_percentage', e.target.value)}
                              className="w-full text-center text-xs font-black p-2 bg-white border border-slate-200 rounded-lg outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-500/20 transition-all shadow-inner text-rose-600"
                            />
                          </div>
                          <p className="text-[8px] font-bold text-slate-400 mt-1">${taxAmount.toLocaleString('uk-UA', { maximumFractionDigits: 0 })}</p>
                        </td>

                        <td className="py-4 px-2 text-center">
                          <div className="relative w-16 mx-auto">
                            <input
                              type="number" min="0" max="100" step="1"
                              value={deal.admin_percentage === '' ? '' : deal.admin_percentage}
                              onChange={(e) => handlePercentageChange(deal.id, 'admin_percentage', e.target.value)}
                              onBlur={(e) => handleSavePercentage(deal.id, 'admin_percentage', e.target.value)}
                              className="w-full text-center text-xs font-black p-2 bg-white border border-slate-200 rounded-lg outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-500/20 transition-all shadow-inner text-amber-600"
                            />
                          </div>
                          <p className="text-[8px] font-bold text-slate-400 mt-1">${adminAmount.toLocaleString('uk-UA', { maximumFractionDigits: 0 })}</p>
                        </td>

                        <td className="py-4 px-5 text-right bg-emerald-50/30">
                          <p className={`text-base font-black ${netProfit > 0 ? 'text-emerald-600' : netProfit < 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                            ${netProfit.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                          <p className={`text-[10px] font-black uppercase mt-1 tracking-wider ${netMargin >= 15 ? 'text-emerald-500' : netMargin > 0 ? 'text-amber-500' : 'text-rose-500'}`}>
                            Маржа: {netMargin.toFixed(1)}%
                          </p>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* МОДАЛЬНЕ ВІКНО ДЕТАЛІЗАЦІЇ */}
      <AnimatePresence>
        {isDetailModalOpen && activeDeal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl flex flex-col max-h-[90vh] overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 bg-slate-900 text-white flex justify-between items-center shrink-0">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-3">
                    <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg"><FaChartLine size={16}/></div>
                    Деталізація фінансів (USD Еквівалент)
                  </h3>
                  <p className="text-[10px] text-slate-400 font-bold mt-1.5 uppercase tracking-widest">
                    СЕС №{activeDeal.custom_id} — {activeDeal.title}
                  </p>
                </div>
                <button
                  onClick={() => setIsDetailModalOpen(false)}
                  className="p-2.5 bg-white/10 hover:bg-white/20 rounded-xl transition-colors"
                >
                  <FaTimes size={16} />
                </button>
              </div>

              <div className="flex-1 overflow-auto custom-scrollbar bg-slate-50 p-6">
                {loadingDetails ? (
                  <div className="py-20 text-center flex flex-col items-center justify-center text-slate-400">
                    <div className="w-10 h-10 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mb-4"></div>
                    <span className="text-[10px] font-black uppercase tracking-widest">Завантаження специфікації...</span>
                  </div>
                ) : bomDetails.length === 0 ? (
                  <div className="py-20 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-2xl bg-white">
                    <FaBoxOpen size={32} className="mx-auto mb-3 opacity-20"/>
                    <p className="text-xs font-black uppercase tracking-widest">Специфікація порожня</p>
                  </div>
                ) : (
                  <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left whitespace-nowrap">
                        <thead className="bg-slate-100 border-b border-slate-200">
                          <tr className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                            <th className="py-4 px-5">Позиція / Автор</th>
                            <th className="py-4 px-4 text-center">Кількість</th>
                            <th className="py-4 px-4 text-right">Собівартість (Од / Заг)</th>
                            <th className="py-4 px-4 text-right">Реалізація (Од / Заг)</th>
                            <th className="py-4 px-5 text-right">Прибуток з позиції</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {bomDetails.map((item) => {
                            const qty = Number(item.quantity_planned || 0);
                            const costUsd = Number(item.unit_price_usd || 0);
                            const saleUsd = Number(item.unit_sale_price_usd || 0);

                            const totalCost = qty * costUsd;
                            const totalSale = qty * saleUsd;
                            const profit = totalSale - totalCost;

                            const isEquipment = item.line_type === 'equipment';
                            const itemName = isEquipment ? item.products?.name : item.custom_name;

                            return (
                              <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                                <td className="py-4 px-5">
                                  <div className="flex items-center gap-2 mb-1.5">
                                    <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded ${isEquipment ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                      {isEquipment ? 'Обладнання' : 'Послуга'}
                                    </span>
                                    {item.currency === 'UAH' && (
                                      <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded bg-sky-100 text-sky-700" title="Оригінальна ціна була вказана в гривні">UAH</span>
                                    )}
                                  </div>
                                  <p className="font-bold text-sm text-slate-800 truncate max-w-[250px]" title={itemName}>
                                    {itemName || 'Невідома позиція'}
                                  </p>
                                  <div className="flex items-center gap-1.5 mt-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                                    <FaUserTag size={10} className="text-slate-300"/>
                                    Додав: <span className="text-slate-500">{item.users?.full_name || 'Невідомо'}</span>
                                  </div>
                                </td>

                                <td className="py-4 px-4 text-center">
                                  <span className="font-black text-slate-800 bg-slate-100 px-3 py-1 rounded-lg border border-slate-200">
                                    {qty}
                                  </span>
                                </td>

                                <td className="py-4 px-4 text-right">
                                  <p className="text-[10px] font-bold text-slate-500 mb-1">${costUsd.toLocaleString('uk-UA', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
                                  <p className="text-sm font-black text-rose-600">${totalCost.toLocaleString('uk-UA', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
                                </td>

                                <td className="py-4 px-4 text-right bg-slate-50/50 border-l border-slate-100">
                                  <p className="text-[10px] font-bold text-slate-500 mb-1">${saleUsd.toLocaleString('uk-UA', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
                                  <p className="text-sm font-black text-sky-600">${totalSale.toLocaleString('uk-UA', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
                                </td>

                                <td className="py-4 px-5 text-right bg-emerald-50/30">
                                  <p className={`text-base font-black ${profit > 0 ? 'text-emerald-600' : profit < 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                                    {profit > 0 ? '+' : ''}${profit.toLocaleString('uk-UA', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                  </p>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot className="bg-slate-900 text-white">
                          <tr className="text-xs font-black uppercase tracking-widest">
                            <td colSpan="2" className="py-4 px-5 text-right">Підсумок по специфікації (в USD):</td>
                            <td className="py-4 px-4 text-right text-rose-400">
                              ${bomDetails.reduce((sum, i) => sum + (Number(i.quantity_planned) * Number(i.unit_price_usd)), 0).toLocaleString('uk-UA', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                            </td>
                            <td className="py-4 px-4 text-right text-sky-400">
                              ${bomDetails.reduce((sum, i) => sum + (Number(i.quantity_planned) * Number(i.unit_sale_price_usd)), 0).toLocaleString('uk-UA', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                            </td>
                            <td className="py-4 px-5 text-right text-emerald-400">
                              ${bomDetails.reduce((sum, i) => sum + ((Number(i.unit_sale_price_usd) - Number(i.unit_price_usd)) * Number(i.quantity_planned)), 0).toLocaleString('uk-UA', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
