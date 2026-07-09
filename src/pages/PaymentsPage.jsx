import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { getCurrentMonthRange } from '../utils/dateTime';
import {
  FaMoneyBillWave, FaWallet, FaTags, FaPlus, FaSearch, FaFilter, FaFileDownload, FaChartLine
} from 'react-icons/fa';

import IncomeTab from './finance-tabs/IncomeTab';
import ExpensesTab from './finance-tabs/ExpensesTab';
import CategoriesTab from './finance-tabs/CategoriesTab';
import ProfitabilityTab from './finance-tabs/ProfitabilityTab';

const TABS = [
  { id: 'analytics', icon: <FaChartLine />, label: 'Аналітика' },
  { id: 'income', icon: <FaWallet />, label: 'Надходження' },
  { id: 'expenses', icon: <FaMoneyBillWave />, label: 'Видатки' },
  { id: 'categories', icon: <FaTags />, label: 'Категорії' }
];

const getIncomeDefaultFilters = () => ({ ...getCurrentMonthRange(), paymentMethod: '', onlyDebtors: false });
const getExpenseDefaultFilters = () => ({ ...getCurrentMonthRange(), categoryId: '' });

export default function PaymentsPage() {
  const [activeTab, setActiveTab] = useState('analytics');
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const [incomeSearch, setIncomeSearch] = useState('');
  const [incomeFilters, setIncomeFilters] = useState(getIncomeDefaultFilters());

  const [expenseSearch, setExpenseSearch] = useState('');
  const [expenseFilters, setExpenseFilters] = useState(getExpenseDefaultFilters());
  const [expenseCategories, setExpenseCategories] = useState([]);

  const [categorySearch, setCategorySearch] = useState('');

  const incomeTabRef = useRef(null);
  const expensesTabRef = useRef(null);
  const categoriesTabRef = useRef(null);

  useEffect(() => {
    if (activeTab === 'expenses') {
      supabase.from('expense_categories').select('id, name').order('name').then(({ data }) => setExpenseCategories(data || []));
    }
  }, [activeTab]);

  const handleNewClick = () => {
    if (activeTab === 'income') incomeTabRef.current?.openNewModal();
    else if (activeTab === 'expenses') expensesTabRef.current?.openNewModal();
    else categoriesTabRef.current?.openNewModal();
  };

  const handleExportClick = () => {
    if (activeTab === 'income') incomeTabRef.current?.exportExcel();
    else if (activeTab === 'expenses') expensesTabRef.current?.exportExcel();
  };

  const newButtonLabel = activeTab === 'income' ? 'Новий платіж' : activeTab === 'expenses' ? 'Новий видаток' : 'Нова категорія';
  const searchPlaceholder = activeTab === 'income' ? 'Пошук (назва, ПІБ, ID угоди)...' : activeTab === 'expenses' ? 'Пошук (категорія, постачальник, угода)...' : 'Пошук категорії...';

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-6 lg:px-8 py-4 md:py-8 space-y-3 md:space-y-4 bg-slate-50 min-h-full">

      <div className="bg-white p-4 md:p-6 rounded-3xl border border-slate-200 shadow-sm shrink-0 relative z-20">
        <h1 className="text-lg md:text-2xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-2.5 mb-4">
          <div className="p-2 bg-amber-500 text-slate-900 rounded-xl shadow-sm"><FaMoneyBillWave size={18} /></div>
          Фінанси
        </h1>

        <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
          <div className="flex bg-slate-100 p-1.5 rounded-2xl overflow-x-auto custom-scrollbar lg:w-auto">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setIsFilterOpen(false); }}
                className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 text-xs font-black uppercase tracking-widest rounded-xl transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>

          <div className={`flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1 lg:justify-end ${activeTab === 'analytics' ? 'hidden' : ''}`}>
            <div className="relative w-full sm:w-64">
              <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input
                type="text"
                placeholder={searchPlaceholder}
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-colors"
                value={activeTab === 'income' ? incomeSearch : activeTab === 'expenses' ? expenseSearch : categorySearch}
                onChange={(e) => {
                  if (activeTab === 'income') setIncomeSearch(e.target.value);
                  else if (activeTab === 'expenses') setExpenseSearch(e.target.value);
                  else setCategorySearch(e.target.value);
                }}
              />
            </div>

            {activeTab !== 'categories' && (
              <div className="relative flex gap-2">
                <button
                  onClick={() => setIsFilterOpen(!isFilterOpen)}
                  className={`flex-1 sm:flex-none p-3 flex items-center justify-center gap-2 rounded-xl border font-bold text-xs uppercase tracking-wider transition-colors ${isFilterOpen ? 'bg-amber-100 text-amber-600 border-amber-200' : 'bg-slate-50 hover:bg-slate-100 text-slate-500 border-slate-200'}`}
                >
                  <FaFilter size={12} /> Фільтри
                </button>

                <button
                  onClick={handleExportClick}
                  className="flex-1 sm:flex-none p-3 flex items-center justify-center gap-2 rounded-xl border bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100 font-bold text-xs uppercase tracking-wider transition-colors"
                  title="Експорт в Excel (.xlsx)"
                >
                  <FaFileDownload size={12} /> Excel
                </button>

                {isFilterOpen && activeTab === 'income' && (
                  <div className="absolute right-0 top-[115%] mt-1 w-72 bg-white border border-slate-200 rounded-2xl p-4 z-50 shadow-2xl space-y-4">
                    <div>
                      <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Період оплати</label>
                      <div className="grid grid-cols-2 gap-2">
                        <input type="date" className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-amber-500" value={incomeFilters.dateFrom} onChange={e => setIncomeFilters({ ...incomeFilters, dateFrom: e.target.value })} />
                        <input type="date" className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-amber-500" value={incomeFilters.dateTo} onChange={e => setIncomeFilters({ ...incomeFilters, dateTo: e.target.value })} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Тип оплати</label>
                      <select className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-amber-500 cursor-pointer" value={incomeFilters.paymentMethod} onChange={e => setIncomeFilters({ ...incomeFilters, paymentMethod: e.target.value })}>
                        <option value="">Усі варіанти</option>
                        <option value="Готівка">Готівка</option>
                        <option value="Картка">Картка</option>
                        <option value="Банківський переказ">Банківський переказ</option>
                      </select>
                    </div>
                    <div className="pt-2 border-t border-slate-100">
                      <label className="flex items-center gap-3 cursor-pointer p-1">
                        <input type="checkbox" className="w-4 h-4 text-amber-500 rounded border-slate-300 focus:ring-amber-500" checked={incomeFilters.onlyDebtors} onChange={e => setIncomeFilters({ ...incomeFilters, onlyDebtors: e.target.checked })} />
                        <span className="text-xs font-bold text-slate-700">Тільки об'єкти з боргом</span>
                      </label>
                    </div>
                    <button onClick={() => setIncomeFilters(getIncomeDefaultFilters())} className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors">
                      Скинути до поточного місяця
                    </button>
                  </div>
                )}

                {isFilterOpen && activeTab === 'expenses' && (
                  <div className="absolute right-0 top-[115%] mt-1 w-72 bg-white border border-slate-200 rounded-2xl p-4 z-50 shadow-2xl space-y-4">
                    <div>
                      <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Період</label>
                      <div className="grid grid-cols-2 gap-2">
                        <input type="date" className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-amber-500" value={expenseFilters.dateFrom} onChange={e => setExpenseFilters({ ...expenseFilters, dateFrom: e.target.value })} />
                        <input type="date" className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-amber-500" value={expenseFilters.dateTo} onChange={e => setExpenseFilters({ ...expenseFilters, dateTo: e.target.value })} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Категорія</label>
                      <select className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-amber-500 cursor-pointer" value={expenseFilters.categoryId} onChange={e => setExpenseFilters({ ...expenseFilters, categoryId: e.target.value })}>
                        <option value="">Усі категорії</option>
                        {expenseCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <button onClick={() => setExpenseFilters(getExpenseDefaultFilters())} className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors">
                      Скинути до поточного місяця
                    </button>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={handleNewClick}
              className="bg-slate-900 hover:bg-slate-800 text-amber-500 px-6 py-3 rounded-xl font-black text-xs transition-colors flex items-center justify-center gap-2 uppercase tracking-widest shadow-lg shadow-slate-900/10 whitespace-nowrap"
            >
              <FaPlus size={12} /> {newButtonLabel}
            </button>
          </div>
        </div>
      </div>

      <div className={activeTab === 'analytics' ? '' : 'hidden'}>
        <ProfitabilityTab />
      </div>
      <div className={activeTab === 'income' ? '' : 'hidden'}>
        <IncomeTab ref={incomeTabRef} searchTerm={incomeSearch} filters={incomeFilters} />
      </div>
      <div className={activeTab === 'expenses' ? '' : 'hidden'}>
        <ExpensesTab ref={expensesTabRef} searchTerm={expenseSearch} filters={expenseFilters} categories={expenseCategories} />
      </div>
      <div className={activeTab === 'categories' ? '' : 'hidden'}>
        <CategoriesTab ref={categoriesTabRef} searchTerm={categorySearch} />
      </div>
    </div>
  );
}
