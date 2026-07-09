import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthProvider';
import { toLocalDateTimeInputValue } from '../utils/dateTime';
import {
  FaTimes, FaSave, FaPlus, FaTags, FaTruckLoading, FaSolarPanel, FaUser, FaChevronDown, FaChevronUp, FaBoxOpen
} from 'react-icons/fa';

const ATTACHMENT_TYPES = [
  { id: 'general', label: 'Загальна витрата' },
  { id: 'employee', label: 'Працівник' },
  { id: 'deal', label: 'Угода' },
  { id: 'supplier', label: 'Постачальник' }
];

export default function NewExpenseModal({ isOpen, onClose, onSaveSuccess }) {
  const { employeeProfile } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [attachmentType, setAttachmentType] = useState('general');

  // --- Загальна витрата / Працівник / Угода ---
  const [categories, setCategories] = useState([]);
  const [categoryId, setCategoryId] = useState('');

  const [employees, setEmployees] = useState([]);
  const [employeeId, setEmployeeId] = useState('');

  const [deals, setDeals] = useState([]);
  const [dealSearch, setDealSearch] = useState('');
  const [dealId, setDealId] = useState('');
  const [isDealDropdownOpen, setIsDealDropdownOpen] = useState(false);
  const dealDropdownRef = useRef(null);

  const [amountUsd, setAmountUsd] = useState('');
  const [exchangeRate, setExchangeRate] = useState('');
  const [amountUah, setAmountUah] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Готівка');
  const [expenseDate, setExpenseDate] = useState('');
  const [notes, setNotes] = useState('');

  // --- Постачальник / Закупівля (пише в purchase_order_payments) ---
  const [suppliers, setSuppliers] = useState([]);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [isSupplierDropdownOpen, setIsSupplierDropdownOpen] = useState(false);
  const [isAddingSupplier, setIsAddingSupplier] = useState(false);
  const supplierDropdownRef = useRef(null);

  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [selectedPO, setSelectedPO] = useState(null);
  const [poPaymentForm, setPoPaymentForm] = useState({ amount: '', amount_uah: '', method: 'Рахунок ФОП', category: 'Часткова оплата', notes: '' });
  const [expandedPoId, setExpandedPoId] = useState(null);
  const [poItemsMap, setPoItemsMap] = useState({});
  const [loadingPoItemsId, setLoadingPoItemsId] = useState(null);

  const getCurrentUserId = async () => {
    if (employeeProfile?.id) return employeeProfile.id;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) throw new Error('Не визначено поточного користувача.');
    return user.id;
  };

  useEffect(() => {
    if (!isOpen) return;
    resetForm();
    fetchCreateData();
  }, [isOpen]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (supplierDropdownRef.current && !supplierDropdownRef.current.contains(event.target)) setIsSupplierDropdownOpen(false);
      if (dealDropdownRef.current && !dealDropdownRef.current.contains(event.target)) setIsDealDropdownOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const resetForm = () => {
    setAttachmentType('general');
    setCategoryId('');
    setEmployeeId('');
    setDealSearch(''); setDealId('');
    setAmountUsd(''); setExchangeRate(''); setAmountUah('');
    setPaymentMethod('Готівка');
    setExpenseDate(toLocalDateTimeInputValue());
    setNotes('');
    setSupplierSearch(''); setSupplierId('');
    setPurchaseOrders([]); setSelectedPO(null);
    setPoPaymentForm({ amount: '', amount_uah: '', method: 'Рахунок ФОП', category: 'Часткова оплата', notes: '' });
    setExpandedPoId(null);
    setPoItemsMap({});
  };

  const toggleViewItems = async (po) => {
    if (expandedPoId === po.id) {
      setExpandedPoId(null);
      return;
    }
    setExpandedPoId(po.id);
    if (poItemsMap[po.id]) return;

    setLoadingPoItemsId(po.id);
    const { data } = await supabase
      .from('purchase_order_items')
      .select('id, quantity_ordered, quantity_received, products(name, sku, unit)')
      .eq('order_id', po.id);
    setPoItemsMap(prev => ({ ...prev, [po.id]: data || [] }));
    setLoadingPoItemsId(null);
  };

  const fetchCreateData = async () => {
    const [catRes, empRes, suppRes, dealRes] = await Promise.all([
      supabase.from('expense_categories').select('id, name').eq('is_active', true).order('name'),
      supabase.from('users').select('id, full_name').eq('is_active', true).order('full_name'),
      supabase.from('suppliers').select('id, name').order('name'),
      supabase.from('deals').select('id, custom_id, title, clients(name)').order('created_at', { ascending: false })
    ]);
    setCategories(catRes.data || []);
    if (catRes.data?.length > 0) setCategoryId(catRes.data[0].id);
    setEmployees(empRes.data || []);
    setSuppliers(suppRes.data || []);
    setDeals(dealRes.data || []);
  };

  const handleChangeAttachmentType = (type) => {
    setAttachmentType(type);
    setEmployeeId(''); setDealSearch(''); setDealId('');
    setSupplierSearch(''); setSupplierId(''); setPurchaseOrders([]); setSelectedPO(null);
  };

  // --- Валютний калькулятор для форми загального видатку ---
  const handleAmountChange = (field, value) => {
    if (field === 'amount_usd') {
      setAmountUsd(value);
      const rate = parseFloat(exchangeRate) || 0;
      if (rate > 0) setAmountUah(value ? (parseFloat(value) * rate).toFixed(2) : '');
    } else if (field === 'exchange_rate') {
      setExchangeRate(value);
      const usd = parseFloat(amountUsd) || 0;
      const rate = parseFloat(value) || 0;
      if (rate > 0 && usd > 0) setAmountUah((usd * rate).toFixed(2));
    } else if (field === 'amount_uah') {
      setAmountUah(value);
      const rate = parseFloat(exchangeRate) || 0;
      if (rate > 0) setAmountUsd(value ? (parseFloat(value) / rate).toFixed(2) : '');
    }
  };

  // --- Валютний калькулятор для оплати закупівлі ---
  const handlePoPaymentAmountChange = (field, value) => {
    setPoPaymentForm(prev => {
      const next = { ...prev, [field]: value };
      const rate = parseFloat(selectedPO?.exchange_rate) || 0;
      if (rate <= 0) return next;
      if (field === 'amount') next.amount_uah = value ? (parseFloat(value) * rate).toFixed(2) : '';
      else if (field === 'amount_uah') next.amount = value ? (parseFloat(value) / rate).toFixed(2) : '';
      return next;
    });
  };

  const handleCreateSupplier = async () => {
    const newName = supplierSearch.trim();
    if (!newName) return;
    setIsAddingSupplier(true);
    const { data, error } = await supabase.from('suppliers').insert([{ name: newName }]).select().single();
    setIsAddingSupplier(false);
    if (!error) {
      setSuppliers([...suppliers, data]);
      handleSelectSupplier(data);
    } else {
      alert('Помилка створення постачальника: ' + error.message);
    }
  };

  const handleSelectSupplier = async (supplier) => {
    setSupplierId(supplier.id);
    setSupplierSearch(supplier.name);
    setIsSupplierDropdownOpen(false);
    setSelectedPO(null);
    setExpandedPoId(null);
    setPoItemsMap({});

    const { data } = await supabase
      .from('purchase_orders')
      .select('id, status, payment_status, total_amount, amount_paid, total_amount_uah, amount_paid_uah, exchange_rate, created_at')
      .eq('supplier_id', supplier.id)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false });
    setPurchaseOrders(data || []);
  };

  const handleSubmitExpense = async (e) => {
    e.preventDefault();
    if (!categoryId) return alert('Оберіть категорію видатку.');
    if (attachmentType === 'employee' && !employeeId) return alert('Оберіть працівника.');
    const amount = parseFloat(amountUsd);
    if (!amount || amount <= 0) return alert('Введіть коректну суму ($)');

    setIsSubmitting(true);
    try {
      const userId = await getCurrentUserId();
      const payload = {
        category_id: categoryId,
        deal_id: attachmentType === 'deal' ? (dealId || null) : null,
        employee_id: attachmentType === 'employee' ? (employeeId || null) : null,
        supplier_id: null,
        amount_usd: amount,
        exchange_rate: parseFloat(exchangeRate) || null,
        amount_uah: parseFloat(amountUah) || 0,
        expense_date: expenseDate ? new Date(expenseDate).toISOString() : new Date().toISOString(),
        payment_method: paymentMethod,
        notes: notes || null,
        created_by: userId
      };

      const { error } = await supabase.from('expenses').insert([payload]);
      if (error) throw error;

      onSaveSuccess();
      onClose();
    } catch (error) {
      alert('Помилка збереження видатку: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitPoPayment = async (e) => {
    e.preventDefault();
    if (!selectedPO) return alert('Оберіть закупівлю, по якій вносите оплату.');
    const amount = parseFloat(poPaymentForm.amount);
    if (!amount || amount <= 0) return alert('Введіть коректну суму ($)');

    setIsSubmitting(true);
    try {
      const userId = await getCurrentUserId();
      const { error } = await supabase.from('purchase_order_payments').insert([{
        purchase_order_id: selectedPO.id,
        amount: amount,
        amount_uah: parseFloat(poPaymentForm.amount_uah) || 0,
        payment_method: poPaymentForm.method,
        payment_category: poPaymentForm.category,
        notes: poPaymentForm.notes || null,
        created_by: userId
      }]);
      if (error) throw error;

      const { data: allPayments } = await supabase
        .from('purchase_order_payments')
        .select('amount, amount_uah')
        .eq('purchase_order_id', selectedPO.id);

      const totalUsd = allPayments?.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0) || 0;
      const totalUah = allPayments?.reduce((sum, p) => sum + (parseFloat(p.amount_uah) || 0), 0) || 0;

      await supabase.from('purchase_orders').update({
        amount_paid: totalUsd,
        amount_paid_uah: totalUah
      }).eq('id', selectedPO.id);

      onSaveSuccess();
      onClose();
    } catch (error) {
      alert('Помилка внесення оплати: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const filteredSuppliers = suppliers.filter(s => s.name.toLowerCase().includes(supplierSearch.toLowerCase()));
  const filteredDeals = dealSearch.trim() === '' ? [] : deals.filter(d =>
    d.title?.toLowerCase().includes(dealSearch.toLowerCase()) ||
    d.clients?.name?.toLowerCase().includes(dealSearch.toLowerCase()) ||
    d.custom_id?.toString().includes(dealSearch)
  );
  const isSupplierMode = attachmentType === 'supplier';

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in custom-scrollbar overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col my-auto overflow-hidden">

        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-900 text-white rounded-t-3xl shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500 text-slate-900 rounded-lg"><FaTags size={18} /></div>
            <div>
              <h3 className="text-lg font-black uppercase tracking-tight">Новий видаток</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5 tracking-widest">Фіксація витрати компанії</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"><FaTimes size={18} /></button>
        </div>

        <form id="newExpenseForm" onSubmit={isSupplierMode ? handleSubmitPoPayment : handleSubmitExpense} className="p-6 space-y-5 bg-slate-50/50 flex-1 overflow-y-auto custom-scrollbar">

          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">До чого прив'язуємо?</label>
            <div className="grid grid-cols-2 gap-2 bg-white border border-slate-200 rounded-2xl p-1.5">
              {ATTACHMENT_TYPES.map(type => (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => handleChangeAttachmentType(type.id)}
                  className={`py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors ${attachmentType === type.id ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          {isSupplierMode ? (
            <>
              <div className="relative" ref={supplierDropdownRef}>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Постачальник *</label>
                <div className="relative w-full cursor-text" onClick={() => setIsSupplierDropdownOpen(true)}>
                  <input type="text" placeholder="Пошук постачальника..." value={supplierSearch} onChange={(e) => { setSupplierSearch(e.target.value); setIsSupplierDropdownOpen(true); if (e.target.value === '') { setSupplierId(''); setPurchaseOrders([]); setSelectedPO(null); } }} className="w-full pl-4 pr-10 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-amber-500" />
                  <FaTruckLoading className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={12} />
                </div>
                {isSupplierDropdownOpen && (
                  <div className="absolute z-[210] top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto custom-scrollbar">
                    {filteredSuppliers.map(s => (
                      <div key={s.id} onClick={() => handleSelectSupplier(s)} className="px-4 py-3 text-sm font-bold text-slate-700 hover:bg-amber-50 cursor-pointer border-b border-slate-50 last:border-0">{s.name}</div>
                    ))}
                    {supplierSearch.trim().length > 0 && filteredSuppliers.length === 0 && (
                      <div className="p-2 border-t border-slate-100 bg-slate-50">
                        <button type="button" onClick={handleCreateSupplier} disabled={isAddingSupplier} className="w-full flex justify-center py-2.5 bg-amber-100 text-slate-800 hover:bg-amber-500 rounded-lg text-xs font-black uppercase transition-colors"><FaPlus size={10} className="mr-2" /> Додати "{supplierSearch}"</button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {supplierId && (
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Закупівля *</label>
                  {purchaseOrders.length === 0 ? (
                    <div className="p-4 text-center text-xs font-bold text-slate-400 bg-white border border-slate-200 rounded-xl">У цього постачальника немає активних закупівель</div>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                      {purchaseOrders.map(po => {
                        const remaining = (parseFloat(po.total_amount) || 0) - (parseFloat(po.amount_paid) || 0);
                        const isExpanded = expandedPoId === po.id;
                        const items = poItemsMap[po.id];
                        return (
                          <div
                            key={po.id}
                            className={`rounded-xl border transition-colors ${selectedPO?.id === po.id ? 'border-amber-500 bg-amber-50' : 'border-slate-200 bg-white'}`}
                          >
                            <div onClick={() => setSelectedPO(po)} className="p-3 cursor-pointer hover:bg-slate-50/50 rounded-t-xl">
                              <div className="flex justify-between items-center">
                                <span className="text-xs font-black text-slate-800">PO-{po.id.substring(0, 6).toUpperCase()}</span>
                                <span className="text-[9px] font-black uppercase text-slate-400">{new Date(po.created_at).toLocaleDateString('uk-UA')}</span>
                              </div>
                              <div className="text-[10px] font-bold text-slate-500 mt-1">
                                Всього: ${Number(po.total_amount || 0).toLocaleString()} · Сплачено: ${Number(po.amount_paid || 0).toLocaleString()} · <span className={remaining > 0 ? 'text-rose-600' : 'text-emerald-600'}>Залишок: ${remaining.toLocaleString()}</span>
                              </div>
                              {!po.total_amount && (
                                <div className="text-[9px] font-black uppercase text-amber-600 bg-amber-50 border border-amber-100 rounded px-2 py-1 mt-1.5 inline-block">
                                  ⚠ У закупівлі не вказана сума — залишок порахується неправильно, поки не заповните суму в Складі → Закупівлі
                                </div>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); toggleViewItems(po); }}
                              className="w-full flex items-center justify-center gap-1.5 py-1.5 border-t border-slate-100 text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-amber-600 hover:bg-amber-50/50 transition-colors"
                            >
                              <FaBoxOpen size={10} /> {isExpanded ? 'Сховати позиції' : 'Що замовлено?'} {isExpanded ? <FaChevronUp size={9} /> : <FaChevronDown size={9} />}
                            </button>

                            {isExpanded && (
                              <div className="border-t border-slate-100 p-3 bg-slate-50/70 rounded-b-xl">
                                {loadingPoItemsId === po.id ? (
                                  <p className="text-[10px] font-bold text-slate-400 text-center py-2">Завантаження...</p>
                                ) : !items || items.length === 0 ? (
                                  <p className="text-[10px] font-bold text-slate-400 text-center py-2">Немає позицій</p>
                                ) : (
                                  <div className="space-y-1.5">
                                    {items.map(item => (
                                      <div key={item.id} className="flex justify-between items-center text-[10px] bg-white rounded-lg px-2.5 py-1.5 border border-slate-100">
                                        <div className="min-w-0">
                                          <span className="font-bold text-slate-700 truncate">{item.products?.name || 'Товар'}</span>
                                          <span className="text-slate-400 font-mono ml-1.5">{item.products?.sku ? `· ${item.products.sku}` : ''}</span>
                                        </div>
                                        <span className="font-black text-slate-600 shrink-0 ml-2">{item.quantity_received || 0} / {item.quantity_ordered} {item.products?.unit}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {selectedPO && (
                <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Сума ($) *</label>
                      <input type="number" min="0.01" step="any" required value={poPaymentForm.amount} onChange={e => handlePoPaymentAmountChange('amount', e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-black outline-none focus:border-amber-500" placeholder="0.00" />
                    </div>
                    <div>
                      <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Сума (₴)</label>
                      <input type="number" min="0" step="any" value={poPaymentForm.amount_uah} onChange={e => handlePoPaymentAmountChange('amount_uah', e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-black outline-none focus:border-amber-500" placeholder="0.00" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Призначення</label>
                      <select value={poPaymentForm.category} onChange={e => setPoPaymentForm({ ...poPaymentForm, category: e.target.value })} className="w-full px-2 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-amber-500 cursor-pointer">
                        <option>Часткова оплата</option>
                        <option>Аванс</option>
                        <option>Повна оплата</option>
                        <option>Під реалізацію</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Метод</label>
                      <select value={poPaymentForm.method} onChange={e => setPoPaymentForm({ ...poPaymentForm, method: e.target.value })} className="w-full px-2 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-amber-500 cursor-pointer">
                        <option>Рахунок ФОП</option>
                        <option>Готівка</option>
                        <option>Картка</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Коментар</label>
                    <textarea rows="2" value={poPaymentForm.notes} onChange={e => setPoPaymentForm({ ...poPaymentForm, notes: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium outline-none focus:border-amber-500 resize-none" />
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Категорія *</label>
                <select required value={categoryId} onChange={e => setCategoryId(e.target.value)} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-amber-500 cursor-pointer">
                  {categories.length === 0 && <option value="">Немає активних категорій</option>}
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              {attachmentType === 'employee' && (
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1 flex items-center gap-1.5"><FaUser size={10} /> Працівник (кому компенсуємо) *</label>
                  <select required value={employeeId} onChange={e => setEmployeeId(e.target.value)} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-amber-500 cursor-pointer">
                    <option value="">Оберіть працівника...</option>
                    {employees.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                  </select>
                </div>
              )}

              {attachmentType === 'deal' && (
                <div className="relative" ref={dealDropdownRef}>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1 flex items-center gap-1.5"><FaSolarPanel size={10} /> Угода *</label>
                  <div className="relative w-full cursor-text" onClick={() => setIsDealDropdownOpen(true)}>
                    <input type="text" placeholder="Пошук угоди за назвою / клієнтом / ID..." value={dealSearch} onChange={(e) => { setDealSearch(e.target.value); setIsDealDropdownOpen(true); if (e.target.value === '') setDealId(''); }} className="w-full pl-4 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-amber-500" />
                  </div>
                  {isDealDropdownOpen && dealSearch.trim().length > 0 && (
                    <div className="absolute z-[200] top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto custom-scrollbar">
                      {filteredDeals.length > 0 ? filteredDeals.map(d => (
                        <div key={d.id} onClick={() => { setDealId(d.id); setDealSearch(`№${d.custom_id} — ${d.title}`); setIsDealDropdownOpen(false); }} className="px-4 py-3 text-sm hover:bg-amber-50 cursor-pointer border-b border-slate-50 last:border-0">
                          <div className="font-bold text-slate-800">{d.title}</div>
                          <div className="text-[10px] text-slate-400 font-bold uppercase">Клієнт: {d.clients?.name}</div>
                        </div>
                      )) : <div className="p-4 text-xs font-bold text-slate-400 text-center uppercase tracking-widest">Нічого не знайдено</div>}
                    </div>
                  )}
                </div>
              )}

              <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Сума ($) *</label>
                    <input type="number" min="0.01" step="any" required value={amountUsd} onChange={e => handleAmountChange('amount_usd', e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-black outline-none focus:border-amber-500" placeholder="0.00" />
                  </div>
                  <div>
                    <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Курс (₴/$)</label>
                    <input type="number" min="0" step="any" value={exchangeRate} onChange={e => handleAmountChange('exchange_rate', e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-black outline-none focus:border-amber-500" placeholder="Напр. 43.5" />
                  </div>
                </div>
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Сума (₴)</label>
                  <input type="number" min="0" step="any" value={amountUah} onChange={e => handleAmountChange('amount_uah', e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-black outline-none focus:border-amber-500" placeholder="0.00" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Метод оплати</label>
                  <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-amber-500 cursor-pointer">
                    <option value="Готівка">Готівка</option>
                    <option value="Картка">Картка</option>
                    <option value="Банківський переказ">Банківський переказ</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Дата й час *</label>
                  <input type="datetime-local" required value={expenseDate} onChange={e => setExpenseDate(e.target.value)} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-amber-500" />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Коментар</label>
                <textarea rows="2" value={notes} onChange={e => setNotes(e.target.value)} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-amber-500 resize-none" placeholder={attachmentType === 'employee' ? 'Номер чека, за що саме...' : 'За що саме, номер чека тощо...'} />
              </div>
            </>
          )}
        </form>

        <div className="p-6 border-t border-slate-100 flex justify-end gap-3 bg-white rounded-b-3xl shrink-0">
          <button type="button" onClick={onClose} className="px-6 py-3.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">Скасувати</button>
          <button form="newExpenseForm" type="submit" disabled={isSubmitting || (isSupplierMode && !selectedPO)} className="px-8 py-3.5 bg-amber-500 hover:bg-amber-400 text-slate-900 text-xs font-black uppercase tracking-widest rounded-xl transition-colors disabled:opacity-50 shadow-lg shadow-amber-500/20 active:scale-95 flex items-center gap-2">
            <FaSave size={14} />{isSubmitting ? 'ЗБЕРЕЖЕННЯ...' : isSupplierMode ? 'ВНЕСТИ ОПЛАТУ' : 'ЗБЕРЕГТИ ВИДАТОК'}
          </button>
        </div>
      </div>
    </div>
  );
}
