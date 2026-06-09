import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthProvider'; 
import * as XLSX from 'xlsx';
import { 
  FaPlus, FaSearch, FaTimes, FaFilter, FaMoneyBillWave, 
  FaUserTie, FaBuilding, FaUser, FaWallet, 
  FaArrowRight, FaExclamationCircle, FaCheckCircle, FaCommentAlt,
  FaChevronLeft, FaChevronRight, FaChartLine, FaFileDownload,
  FaTrash // Додано імпорт іконки кошика
} from 'react-icons/fa';

export default function PaymentsPage() {
  const navigate = useNavigate();
  const { employeeProfile } = useAuth(); 

  const [payments, setPayments] = useState([]);
  const [deals, setDeals] = useState([]); 
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    paymentMethod: '',
    onlyDebtors: false
  });
  
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    deal_id: '',
    client_id: '',
    amount_usd: '',
    exchange_rate: '43.5',
    amount_uah: '',
    payment_method: 'Готівка',
    payment_category: 'Аванс',
    payment_date: new Date().toISOString().slice(0, 16), 
    notes: ''
  });

  const [dealSearchText, setDealSearchText] = useState('');
  const [isDealDropdownOpen, setIsDealDropdownOpen] = useState(false);
  const [selectedDealInfo, setSelectedDealInfo] = useState(null);

  // СТАНИ ДЛЯ ВИДАЛЕННЯ
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [paymentToDelete, setPaymentToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: paymentsData, error: paymentsError } = await supabase
        .from('payments')
        .select('*, deals(*, clients(*)), users(full_name)')
        .order('payment_date', { ascending: false });

      if (paymentsError) throw paymentsError;
      setPayments(paymentsData || []);

      const { data: dealsData, error: dealsError } = await supabase
        .from('deals')
        .select('*, clients(*)');

      if (dealsError) throw dealsError;
      setDeals(dealsData || []);

    } catch (error) {
      console.error('Помилка завантаження даних:', error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const usd = parseFloat(formData.amount_usd) || 0;
    const rate = parseFloat(formData.exchange_rate) || 0;
    setFormData(prev => ({ ...prev, amount_uah: (usd * rate).toFixed(0) }));
  }, [formData.amount_usd, formData.exchange_rate]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filters]);

  const getDealDebtStatus = (deal) => {
    if (!deal) return { debt: 0, isPaid: true };
    const dealPayments = payments
      .filter(p => p.deal_id === deal.id)
      .reduce((sum, p) => sum + (parseFloat(p.amount_usd) || 0), 0);
    const debt = (parseFloat(deal.final_budget) || 0) - dealPayments;
    return {
      debt: debt > 0 ? debt : 0,
      isPaid: debt <= 0
    };
  };

  const filteredPayments = useMemo(() => {
    return payments.filter(p => {
      const search = searchTerm.toLowerCase();
      
      const matchesSearch = searchTerm ? (
        p.deals?.custom_id?.toString().includes(search) ||
        p.deals?.clients?.custom_id?.toString().includes(search) ||
        p.deals?.title?.toLowerCase().includes(search) ||
        p.deals?.clients?.name?.toLowerCase().includes(search)
      ) : true;

      const pDate = new Date(p.payment_date);
      const matchesDateFrom = filters.dateFrom ? pDate >= new Date(filters.dateFrom) : true;
      const matchesDateTo = filters.dateTo ? pDate <= new Date(filters.dateTo + 'T23:59:59') : true;
      const matchesMethod = filters.paymentMethod ? p.payment_method === filters.paymentMethod : true;

      let matchesDebtor = true;
      if (filters.onlyDebtors && p.deals) {
        const { isPaid } = getDealDebtStatus(p.deals);
        matchesDebtor = !isPaid;
      }

      return matchesSearch && matchesDateFrom && matchesDateTo && matchesMethod && matchesDebtor;
    });
  }, [payments, searchTerm, filters, deals]);

  const metrics = useMemo(() => {
    const totalUsd = filteredPayments.reduce((sum, p) => sum + (parseFloat(p.amount_usd) || 0), 0);
    const totalUah = filteredPayments.reduce((sum, p) => sum + (parseFloat(p.amount_uah) || 0), 0);
    const avgUsd = filteredPayments.length > 0 ? totalUsd / filteredPayments.length : 0;
    
    let totalDebt = 0;
    deals.forEach(deal => {
      if (deal.status === 'В роботі' || deal.status === 'Клієнт на паузі') {
        const dealPayments = payments
          .filter(p => p.deal_id === deal.id)
          .reduce((sum, p) => sum + (parseFloat(p.amount_usd) || 0), 0);
        const debt = (parseFloat(deal.final_budget) || 0) - dealPayments;
        if (debt > 0) totalDebt += debt;
      }
    });

    return { totalUsd, totalUah, totalDebt, avgUsd };
  }, [filteredPayments, payments, deals]);

  const totalPages = Math.ceil(filteredPayments.length / itemsPerPage) || 1;
  const paginatedPayments = filteredPayments.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleSubmitPayment = async (e) => {
    e.preventDefault();
    if (!formData.deal_id || !formData.client_id || !formData.amount_usd) {
      alert('Будь ласка, заповніть усі обов’язкові поля та оберіть угоду.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        deal_id: formData.deal_id,
        client_id: formData.client_id,
        amount_usd: parseFloat(formData.amount_usd),
        exchange_rate: parseFloat(formData.exchange_rate),
        amount_uah: parseFloat(formData.amount_uah),
        payment_method: formData.payment_method,
        payment_category: formData.payment_category,
        payment_date: new Date(formData.payment_date).toISOString(),
        created_by: employeeProfile?.id || '00000000-0000-0000-0000-000000000000',
        notes: formData.notes || null
      };

      const { error } = await supabase.from('payments').insert([payload]);
      if (error) throw error;

      setIsModalOpen(false);
      setFormData({
        deal_id: '', client_id: '', amount_usd: '', exchange_rate: '43.5',
        amount_uah: '', payment_method: 'Готівка', payment_category: 'Аванс',
        payment_date: new Date().toISOString().slice(0, 16), notes: ''
      });
      setDealSearchText('');
      setSelectedDealInfo(null);
      fetchData();
    } catch (error) {
      alert('Помилка при збереженні платежу: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ЛОГІКА ВИДАЛЕННЯ
  const handleDeleteClick = (payment) => {
    setPaymentToDelete(payment);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!paymentToDelete) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('payments')
        .delete()
        .eq('id', paymentToDelete.id);

      if (error) throw error;

      setIsDeleteModalOpen(false);
      setPaymentToDelete(null);
      fetchData(); // Оновлюємо дані після видалення
    } catch (error) {
      alert('Помилка при видаленні платежу: ' + error.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExportExcel = () => {
    if (filteredPayments.length === 0) {
      alert('Немає даних для експорту');
      return;
    }

    const exportData = filteredPayments.map(p => {
      const debtStatus = getDealDebtStatus(p.deals);
      const pDate = new Date(p.payment_date);

      return {
        "Дата транзакції": pDate.toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
        "Клієнт": p.deals?.clients?.name || 'Невказано',
        "ID Клієнта": p.deals?.clients?.custom_id || '',
        "Угода / Об'єкт": p.deals?.title || 'Невказано',
        "ID Угоди": p.deals?.custom_id || '',
        "Внесена Сума (USD)": Number(p.amount_usd) || 0,
        "Курс (UAH/USD)": Number(p.exchange_rate) || 0,
        "Внесена Сума (UAH)": Number(p.amount_uah) || 0,
        "Форма оплати": p.payment_method,
        "Призначення": p.payment_category,
        "Поточний борг по угоді (USD)": Number(debtStatus.debt) || 0,
        "Менеджер": p.users?.full_name || 'Система',
        "Примітки": p.notes || ""
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);

    worksheet['!cols'] = [
      { wch: 18 }, { wch: 25 }, { wch: 12 }, { wch: 30 }, { wch: 12 }, 
      { wch: 20 }, { wch: 15 }, { wch: 20 }, { wch: 20 }, { wch: 22 }, 
      { wch: 28 }, { wch: 20 }, { wch: 40 }
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Платежі");

    const fileName = `payments_export_${new Date().toLocaleDateString('uk-UA')}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  const filteredDealsForSelect = deals.filter(d => 
    d.title?.toLowerCase().includes(dealSearchText.toLowerCase()) ||
    d.clients?.name?.toLowerCase().includes(dealSearchText.toLowerCase()) ||
    d.custom_id?.toString().includes(dealSearchText) ||
    d.clients?.custom_id?.toString().includes(dealSearchText)
  );

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-6 lg:px-8 py-4 md:py-8 space-y-4 md:space-y-6 bg-slate-50 min-h-full">
      
      {/* 1. ПАНЕЛЬ КЕРУВАННЯ */}
      <div className="bg-white p-4 md:p-6 rounded-3xl border border-slate-200 flex flex-col lg:flex-row items-center gap-4 shadow-sm relative z-20">
        <div className="flex-1 w-full flex items-center justify-between lg:justify-start gap-4">
          <h1 className="text-lg md:text-2xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-2.5">
            <div className="p-2 bg-amber-500 text-slate-900 rounded-xl shadow-sm"><FaMoneyBillWave size={18}/></div>
            Каса та Платежі
          </h1>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto relative">
          <div className="relative w-full sm:w-64">
            <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input 
              type="text" 
              placeholder="Пошук (Назва, ПІБ, ID Угоди)..." 
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
              <FaFilter size={12}/> Фільтри
            </button>

            <button 
              onClick={handleExportExcel}
              className="flex-1 sm:flex-none p-3 flex items-center justify-center gap-2 rounded-xl border bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100 font-bold text-xs uppercase tracking-wider transition-colors"
              title="Експорт в Excel (.xlsx)"
            >
              <FaFileDownload size={12}/> Excel
            </button>

            {isFilterOpen && (
              <div className="absolute right-0 top-[115%] mt-1 w-72 bg-white border border-slate-200 rounded-2xl p-4 z-50 shadow-2xl space-y-4">
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Період оплати</label>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="date" className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-amber-500" value={filters.dateFrom} onChange={e => setFilters({...filters, dateFrom: e.target.value})} />
                    <input type="date" className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-amber-500" value={filters.dateTo} onChange={e => setFilters({...filters, dateTo: e.target.value})} />
                  </div>
                </div>

                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Тип оплати</label>
                  <select className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-amber-500 cursor-pointer" value={filters.paymentMethod} onChange={e => setFilters({...filters, paymentMethod: e.target.value})}>
                    <option value="">Усі варіанти</option>
                    <option value="Готівка">Готівка</option>
                    <option value="Картка">Картка</option>
                    <option value="Банківський переказ">Банківський переказ</option>
                  </select>
                </div>

                <div className="pt-2 border-t border-slate-100">
                  <label className="flex items-center gap-3 cursor-pointer p-1">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 text-amber-500 rounded border-slate-300 focus:ring-amber-500" 
                      checked={filters.onlyDebtors}
                      onChange={e => setFilters({...filters, onlyDebtors: e.target.checked})}
                    />
                    <span className="text-xs font-bold text-slate-700">Тільки об'єкти з боргом</span>
                  </label>
                </div>

                <button 
                  onClick={() => setFilters({ dateFrom: '', dateTo: '', paymentMethod: '', onlyDebtors: false })} 
                  className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors"
                >
                  Скинути налаштування
                </button>
              </div>
            )}
          </div>
          
          <button 
            onClick={() => setIsModalOpen(true)} 
            className="bg-slate-900 hover:bg-slate-800 text-amber-500 px-6 py-3 rounded-xl font-black text-xs transition-colors flex items-center justify-center gap-2 uppercase tracking-widest shadow-lg shadow-slate-900/10"
          >
            <FaPlus size={12} /> Новий платіж
          </button>
        </div>
      </div>

      {/* 2. АНАЛІТИЧНІ КАРТКИ */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 relative z-10">
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl"><FaWallet size={24}/></div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Всього отримано</p>
            <h3 className="text-xl font-black text-emerald-500 mt-0.5">{metrics.totalUsd.toLocaleString()} $</h3>
            <p className="text-[10px] text-slate-400 font-bold tracking-wide uppercase mt-0.5">По поточним фільтрам</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl"><FaExclamationCircle size={24}/></div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Загальний активний борг</p>
            <h3 className="text-xl font-black text-rose-500 mt-0.5">{metrics.totalDebt.toLocaleString()} $</h3>
            <p className="text-[10px] text-slate-400 font-bold tracking-wide uppercase mt-0.5">Всі відкриті угоди</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl"><FaChartLine size={24}/></div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Середній чек (платіж)</p>
            <h3 className="text-xl font-black text-slate-800 mt-0.5">~ {Math.round(metrics.avgUsd).toLocaleString()} $</h3>
            <p className="text-[10px] text-slate-400 font-bold tracking-wide uppercase mt-0.5">За обраний період</p>
          </div>
        </div>
      </div>

      {/* 3. ТАБЛИЦЯ ТРАНЗАКЦІЙ */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden relative z-0 flex flex-col">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100 text-slate-500 text-[10px] font-black uppercase tracking-widest">
                <th className="p-5">Дата транзакції</th>
                <th className="p-5">Клієнт / Об'єкт (Угода)</th>
                <th className="p-5">Внесена сума</th>
                <th className="p-5">Тип та Призначення</th>
                <th className="p-5 text-center">Стан угоди</th>
                <th className="p-5 text-right">Менеджер</th>
                <th className="p-5 text-center">Дії</th> {/* Нова колонка */}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan="7" className="text-center p-12 text-slate-400 font-bold uppercase tracking-widest animate-pulse">Завантаження каси...</td></tr>
              ) : paginatedPayments.length === 0 ? (
                <tr><td colSpan="7" className="text-center p-12 font-bold text-sm text-slate-400">Платежів не знайдено за обраними критеріями</td></tr>
              ) : (
                paginatedPayments.map((payment) => {
                  const debtStatus = getDealDebtStatus(payment.deals);
                  const isBusiness = payment.deals?.clients?.client_type === 'Юридична особа';
                  const pDate = new Date(payment.payment_date);

                  return (
                    <tr key={payment.id} className="hover:bg-amber-50/30 transition-colors group">
                      <td className="p-5">
                        <div className="text-[11px] font-black text-slate-700">{pDate.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' })}</div>
                        <div className="text-[10px] font-bold text-slate-400 mt-1 uppercase">{pDate.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}</div>
                      </td>
                      <td className="p-5">
                        <div className="flex items-center gap-2">
                          <span className={`p-1.5 rounded-md ${isBusiness ? 'bg-amber-50 text-amber-600' : 'bg-slate-50 text-slate-400'}`}>
                            {isBusiness ? <FaBuilding size={12}/> : <FaUser size={12}/>}
                          </span>
                          <span className="font-bold text-slate-900 text-sm">{payment.deals?.clients?.name || 'Невказано'}</span>
                        </div>
                        {payment.deals && (
                          <div 
                            onClick={() => navigate(`/deals/${payment.deals.id}`)}
                            className="text-[10px] text-amber-600 font-black uppercase tracking-widest mt-1 hover:underline cursor-pointer flex items-center gap-1.5 inline-flex"
                          >
                            {payment.deals.title} <FaArrowRight size={8}/>
                          </div>
                        )}
                      </td>
                      <td className="p-5">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-emerald-600 text-base">+{Number(payment.amount_usd).toLocaleString()} $</span>
                          {payment.notes && (
                            <span className="text-slate-300 hover:text-amber-500 cursor-help transition-colors" title={payment.notes}>
                              <FaCommentAlt size={12} />
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-wider">
                          {Number(payment.amount_uah).toLocaleString()} ₴ <span className="text-slate-300">(курс {payment.exchange_rate})</span>
                        </div>
                      </td>
                      <td className="p-5 space-y-1.5">
                        <div><span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-md text-[9px] font-black uppercase tracking-widest">{payment.payment_method}</span></div>
                        <div><span className="px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-100 rounded-md text-[9px] font-black uppercase tracking-widest">{payment.payment_category}</span></div>
                      </td>
                      <td className="p-5 text-center">
                        {debtStatus.isPaid ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-[10px] font-black uppercase tracking-widest border border-emerald-100"><FaCheckCircle size={12}/> Оплачено</span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 text-rose-700 rounded-lg text-[10px] font-black uppercase tracking-widest border border-rose-100"><FaExclamationCircle size={12}/> Борг: {debtStatus.debt.toLocaleString()} $</span>
                        )}
                      </td>
                      <td className="p-5 text-right text-[11px] font-black text-slate-400 uppercase tracking-widest">{payment.users?.full_name || 'Система'}</td>
                      
                      {/* Кнопка видалення */}
                      <td className="p-5 text-center">
                        <button
                          onClick={() => handleDeleteClick(payment)}
                          className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                          title="Видалити платіж"
                        >
                          <FaTrash size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="p-4 md:p-5 border-t border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Показано {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, filteredPayments.length)} з {filteredPayments.length}
            </span>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-400 hover:text-amber-600 hover:border-amber-300 disabled:opacity-50 disabled:hover:border-slate-200 disabled:hover:text-slate-400 transition-colors"
              >
                <FaChevronLeft size={10}/>
              </button>
              <div className="px-3 text-xs font-black text-slate-700">{currentPage} <span className="text-slate-400 font-bold mx-1">/</span> {totalPages}</div>
              <button 
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-400 hover:text-amber-600 hover:border-amber-300 disabled:opacity-50 disabled:hover:border-slate-200 disabled:hover:text-slate-400 transition-colors"
              >
                <FaChevronRight size={10}/>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 4. МОДАЛЬНЕ ВІКНО СТВОРЕННЯ */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-lg flex flex-col h-[85vh] sm:h-auto max-h-[90vh]">
            
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-900 text-white shrink-0 sm:rounded-t-3xl">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500 text-slate-900 rounded-lg"><FaPlus size={14}/></div>
                <div>
                  <h3 className="text-sm md:text-base font-black uppercase tracking-tight">Нова фінансова транзакція</h3>
                  <p className="text-[9px] text-amber-500 font-bold uppercase tracking-widest mt-0.5">+ Фіксація в касі</p>
                </div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-2 bg-white/10 text-white hover:bg-white/20 rounded-full transition-colors"><FaTimes size={16} /></button>
            </div>

            <form id="paymentForm" onSubmit={handleSubmitPayment} className="p-4 md:p-6 overflow-y-auto custom-scrollbar space-y-5 bg-slate-50/50 flex-1">
              
              <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 space-y-2 relative">
                <label className="block text-[10px] font-black text-slate-400 uppercase ml-1 tracking-widest">Обрати Об'єкт / Угоду *</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none"><FaUserTie className="text-slate-400" size={14} /></div>
                  <input 
                    type="text" 
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-xs sm:text-sm font-bold text-slate-800 focus:border-amber-500 transition-colors"
                    placeholder="Введіть назву об'єкту, ПІБ або ID..." 
                    value={dealSearchText}
                    onChange={(e) => {
                      setDealSearchText(e.target.value);
                      setIsDealDropdownOpen(true);
                      setFormData({...formData, deal_id: '', client_id: ''});
                      setSelectedDealInfo(null);
                    }}
                    onFocus={() => setIsDealDropdownOpen(true)}
                  />
                  
                  {isDealDropdownOpen && dealSearchText && (
                    <div className="absolute z-[120] w-full mt-2 bg-white border border-slate-200 rounded-xl shadow-2xl max-h-60 overflow-y-auto custom-scrollbar left-0">
                      {filteredDealsForSelect.length > 0 ? filteredDealsForSelect.map(d => (
                        <div 
                          key={d.id}
                          onMouseDown={() => {
                            setFormData({ ...formData, deal_id: d.id, client_id: d.client_id });
                            setDealSearchText(`№${d.custom_id} — ${d.title}`);
                            setIsDealDropdownOpen(false);
                            
                            const currentPaid = payments
                              .filter(p => p.deal_id === d.id)
                              .reduce((sum, p) => sum + (parseFloat(p.amount_usd) || 0), 0);
                            setSelectedDealInfo({
                              budget: d.final_budget,
                              paid: currentPaid,
                              client: d.clients?.name
                            });
                          }}
                          className="px-4 py-3 hover:bg-amber-50 cursor-pointer border-b border-slate-50 flex justify-between items-center transition-colors"
                        >
                          <div>
                            <div className="font-bold text-slate-800 text-xs">{d.title}</div>
                            <div className="text-[10px] text-slate-400 font-bold tracking-wide mt-0.5 uppercase">Клієнт: {d.clients?.name}</div>
                          </div>
                          <div className="text-xs font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded">{Number(d.final_budget).toLocaleString()} $</div>
                        </div>
                      )) : (
                        <div className="p-4 text-xs font-bold text-slate-400 text-center uppercase tracking-widest">Нічого не знайдено</div>
                      )}
                    </div>
                  )}
                </div>

                {selectedDealInfo && (
                  <div className="mt-3 p-3 bg-amber-50 border border-amber-100 rounded-xl text-[11px] space-y-1.5">
                    <div className="font-bold text-slate-500 uppercase tracking-wider">Клієнт: <span className="text-slate-900">{selectedDealInfo.client}</span></div>
                    <div className="flex justify-between font-bold text-slate-500 bg-white p-2 rounded-lg border border-amber-200/50">
                      <span>Бюджет: <b>{Number(selectedDealInfo.budget).toLocaleString()} $</b></span>
                      <span>Внесено: <b className="text-emerald-600">{Number(selectedDealInfo.paid).toLocaleString()} $</b></span>
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1 tracking-widest">Сума ($) *</label>
                    <input 
                      type="number" step="0.01" required 
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black text-slate-800 outline-none focus:border-amber-500 transition-colors" 
                      placeholder="Напр. 1500"
                      value={formData.amount_usd}
                      onChange={e => setFormData({...formData, amount_usd: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1 tracking-widest">Курс (₴/$)</label>
                    <input 
                      type="number" step="0.01" required 
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black text-slate-800 outline-none focus:border-amber-500 transition-colors" 
                      value={formData.exchange_rate}
                      onChange={e => setFormData({...formData, exchange_rate: e.target.value})}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1 tracking-widest">Сума в UAH (Розрахунок)</label>
                  <input 
                    type="number" 
                    className="w-full p-3 bg-slate-100 border border-slate-200 rounded-xl text-sm font-black text-slate-500 outline-none cursor-not-allowed" 
                    value={formData.amount_uah}
                    readOnly
                  />
                </div>
              </div>

              <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1 tracking-widest">Форма оплати</label>
                  <select 
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black uppercase tracking-wider outline-none cursor-pointer focus:border-amber-500"
                    value={formData.payment_method}
                    onChange={e => setFormData({...formData, payment_method: e.target.value})}
                  >
                    <option value="Готівка">Готівка</option>
                    <option value="Картка">Картка</option>
                    <option value="Банківський переказ">Банківський переказ</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1 tracking-widest">Призначення</label>
                  <select 
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black uppercase tracking-wider outline-none cursor-pointer focus:border-amber-500"
                    value={formData.payment_category}
                    onChange={e => setFormData({...formData, payment_category: e.target.value})}
                  >
                    <option value="Аванс">Аванс</option>
                    <option value="Часткова оплата">Часткова оплата</option>
                    <option value="Повна оплата">Повна оплата</option>
                    <option value="Кредит/Розтермінування">Кредит/Розтермінування</option>
                  </select>
                </div>
              </div>

              <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 space-y-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1 tracking-widest">Дата транзакції</label>
                  <input 
                    type="datetime-local" 
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black outline-none focus:border-amber-500 transition-colors text-slate-700" 
                    value={formData.payment_date}
                    onChange={e => setFormData({...formData, payment_date: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1 tracking-widest">Коментар / Примітки</label>
                  <textarea 
                    rows="2" 
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-amber-500 resize-none transition-colors" 
                    placeholder="Додаткова інформація по платежу..."
                    value={formData.notes}
                    onChange={e => setFormData({...formData, notes: e.target.value})}
                  />
                </div>
              </div>
            </form>

            <div className="p-4 md:p-5 border-t border-slate-100 flex gap-3 bg-white shrink-0 sm:rounded-b-3xl">
              <button 
                type="button" 
                onClick={() => setIsModalOpen(false)} 
                className="w-1/3 py-3.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors uppercase tracking-widest"
              >
                Скасувати
              </button>
              <button 
                form="paymentForm" 
                type="submit" 
                disabled={isSubmitting || !formData.deal_id} 
                className="w-2/3 py-3.5 bg-amber-500 hover:bg-amber-400 text-slate-900 rounded-xl font-black text-xs uppercase tracking-widest transition-colors disabled:opacity-40 flex items-center justify-center shadow-lg shadow-amber-500/20"
              >
                {isSubmitting ? 'ОБРОБКА...' : 'ПРОВЕСТИ ПЛАТІЖ'}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* 5. МОДАЛЬНЕ ВІКНО ПІДТВЕРДЖЕННЯ ВИДАЛЕННЯ */}
      {isDeleteModalOpen && paymentToDelete && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-5 bg-rose-50 border-b border-rose-100 flex items-center justify-center">
              <div className="p-3 bg-rose-100 rounded-full text-rose-500 shadow-sm">
                <FaTrash size={28} />
              </div>
            </div>
            
            <div className="p-6 text-center space-y-4 bg-white">
              <h3 className="text-xl font-black text-slate-800 tracking-tight">Видалити платіж?</h3>
              <p className="text-sm font-medium text-slate-500 leading-relaxed">
                Ви дійсно хочете безповоротно видалити транзакцію на суму <br/>
                <span className="text-lg font-black text-rose-500 block mt-2">
                  {Number(paymentToDelete.amount_usd).toLocaleString()} $
                </span>
              </p>
            </div>
            
            <div className="p-4 border-t border-slate-100 flex gap-3 bg-slate-50">
              <button
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  setPaymentToDelete(null);
                }}
                className="flex-1 py-3 text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 hover:text-slate-800 rounded-xl transition-colors uppercase tracking-widest shadow-sm"
              >
                Скасувати
              </button>
              <button
                onClick={confirmDelete}
                disabled={isDeleting}
                className="flex-1 py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-colors disabled:opacity-50 shadow-lg shadow-rose-500/20"
              >
                {isDeleting ? 'Видалення...' : 'Видалити'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}