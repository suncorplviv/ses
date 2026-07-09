import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import * as XLSX from 'xlsx';
import {
  FaCashRegister, FaPlus, FaSearch, FaFilter, FaFileDownload,
  FaWallet, FaChartLine, FaPercentage, FaUser, FaBuilding,
  FaChevronLeft, FaChevronRight, FaExclamationCircle
} from 'react-icons/fa';
import { getCurrentMonthRange } from '../utils/dateTime';

import NewSaleModal from '../modals/NewSaleModal';
import SaleDetailsModal from '../modals/SaleDetailsModal';

const paymentStatusLabels = {
  unpaid: { label: 'Неоплачено', color: 'bg-rose-50 text-rose-600 border-rose-100' },
  partial: { label: 'Часткова оплата', color: 'bg-amber-50 text-amber-600 border-amber-100' },
  paid: { label: 'Оплачено', color: 'bg-emerald-50 text-emerald-600 border-emerald-100' }
};

// За замовчуванням показуємо тільки поточний місяць, щоб список не розростався до нескінченності
const getDefaultFilters = () => ({ ...getCurrentMonthRange(), paymentStatus: '', includeCancelled: false });

export default function SalesPage() {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filters, setFilters] = useState(getDefaultFilters());

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [isNewSaleModalOpen, setIsNewSaleModalOpen] = useState(false);
  const [selectedSaleId, setSelectedSaleId] = useState(null);

  const fetchSales = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('sales')
        .select('*, clients(name, custom_id, client_type), users:created_by(full_name)')
        .order('sale_date', { ascending: false });
      if (error) throw error;
      setSales(data || []);
    } catch (error) {
      console.error('Помилка завантаження продажів:', error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSales();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filters]);

  const filteredSales = useMemo(() => {
    return sales.filter(s => {
      const search = searchTerm.toLowerCase();
      const matchesSearch = !search ||
        s.clients?.name?.toLowerCase().includes(search) ||
        s.clients?.custom_id?.toString().includes(search) ||
        s.custom_id?.toString().includes(search);

      const sDate = new Date(s.sale_date);
      const matchesDateFrom = filters.dateFrom ? sDate >= new Date(filters.dateFrom) : true;
      const matchesDateTo = filters.dateTo ? sDate <= new Date(filters.dateTo + 'T23:59:59') : true;
      const matchesStatus = filters.paymentStatus ? s.payment_status === filters.paymentStatus : true;
      const matchesCancelled = filters.includeCancelled ? true : s.status !== 'cancelled';

      return matchesSearch && matchesDateFrom && matchesDateTo && matchesStatus && matchesCancelled;
    });
  }, [sales, searchTerm, filters]);

  const kpi = useMemo(() => {
    const active = filteredSales.filter(s => s.status !== 'cancelled');
    const totalRevenue = active.reduce((sum, s) => sum + (parseFloat(s.total_revenue_usd) || 0), 0);
    const totalProfit = active.reduce((sum, s) => sum + (parseFloat(s.total_profit_usd) || 0), 0);
    const marginPct = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    const totalDebt = active.reduce((sum, s) => {
      const debt = (parseFloat(s.total_revenue_usd) || 0) - (parseFloat(s.amount_paid_usd) || 0);
      return sum + (debt > 0 ? debt : 0);
    }, 0);
    return { totalRevenue, totalProfit, marginPct, totalDebt };
  }, [filteredSales]);

  const totalPages = Math.ceil(filteredSales.length / itemsPerPage) || 1;
  const visiblePage = Math.min(currentPage, totalPages);
  const paginatedSales = filteredSales.slice((visiblePage - 1) * itemsPerPage, visiblePage * itemsPerPage);

  const handleExportSales = () => {
    if (filteredSales.length === 0) return alert('Немає даних для експорту.');

    const exportData = filteredSales.map(s => ({
      'ID': s.custom_id,
      'Дата': new Date(s.sale_date).toLocaleString('uk-UA'),
      'Клієнт': s.clients?.name || '',
      'ID Клієнта': s.clients?.custom_id || '',
      'Виручка (USD)': Number(s.total_revenue_usd) || 0,
      'Собівартість (USD)': Number(s.total_cost_usd) || 0,
      'Прибуток (USD)': Number(s.total_profit_usd) || 0,
      'Сплачено (USD)': Number(s.amount_paid_usd) || 0,
      'Статус оплати': paymentStatusLabels[s.payment_status]?.label || s.payment_status,
      'Статус': s.status === 'cancelled' ? 'Скасовано' : 'Завершено',
      'Менеджер': s.users?.full_name || '',
      'Примітки': s.notes || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Продажі');
    XLSX.writeFile(workbook, `Продажі_${new Date().toLocaleDateString('uk-UA')}.xlsx`);
  };

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-6 lg:px-8 py-4 md:py-8 space-y-4 md:space-y-6 bg-slate-50 min-h-full">

      {/* ПАНЕЛЬ КЕРУВАННЯ */}
      <div className="bg-white p-4 md:p-6 rounded-3xl border border-slate-200 flex flex-col lg:flex-row items-center gap-4 shadow-sm relative z-20">
        <div className="flex-1 w-full flex items-center justify-between lg:justify-start gap-4">
          <h1 className="text-lg md:text-2xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-2.5">
            <div className="p-2 bg-amber-500 text-slate-900 rounded-xl shadow-sm"><FaCashRegister size={18} /></div>
            Продажі
          </h1>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto relative">
          <div className="relative w-full sm:w-64">
            <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              type="text"
              placeholder="Пошук клієнта або ID..."
              className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-colors"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="relative flex gap-2">
            <button
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              className={`flex-1 sm:flex-none p-3 flex items-center justify-center gap-2 rounded-xl border font-bold text-xs uppercase tracking-wider transition-colors ${isFilterOpen ? 'bg-amber-100 text-amber-600 border-amber-200' : 'bg-slate-50 hover:bg-slate-100 text-slate-500 border-slate-200'}`}
            >
              <FaFilter size={12} /> Фільтри
            </button>

            <button
              onClick={handleExportSales}
              className="flex-1 sm:flex-none p-3 flex items-center justify-center gap-2 rounded-xl border bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100 font-bold text-xs uppercase tracking-wider transition-colors"
              title="Експорт в Excel (.xlsx)"
            >
              <FaFileDownload size={12} /> Excel
            </button>

            {isFilterOpen && (
              <div className="absolute right-0 top-[115%] mt-1 w-72 bg-white border border-slate-200 rounded-2xl p-4 z-50 shadow-2xl space-y-4">
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Період продажу</label>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="date" className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-amber-500" value={filters.dateFrom} onChange={e => setFilters({ ...filters, dateFrom: e.target.value })} />
                    <input type="date" className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-amber-500" value={filters.dateTo} onChange={e => setFilters({ ...filters, dateTo: e.target.value })} />
                  </div>
                </div>

                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Статус оплати</label>
                  <select className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-amber-500 cursor-pointer" value={filters.paymentStatus} onChange={e => setFilters({ ...filters, paymentStatus: e.target.value })}>
                    <option value="">Усі варіанти</option>
                    <option value="unpaid">Неоплачено</option>
                    <option value="partial">Часткова оплата</option>
                    <option value="paid">Оплачено</option>
                  </select>
                </div>

                <div className="pt-2 border-t border-slate-100">
                  <label className="flex items-center gap-3 cursor-pointer p-1">
                    <input type="checkbox" className="w-4 h-4 text-amber-500 rounded border-slate-300 focus:ring-amber-500" checked={filters.includeCancelled} onChange={e => setFilters({ ...filters, includeCancelled: e.target.checked })} />
                    <span className="text-xs font-bold text-slate-700">Показувати скасовані</span>
                  </label>
                </div>

                <button onClick={() => setFilters(getDefaultFilters())} className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors">
                  Скинути до поточного місяця
                </button>
              </div>
            )}
          </div>

          <button
            onClick={() => setIsNewSaleModalOpen(true)}
            className="bg-slate-900 hover:bg-slate-800 text-amber-500 px-6 py-3 rounded-xl font-black text-xs transition-colors flex items-center justify-center gap-2 uppercase tracking-widest shadow-lg shadow-slate-900/10"
          >
            <FaPlus size={12} /> Новий продаж
          </button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 relative z-10">
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl"><FaWallet size={22} /></div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Виручка</p>
            <h3 className="text-lg font-black text-emerald-500 mt-0.5">{kpi.totalRevenue.toLocaleString()} $</h3>
          </div>
        </div>
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl"><FaChartLine size={22} /></div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Прибуток</p>
            <h3 className="text-lg font-black text-slate-800 mt-0.5">{kpi.totalProfit.toLocaleString()} $</h3>
          </div>
        </div>
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-sky-50 text-sky-600 rounded-2xl"><FaPercentage size={22} /></div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Середня маржа</p>
            <h3 className="text-lg font-black text-slate-800 mt-0.5">{kpi.marginPct.toFixed(1)} %</h3>
          </div>
        </div>
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl"><FaExclamationCircle size={22} /></div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Борг по продажах</p>
            <h3 className="text-lg font-black text-rose-500 mt-0.5">{kpi.totalDebt.toLocaleString()} $</h3>
          </div>
        </div>
      </div>

      {/* ТАБЛИЦЯ */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden relative z-0">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100 text-slate-500 text-[10px] font-black uppercase tracking-widest">
                <th className="p-5">ID</th>
                <th className="p-5">Клієнт</th>
                <th className="p-5">Дата</th>
                <th className="p-5 text-right">Виручка</th>
                <th className="p-5 text-right">Прибуток</th>
                <th className="p-5 text-center">Оплата</th>
                <th className="p-5">Менеджер</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan="7" className="text-center p-12 text-slate-400 font-bold uppercase tracking-widest animate-pulse">Завантаження продажів...</td></tr>
              ) : paginatedSales.length === 0 ? (
                <tr><td colSpan="7" className="text-center p-12 text-slate-400 font-bold">Продажів не знайдено</td></tr>
              ) : (
                paginatedSales.map(sale => {
                  const payStatusInfo = paymentStatusLabels[sale.payment_status] || paymentStatusLabels.unpaid;
                  const isCancelled = sale.status === 'cancelled';
                  return (
                    <tr key={sale.id} onClick={() => setSelectedSaleId(sale.id)} className={`hover:bg-amber-50/30 transition-colors cursor-pointer group ${isCancelled ? 'opacity-50' : ''}`}>
                      <td className="p-5 text-xs font-mono font-bold text-slate-400">#{sale.custom_id}</td>
                      <td className="p-5">
                        <div className="flex items-center gap-3">
                          <div className={`flex items-center justify-center w-9 h-9 rounded-xl shrink-0 ${sale.clients?.client_type === 'Юридична особа' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                            {sale.clients?.client_type === 'Юридична особа' ? <FaBuilding size={14} /> : <FaUser size={14} />}
                          </div>
                          <div className="font-bold text-slate-900 text-sm group-hover:text-amber-600 transition-colors">{sale.clients?.name || '—'}</div>
                        </div>
                      </td>
                      <td className="p-5 text-xs font-bold text-slate-500">{new Date(sale.sale_date).toLocaleDateString('uk-UA')}</td>
                      <td className="p-5 text-right text-sm font-black text-slate-900">${Number(sale.total_revenue_usd || 0).toLocaleString()}</td>
                      <td className={`p-5 text-right text-sm font-black ${Number(sale.total_profit_usd || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>${Number(sale.total_profit_usd || 0).toLocaleString()}</td>
                      <td className="p-5 text-center">
                        {isCancelled ? (
                          <span className="px-3 py-1.5 bg-rose-50 text-rose-600 rounded-lg text-[9px] font-black uppercase tracking-widest border border-rose-100">Скасовано</span>
                        ) : (
                          <span className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border ${payStatusInfo.color}`}>{payStatusInfo.label}</span>
                        )}
                      </td>
                      <td className="p-5 text-xs font-bold text-slate-500">{sale.users?.full_name || '—'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between p-5 border-t border-slate-100">
            <div className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
              Стор <span className="text-slate-700">{visiblePage}</span> з {totalPages}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setCurrentPage(p => p - 1)} disabled={visiblePage === 1} className="p-2 bg-slate-100 rounded-lg disabled:opacity-30"><FaChevronLeft size={12} /></button>
              <button onClick={() => setCurrentPage(p => p + 1)} disabled={visiblePage === totalPages} className="p-2 bg-slate-100 rounded-lg disabled:opacity-30"><FaChevronRight size={12} /></button>
            </div>
          </div>
        )}
      </div>

      {isNewSaleModalOpen && (
        <NewSaleModal
          isOpen={isNewSaleModalOpen}
          onClose={() => setIsNewSaleModalOpen(false)}
          onSaveSuccess={fetchSales}
        />
      )}

      {selectedSaleId && (
        <SaleDetailsModal
          isOpen={!!selectedSaleId}
          onClose={() => setSelectedSaleId(null)}
          saleId={selectedSaleId}
          onSaveSuccess={fetchSales}
        />
      )}
    </div>
  );
}
