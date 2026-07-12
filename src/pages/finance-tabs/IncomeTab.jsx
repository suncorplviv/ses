import React, { useState, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../AuthProvider';
import * as XLSX from 'xlsx';
import { toLocalDateTimeInputValue } from '../../utils/dateTime';
import {
  FaPlus, FaTimes, FaUserTie, FaBuilding, FaUser, FaWallet,
  FaArrowRight, FaExclamationCircle, FaCheckCircle, FaChevronLeft, FaChevronRight
} from 'react-icons/fa';

import PaymentDetailsModal from '../../modals/PaymentDetailsModal';

const IncomeTab = forwardRef(function IncomeTab({ searchTerm, filters }, ref) {
  const navigate = useNavigate();
  const { employeeProfile } = useAuth();

  const [payments, setPayments] = useState([]);
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    payment_date: toLocalDateTimeInputValue(),
    notes: ''
  });

  const [dealSearchText, setDealSearchText] = useState('');
  const [isDealDropdownOpen, setIsDealDropdownOpen] = useState(false);
  const [selectedDealInfo, setSelectedDealInfo] = useState(null);

  const [selectedPayment, setSelectedPayment] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Каса показує ВСІ надходження: і по угодах (СЕС), і по продажах зі складу
      const { data: paymentsData, error: paymentsError } = await supabase
        .from('payments')
        .select('*, deals(*, clients(*)), sales(custom_id, clients(name, client_type, custom_id)), users(full_name)')
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
      const search = (searchTerm || '').toLowerCase();

      const matchesSearch = search ? (
        p.deals?.custom_id?.toString().includes(search) ||
        p.deals?.clients?.custom_id?.toString().includes(search) ||
        p.deals?.title?.toLowerCase().includes(search) ||
        p.deals?.clients?.name?.toLowerCase().includes(search) ||
        p.sales?.custom_id?.toString().includes(search) ||
        p.sales?.clients?.name?.toLowerCase().includes(search)
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
  }, [payments, searchTerm, filters]);

  // "Отримано" рахується ЛИШЕ по відфільтрованому періоду,
  // а "Борг" — по ВСІХ угодах і ВСІХ платежах, незалежно від фільтра дат.
  const metrics = useMemo(() => {
    const totalUsd = filteredPayments.reduce((sum, p) => sum + (parseFloat(p.amount_usd) || 0), 0);

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

    return { totalUsd, totalDebt };
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
        payment_date: toLocalDateTimeInputValue(), notes: ''
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

  const handleExportExcel = () => {
    if (filteredPayments.length === 0) {
      alert('Немає даних для експорту');
      return;
    }

    const exportData = filteredPayments.map(p => {
      const debtStatus = getDealDebtStatus(p.deals);
      const pDate = new Date(p.payment_date);
      const clientInfo = p.deals?.clients || p.sales?.clients;

      return {
        "Дата транзакції": pDate.toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
        "Клієнт": clientInfo?.name || 'Невказано',
        "ID Клієнта": clientInfo?.custom_id || '',
        "Угода / Об'єкт": p.deals?.title || (p.sale_id ? `Продаж зі складу №${p.sales?.custom_id || ''}` : 'Невказано'),
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
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Надходження");
    XLSX.writeFile(workbook, `Надходження_${new Date().toLocaleDateString('uk-UA')}.xlsx`);
  };

  useImperativeHandle(ref, () => ({
    openNewModal: () => setIsModalOpen(true),
    exportExcel: handleExportExcel
  }));

  const filteredDealsForSelect = deals.filter(d =>
    d.title?.toLowerCase().includes(dealSearchText.toLowerCase()) ||
    d.clients?.name?.toLowerCase().includes(dealSearchText.toLowerCase()) ||
    d.custom_id?.toString().includes(dealSearchText) ||
    d.clients?.custom_id?.toString().includes(dealSearchText)
  );

  const periodLabel = filters.dateFrom && filters.dateTo
    ? `${new Date(filters.dateFrom).toLocaleDateString('uk-UA')} – ${new Date(filters.dateTo).toLocaleDateString('uk-UA')}`
    : 'весь час';

  return (
    <div className="space-y-3 md:space-y-4">

      {/* АНАЛІТИЧНІ КАРТКИ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
          <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl"><FaWallet size={20} /></div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Отримано за період</p>
            <h3 className="text-lg font-black text-emerald-500 mt-0.5">{metrics.totalUsd.toLocaleString()} $</h3>
            <p className="text-[9px] text-slate-400 font-bold tracking-wide uppercase mt-0.5">{periodLabel}</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
          <div className="p-2.5 bg-rose-50 text-rose-600 rounded-xl"><FaExclamationCircle size={20} /></div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Загальний борг</p>
            <h3 className="text-lg font-black text-rose-500 mt-0.5">{metrics.totalDebt.toLocaleString()} $</h3>
            <p className="text-[9px] text-slate-400 font-bold tracking-wide uppercase mt-0.5">За весь час</p>
          </div>
        </div>
      </div>

      {/* ТАБЛИЦЯ ТРАНЗАКЦІЙ */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden relative z-0 flex flex-col">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100 text-slate-500 text-[10px] font-black uppercase tracking-widest">
                <th className="p-5">Дата</th>
                <th className="p-5">Клієнт / Угода</th>
                <th className="p-5">Сума</th>
                <th className="p-5">Метод / Призначення</th>
                <th className="p-5 text-center">Стан угоди</th>
                <th className="p-5 text-right">Менеджер</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan="6" className="text-center p-12 text-slate-400 font-bold uppercase tracking-widest animate-pulse">Завантаження каси...</td></tr>
              ) : paginatedPayments.length === 0 ? (
                <tr><td colSpan="6" className="text-center p-12 font-bold text-sm text-slate-400">Платежів не знайдено за обраними критеріями</td></tr>
              ) : (
                paginatedPayments.map((payment) => {
                  const isSalePayment = !!payment.sale_id;
                  const clientInfo = payment.deals?.clients || payment.sales?.clients;
                  const debtStatus = getDealDebtStatus(payment.deals);
                  const isBusiness = clientInfo?.client_type === 'Юридична особа';
                  const pDate = new Date(payment.payment_date);

                  return (
                    <tr key={payment.id} onClick={() => setSelectedPayment(payment)} className="hover:bg-amber-50/30 transition-colors cursor-pointer group">
                      <td className="p-5">
                        <div className="text-[11px] font-black text-slate-700">{pDate.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' })}</div>
                        <div className="text-[10px] font-bold text-slate-400 mt-1 uppercase">{pDate.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}</div>
                      </td>
                      <td className="p-5">
                        <div className="flex items-center gap-2">
                          <span className={`p-1.5 rounded-md ${isBusiness ? 'bg-amber-50 text-amber-600' : 'bg-slate-50 text-slate-400'}`}>
                            {isBusiness ? <FaBuilding size={12} /> : <FaUser size={12} />}
                          </span>
                          <span className="font-bold text-slate-900 text-sm group-hover:text-amber-600 transition-colors">{clientInfo?.name || 'Невказано'}</span>
                        </div>
                        {payment.deals && (
                          <div className="text-[10px] text-amber-600 font-black uppercase tracking-widest mt-1 flex items-center gap-1.5">
                            {payment.deals.title} <FaArrowRight size={8} />
                          </div>
                        )}
                        {isSalePayment && (
                          <div className="text-[10px] text-emerald-600 font-black uppercase tracking-widest mt-1">
                            Продаж зі складу №{payment.sales?.custom_id || '—'}
                          </div>
                        )}
                      </td>
                      <td className="p-5">
                        <span className="font-black text-emerald-600 text-base">+{Number(payment.amount_usd).toLocaleString()} $</span>
                        <div className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-wider">
                          {Number(payment.amount_uah).toLocaleString()} ₴
                        </div>
                      </td>
                      <td className="p-5 space-y-1.5">
                        <div><span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-md text-[9px] font-black uppercase tracking-widest">{payment.payment_method}</span></div>
                        <div><span className="px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-100 rounded-md text-[9px] font-black uppercase tracking-widest">{payment.payment_category}</span></div>
                      </td>
                      <td className="p-5 text-center">
                        {isSalePayment ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-[10px] font-black uppercase tracking-widest border border-emerald-100">Продаж</span>
                        ) : debtStatus.isPaid ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-[10px] font-black uppercase tracking-widest border border-emerald-100"><FaCheckCircle size={12} /> Оплачено</span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 text-rose-700 rounded-lg text-[10px] font-black uppercase tracking-widest border border-rose-100"><FaExclamationCircle size={12} /> Борг: {debtStatus.debt.toLocaleString()} $</span>
                        )}
                      </td>
                      <td className="p-5 text-right text-[11px] font-black text-slate-400 uppercase tracking-widest">{payment.users?.full_name || 'Система'}</td>
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
                <FaChevronLeft size={10} />
              </button>
              <div className="px-3 text-xs font-black text-slate-700">{currentPage} <span className="text-slate-400 font-bold mx-1">/</span> {totalPages}</div>
              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-400 hover:text-amber-600 hover:border-amber-300 disabled:opacity-50 disabled:hover:border-slate-200 disabled:hover:text-slate-400 transition-colors"
              >
                <FaChevronRight size={10} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* МОДАЛЬНЕ ВІКНО СТВОРЕННЯ */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-lg flex flex-col h-[85vh] sm:h-auto sm:max-h-[90vh] overflow-hidden">

            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-900 text-white shrink-0 sm:rounded-t-3xl">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500 text-slate-900 rounded-lg"><FaPlus size={14} /></div>
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
                      setFormData({ ...formData, deal_id: '', client_id: '' });
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
                      <span>Вартість: <b>{Number(selectedDealInfo.budget).toLocaleString()} $</b></span>
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
                      onChange={e => setFormData({ ...formData, amount_usd: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1 tracking-widest">Курс (₴/$)</label>
                    <input
                      type="number" step="0.01" required
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black text-slate-800 outline-none focus:border-amber-500 transition-colors"
                      value={formData.exchange_rate}
                      onChange={e => setFormData({ ...formData, exchange_rate: e.target.value })}
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
                    onChange={e => setFormData({ ...formData, payment_method: e.target.value })}
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
                    onChange={e => setFormData({ ...formData, payment_category: e.target.value })}
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
                    onChange={e => setFormData({ ...formData, payment_date: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1 tracking-widest">Коментар / Примітки</label>
                  <textarea
                    rows="2"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-amber-500 resize-none transition-colors"
                    placeholder="Додаткова інформація по платежу..."
                    value={formData.notes}
                    onChange={e => setFormData({ ...formData, notes: e.target.value })}
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

      {selectedPayment && (
        <PaymentDetailsModal
          isOpen={!!selectedPayment}
          onClose={() => setSelectedPayment(null)}
          payment={selectedPayment}
          debtStatus={getDealDebtStatus(selectedPayment.deals)}
          onSaveSuccess={fetchData}
          onOpenDeal={(dealId) => navigate(`/deals/${dealId}`)}
        />
      )}
    </div>
  );
});

export default IncomeTab;
