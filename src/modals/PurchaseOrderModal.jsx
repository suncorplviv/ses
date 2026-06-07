import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthProvider';
import { 
  FaTimes, FaSave, FaBuilding, FaSearch, FaChevronDown, FaBoxOpen, 
  FaPlus, FaTrash, FaCommentDots, FaChevronUp, FaTruckLoading, 
  FaMapMarkerAlt, FaCheck, FaBan, FaArrowDown, FaMoneyBillWave, FaHistory, FaEdit 
} from 'react-icons/fa';

const paymentStatusLabels = {
  unpaid: { label: 'Неоплачено', color: 'bg-rose-50 text-rose-600 border-rose-100' },
  realization: { label: 'Під реалізацію', color: 'bg-purple-50 text-purple-600 border-purple-100' },
  advance: { label: 'Аванс', color: 'bg-sky-50 text-sky-600 border-sky-100' },
  partial: { label: 'Часткова оплата', color: 'bg-amber-50 text-amber-600 border-amber-100' },
  paid: { label: 'Оплачено повністю', color: 'bg-emerald-50 text-emerald-600 border-emerald-100' }
};

export default function PurchaseOrderModal({ isOpen, onClose, poToEdit, onSaveSuccess }) {
  const { employeeProfile } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEditingOrder, setIsEditingOrder] = useState(false);
  const isViewMode = !!poToEdit && !isEditingOrder;

  // Форма СТВОРЕННЯ / РЕДАГУВАННЯ
  const [formData, setFormData] = useState({ 
    supplier_id: '', delivery_type: 'to_warehouse', destination_location_id: '', notes: '',
    supplier_document_number: '', total_amount: '', exchange_rate: '', total_amount_uah: '', payment_status: 'unpaid'
  });
  const [orderItems, setOrderItems] = useState([]);
  
  const [suppliers, setSuppliers] = useState([]);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [isSupplierDropdownOpen, setIsSupplierDropdownOpen] = useState(false);
  const supplierDropdownRef = useRef(null);
  const [isAddingSupplier, setIsAddingSupplier] = useState(false);
  
  const [locations, setLocations] = useState([]);
  const [locationSearch, setLocationSearch] = useState('');
  const [isLocationDropdownOpen, setIsLocationDropdownOpen] = useState(false);
  const locationDropdownRef = useRef(null);
  
  const [products, setProducts] = useState([]);
  const [productSearch, setProductSearch] = useState('');
  const [isProductDropdownOpen, setIsProductDropdownOpen] = useState(false);
  const productDropdownRef = useRef(null);
  
  const [isNotesOpen, setIsNotesOpen] = useState(false);

  // Стейт детального ПЕРЕГЛЯДУ
  const [poDetails, setPoDetails] = useState(null);
  const [viewItems, setViewItems] = useState([]);
  const [payments, setPayments] = useState([]);
  const [receivingItemId, setReceivingItemId] = useState(null);
  const [receivingQty, setReceivingQty] = useState('');
  const [isReceiving, setIsReceiving] = useState(false);
  
  // Стейт нової оплати (керований двовалютний ввід)
  const [paymentForm, setPaymentForm] = useState({ amount: '', amount_uah: '', method: 'Рахунок ФОП', category: 'Часткова оплата', notes: '' });
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  const getCurrentUserId = async () => {
    if (employeeProfile?.id) return employeeProfile.id;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) throw new Error('Не визначено поточного користувача.');
    return user.id;
  };

  useEffect(() => {
    if (isOpen) {
      fetchCreateData();
      if (!poToEdit) {
        setFormData({ supplier_id: '', delivery_type: 'to_warehouse', destination_location_id: '', notes: '', supplier_document_number: '', total_amount: '', exchange_rate: '', total_amount_uah: '', payment_status: 'unpaid' });
        setOrderItems([]); setSupplierSearch(''); setLocationSearch(''); setProductSearch(''); setIsNotesOpen(false); setIsEditingOrder(false);
      } else {
        fetchViewData();
        setIsEditingOrder(false);
      }
    }
  }, [isOpen, poToEdit]);

  useEffect(() => {
    if (isViewMode) return;
    function handleClickOutside(event) {
      if (supplierDropdownRef.current && !supplierDropdownRef.current.contains(event.target)) setIsSupplierDropdownOpen(false);
      if (locationDropdownRef.current && !locationDropdownRef.current.contains(event.target)) setIsLocationDropdownOpen(false);
      if (productDropdownRef.current && !productDropdownRef.current.contains(event.target)) setIsProductDropdownOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isViewMode]);

  const fetchCreateData = async () => {
    const [suppRes, prodRes, locRes] = await Promise.all([
      supabase.from('suppliers').select('id, name').order('name'),
      supabase.from('products').select('id, name, sku, unit').eq('is_active', true),
      supabase.from('stock_locations').select('id, name, type').eq('is_active', true)
    ]);

    const dedupeSuppliersByName = (rows) => {
      const map = new Map();
      rows.forEach(row => {
        const key = row.name?.trim().toLowerCase();
        if (key && !map.has(key)) map.set(key, row);
      });
      return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'uk'));
    };
    setSuppliers(dedupeSuppliersByName(suppRes.data || []));
    if (prodRes.data) setProducts(prodRes.data);
    if (locRes.data) setLocations(locRes.data);
  };

  const fetchViewData = async () => {
    if (!poToEdit?.id) return;
    const { data: po } = await supabase.from('purchase_orders').select('*, suppliers(name), destination_location:stock_locations!purchase_orders_destination_location_id_fkey(name)').eq('id', poToEdit.id).single();
    if (po) setPoDetails(po);

    const { data: items } = await supabase.from('purchase_order_items').select('*, products(name, sku, unit)').eq('order_id', poToEdit.id);
    if (items) setViewItems(items);

    const { data: payData } = await supabase.from('purchase_order_payments').select('*, users(full_name)').eq('purchase_order_id', poToEdit.id).order('payment_date', { ascending: false });
    if (payData) setPayments(payData);
  };

  const handleEnterEditMode = () => {
    setFormData({
      supplier_id: poDetails.supplier_id || '',
      delivery_type: poDetails.delivery_type || 'to_warehouse',
      destination_location_id: poDetails.destination_location_id || '',
      notes: poDetails.notes || '',
      supplier_document_number: poDetails.supplier_document_number || '',
      total_amount: poDetails.total_amount || '',
      exchange_rate: poDetails.exchange_rate || '',
      total_amount_uah: poDetails.total_amount_uah || '',
      payment_status: poDetails.payment_status || 'unpaid'
    });
    setSupplierSearch(poDetails.suppliers?.name || '');
    setLocationSearch(poDetails.destination_location?.name || '');
    
    setOrderItems(viewItems.map(vi => ({
      id: vi.id,
      product_id: vi.product_id,
      name: vi.products?.name,
      sku: vi.products?.sku,
      unit: vi.products?.unit,
      quantity_ordered: vi.quantity_ordered,
      quantity_received: vi.quantity_received || 0
    })));
    
    if (poDetails.notes) setIsNotesOpen(true);
    setIsEditingOrder(true);
  };

  // Валютний калькулятор для головної суми замовлення
  const handleAmountChange = (field, value) => {
    setFormData(prev => {
      const newData = { ...prev, [field]: value };
      const amountUsd = parseFloat(newData.total_amount) || 0;
      const rate = parseFloat(newData.exchange_rate) || 0;

      if (field === 'total_amount' && rate > 0) {
        newData.total_amount_uah = value ? (parseFloat(value) * rate).toFixed(2) : '';
      } else if (field === 'exchange_rate' && amountUsd > 0) {
        newData.total_amount_uah = value ? (amountUsd * parseFloat(value)).toFixed(2) : '';
      } else if (field === 'total_amount_uah' && rate > 0) {
        newData.total_amount = value ? (parseFloat(value) / rate).toFixed(2) : '';
      }
      return newData;
    });
  };

  // Валютний калькулятор для форми платежів
  const handlePaymentAmountChange = (field, value) => {
    setPaymentForm(prev => {
      const nextData = { ...prev, [field]: value };
      const rate = parseFloat(poDetails?.exchange_rate || poToEdit?.exchange_rate) || 0;
      
      if (rate <= 0) return nextData;

      if (field === 'amount') {
        nextData.amount_uah = value ? (parseFloat(value) * rate).toFixed(2) : '';
      } else if (field === 'amount_uah') {
        nextData.amount = value ? (parseFloat(value) / rate).toFixed(2) : '';
      }
      return nextData;
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
      setFormData({...formData, supplier_id: data.id});
      setIsSupplierDropdownOpen(false);
    }
  };

  const handleAddItem = (product) => {
    if (orderItems.find(item => item.product_id === product.id)) return;
    setOrderItems([...orderItems, { product_id: product.id, name: product.name, sku: product.sku, unit: product.unit, quantity_ordered: '1', quantity_received: 0 }]);
    setProductSearch(''); setIsProductDropdownOpen(false);
  };

  const handleRemoveItem = (productId) => setOrderItems(orderItems.filter(item => item.product_id !== productId));
  const handleItemQuantityChange = (productId, qty) => setOrderItems(orderItems.map(item => item.product_id === productId ? { ...item, quantity_ordered: qty } : item));

  const handleSaveSubmit = async (e) => {
    e.preventDefault();
    if (!formData.supplier_id) return alert('Оберіть постачальника!');
    if (!formData.destination_location_id) return alert('Оберіть локацію!');
    if (orderItems.length === 0) return alert('Додайте товари!');
    
    setIsSubmitting(true);
    try {
      const orderPayload = {
        supplier_id: formData.supplier_id,
        delivery_type: formData.delivery_type,
        destination_location_id: formData.destination_location_id || null,
        notes: formData.notes || null,
        supplier_document_number: formData.supplier_document_number || null,
        total_amount: parseFloat(formData.total_amount) || 0,
        exchange_rate: parseFloat(formData.exchange_rate) || null,
        total_amount_uah: parseFloat(formData.total_amount_uah) || 0,
        payment_status: formData.payment_status
      };

      if (poToEdit) {
        await supabase.from('purchase_orders').update(orderPayload).eq('id', poToEdit.id);
        
        for (const item of orderItems) {
          const qty = parseFloat(item.quantity_ordered) || 0;
          if (item.id) await supabase.from('purchase_order_items').update({ quantity_ordered: qty }).eq('id', item.id);
          else await supabase.from('purchase_order_items').insert([{ order_id: poToEdit.id, product_id: item.product_id, quantity_ordered: qty, quantity_received: 0 }]);
        }

        const currentItemIds = orderItems.map(i => i.id).filter(Boolean);
        const itemsToDelete = viewItems.filter(vi => !currentItemIds.includes(vi.id));
        for (const item of itemsToDelete) {
          if (item.quantity_received > 0) throw new Error(`Неможливо видалити "${item.products?.name}", бо його вже прийнято.`);
          await supabase.from('purchase_order_items').delete().eq('id', item.id);
        }

        setIsEditingOrder(false);
        await fetchViewData();
      } else {
        orderPayload.status = 'pending';
        const { data: poData, error: poError } = await supabase.from('purchase_orders').insert([orderPayload]).select().single();
        if (poError) throw poError;

        const itemsPayload = orderItems.map(item => ({
          order_id: poData.id,
          product_id: item.product_id,
          quantity_ordered: parseFloat(item.quantity_ordered) || 0,
          quantity_received: 0
        }));
        await supabase.from('purchase_order_items').insert(itemsPayload);
        onClose();
      }
      onSaveSuccess();
    } catch (error) { alert('Помилка: ' + error.message); } 
    finally { setIsSubmitting(false); }
  };

  const handleAddPayment = async (e) => {
    e.preventDefault();
    const amount = parseFloat(paymentForm.amount);
    const amount_uah = parseFloat(paymentForm.amount_uah);
    if (!amount || isNaN(amount) || amount <= 0) return alert('Введіть коректну суму ($)');

    setIsSubmittingPayment(true);
    try {
      const userId = await getCurrentUserId();
      await supabase.from('purchase_order_payments').insert([{ 
        purchase_order_id: poToEdit.id, 
        amount: amount, 
        amount_uah: amount_uah || 0,
        payment_method: paymentForm.method, 
        payment_category: paymentForm.category,
        notes: paymentForm.notes || null, 
        created_by: userId 
      }]);

      setPaymentForm({ amount: '', amount_uah: '', method: 'Рахунок ФОП', category: 'Часткова оплата', notes: '' });
      await fetchViewData();
      onSaveSuccess(); 
    } catch (error) { alert('Помилка: ' + error.message); } 
    finally { setIsSubmittingPayment(false); }
  };

  const handleReceiveStock = async (item) => {
    const qty = parseFloat(receivingQty);
    const remaining = item.quantity_ordered - item.quantity_received;
    if (isNaN(qty) || qty <= 0 || qty > remaining) return alert(`Введіть кількість (від 0.1 до ${remaining})`);

    setIsReceiving(true);
    try {
      const userId = await getCurrentUserId();
      await supabase.rpc('erp_receive_stock', { p_product_id: item.product_id, p_quantity: qty, p_to_location_id: poDetails.destination_location_id, p_performed_by: userId, p_purchase_order_item_id: item.id, p_document_number: `PO-${poDetails.id.substring(0,6).toUpperCase()}`, p_notes: 'Прийом по замовленню' });
      setReceivingItemId(null); setReceivingQty(''); await fetchViewData(); onSaveSuccess(); 
    } catch (error) { alert('Помилка: ' + error.message); } 
    finally { setIsReceiving(false); }
  };

  const handleCancelOrder = async () => {
    if (!window.confirm('Ви впевнені, що хочете скасувати це замовлення?')) return;
    await supabase.from('purchase_orders').update({ status: 'cancelled' }).eq('id', poToEdit.id);
    onSaveSuccess(); onClose();
  };

  if (!isOpen) return null;

  // ================= РЕЖИМ ПЕРЕГЛЯДУ КАРТКИ =================
  if (isViewMode) {
    const currentPo = poDetails || poToEdit;
    const isCancelled = currentPo.status === 'cancelled';
    const isFullyReceived = currentPo.status === 'received';
    const payStatusInfo = paymentStatusLabels[currentPo.payment_status] || paymentStatusLabels.unpaid;

    return (
      <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in custom-scrollbar overflow-y-auto">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl flex flex-col my-auto overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-900 text-white shrink-0">
            <div>
              <h3 className="text-lg font-black uppercase tracking-tight flex items-center gap-2"><FaTruckLoading className="text-amber-400"/> PO-{currentPo.id.substring(0,6).toUpperCase()}</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase mt-1 tracking-widest flex items-center gap-2">
                <span><FaBuilding className="inline mb-0.5 text-slate-500"/> {currentPo.suppliers?.name}</span>
                {currentPo.supplier_document_number && <span>• Дог/Інвойс: {currentPo.supplier_document_number}</span>}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {!isCancelled && !isFullyReceived && (
                <button onClick={handleEnterEditMode} className="p-2 bg-amber-500 hover:bg-amber-400 text-slate-900 rounded-lg transition-colors flex items-center gap-2 text-xs font-black uppercase tracking-widest mr-2 shadow-sm"><FaEdit size={14} /> Редагувати</button>
              )}
              <button onClick={onClose} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"><FaTimes size={18} /></button>
            </div>
          </div>

          <div className="p-6 md:p-8 space-y-8 bg-slate-50/50 max-h-[75vh] overflow-y-auto custom-scrollbar">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 flex flex-wrap gap-6 justify-between items-center shadow-sm">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Локація доставки</p>
                <p className="font-bold text-slate-800 flex items-center gap-1.5 mt-1"><FaMapMarkerAlt className="text-amber-500"/> {currentPo.destination_location?.name || 'Не вказано'}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Статус доставки</p>
                <div className="mt-1">
                  {isCancelled ? <span className="bg-rose-100 text-rose-700 px-3 py-1 rounded-lg text-xs font-black uppercase">Скасовано</span> :
                   isFullyReceived ? <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-lg text-xs font-black uppercase">Отримано</span> :
                   <span className="bg-sky-100 text-sky-700 px-3 py-1 rounded-lg text-xs font-black uppercase">В процесі</span>}
                </div>
              </div>
            </div>

            {/* ДВОВАЛЮТНІ ФІНАНСИ ТА ОПЛАТИ */}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6">
                <div className="shrink-0">
                  <h4 className="font-black text-sm uppercase tracking-widest text-slate-800 flex items-center gap-2"><FaMoneyBillWave className="text-emerald-500"/> Баланс Розрахунків</h4>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-2 mt-3">
                    <div>
                      <p className="text-[9px] text-slate-400 font-bold uppercase">Всього в $</p>
                      <p className="text-lg font-black text-slate-900">${Number(currentPo.total_amount || 0).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-slate-400 font-bold uppercase">Сплачено в $</p>
                      <p className="text-lg font-black text-emerald-600">${Number(currentPo.amount_paid || 0).toLocaleString()}</p>
                    </div>
                    {currentPo.total_amount_uah > 0 && (
                      <>
                        <div>
                          <p className="text-[9px] text-slate-400 font-bold uppercase">Всього в ₴</p>
                          <p className="text-sm font-black text-slate-600">{Number(currentPo.total_amount_uah).toLocaleString()} ₴</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-slate-400 font-bold uppercase">Сплачено в ₴</p>
                          <p className="text-sm font-black text-emerald-600">{Number(currentPo.amount_paid_uah || 0).toLocaleString()} ₴</p>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="mt-3"><span className={`inline-block px-3 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest border ${payStatusInfo.color}`}>{payStatusInfo.label}</span></div>
                </div>

                {/* Розумна форма додавання оплати */}
                {!isCancelled && currentPo.payment_status !== 'paid' && (
                  <form onSubmit={handleAddPayment} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex-1 w-full">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Провести транзакцію</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
                      <div>
                        <label className="block text-[9px] font-bold text-slate-400 mb-1">Сума ($)</label>
                        <input type="number" min="0.01" step="any" required placeholder="0.00" value={paymentForm.amount} onChange={e => handlePaymentAmountChange('amount', e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-emerald-500"/>
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold text-slate-400 mb-1">Сума (₴)</label>
                        <input type="number" min="0.01" step="any" placeholder="Авторахунок" value={paymentForm.amount_uah} onChange={e => handlePaymentAmountChange('amount_uah', e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-emerald-500"/>
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold text-slate-400 mb-1">Призначення</label>
                        <select value={paymentForm.category} onChange={e => setPaymentForm({...paymentForm, category: e.target.value})} className="w-full px-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-emerald-500 cursor-pointer">
                          <option>Часткова оплата</option>
                          <option>Аванс</option>
                          <option>Повна оплата</option>
                          <option>Під реалізацію</option>
                        </select>
                      </div>
                      <div>
                        <select value={paymentForm.method} onChange={e => setPaymentForm({...paymentForm, method: e.target.value})} className="w-full px-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-emerald-500 cursor-pointer">
                          <option>Рахунок ФОП</option>
                          <option>Готівка</option>
                          <option>Картка</option>
                        </select>
                      </div>
                      <div className="col-span-2 sm:col-span-3">
                        <input type="text" placeholder="Примітка до платежу..." value={paymentForm.notes || ''} onChange={e => setPaymentForm({...paymentForm, notes: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium outline-none focus:border-emerald-500"/>
                      </div>
                      <button type="submit" disabled={isSubmittingPayment} className="w-full py-2 bg-emerald-500 hover:bg-emerald-400 text-white rounded-lg text-xs font-black uppercase tracking-widest transition-colors shadow-sm disabled:opacity-50">{isSubmittingPayment ? '...' : 'Внести'}</button>
                    </div>
                  </form>
                )}
              </div>

              {/* Двовалютна історія транзакцій */}
              {payments.length > 0 && (
                <div className="p-0 border-t border-slate-100">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-[10px] uppercase font-black text-slate-400 tracking-widest border-b border-slate-100">
                      <tr>
                        <th className="p-3 pl-5"><FaHistory className="inline mb-0.5 mr-1"/> Транзакція</th>
                        <th className="p-3">Тип / Метод</th>
                        <th className="p-3 text-right pr-5">Сума сплати</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {payments.map(pay => (
                        <tr key={pay.id} className="hover:bg-slate-50">
                          <td className="p-3 pl-5">
                            <span className="font-bold text-slate-800">{new Date(pay.payment_date).toLocaleDateString('uk-UA')}</span>
                            <span className="text-[10px] text-slate-400 ml-2 font-mono">{new Date(pay.payment_date).toLocaleTimeString('uk-UA', {hour: '2-digit', minute:'2-digit'})}</span>
                            <div className="text-[10px] font-bold text-slate-500 mt-0.5">Провів: {pay.users?.full_name} {pay.notes ? `(${pay.notes})` : ''}</div>
                          </td>
                          <td className="p-3">
                            <div className="flex flex-col gap-1">
                              <span className="text-[10px] font-black uppercase text-slate-700">{pay.payment_category || 'Оплата'}</span>
                              <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[9px] font-bold w-fit">{pay.payment_method}</span>
                            </div>
                          </td>
                          <td className="p-3 text-right pr-5">
                            <div className="font-black text-emerald-600">+ ${Number(pay.amount || 0).toLocaleString()}</div>
                            {pay.amount_uah > 0 && (
                              <div className="text-[10px] text-slate-400 font-bold">+{Number(pay.amount_uah).toLocaleString()} ₴</div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* СПЕЦИФІКАЦІЯ */}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <h4 className="p-4 border-b border-slate-100 font-black text-sm uppercase tracking-widest text-slate-800 bg-slate-50/50 flex items-center gap-2"><FaBoxOpen className="text-amber-500"/> Специфікація та Прийом</h4>
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-[10px] uppercase font-black text-slate-400 tracking-widest border-b border-slate-200">
                  <tr><th className="p-4">Товар</th><th className="p-4 text-center">Замовлено</th><th className="p-4 text-center">Отримано</th><th className="p-4 text-right">Дії</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {viewItems.map(item => {
                    const remaining = item.quantity_ordered - item.quantity_received;
                    const isItemComplete = remaining <= 0;
                    return (
                      <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-4">
                          <p className="font-bold text-slate-800 text-sm">{item.products?.name}</p>
                          <p className="text-[10px] font-mono text-slate-400">SKU: {item.products?.sku || '-'}</p>
                        </td>
                        <td className="p-4 text-center font-black text-slate-800">{item.quantity_ordered} <span className="text-xs text-slate-400">{item.products?.unit}</span></td>
                        <td className="p-4 text-center"><span className={`font-black ${isItemComplete ? 'text-emerald-600' : 'text-amber-500'}`}>{item.quantity_received}</span></td>
                        <td className="p-4 text-right">
                          {!isCancelled && !isItemComplete && (
                            receivingItemId === item.id ? (
                              <div className="flex items-center justify-end gap-2 animate-fade-in">
                                <input type="number" min="0.1" max={remaining} step="any" value={receivingQty} onChange={e => setReceivingQty(e.target.value)} className="w-20 p-2 border border-emerald-300 bg-emerald-50 text-emerald-900 rounded-lg text-sm font-black text-center outline-none" autoFocus/>
                                <button onClick={() => handleReceiveStock(item)} disabled={isReceiving} className="p-2 bg-emerald-500 hover:bg-emerald-400 text-white rounded-lg shadow-sm"><FaCheck size={14}/></button>
                                <button onClick={() => setReceivingItemId(null)} disabled={isReceiving} className="p-2 text-slate-400 hover:text-rose-500"><FaTimes size={14}/></button>
                              </div>
                            ) : (
                              <button onClick={() => { setReceivingItemId(item.id); setReceivingQty(remaining); }} className="px-3 py-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 ml-auto border border-emerald-200"><FaArrowDown size={10}/> Прийняти</button>
                            )
                          )}
                          {isItemComplete && <span className="text-[10px] font-black uppercase text-emerald-500"><FaCheck className="inline mr-1"/> Прийнято</span>}
                          {isCancelled && <span className="text-[10px] font-black uppercase text-rose-400">Скасовано</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <div className="p-6 border-t border-slate-100 flex justify-between bg-white shrink-0">
            {!isCancelled && !isFullyReceived ? (
              <button onClick={handleCancelOrder} className="px-4 py-2 text-rose-500 hover:bg-rose-50 rounded-xl text-xs font-black uppercase tracking-widest transition-colors flex items-center gap-2"><FaBan size={12}/> Скасувати замовлення</button>
            ) : <div></div>}
            <button onClick={onClose} className="px-6 py-3.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-colors">Закрити</button>
          </div>
        </div>
      </div>
    );
  }

  // ================= РЕЖИМ СТВОРЕННЯ / РЕДАГУВАННЯ ФОРМИ =================
  const filteredSuppliers = suppliers.filter(s => s.name.toLowerCase().includes(supplierSearch.toLowerCase()));
  const filteredLocations = locations.filter(l => formData.delivery_type === 'direct_to_site' ? l.type === 'project_site' : l.type === 'warehouse').filter(l => l.name.toLowerCase().includes(locationSearch.toLowerCase()));
  const filteredProducts = productSearch.trim() === '' ? products.slice(0, 5) : products.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase()) || p.sku?.toLowerCase().includes(productSearch.toLowerCase()));

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in custom-scrollbar overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl flex flex-col my-auto relative overflow-visible">
        
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-900 text-white rounded-t-3xl shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500 text-slate-900 rounded-lg">{isEditingOrder ? <FaEdit size={18}/> : <FaTruckLoading size={18}/>}</div>
            <div>
              <h3 className="text-lg font-black uppercase tracking-tight">{isEditingOrder ? `Редагування PO-${poToEdit?.id.substring(0,6).toUpperCase()}` : 'Нова закупівля'}</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5 tracking-widest">Формування замовлення постачальнику</p>
            </div>
          </div>
          <div className="flex gap-2">
            {isEditingOrder && <button type="button" onClick={() => setIsEditingOrder(false)} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-xs font-black uppercase transition-colors">Назад</button>}
            <button type="button" onClick={onClose} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"><FaTimes size={18} /></button>
          </div>
        </div>

        <form id="poForm" onSubmit={handleSaveSubmit} className="p-6 md:p-8 space-y-6 bg-slate-50/50 max-h-[70vh] overflow-y-auto custom-scrollbar">
          
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-2 gap-4">
            
            <div className="relative" ref={supplierDropdownRef}>
              <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Постачальник *</label>
              <div className="relative w-full cursor-text" onClick={() => setIsSupplierDropdownOpen(true)}>
                <input type="text" placeholder="Пошук постачальника..." value={supplierSearch} onChange={(e) => { setSupplierSearch(e.target.value); setIsSupplierDropdownOpen(true); if (e.target.value === '') setFormData({...formData, supplier_id: ''}); }} className="w-full pl-4 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-amber-500 transition-colors"/>
                <FaSearch className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={12}/>
              </div>
              {isSupplierDropdownOpen && (
                <div className="absolute z-[210] top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl max-h-56 overflow-y-auto custom-scrollbar">
                  {filteredSuppliers.map(s => <div key={s.id} onClick={() => { setFormData({...formData, supplier_id: s.id}); setSupplierSearch(s.name); setIsSupplierDropdownOpen(false); }} className="px-4 py-3 text-sm font-bold text-slate-700 hover:bg-amber-50 cursor-pointer border-b border-slate-50 last:border-0">{s.name}</div>)}
                  {supplierSearch.trim().length > 0 && filteredSuppliers.length === 0 && (
                    <div className="p-2 border-t border-slate-100 bg-slate-50">
                      <button type="button" onClick={handleCreateSupplier} disabled={isAddingSupplier} className="w-full flex justify-center py-2.5 bg-amber-100 text-slate-800 hover:bg-amber-500 rounded-lg text-xs font-black uppercase transition-colors"><FaPlus size={10} className="mr-2"/> Додати "{supplierSearch}"</button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Номер договору / Інвойсу</label>
              <input type="text" placeholder="Необов'язково" value={formData.supplier_document_number} onChange={e => setFormData({...formData, supplier_document_number: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-amber-500 transition-colors"/>
            </div>

            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Куди доставляємо? *</label>
              <select value={formData.delivery_type} onChange={e => { setFormData({...formData, delivery_type: e.target.value, destination_location_id: ''}); setLocationSearch(''); }} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-amber-500 cursor-pointer">
                <option value="to_warehouse">На Головний склад</option>
                <option value="direct_to_site">Прямо на об'єкт клієнта</option>
              </select>
            </div>

            <div className="relative" ref={locationDropdownRef}>
              <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Точна локація *</label>
              <div className="relative w-full cursor-text" onClick={() => setIsLocationDropdownOpen(true)}>
                <input type="text" placeholder={formData.delivery_type === 'to_warehouse' ? "Пошук складу..." : "Пошук назви об'єкта..."} value={locationSearch} onChange={(e) => { setLocationSearch(e.target.value); setIsLocationDropdownOpen(true); if (e.target.value === '') setFormData({...formData, destination_location_id: ''}); }} className="w-full pl-4 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-amber-500 transition-colors"/>
                <FaMapMarkerAlt className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={12}/>
              </div>
              {isLocationDropdownOpen && (
                <div className="absolute z-[200] top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto custom-scrollbar">
                  {filteredLocations.map(l => <div key={l.id} onClick={() => { setFormData({...formData, destination_location_id: l.id}); setLocationSearch(l.name); setIsLocationDropdownOpen(false); }} className="px-4 py-3 text-sm font-bold text-slate-700 hover:bg-amber-50 cursor-pointer border-b border-slate-50 last:border-0 truncate">{l.name}</div>)}
                </div>
              )}
            </div>

            {/* ВАЛЮТНИЙ КАЛЬКУЛЯТОР ФОРМИ */}
            <div className="md:col-span-2 mt-2 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <label className="block text-[10px] font-black text-slate-400 uppercase mb-3 flex items-center gap-2"><FaMoneyBillWave/> Фінансові умови замовлення</label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">Сума ($) *</label>
                  <input type="number" min="0" step="any" required placeholder="0.00" value={formData.total_amount} onChange={e => handleAmountChange('total_amount', e.target.value)} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold outline-none focus:border-amber-500 transition-colors"/>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">Курс валют</label>
                  <input type="number" min="0" step="any" placeholder="Напр. 40.5" value={formData.exchange_rate} onChange={e => handleAmountChange('exchange_rate', e.target.value)} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold outline-none focus:border-amber-500 transition-colors"/>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">Сума (₴)</label>
                  <input type="number" min="0" step="any" placeholder="0.00" value={formData.total_amount_uah} onChange={e => handleAmountChange('total_amount_uah', e.target.value)} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold outline-none focus:border-amber-500 transition-colors"/>
                </div>
              </div>
            </div>

            {/* РУЧНИЙ ВИБІР СТАТУСУ ФІНАНСІВ ПРИ ФОРМУВАННІ / РЕДАГУВАННІ */}
            <div className="md:col-span-2">
              <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Статус фінансування / умов закупівлі</label>
              <select value={formData.payment_status} onChange={e => setFormData({...formData, payment_status: e.target.value})} className="w-full md:w-1/2 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-amber-500 cursor-pointer">
                <option value="unpaid">Неоплачено</option>
                <option value="realization">Під реалізацію</option>
                <option value="advance">Аванс</option>
                <option value="partial">Часткова оплата</option>
                <option value="paid">Оплачено повністю</option>
              </select>
            </div>

            <div className="md:col-span-2 pt-2 border-t border-slate-100">
              <button type="button" onClick={() => setIsNotesOpen(!isNotesOpen)} className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase hover:text-slate-600 transition-colors ml-1"><FaCommentDots /> {isNotesOpen ? 'Сховати коментар' : 'Коментар до замовлення'} {isNotesOpen ? <FaChevronUp size={10}/> : <FaChevronDown size={10}/>}</button>
              {isNotesOpen && <div className="mt-3 animate-fade-in"><textarea rows="2" value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-amber-500 resize-none transition-colors" placeholder="Будь-які примітки щодо фінансів чи доставки..."/></div>}
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h4 className="font-black text-sm uppercase tracking-widest text-slate-800 flex items-center gap-2"><FaBoxOpen className="text-amber-500"/> Специфікація замовлення</h4>
            <div className="relative" ref={productDropdownRef}>
              <div className="relative w-full cursor-text" onClick={() => setIsProductDropdownOpen(true)}>
                <input type="text" placeholder="Пошук товару для додавання..." value={productSearch} onChange={(e) => { setProductSearch(e.target.value); setIsProductDropdownOpen(true); }} className="w-full pl-4 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-amber-500"/>
                <FaSearch className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={14}/>
              </div>
              {isProductDropdownOpen && (
                <div className="absolute z-[190] top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl max-h-56 overflow-y-auto custom-scrollbar">
                  {filteredProducts.map(p => (
                    <div key={p.id} onClick={() => handleAddItem(p)} className="px-4 py-3 text-sm flex justify-between items-center hover:bg-amber-50 cursor-pointer border-b border-slate-50 group">
                      <div><span className="font-bold text-slate-800">{p.name}</span><span className="block text-[10px] text-slate-400 font-mono mt-0.5">SKU: {p.sku || 'Без SKU'}</span></div>
                      <FaPlus className="text-amber-400"/>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {orderItems.length > 0 ? (
              <div className="mt-4 border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-[10px] uppercase font-black text-slate-400 tracking-widest border-b border-slate-200">
                    <tr><th className="p-3">Обладнання</th><th className="p-3 text-center w-32">Кількість</th><th className="p-3 text-center w-12"></th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {orderItems.map(item => {
                      const minQuantity = item.quantity_received > 0 ? item.quantity_received : 0.1;
                      return (
                        <tr key={item.product_id} className="bg-white">
                          <td className="p-3"><p className="font-bold text-slate-800 text-sm line-clamp-1">{item.name}</p><p className="text-[10px] font-mono text-slate-400">SKU: {item.sku || '-'}</p></td>
                          <td className="p-3 text-center">
                            <div className="flex flex-col items-center justify-center">
                              <div className="flex items-center gap-2">
                                <input type="text" required value={item.quantity_ordered} onChange={(e) => handleItemQuantityChange(item.product_id, e.target.value)} className="w-20 p-2 text-center border border-slate-200 rounded-lg text-sm font-black outline-none focus:border-amber-500"/>
                                <span className="text-[10px] font-black text-slate-400">{item.unit}</span>
                              </div>
                              {item.quantity_received > 0 && <span className="text-[9px] text-emerald-500 font-bold mt-1">Прийнято: {item.quantity_received}</span>}
                            </div>
                          </td>
                          <td className="p-3 text-center">
                            {item.quantity_received > 0 ? <span className="text-[10px] text-slate-300" title="Вже частково прийнято">Н/Д</span> : <button type="button" onClick={() => handleRemoveItem(item.product_id)} className="p-2 text-slate-300 hover:text-rose-500 transition-colors"><FaTrash size={14}/></button>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : <div className="py-8 text-center text-slate-400 text-xs font-bold uppercase tracking-widest border-2 border-dashed border-slate-200 rounded-xl">Корзина порожня</div>}
          </div>
        </form>

        <div className="p-6 border-t border-slate-100 flex justify-end gap-3 bg-white rounded-b-3xl shrink-0">
          <button type="button" onClick={() => isEditingOrder ? setIsEditingOrder(false) : onClose()} className="px-6 py-3.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">Скасувати</button>
          <button form="poForm" type="submit" disabled={isSubmitting} className="px-8 py-3.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-colors disabled:opacity-50 shadow-lg shadow-slate-900/20 active:scale-95 flex items-center gap-2"><FaSave size={14} />{isSubmitting ? 'ЗБЕРЕЖЕННЯ...' : isEditingOrder ? 'ЗБЕРЕГТИ ЗМІНИ' : 'СФОРМУВАТИ ЗАМОВЛЕННЯ'}</button>
        </div>
      </div>
    </div>
  );
}