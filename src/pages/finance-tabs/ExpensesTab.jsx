import React, { useState, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import * as XLSX from 'xlsx';
import {
  FaMoneyBillWave, FaTags, FaChevronLeft, FaChevronRight, FaTruckLoading
} from 'react-icons/fa';

import NewExpenseModal from '../../modals/NewExpenseModal';
import ExpenseDetailsModal from '../../modals/ExpenseDetailsModal';
import PurchaseOrderModal from '../../modals/PurchaseOrderModal';

const ExpensesTab = forwardRef(function ExpensesTab({ searchTerm, filters, categories }, ref) {
  const navigate = useNavigate();
  const [expenses, setExpenses] = useState([]);
  const [supplierPayments, setSupplierPayments] = useState([]);
  const [supplierDebts, setSupplierDebts] = useState([]);
  const [loading, setLoading] = useState(true);

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [isNewExpenseModalOpen, setIsNewExpenseModalOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState(null);
  const [selectedPoForView, setSelectedPoForView] = useState(null);

  const fetchExpenses = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('expenses')
        .select('*, expense_categories(name), deals(id, custom_id, title), suppliers(name), creator:created_by(full_name), employee:employee_id(full_name)')
        .order('expense_date', { ascending: false });
      if (error) throw error;
      setExpenses(data || []);

      // Оплати по закупівлях (їх вносять з цієї ж вкладки, тип "Постачальник") —
      // вони реально пишуться в purchase_order_payments, а не в expenses,
      // тож без цього fetch'у вони були б невидимі в списку видатків.
      const { data: poPayData } = await supabase
        .from('purchase_order_payments')
        .select('*, purchase_orders(id, supplier_id, status, suppliers(name)), users(full_name)')
        .order('payment_date', { ascending: false });
      setSupplierPayments(poPayData || []);

      const { data: poData } = await supabase
        .from('purchase_orders')
        .select('supplier_id, total_amount, amount_paid, status, suppliers(name)')
        .neq('status', 'cancelled');

      const debtMap = new Map();
      (poData || []).forEach(po => {
        if (!po.supplier_id) return;
        const outstanding = (parseFloat(po.total_amount) || 0) - (parseFloat(po.amount_paid) || 0);
        if (outstanding <= 0) return;
        const current = debtMap.get(po.supplier_id) || { name: po.suppliers?.name || 'Невідомо', debt: 0 };
        current.debt += outstanding;
        debtMap.set(po.supplier_id, current);
      });
      setSupplierDebts(Array.from(debtMap.values()).sort((a, b) => b.debt - a.debt));
    } catch (error) {
      console.error('Помилка завантаження видатків:', error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExpenses();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filters]);

  // Уніфікований список: власне видатки + оплати по закупівлях в одній стрічці,
  // щоб усе, що оформили з цієї вкладки, було видно тут незалежно від таблиці зберігання.
  const unifiedRows = useMemo(() => {
    const expenseRows = expenses.map(e => ({
      key: `expense-${e.id}`,
      rowType: 'expense',
      date: e.expense_date,
      amountUsd: parseFloat(e.amount_usd) || 0,
      customId: e.custom_id,
      categoryLabel: e.expense_categories?.name || 'Без категорії',
      counterpartyLabel: e.employee?.full_name ? `Працівник: ${e.employee.full_name}` : (e.deals?.title || e.suppliers?.name || '—'),
      managerLabel: e.creator?.full_name || '—',
      searchText: [e.expense_categories?.name, e.suppliers?.name, e.deals?.title, e.employee?.full_name, e.notes].filter(Boolean).join(' ').toLowerCase(),
      categoryId: e.category_id,
      raw: e
    }));

    const poPaymentRows = supplierPayments.map(p => ({
      key: `po-payment-${p.id}`,
      rowType: 'supplier_payment',
      date: p.payment_date || p.created_at,
      amountUsd: parseFloat(p.amount) || 0,
      customId: null,
      categoryLabel: 'Постачальник',
      counterpartyLabel: `${p.purchase_orders?.suppliers?.name || 'Постачальник'} · PO-${(p.purchase_order_id || '').substring(0, 6).toUpperCase()}`,
      managerLabel: p.users?.full_name || '—',
      searchText: [p.purchase_orders?.suppliers?.name, p.payment_category, p.notes].filter(Boolean).join(' ').toLowerCase(),
      categoryId: null,
      raw: p
    }));

    return [...expenseRows, ...poPaymentRows].sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [expenses, supplierPayments]);

  const filteredRows = useMemo(() => {
    return unifiedRows.filter(row => {
      const search = (searchTerm || '').toLowerCase();
      const matchesSearch = !search || row.searchText.includes(search);

      const rDate = new Date(row.date);
      const matchesDateFrom = filters.dateFrom ? rDate >= new Date(filters.dateFrom) : true;
      const matchesDateTo = filters.dateTo ? rDate <= new Date(filters.dateTo + 'T23:59:59') : true;
      // Постачальницькі оплати не належать жодній категорії видатків,
      // тож фільтр по конкретній категорії їх свідомо ховає.
      const matchesCategory = filters.categoryId ? row.categoryId === filters.categoryId : true;

      return matchesSearch && matchesDateFrom && matchesDateTo && matchesCategory;
    });
  }, [unifiedRows, searchTerm, filters]);

  const kpi = useMemo(() => {
    const totalSpent = filteredRows.reduce((sum, r) => sum + r.amountUsd, 0);

    const byCategory = new Map();
    filteredRows.forEach(r => {
      byCategory.set(r.categoryLabel, (byCategory.get(r.categoryLabel) || 0) + r.amountUsd);
    });
    const topCategories = Array.from(byCategory.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4);

    return { totalSpent, topCategories };
  }, [filteredRows]);

  const totalPages = Math.ceil(filteredRows.length / itemsPerPage) || 1;
  const visiblePage = Math.min(currentPage, totalPages);
  const paginatedRows = filteredRows.slice((visiblePage - 1) * itemsPerPage, visiblePage * itemsPerPage);

  const periodLabel = filters.dateFrom && filters.dateTo
    ? `${new Date(filters.dateFrom).toLocaleDateString('uk-UA')} – ${new Date(filters.dateTo).toLocaleDateString('uk-UA')}`
    : 'весь час';

  const handleExportExpenses = () => {
    if (filteredRows.length === 0) return alert('Немає даних для експорту.');

    const exportData = filteredRows.map(r => ({
      'ID': r.customId ?? '',
      'Дата': new Date(r.date).toLocaleString('uk-UA'),
      'Категорія': r.categoryLabel,
      'Сума (USD)': r.amountUsd,
      'Контрагент / Прив\'язка': r.counterpartyLabel,
      'Менеджер': r.managerLabel,
      'Коментар': r.raw.notes || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Видатки');
    XLSX.writeFile(workbook, `Видатки_${new Date().toLocaleDateString('uk-UA')}.xlsx`);
  };

  const handleRowClick = (row) => {
    if (row.rowType === 'expense') setSelectedExpense(row.raw);
    else setSelectedPoForView({ id: row.raw.purchase_order_id });
  };

  useImperativeHandle(ref, () => ({
    openNewModal: () => setIsNewExpenseModalOpen(true),
    exportExcel: handleExportExpenses
  }));

  return (
    <div className="space-y-3 md:space-y-4">

      {/* KPI + РОЗБИВКА ПО КАТЕГОРІЯХ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
          <div className="p-2.5 bg-rose-50 text-rose-600 rounded-xl"><FaMoneyBillWave size={20} /></div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Витрачено за період</p>
            <h3 className="text-lg font-black text-rose-500 mt-0.5">{kpi.totalSpent.toLocaleString()} $</h3>
            <p className="text-[9px] text-slate-400 font-bold tracking-wide uppercase mt-0.5">{periodLabel}</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5"><FaTags size={11} /> Топ категорій за період</p>
          {kpi.topCategories.length === 0 ? (
            <p className="text-xs text-slate-400 font-bold">Немає даних</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {kpi.topCategories.map(([name, sum]) => (
                <span key={name} className="px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-100 rounded-lg text-[10px] font-black uppercase tracking-wider">
                  {name}: {sum.toLocaleString()} $
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* БОРГИ ПОСТАЧАЛЬНИКАМ */}
      {supplierDebts.length > 0 && (
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5"><FaTruckLoading size={12} /> Борги постачальникам (по закупівлях)</p>
          <div className="flex flex-wrap gap-2">
            {supplierDebts.map(s => (
              <span key={s.name} className="px-3 py-1.5 bg-rose-50 text-rose-700 border border-rose-100 rounded-lg text-[10px] font-black uppercase tracking-wider">
                {s.name}: {s.debt.toLocaleString()} $
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ТАБЛИЦЯ */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden relative z-0">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100 text-slate-500 text-[10px] font-black uppercase tracking-widest">
                <th className="p-5">ID</th>
                <th className="p-5">Дата</th>
                <th className="p-5">Категорія</th>
                <th className="p-5 text-right">Сума</th>
                <th className="p-5">Контрагент / Угода</th>
                <th className="p-5">Менеджер</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan="6" className="text-center p-12 text-slate-400 font-bold uppercase tracking-widest animate-pulse">Завантаження видатків...</td></tr>
              ) : paginatedRows.length === 0 ? (
                <tr><td colSpan="6" className="text-center p-12 text-slate-400 font-bold">Видатків не знайдено</td></tr>
              ) : (
                paginatedRows.map(row => (
                  <tr key={row.key} onClick={() => handleRowClick(row)} className="hover:bg-amber-50/30 transition-colors cursor-pointer group">
                    <td className="p-5 text-xs font-mono font-bold text-slate-400">{row.customId ? `#${row.customId}` : '—'}</td>
                    <td className="p-5 text-xs font-bold text-slate-500">{new Date(row.date).toLocaleDateString('uk-UA')}</td>
                    <td className="p-5">
                      <span className={`px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest border ${row.rowType === 'supplier_payment' ? 'bg-sky-50 text-sky-800 border-sky-100' : 'bg-amber-50 text-amber-800 border-amber-100'}`}>
                        {row.categoryLabel}
                      </span>
                    </td>
                    <td className="p-5 text-right text-sm font-black text-rose-600">-{row.amountUsd.toLocaleString()} $</td>
                    <td className="p-5 text-xs font-bold text-slate-600">{row.counterpartyLabel}</td>
                    <td className="p-5 text-xs font-bold text-slate-500">{row.managerLabel}</td>
                  </tr>
                ))
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

      {isNewExpenseModalOpen && (
        <NewExpenseModal isOpen={isNewExpenseModalOpen} onClose={() => setIsNewExpenseModalOpen(false)} onSaveSuccess={fetchExpenses} />
      )}

      {selectedExpense && (
        <ExpenseDetailsModal
          isOpen={!!selectedExpense}
          onClose={() => setSelectedExpense(null)}
          expense={selectedExpense}
          categories={categories}
          onSaveSuccess={fetchExpenses}
          onOpenDeal={(dealId) => navigate(`/deals/${dealId}`)}
        />
      )}

      {selectedPoForView && (
        <PurchaseOrderModal
          isOpen={!!selectedPoForView}
          onClose={() => setSelectedPoForView(null)}
          poToEdit={selectedPoForView}
          onSaveSuccess={fetchExpenses}
        />
      )}
    </div>
  );
});

export default ExpensesTab;
