import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthProvider';
import { toLocalDateTimeInputValue } from '../utils/dateTime';
import {
  FaTimes, FaSave, FaSearch, FaPlus, FaTrash, FaUser, FaBuilding,
  FaWarehouse, FaBoxOpen, FaMoneyBillWave, FaExclamationTriangle
} from 'react-icons/fa';

const emptyNewClientForm = { client_type: 'Фізична особа', name: '', phone: '', company_name: '' };

export default function NewSaleModal({ isOpen, onClose, onSaveSuccess }) {
  const { employeeProfile } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- Клієнт ---
  const [recentClients, setRecentClients] = useState([]);
  const [clientResults, setClientResults] = useState([]);
  const [clientQuery, setClientQuery] = useState('');
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);
  const [isCreatingClient, setIsCreatingClient] = useState(false);
  const [newClientForm, setNewClientForm] = useState(emptyNewClientForm);
  const [isSavingClient, setIsSavingClient] = useState(false);
  const clientDropdownRef = useRef(null);

  // --- Склад ---
  const [locations, setLocations] = useState([]);
  const [locationId, setLocationId] = useState('');

  // --- Товари ---
  const [productQuery, setProductQuery] = useState('');
  const [productResults, setProductResults] = useState([]);
  const [isProductDropdownOpen, setIsProductDropdownOpen] = useState(false);
  const productDropdownRef = useRef(null);
  const [lineItems, setLineItems] = useState([]);
  const [stockMap, setStockMap] = useState({});

  // --- Оплата ---
  const [collectPaymentNow, setCollectPaymentNow] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    amount_usd: '', exchange_rate: '', amount_uah: '',
    payment_method: 'Готівка', payment_category: 'Повна оплата', notes: ''
  });

  const [notes, setNotes] = useState('');
  const [saleDate, setSaleDate] = useState('');

  const getCurrentUserId = async () => {
    if (employeeProfile?.id) return employeeProfile.id;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) throw new Error('Не визначено поточного користувача.');
    return user.id;
  };

  useEffect(() => {
    if (!isOpen) return;
    resetForm();
    fetchLocations();
    fetchRecentClients();
  }, [isOpen]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (clientDropdownRef.current && !clientDropdownRef.current.contains(event.target)) setIsClientDropdownOpen(false);
      if (productDropdownRef.current && !productDropdownRef.current.contains(event.target)) setIsProductDropdownOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Дебаунс-пошук клієнта (2+ символи)
  useEffect(() => {
    if (!isClientDropdownOpen) return;
    const q = clientQuery.trim();
    if (q.length < 2) { setClientResults([]); return; }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('clients')
        .select('id, name, phone, client_type, company_name, custom_id')
        .or(`name.ilike.%${q}%,phone.ilike.%${q}%,company_name.ilike.%${q}%`)
        .limit(10);
      setClientResults(data || []);
    }, 300);
    return () => clearTimeout(timer);
  }, [clientQuery, isClientDropdownOpen]);

  // Дебаунс-пошук товару (2+ символи)
  useEffect(() => {
    if (!isProductDropdownOpen) { setProductResults([]); return; }
    const q = productQuery.trim();
    if (q.length < 2) { setProductResults([]); return; }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('products')
        .select('id, name, sku, unit, cost_price, sale_price, currency')
        .eq('is_active', true)
        .or(`name.ilike.%${q}%,sku.ilike.%${q}%`)
        .limit(10);
      setProductResults(data || []);
    }, 300);
    return () => clearTimeout(timer);
  }, [productQuery, isProductDropdownOpen]);

  // Оновлюємо доступні залишки при зміні складу
  useEffect(() => {
    if (!locationId) return;
    const productIds = lineItems.filter(li => li.line_type === 'product' && li.product_id).map(li => li.product_id);
    if (productIds.length === 0) return;
    refreshStockMap(productIds, locationId);
  }, [locationId]);

  const resetForm = () => {
    setClientQuery(''); setClientResults([]); setSelectedClient(null);
    setIsCreatingClient(false); setNewClientForm(emptyNewClientForm);
    setProductQuery(''); setProductResults([]); setLineItems([]); setStockMap({});
    setCollectPaymentNow(false);
    setPaymentForm({ amount_usd: '', exchange_rate: '', amount_uah: '', payment_method: 'Готівка', payment_category: 'Повна оплата', notes: '' });
    setNotes('');
    setSaleDate(toLocalDateTimeInputValue());
  };

  const fetchRecentClients = async () => {
    const { data } = await supabase
      .from('clients')
      .select('id, name, phone, client_type, company_name, custom_id')
      .order('created_at', { ascending: false })
      .limit(8);
    setRecentClients(data || []);
  };

  const fetchLocations = async () => {
    const { data } = await supabase
      .from('stock_locations')
      .select('id, name, type, is_default')
      .eq('type', 'warehouse')
      .eq('is_active', true)
      .order('is_default', { ascending: false })
      .order('name');
    setLocations(data || []);
    if (data && data.length > 0) {
      setLocationId(data.find(l => l.is_default)?.id || data[0].id);
    } else {
      setLocationId('');
    }
  };

  const refreshStockMap = async (productIds, locId) => {
    if (!locId || productIds.length === 0) return;
    const { data } = await supabase
      .from('v_stock_available')
      .select('product_id, available_stock')
      .eq('location_id', locId)
      .in('product_id', productIds);

    setStockMap(prev => {
      const next = { ...prev };
      productIds.forEach(id => { next[id] = 0; });
      (data || []).forEach(row => { next[row.product_id] = Number(row.available_stock || 0); });
      return next;
    });
  };

  // --- Клієнт: вибір / створення ---
  const handleSelectClient = (client) => {
    setSelectedClient(client);
    setClientQuery(client.name);
    setIsClientDropdownOpen(false);
  };

  const startCreatingClient = () => {
    setNewClientForm({ ...emptyNewClientForm, name: clientQuery.trim() });
    setIsCreatingClient(true);
  };

  const handleCreateClient = async (e) => {
    e.preventDefault();
    if (!newClientForm.name.trim()) return alert('Вкажіть ім\'я або контактну особу.');
    setIsSavingClient(true);
    try {
      const payload = {
        client_type: newClientForm.client_type,
        name: newClientForm.name.trim(),
        phone: newClientForm.phone || null,
        company_name: newClientForm.client_type === 'Юридична особа' ? (newClientForm.company_name || null) : null
      };
      const { data, error } = await supabase.from('clients').insert([payload]).select().single();
      if (error) throw error;
      setSelectedClient(data);
      setClientQuery(data.name);
      setIsCreatingClient(false);
      setIsClientDropdownOpen(false);
      fetchRecentClients();
    } catch (error) {
      alert('Помилка створення клієнта: ' + error.message);
    } finally {
      setIsSavingClient(false);
    }
  };

  // --- Товари: додавання рядків ---
  const handleAddProduct = (product) => {
    setProductQuery(''); setIsProductDropdownOpen(false);

    setLineItems(prev => {
      const existing = prev.find(li => li.line_type === 'product' && li.product_id === product.id);
      if (existing) {
        return prev.map(li => li === existing ? { ...li, quantity: Number(li.quantity) + 1 } : li);
      }
      return [...prev, {
        key: crypto.randomUUID(),
        line_type: 'product',
        product_id: product.id,
        name: product.name,
        sku: product.sku,
        unit: product.unit || 'шт',
        quantity: 1,
        currency: product.currency || 'USD',
        exchange_rate: 41.0,
        unit_cost_price: product.cost_price || 0,
        unit_sale_price: product.sale_price || 0
      }];
    });

    refreshStockMap([product.id], locationId);
  };

  const handleAddCustomLine = () => {
    setLineItems(prev => ([...prev, {
      key: crypto.randomUUID(),
      line_type: 'custom',
      product_id: null,
      name: '',
      sku: null,
      unit: 'шт',
      quantity: 1,
      currency: 'USD',
      exchange_rate: 41.0,
      unit_cost_price: 0,
      unit_sale_price: 0
    }]));
  };

  const updateLineItem = (key, patch) => {
    setLineItems(prev => prev.map(li => li.key === key ? { ...li, ...patch } : li));
  };

  const removeLineItem = (key) => setLineItems(prev => prev.filter(li => li.key !== key));

  const lineToUsd = (li, field) => {
    const value = parseFloat(field === 'cost' ? li.unit_cost_price : li.unit_sale_price) || 0;
    if (li.currency === 'USD') return value;
    const rate = parseFloat(li.exchange_rate) || 1;
    return rate > 0 ? value / rate : 0;
  };

  // --- Підсумки ---
  const totals = lineItems.reduce((acc, li) => {
    const qty = parseFloat(li.quantity) || 0;
    const costUsd = lineToUsd(li, 'cost') * qty;
    const revenueUsd = lineToUsd(li, 'sale') * qty;
    acc.cost += costUsd;
    acc.revenue += revenueUsd;
    return acc;
  }, { cost: 0, revenue: 0 });
  const totalProfit = totals.revenue - totals.cost;
  const marginPct = totals.revenue > 0 ? (totalProfit / totals.revenue) * 100 : 0;

  // --- Валютний калькулятор форми оплати ---
  const handlePaymentAmountChange = (field, value) => {
    setPaymentForm(prev => {
      const next = { ...prev, [field]: value };
      const rate = parseFloat(next.exchange_rate) || 0;
      if (rate <= 0) return next;
      if (field === 'amount_usd') next.amount_uah = value ? (parseFloat(value) * rate).toFixed(2) : '';
      else if (field === 'amount_uah') next.amount_usd = value ? (parseFloat(value) / rate).toFixed(2) : '';
      else if (field === 'exchange_rate' && next.amount_usd) next.amount_uah = (parseFloat(next.amount_usd) * rate).toFixed(2);
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedClient?.id) return alert('Оберіть або створіть клієнта.');
    if (!locationId) return alert('Оберіть склад, з якого списується товар.');
    if (lineItems.length === 0) return alert('Додайте хоча б одну позицію.');

    for (const li of lineItems) {
      const qty = parseFloat(li.quantity) || 0;
      if (qty <= 0) return alert('Кількість має бути більшою за нуль у всіх рядках.');
      if (li.line_type === 'custom' && !li.name.trim()) return alert('Вкажіть назву для довільної позиції.');
      if (li.line_type === 'product') {
        const available = stockMap[li.product_id];
        if (available !== undefined && qty > available) {
          return alert(`Недостатньо залишку "${li.name}": потрібно ${qty}, доступно ${available}.`);
        }
      }
    }

    setIsSubmitting(true);
    try {
      const userId = await getCurrentUserId();

      const items = lineItems.map(li => ({
        line_type: li.line_type,
        product_id: li.line_type === 'product' ? li.product_id : null,
        custom_name: li.line_type === 'custom' ? li.name.trim() : null,
        quantity: parseFloat(li.quantity),
        unit: li.unit,
        currency: li.currency,
        exchange_rate: li.currency === 'UAH' ? (parseFloat(li.exchange_rate) || 1) : null,
        unit_cost_price: parseFloat(li.unit_cost_price) || 0,
        unit_sale_price: parseFloat(li.unit_sale_price) || 0,
        unit_cost_price_usd: lineToUsd(li, 'cost'),
        unit_sale_price_usd: lineToUsd(li, 'sale')
      }));

      const initialPayment = (collectPaymentNow && parseFloat(paymentForm.amount_usd) > 0) ? {
        amount_usd: parseFloat(paymentForm.amount_usd),
        exchange_rate: parseFloat(paymentForm.exchange_rate) || null,
        amount_uah: parseFloat(paymentForm.amount_uah) || 0,
        payment_method: paymentForm.payment_method,
        payment_category: paymentForm.payment_category,
        notes: paymentForm.notes || null
      } : null;

      const { error } = await supabase.rpc('erp_direct_sale', {
        p_client_id: selectedClient.id,
        p_location_id: locationId,
        p_items: items,
        p_performed_by: userId,
        p_currency: 'USD',
        p_exchange_rate: null,
        p_notes: notes || null,
        p_initial_payment: initialPayment,
        p_sale_date: saleDate ? new Date(saleDate).toISOString() : null
      });

      if (error) throw error;

      onSaveSuccess();
      onClose();
    } catch (error) {
      alert('Помилка оформлення продажу: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const clientDropdownList = clientQuery.trim().length >= 2 ? clientResults : recentClients;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in custom-scrollbar overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col my-auto overflow-hidden">

        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-900 text-white rounded-t-3xl shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500 text-slate-900 rounded-lg"><FaMoneyBillWave size={18} /></div>
            <div>
              <h3 className="text-lg font-black uppercase tracking-tight">Новий продаж</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5 tracking-widest">Миттєвий відпуск товару зі складу</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"><FaTimes size={18} /></button>
        </div>

        <form id="newSaleForm" onSubmit={handleSubmit} className="p-6 md:p-8 space-y-6 bg-slate-50/50 flex-1 overflow-y-auto custom-scrollbar">

          {/* КЛІЄНТ + СКЛАД */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative" ref={clientDropdownRef}>
              <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Клієнт *</label>
              <div className="relative w-full cursor-text" onClick={() => setIsClientDropdownOpen(true)}>
                <input
                  type="text"
                  placeholder="Пошук за ім'ям або телефоном..."
                  value={clientQuery}
                  onChange={(e) => { setClientQuery(e.target.value); setIsClientDropdownOpen(true); if (e.target.value === '') setSelectedClient(null); }}
                  className="w-full pl-4 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-amber-500 transition-colors"
                />
                <FaSearch className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={12} />
              </div>

              {isClientDropdownOpen && !isCreatingClient && (
                <div className="absolute z-[210] top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl max-h-64 overflow-y-auto custom-scrollbar">
                  {clientQuery.trim().length < 2 && (
                    <div className="px-4 py-2 text-[9px] font-black uppercase text-slate-400 bg-slate-50 border-b border-slate-100">Останні клієнти</div>
                  )}
                  {clientDropdownList.map(c => (
                    <div key={c.id} onClick={() => handleSelectClient(c)} className="px-4 py-3 text-sm hover:bg-amber-50 cursor-pointer border-b border-slate-50 last:border-0 flex items-center gap-3">
                      <div className={`flex items-center justify-center w-7 h-7 rounded-lg shrink-0 ${c.client_type === 'Юридична особа' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                        {c.client_type === 'Юридична особа' ? <FaBuilding size={12} /> : <FaUser size={12} />}
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-slate-800 truncate">{c.name}</div>
                        <div className="text-[10px] text-slate-400 font-bold">{c.company_name || c.phone || '—'}</div>
                      </div>
                    </div>
                  ))}
                  {clientQuery.trim().length > 0 && (
                    <div className="p-2 border-t border-slate-100 bg-slate-50">
                      <button type="button" onClick={startCreatingClient} className="w-full flex justify-center items-center gap-2 py-2.5 bg-amber-100 text-slate-800 hover:bg-amber-500 rounded-lg text-xs font-black uppercase transition-colors">
                        <FaPlus size={10} /> Додати "{clientQuery}"
                      </button>
                    </div>
                  )}
                </div>
              )}

              {isCreatingClient && (
                <div className="absolute z-[210] top-full left-0 right-0 mt-2 bg-white border border-amber-200 rounded-xl shadow-xl p-4 space-y-3 animate-fade-in">
                  <div className="flex gap-2">
                    {['Фізична особа', 'Юридична особа'].map(type => (
                      <label key={type} className={`flex-1 flex items-center justify-center gap-1.5 p-2 border rounded-lg cursor-pointer transition-all text-[10px] font-black uppercase ${newClientForm.client_type === type ? 'border-amber-500 bg-amber-50 text-amber-800' : 'border-slate-200 text-slate-500'}`}>
                        <input type="radio" className="hidden" checked={newClientForm.client_type === type} onChange={() => setNewClientForm({ ...newClientForm, client_type: type })} />
                        {type === 'Юридична особа' ? 'Юр. особа' : 'Фіз. особа'}
                      </label>
                    ))}
                  </div>
                  <input type="text" required placeholder="Ім'я / Контактна особа *" value={newClientForm.name} onChange={e => setNewClientForm({ ...newClientForm, name: e.target.value })} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:border-amber-500" />
                  <input type="tel" placeholder="Телефон" value={newClientForm.phone} onChange={e => setNewClientForm({ ...newClientForm, phone: e.target.value })} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:border-amber-500" />
                  {newClientForm.client_type === 'Юридична особа' && (
                    <input type="text" placeholder="Назва компанії" value={newClientForm.company_name} onChange={e => setNewClientForm({ ...newClientForm, company_name: e.target.value })} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:border-amber-500" />
                  )}
                  <div className="flex gap-2 pt-1">
                    <button type="button" onClick={() => setIsCreatingClient(false)} className="flex-1 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg">Скасувати</button>
                    <button type="button" onClick={handleCreateClient} disabled={isSavingClient} className="flex-1 py-2 text-xs font-black text-slate-900 bg-amber-500 hover:bg-amber-400 rounded-lg uppercase">{isSavingClient ? '...' : 'Зберегти'}</button>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Склад списання *</label>
              <div className="relative">
                <select value={locationId} onChange={e => setLocationId(e.target.value)} className="w-full pl-4 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-amber-500 cursor-pointer appearance-none">
                  {locations.length === 0 && <option value="">Немає активних складів</option>}
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}{l.is_default ? ' (основний)' : ''}</option>)}
                </select>
                <FaWarehouse className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Дата й час продажу *</label>
              <input type="datetime-local" required value={saleDate} onChange={e => setSaleDate(e.target.value)} className="w-full md:w-1/2 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-amber-500 transition-colors" />
              <p className="text-[9px] font-bold text-slate-400 mt-1 ml-1">Можна поставити заднім числом, якщо продаж оформлюється не в момент фактичної передачі товару.</p>
            </div>
          </div>

          {/* ТОВАРИ */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-black text-sm uppercase tracking-widest text-slate-800 flex items-center gap-2"><FaBoxOpen className="text-amber-500" /> Позиції продажу</h4>
              <button type="button" onClick={handleAddCustomLine} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors flex items-center gap-1.5">
                <FaPlus size={10} /> Довільна позиція
              </button>
            </div>

            <div className="relative" ref={productDropdownRef}>
              <div className="relative w-full cursor-text" onClick={() => setIsProductDropdownOpen(true)}>
                <input
                  type="text"
                  placeholder="Пошук товару за назвою або артикулом..."
                  value={productQuery}
                  onChange={(e) => { setProductQuery(e.target.value); setIsProductDropdownOpen(true); }}
                  className="w-full pl-4 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-amber-500"
                />
                <FaSearch className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              </div>
              {isProductDropdownOpen && (
                <div className="absolute z-[190] top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl max-h-56 overflow-y-auto custom-scrollbar">
                  {productQuery.trim().length < 2 ? (
                    <div className="p-4 text-center text-xs font-bold text-slate-400">Введіть 2+ символи для пошуку...</div>
                  ) : productResults.length === 0 ? (
                    <div className="p-4 text-center text-xs font-bold text-slate-400">Нічого не знайдено</div>
                  ) : productResults.map(p => (
                    <div key={p.id} onClick={() => handleAddProduct(p)} className="px-4 py-3 text-sm flex justify-between items-center hover:bg-amber-50 cursor-pointer border-b border-slate-50 last:border-0">
                      <div><span className="font-bold text-slate-800">{p.name}</span><span className="block text-[10px] text-slate-400 font-mono mt-0.5">SKU: {p.sku || 'Без SKU'}</span></div>
                      <FaPlus className="text-amber-400" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {lineItems.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs font-bold uppercase tracking-widest border-2 border-dashed border-slate-200 rounded-xl">Кошик порожній</div>
            ) : (
              <div className="overflow-x-auto custom-scrollbar border border-slate-200 rounded-xl">
                <table className="w-full text-left min-w-[720px]">
                  <thead className="bg-slate-50 text-[9px] uppercase font-black text-slate-400 tracking-widest border-b border-slate-200">
                    <tr>
                      <th className="p-3">Позиція</th>
                      <th className="p-3 text-center w-24">К-сть</th>
                      <th className="p-3 text-center w-28">Собівартість</th>
                      <th className="p-3 text-center w-28">Ціна продажу</th>
                      <th className="p-3 text-center w-20">Валюта</th>
                      <th className="p-3 text-center w-24">Маржа</th>
                      <th className="p-3 text-center w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lineItems.map(li => {
                      const qty = parseFloat(li.quantity) || 0;
                      const profit = (lineToUsd(li, 'sale') - lineToUsd(li, 'cost')) * qty;
                      const available = li.line_type === 'product' ? stockMap[li.product_id] : null;
                      const overStock = available !== undefined && available !== null && qty > available;
                      return (
                        <tr key={li.key} className="bg-white">
                          <td className="p-3">
                            {li.line_type === 'custom' ? (
                              <input type="text" required placeholder="Назва позиції (напр. доставка)" value={li.name} onChange={e => updateLineItem(li.key, { name: e.target.value })} className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:border-amber-500" />
                            ) : (
                              <div>
                                <p className="font-bold text-slate-800 text-sm">{li.name}</p>
                                <p className="text-[10px] font-mono text-slate-400">SKU: {li.sku || '-'}</p>
                                {available !== undefined && (
                                  <p className={`text-[9px] font-black uppercase mt-0.5 ${overStock ? 'text-rose-500' : 'text-emerald-500'}`}>
                                    Доступно: {available ?? '...'} {li.unit}
                                  </p>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            <input type="number" min="0.01" step="any" value={li.quantity} onChange={e => updateLineItem(li.key, { quantity: e.target.value })} className={`w-20 p-2 text-center border rounded-lg text-sm font-black outline-none focus:border-amber-500 ${overStock ? 'border-rose-300 bg-rose-50' : 'border-slate-200'}`} />
                          </td>
                          <td className="p-3 text-center">
                            <input type="number" min="0" step="any" value={li.unit_cost_price} onChange={e => updateLineItem(li.key, { unit_cost_price: e.target.value })} className="w-24 p-2 text-center border border-slate-200 rounded-lg text-sm font-bold outline-none focus:border-amber-500" />
                          </td>
                          <td className="p-3 text-center">
                            <input type="number" min="0" step="any" value={li.unit_sale_price} onChange={e => updateLineItem(li.key, { unit_sale_price: e.target.value })} className="w-24 p-2 text-center border border-amber-200 bg-amber-50/50 rounded-lg text-sm font-bold outline-none focus:border-amber-500" />
                          </td>
                          <td className="p-3 text-center">
                            <select value={li.currency} onChange={e => updateLineItem(li.key, { currency: e.target.value })} className="w-full p-2 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-amber-500 cursor-pointer">
                              <option value="USD">USD</option>
                              <option value="UAH">UAH</option>
                            </select>
                            {li.currency === 'UAH' && (
                              <input type="number" min="1" step="any" title="Курс" value={li.exchange_rate} onChange={e => updateLineItem(li.key, { exchange_rate: e.target.value })} className="w-full mt-1 p-1.5 text-center border border-sky-200 bg-sky-50 rounded text-[10px] font-bold outline-none focus:border-sky-500" />
                            )}
                          </td>
                          <td className="p-3 text-center">
                            <span className={`text-xs font-black ${profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>${profit.toFixed(2)}</span>
                          </td>
                          <td className="p-3 text-center">
                            <button type="button" onClick={() => removeLineItem(li.key)} className="p-2 text-slate-300 hover:text-rose-500 transition-colors"><FaTrash size={14} /></button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {lineItems.length > 0 && (
              <div className="flex flex-wrap gap-6 justify-end p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div className="text-right">
                  <p className="text-[9px] font-black text-slate-400 uppercase">Виручка</p>
                  <p className="text-sm font-black text-slate-900">${totals.revenue.toFixed(2)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-black text-slate-400 uppercase">Собівартість</p>
                  <p className="text-sm font-black text-slate-500">${totals.cost.toFixed(2)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-black text-slate-400 uppercase">Прибуток</p>
                  <p className={`text-sm font-black ${totalProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>${totalProfit.toFixed(2)} ({marginPct.toFixed(1)}%)</p>
                </div>
              </div>
            )}
          </div>

          {/* ОПЛАТА */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={collectPaymentNow} onChange={e => setCollectPaymentNow(e.target.checked)} className="w-4 h-4 accent-amber-500" />
              <span className="font-black text-sm uppercase tracking-widest text-slate-800 flex items-center gap-2"><FaMoneyBillWave className="text-emerald-500" /> Отримати оплату зараз</span>
            </label>

            {collectPaymentNow && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end animate-fade-in">
                <div>
                  <label className="block text-[9px] font-bold text-slate-400 mb-1">Сума ($)</label>
                  <input type="number" min="0" step="any" placeholder="0.00" value={paymentForm.amount_usd} onChange={e => handlePaymentAmountChange('amount_usd', e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-emerald-500" />
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-slate-400 mb-1">Курс / Сума (₴)</label>
                  <div className="flex gap-1">
                    <input type="number" min="0" step="any" placeholder="Курс" value={paymentForm.exchange_rate} onChange={e => handlePaymentAmountChange('exchange_rate', e.target.value)} className="w-1/2 px-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-emerald-500" />
                    <input type="number" min="0" step="any" placeholder="₴" value={paymentForm.amount_uah} onChange={e => handlePaymentAmountChange('amount_uah', e.target.value)} className="w-1/2 px-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-emerald-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-slate-400 mb-1">Метод</label>
                  <select value={paymentForm.payment_method} onChange={e => setPaymentForm({ ...paymentForm, payment_method: e.target.value })} className="w-full px-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-emerald-500 cursor-pointer">
                    <option value="Готівка">Готівка</option>
                    <option value="Картка">Картка</option>
                    <option value="Банківський переказ">Банківський переказ</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-slate-400 mb-1">Призначення</label>
                  <select value={paymentForm.payment_category} onChange={e => setPaymentForm({ ...paymentForm, payment_category: e.target.value })} className="w-full px-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-emerald-500 cursor-pointer">
                    <option value="Повна оплата">Повна оплата</option>
                    <option value="Часткова оплата">Часткова оплата</option>
                    <option value="Аванс">Аванс</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Коментар до продажу</label>
            <textarea rows="2" value={notes} onChange={e => setNotes(e.target.value)} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-amber-500 resize-none" placeholder="Необов'язковий коментар..." />
          </div>

          {lineItems.some(li => li.line_type === 'product' && stockMap[li.product_id] !== undefined && parseFloat(li.quantity) > stockMap[li.product_id]) && (
            <div className="bg-rose-50 border border-rose-200 p-4 rounded-xl flex items-start gap-3">
              <FaExclamationTriangle className="text-rose-500 mt-0.5 shrink-0" />
              <p className="text-xs font-bold text-rose-700">Кількість деяких позицій перевищує доступний залишок на обраному складі. Виправте кількість або оберіть інший склад.</p>
            </div>
          )}
        </form>

        <div className="p-6 border-t border-slate-100 flex justify-end gap-3 bg-white rounded-b-3xl shrink-0">
          <button type="button" onClick={onClose} className="px-6 py-3.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">Скасувати</button>
          <button form="newSaleForm" type="submit" disabled={isSubmitting} className="px-8 py-3.5 bg-amber-500 hover:bg-amber-400 text-slate-900 text-xs font-black uppercase tracking-widest rounded-xl transition-colors disabled:opacity-50 shadow-lg shadow-amber-500/20 active:scale-95 flex items-center gap-2">
            <FaSave size={14} />{isSubmitting ? 'ОФОРМЛЕННЯ...' : 'ОФОРМИТИ ПРОДАЖ'}
          </button>
        </div>
      </div>
    </div>
  );
}
