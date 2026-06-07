import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthProvider';
import { 
  FaPlus, FaBoxOpen, FaTrash, FaSearch, FaTimes, 
  FaUndo, FaTruckLoading, FaArrowLeft, 
  FaCommentDots, FaChevronDown, FaChevronUp, FaCheckCircle, FaExchangeAlt
} from 'react-icons/fa';

export default function DealSpecification({ dealId, onProgressUpdate, onBack, onCompleteTask }) {
  const { employeeProfile } = useAuth();
  
  const [bomItems, setBomItems] = useState([]);
  const [loading, setLoading] = useState(true);

  // СТЕЙТИ МОДАЛКИ: ДОДАВАННЯ ТОВАРУ
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addLineType, setAddLineType] = useState('equipment');
  const [productsList, setProductsList] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  
  const [serviceName, setServiceName] = useState('');
  const [quantity, setQuantity] = useState(1);
  
  // ФІНАНСОВІ СТЕЙТИ (МУЛЬТИВАЛЮТНІСТЬ)
  const [itemCurrency, setItemCurrency] = useState('USD');
  const [exchangeRate, setExchangeRate] = useState(41.0); // Дефолтний курс
  const [unitCostPrice, setUnitCostPrice] = useState(''); // Собівартість
  const [unitSalePrice, setUnitSalePrice] = useState(''); // Ціна продажу

  const [isAdding, setIsAdding] = useState(false);
  const [addNotes, setAddNotes] = useState('');
  const [isAddNotesOpen, setIsAddNotesOpen] = useState(false);
  const [pendingBomItems, setPendingBomItems] = useState([]);

  // СТЕЙТИ МОДАЛКИ: ПРЯМА ПОСТАВКА
  const [isDirectModalOpen, setIsDirectModalOpen] = useState(false);
  const [directItem, setDirectItem] = useState(null);
  const [directData, setDirectData] = useState({ supplier_id: '', quantity: '', notes: '' });
  const [isDirectSubmitting, setIsDirectSubmitting] = useState(false);
  const [suppliersList, setSuppliersList] = useState([]);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [isSupplierDropdownOpen, setIsSupplierDropdownOpen] = useState(false);
  const [isAddingSupplier, setIsAddingSupplier] = useState(false);
  const supplierDropdownRef = useRef(null);

  const getCurrentUserId = async () => {
    if (employeeProfile?.id) return employeeProfile.id;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) throw new Error('Не визначено поточного користувача.');
    return user.id;
  };

  const fetchBom = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('v_deal_bom_fulfillment')
      .select('*')
      .eq('deal_id', dealId)
      .order('product_name');

    if (error) {
      console.error("Помилка специфікації:", error);
      setLoading(false);
      return;
    }

    const productIds = [...new Set((data || []).map(item => item.product_id).filter(Boolean))];
    const availabilityByProduct = {};

    if (productIds.length > 0) {
      const { data: stockData, error: stockError } = await supabase
        .from('v_stock_available')
        .select('product_id, location_type, physical_stock, available_stock')
        .in('product_id', productIds)
        .eq('location_type', 'warehouse');

      if (stockError) console.error("Помилка залишків:", stockError);

      (stockData || []).forEach(row => {
        const current = availabilityByProduct[row.product_id] || { physical: 0, available: 0 };
        availabilityByProduct[row.product_id] = {
          physical: current.physical + Number(row.physical_stock || 0),
          available: current.available + Number(row.available_stock || 0)
        };
      });
    }
    
    const mappedData = (data || []).map(item => {
      const availability = availabilityByProduct[item.product_id] || { physical: 0, available: 0 };
      const quantityMounted = Number(item.quantity_mounted || 0);
      const quantityShortage = Number(item.quantity_shortage || 0);

      return {
        ...item,
        quantity_actual: quantityMounted,
        physical_qty: availability.physical,
        available_qty: availability.available,
        is_fully_covered: quantityShortage === 0
      };
    });

    setBomItems(mappedData);

    if (onProgressUpdate) {
      const totalPlanned = mappedData.length;
      const coveredCount = mappedData.filter(item => {
        const isService = (item.line_type || 'equipment') === 'service';
        return isService || item.is_fully_covered || item.quantity_actual >= item.quantity_planned;
      }).length;
      const mountedCount = mappedData.filter(item => item.quantity_actual >= item.quantity_planned).length;
      onProgressUpdate({ total: totalPlanned, reserved: coveredCount, mounted: mountedCount });
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchBom();
  }, [dealId]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (supplierDropdownRef.current && !supplierDropdownRef.current.contains(event.target)) {
        setIsSupplierDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isAddModalOpen && addLineType === 'equipment' && searchQuery.length >= 2) {
      const timer = setTimeout(() => { fetchProducts(); }, 300);
      return () => clearTimeout(timer);
    } else {
      setProductsList([]); 
    }
  }, [isAddModalOpen, searchQuery]);

  const fetchProducts = async () => {
    const query = searchQuery.trim();
    const { data, error } = await supabase
      .from('products')
      .select('id, name, sku, unit, product_type, sale_price, cost_price, currency')
      .eq('is_active', true)
      .or(`name.ilike.%${query}%,sku.ilike.%${query}%`)
      .limit(10);
    if (!error && data) setProductsList(data);
  };

  const clearAddForm = () => {
    setSelectedProduct(null);
    setSearchQuery('');
    setServiceName('');
    setQuantity(1);
    setUnitSalePrice('');
    setUnitCostPrice('');
    setItemCurrency('USD');
    setAddNotes('');
    setIsAddNotesOpen(false);
  };

  const handleAddToQueue = () => {
    const qty = parseFloat(quantity);
    const cost = parseFloat(unitCostPrice) || 0;
    const sale = parseFloat(unitSalePrice) || 0;
    const rate = parseFloat(exchangeRate) || 1;

    if (addLineType === 'equipment' && !selectedProduct) return alert('Оберіть товар зі списку.');
    if (addLineType === 'service' && !serviceName.trim()) return alert('Вкажіть назву послуги.');
    if (!(qty > 0)) return alert('Кількість має бути більшою за нуль.');

    // Розрахунок доларових еквівалентів
    const costUsd = itemCurrency === 'USD' ? cost : (cost / rate);
    const saleUsd = itemCurrency === 'USD' ? sale : (sale / rate);

    const newItem = {
      product_id: addLineType === 'equipment' ? selectedProduct.id : null,
      line_type: addLineType,
      custom_name: addLineType === 'service' ? serviceName.trim() : null,
      display_name: addLineType === 'equipment' ? selectedProduct.name : serviceName.trim(),
      unit: addLineType === 'equipment' ? (selectedProduct.unit || 'шт') : 'шт',
      quantity_planned: qty,
      unit_price: cost,
      unit_sale_price: sale,
      currency: itemCurrency,
      exchange_rate: rate,
      unit_price_usd: costUsd,
      unit_sale_price_usd: saleUsd,
      notes: addNotes || null
    };

    setPendingBomItems(prev => [...prev, newItem]);
    clearAddForm();
  };

  const removePendingItem = (index) => {
    setPendingBomItems(prev => prev.filter((_, i) => i !== index));
  };

  const saveAllPendingItems = async () => {
    if (pendingBomItems.length === 0) return alert('Список порожній. Додайте хоча б одну позицію.');

    setIsAdding(true);

    const payload = pendingBomItems.map(item => ({
      deal_id: dealId,
      product_id: item.product_id,
      line_type: item.line_type,
      custom_name: item.custom_name,
      quantity_planned: item.quantity_planned,
      unit_price: item.unit_price,
      unit_sale_price: item.unit_sale_price,
      currency: item.currency,
      exchange_rate: item.exchange_rate,
      unit_price_usd: item.unit_price_usd,
      unit_sale_price_usd: item.unit_sale_price_usd,
      notes: item.notes,
      added_by: employeeProfile?.id
    }));

    const { error } = await supabase.from('deal_bom').insert(payload);

    if (error) {
      alert('Помилка збереження позицій: ' + error.message);
    } else {
      setPendingBomItems([]);
      clearAddForm();
      setAddLineType('equipment');
      setIsAddModalOpen(false);
      fetchBom();
    }
    setIsAdding(false);
  };

  const handleRemoveFromBom = async (bomId) => {
    if (!window.confirm("Видалити позицію зі специфікації?")) return;
    const { error } = await supabase.from('deal_bom').delete().eq('id', bomId);
    if (error) alert('Не вдалося видалити: ' + error.message);
    else fetchBom();
  };

  const handleReserve = async (item) => {
    const quantityToReserve = Math.min(Number(item.quantity_shortage || 0), Number(item.available_qty || 0));
    if (quantityToReserve <= 0) return alert('Немає вільного залишку для резерву. Зробіть закупку.');

    try {
      const userId = await getCurrentUserId();
      const { error } = await supabase.rpc('erp_reserve_bom_item', {
        p_bom_id: item.bom_id, p_location_id: null, p_quantity: quantityToReserve, p_performed_by: userId, p_notes: `Резерв з угоди`
      });
      if (error) throw error;
      await supabase.from('deal_activity_log').insert([{ deal_id: dealId, user_id: userId, action: `Зарезервовано: ${item.product_name}` }]);
      fetchBom();
    } catch (error) { alert('Помилка резервування: ' + error.message); }
  };

  const handleCancelReserve = async (item) => {
    if (!window.confirm("Зняти резерв? Товар повернеться на склад.")) return;
    try {
      const userId = await getCurrentUserId();
      const { data: reservations, error: findError } = await supabase
        .from('deal_reservations')
        .select('id, quantity_issued')
        .eq('bom_id', item.bom_id)
        .in('status', ['pending', 'confirmed', 'partially_issued'])
        .order('created_at', { ascending: true });
      if (findError) throw findError;

      const cancellableReservations = (reservations || []).filter(res => Number(res.quantity_issued || 0) === 0);
      const issuedReservationsCount = (reservations || []).length - cancellableReservations.length;

      if (cancellableReservations.length === 0) {
        throw new Error('Цей резерв уже має видачу. Спочатку оформіть повернення виданого товару.');
      }

      for (const res of cancellableReservations) {
        const { error } = await supabase.rpc('erp_cancel_reservation', { p_reservation_id: res.id, p_performed_by: userId });
        if (error) throw error;
      }

      const actionText = issuedReservationsCount > 0
        ? `Скасовано відкриту частину резерву: ${item.product_name}`
        : `Скасовано резерв: ${item.product_name}`;
      await supabase.from('deal_activity_log').insert([{ deal_id: dealId, user_id: userId, action: actionText }]);
      fetchBom();
    } catch (error) { alert('Помилка: ' + error.message); }
  };

  const openDirectModal = async (item) => {
    setDirectItem(item);
    setDirectData({ supplier_id: '', quantity: item.quantity_shortage, notes: '' });
    setSupplierSearch('');
    setIsDirectModalOpen(true);
    
    const { data } = await supabase.from('suppliers').select('id, name').order('name');
    if (data) setSuppliersList(data);
  };

  const handleCreateSupplier = async () => {
    const newName = supplierSearch.trim();
    if (!newName) return;
    setIsAddingSupplier(true);
    const { data, error } = await supabase.from('suppliers').insert([{ name: newName }]).select().single();
    setIsAddingSupplier(false);
    if (!error) {
      setSuppliersList([...suppliersList, data]);
      setDirectData({...directData, supplier_id: data.id});
      setIsSupplierDropdownOpen(false);
    }
  };

  const submitDirectOrder = async (e) => {
    e.preventDefault();
    if (!directData.supplier_id) return alert('Оберіть постачальника!');
    const qty = parseFloat(directData.quantity);
    if (qty <= 0) return alert('Кількість має бути більшою за нуль!');

    setIsDirectSubmitting(true);
    try {
      const userId = await getCurrentUserId();
      const { data: locId, error: locErr } = await supabase.rpc('erp_ensure_deal_location', { p_deal_id: dealId });
      if (locErr) throw locErr;

      const { data: po, error: poErr } = await supabase.from('purchase_orders').insert([{
        supplier_id: directData.supplier_id,
        delivery_type: 'direct_to_site',
        destination_location_id: locId,
        status: 'pending',
        notes: directData.notes || 'Пряма поставка на об\'єкт'
      }]).select().single();
      if (poErr) throw poErr;

      const { data: poItem, error: poiErr } = await supabase.from('purchase_order_items').insert([{
        order_id: po.id,
        product_id: directItem.product_id,
        quantity_ordered: qty,
        quantity_received: 0
      }]).select().single();
      if (poiErr) throw poiErr;

      const { error: allocErr } = await supabase.from('deal_bom_allocations').insert([{
        bom_id: directItem.bom_id,
        source_type: 'purchase_order',
        location_id: locId,
        purchase_order_id: po.id,
        purchase_order_item_id: poItem.id,
        quantity: qty,
        status: 'ordered',
        created_by: userId
      }]);
      if (allocErr) throw allocErr;

      await supabase.rpc('erp_refresh_bom_status', { p_bom_id: directItem.bom_id });
      await supabase.from('deal_activity_log').insert([{ deal_id: dealId, user_id: userId, action: `Оформлено пряму поставку: ${directItem.product_name} (${qty})` }]);

      setIsDirectModalOpen(false);
      setDirectItem(null);
      fetchBom();
    } catch (err) {
      alert('Помилка оформлення прямої поставки: ' + err.message);
    } finally {
      setIsDirectSubmitting(false);
    }
  };

  const isAllCovered = bomItems.length > 0 && bomItems.every(item => {
    const isService = (item.line_type || 'equipment') === 'service';
    return isService || item.is_fully_covered || item.quantity_actual >= item.quantity_planned;
  });

  if (loading) return <div className="p-8 text-center text-slate-400 font-bold text-sm animate-pulse flex-1 flex items-center justify-center min-h-[50vh]">Завантаження даних...</div>;

  return (
    <div className="flex flex-col h-full bg-slate-50 min-h-screen">
      
      <div className="bg-white mx-4 md:mx-6 mt-4 px-5 py-3 border border-slate-200 rounded-2xl flex justify-between items-center shadow-sm shrink-0">
        <button 
          onClick={onBack} 
          className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 rounded-xl text-xs font-black uppercase tracking-widest transition-colors"
        >
          <FaArrowLeft size={12}/> Назад
        </button>
        
        <h2 className="text-sm md:text-base font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
          <FaBoxOpen className="text-amber-500"/> Комплектація та резерв
        </h2>

        <div className="flex items-center gap-3">
          {isAllCovered && onCompleteTask && (
            <button 
              onClick={onCompleteTask} 
              className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex justify-center items-center gap-2 transition-all shadow-md shadow-emerald-500/30"
            >
              <FaCheckCircle size={14}/> Підтвердити резерв
            </button>
          )}
          <button 
            onClick={() => setIsAddModalOpen(true)} 
            className="bg-slate-900 hover:bg-slate-800 text-white px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex justify-center items-center gap-2 transition-all shadow-md shadow-slate-900/20 active:scale-95 whitespace-nowrap"
          >
            <FaPlus size={12}/> Додати позицію
          </button>
        </div>
      </div>

      <div className="p-4 md:p-6 space-y-6 flex-1 overflow-y-auto">
        <div className="animate-fade-in">
          <div className="overflow-x-auto custom-scrollbar border border-slate-200 rounded-2xl bg-white shadow-sm">
            <table className="w-full text-left border-collapse table-auto">
              <thead className="bg-slate-50">
                <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200">
                  <th className="py-4 px-4 w-4/12">Позиція</th>
                  <th className="py-4 px-2 text-center w-1/12">Потреба</th>
                  <th className="py-4 px-2 text-center w-2/12">Ціна (USD) / Сума</th>
                  <th className="py-4 px-2 text-center w-2/12">Статус складу</th>
                  <th className="py-4 px-4 text-right w-3/12">Дії</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bomItems.length === 0 ? (
                  <tr><td colSpan="5" className="py-16 text-center text-slate-400 font-bold bg-white">Специфікація порожня</td></tr>
                ) : (
                  bomItems.map((item) => {
                    const quantityPlanned = Number(item.quantity_planned || 0);
                    const quantityMounted = Number(item.quantity_mounted || 0);
                    const quantityReserved = Number(item.quantity_reserved || 0);
                    const quantityIssued = Number(item.quantity_issued || 0);
                    const quantityOrdered = Number(item.quantity_ordered || 0);
                    const quantityReceived = Number(item.quantity_received || 0);
                    const quantityShortage = Number(item.quantity_shortage || 0);
                    const availableQty = Number(item.available_qty || 0);
                    const isService = (item.line_type || 'equipment') === 'service';
                    
                    const unitPriceUsd = Number(item.unit_sale_price_usd || item.unit_sale_price || 0);
                    const lineTotalUsd = unitPriceUsd * quantityPlanned;
                    
                    const canRemove = isService || (quantityMounted === 0 && quantityReserved === 0 && quantityIssued === 0 && quantityOrdered === 0 && quantityReceived === 0);
                    const canReserve = !isService && quantityShortage > 0 && availableQty > 0;
                    const hasOpenReserve = quantityReserved > 0;

                    return (
                      <tr key={item.bom_id} className="hover:bg-slate-50/50 transition-colors bg-white">
                        <td className="py-4 px-4">
                          <p className="font-bold text-sm text-slate-800 leading-tight">{item.product_name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[9px] font-bold text-slate-400 uppercase">
                              {isService ? 'Послуга' : (item.sku || 'Без артикулу')}
                            </span>
                            {item.currency === 'UAH' && (
                              <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded text-[8px] font-black uppercase">В гривні</span>
                            )}
                          </div>
                        </td>
                        
                        <td className="py-4 px-2 text-center">
                          <span className="font-black text-slate-900 text-sm">{item.quantity_planned}</span>
                          <span className="text-[9px] text-slate-400 ml-1">{item.unit}</span>
                        </td>

                        <td className="py-4 px-2 text-center">
                          <div className="text-xs font-black text-slate-900">${unitPriceUsd.toLocaleString('uk-UA', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                          <div className="text-[9px] font-bold text-slate-400 mt-1">${lineTotalUsd.toLocaleString('uk-UA', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                        </td>
                        
                        <td className="py-4 px-2 text-center">
                          {isService ? (
                            <span className="px-2 py-1 bg-slate-100 text-slate-600 text-[9px] font-black uppercase rounded-md border border-slate-200 shadow-sm block w-max mx-auto">Послуга</span>
                          ) : quantityMounted >= quantityPlanned ? (
                            <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-[9px] font-black uppercase rounded-md border border-emerald-200 shadow-sm block w-max mx-auto">Змонтовано</span>
                          ) : quantityIssued > quantityMounted ? (
                            <span className="px-2 py-1 bg-sky-100 text-sky-700 text-[9px] font-black uppercase rounded-md border border-sky-200 shadow-sm block w-max mx-auto">Видано: {quantityIssued}</span>
                          ) : hasOpenReserve ? (
                            <span className="px-2 py-1 bg-amber-100 text-amber-700 text-[9px] font-black uppercase rounded-md border border-amber-200 shadow-sm block w-max mx-auto">В резерві: {quantityReserved}</span>
                          ) : quantityShortage === 0 ? (
                            <span className="text-[9px] font-black uppercase text-emerald-500">Покрито</span>
                          ) : availableQty > 0 ? (
                            <span className="text-[9px] font-black uppercase text-emerald-500">Є вільно: {availableQty}</span>
                          ) : (
                            <span className="text-[9px] font-black uppercase text-rose-500">Дефіцит: {quantityShortage}</span>
                          )}

                          {quantityOrdered > 0 && (
                            <span className="px-2 py-1 bg-slate-100 text-slate-700 text-[9px] font-black uppercase rounded-md border border-slate-200 shadow-sm block w-max mx-auto mt-1">В дорозі (Пряма): {quantityOrdered}</span>
                          )}
                          {quantityReceived > 0 && (
                            <span className="px-2 py-1 bg-emerald-50 text-emerald-600 text-[9px] font-black uppercase rounded-md border border-emerald-200 shadow-sm block w-max mx-auto mt-1">Приїхало (Пряма): {quantityReceived}</span>
                          )}
                        </td>
                        
                        <td className="py-4 px-4 text-right">
                          <div className="flex items-center justify-end gap-2 flex-wrap">
                            {quantityShortage > 0 && !isService && (
                              <button onClick={() => openDirectModal(item)} className="px-3 py-2 bg-amber-50 hover:bg-amber-500 hover:text-slate-900 text-amber-700 text-[9px] font-black uppercase rounded-lg transition-all flex items-center gap-1.5 border border-amber-200 shadow-sm">
                                <FaTruckLoading size={10}/> Замовити
                              </button>
                            )}

                            {canReserve && (
                              <button onClick={() => handleReserve(item)} className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white text-[9px] font-black uppercase rounded-lg transition-all shadow-sm">
                                {hasOpenReserve ? 'Дорезерв' : 'Резерв'}
                              </button>
                            )}

                            {hasOpenReserve && (
                              <button onClick={() => handleCancelReserve(item)} className="px-3 py-2 bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-500 text-[9px] font-black uppercase rounded-lg transition-all flex items-center gap-1.5 border border-slate-200">
                                <FaUndo size={10}/> Зняти
                              </button>
                            )}

                            {canRemove && (
                              <button onClick={() => handleRemoveFromBom(item.bom_id)} className="p-2 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-rose-50 transition-colors"><FaTrash size={14}/></button>
                            )}
                          </div>
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

      {isAddModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in custom-scrollbar overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg flex flex-col my-auto relative overflow-visible">
            
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-900 text-white rounded-t-3xl shrink-0">
              <div>
                <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                  <FaBoxOpen className="text-amber-400"/> Додати позиції
                </h3>
                {pendingBomItems.length > 0 && (
                  <p className="text-[10px] font-bold text-amber-300 mt-0.5">
                    У списку: {pendingBomItems.length} поз. · $
                    {pendingBomItems.reduce((sum, i) => sum + i.quantity_planned * i.unit_sale_price_usd, 0).toLocaleString('uk-UA', {maximumFractionDigits: 2})}
                  </p>
                )}
              </div>
              <button
                onClick={() => {
                  setIsAddModalOpen(false);
                  setPendingBomItems([]);
                  clearAddForm();
                  setAddLineType('equipment');
                }}
                className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
              >
                <FaTimes size={16}/>
              </button>
            </div>

            <div className="p-6 space-y-4 bg-slate-50/50">
              <div className="grid grid-cols-2 gap-2 bg-white border border-slate-200 rounded-2xl p-1.5">
                <button
                  type="button"
                  onClick={() => { setAddLineType('equipment'); setSelectedProduct(null); setServiceName(''); }}
                  className={`py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors ${addLineType === 'equipment' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                >
                  Обладнання / Матеріали
                </button>
                <button
                  type="button"
                  onClick={() => { 
                    setAddLineType('service'); 
                    setSelectedProduct(null); 
                    setSearchQuery('');
                    setItemCurrency('USD');
                    setUnitCostPrice('');
                  }}
                  className={`py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors ${addLineType === 'service' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                >
                  Послуги / Роботи
                </button>
              </div>

              {addLineType === 'equipment' ? (
                <>
                  <div className="relative">
                    <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"/>
                    <input
                      autoFocus
                      type="text"
                      placeholder="Пошук за назвою або артикулом..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-amber-500 transition-colors"
                    />
                  </div>

                  <div className="max-h-44 overflow-y-auto bg-white border border-slate-100 rounded-xl custom-scrollbar">
                    {searchQuery.length < 2 ? (
                      <div className="p-5 text-center text-xs font-bold text-slate-400">Почніть вводити назву або артикул...</div>
                    ) : productsList.length === 0 ? (
                      <div className="p-5 text-center text-xs font-bold text-slate-400">Нічого не знайдено :(</div>
                    ) : (
                      productsList.map(p => (
                        <div
                          key={p.id}
                          onClick={() => { 
                            setSelectedProduct(p); 
                            setUnitSalePrice(p.sale_price || ''); 
                            setUnitCostPrice(p.cost_price || 0);
                            setItemCurrency(p.currency || 'USD');
                          }}
                          className={`p-3 cursor-pointer border-b border-slate-50 last:border-0 transition-colors flex justify-between items-center ${selectedProduct?.id === p.id ? 'bg-amber-50' : 'hover:bg-slate-50'}`}
                        >
                          <div>
                            <p className="text-xs font-bold text-slate-800">{p.name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <p className="text-[9px] font-bold text-slate-400 uppercase">{p.sku || 'Без SKU'}</p>
                              {p.currency === 'UAH' && <span className="text-[8px] bg-amber-100 text-amber-700 px-1 py-0.5 rounded font-black">UAH</span>}
                            </div>
                          </div>
                          <span className="text-[10px] font-black text-slate-500">{p.unit}</span>
                        </div>
                      ))
                    )}
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Назва послуги *</label>
                    <input
                      autoFocus
                      type="text"
                      value={serviceName}
                      onChange={(e) => setServiceName(e.target.value)}
                      placeholder="Напр: монтаж інвертора, доставка..."
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-amber-500 transition-colors"
                    />
                  </div>
                </div>
              )}

              {(selectedProduct || addLineType === 'service') && (
                <div className="space-y-4 pt-4 border-t border-slate-100 animate-fade-in">
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase mb-1 ml-1">Кількість *</label>
                      <input
                        type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} min="0.1" step="any"
                        className="w-full p-3 bg-white border border-slate-200 rounded-xl text-center font-black outline-none focus:border-amber-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase mb-1 ml-1">Валюта вводу</label>
                      {addLineType === 'service' ? (
                        <select 
                          value={itemCurrency} onChange={(e) => setItemCurrency(e.target.value)}
                          className="w-full p-3 bg-white border border-slate-200 rounded-xl text-center font-black outline-none focus:border-amber-500 cursor-pointer"
                        >
                          <option value="USD">Долари (USD)</option>
                          <option value="UAH">Гривні (UAH)</option>
                        </select>
                      ) : (
                        <div className="w-full p-3 bg-slate-100 border border-slate-200 rounded-xl text-center font-black text-slate-500">
                          {itemCurrency === 'USD' ? 'Долари (USD)' : 'Гривні (UAH)'}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                    <div>
                      <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">
                        Собівартість ({itemCurrency === 'USD' ? '$' : '₴'})
                      </label>
                      <input
                        type="number" value={unitCostPrice} onChange={(e) => setUnitCostPrice(e.target.value)} min="0" step="any"
                        className="w-full p-2 bg-white border border-slate-200 rounded-lg text-center font-bold outline-none focus:border-amber-500 transition-colors"
                        placeholder="0.00"
                      />
                      {addLineType === 'equipment' && (
                        <p className="text-[8px] font-bold text-slate-400 mt-1 uppercase text-center tracking-wider">Редагується під закупку</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">
                        Реалізація ({itemCurrency === 'USD' ? '$' : '₴'})
                      </label>
                      <input
                        type="number" value={unitSalePrice} onChange={(e) => setUnitSalePrice(e.target.value)} min="0" step="any"
                        className="w-full p-2 bg-amber-50 border border-amber-200 rounded-lg text-center font-bold outline-none focus:border-amber-500"
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  {itemCurrency === 'UAH' && (
                    <div className="bg-sky-50 p-3 rounded-xl border border-sky-100 flex items-center gap-3">
                      <FaExchangeAlt className="text-sky-400 shrink-0"/>
                      <div className="flex-1">
                        <label className="block text-[9px] font-black text-sky-600 uppercase mb-1">Поточний курс для розрахунку маржі ($)</label>
                        <input
                          type="number" value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)} min="1" step="any"
                          className="w-full p-2 bg-white border border-sky-200 rounded-lg font-bold outline-none focus:border-sky-500 text-sky-800 text-sm"
                        />
                      </div>
                      <div className="text-right shrink-0 mt-3">
                        <p className="text-[9px] font-bold text-sky-500 uppercase">Еквівалент</p>
                        <p className="text-sm font-black text-sky-700">
                           ${((parseFloat(unitSalePrice) || 0) / (parseFloat(exchangeRate) || 1)).toFixed(2)} / од.
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setIsAddNotesOpen(!isAddNotesOpen)}
                      className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase hover:text-slate-600 transition-colors ml-1"
                    >
                      <FaCommentDots/> {isAddNotesOpen ? 'Сховати примітку' : 'Додати примітку'} {isAddNotesOpen ? <FaChevronUp size={10}/> : <FaChevronDown size={10}/>}
                    </button>
                    {isAddNotesOpen && (
                      <div className="mt-3 animate-fade-in">
                        <textarea
                          rows="2"
                          value={addNotes}
                          onChange={e => setAddNotes(e.target.value)}
                          className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-amber-500 resize-none transition-colors"
                          placeholder="Вкажіть побажання щодо товару..."
                        />
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleAddToQueue}
                    className="w-full py-3.5 bg-amber-400 hover:bg-amber-500 text-slate-900 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-md shadow-amber-400/30 flex items-center justify-center gap-2 active:scale-95"
                  >
                    <FaPlus size={11}/> + Додати у список
                  </button>
                </div>
              )}
            </div>

            {pendingBomItems.length > 0 && (
              <div className="px-6 pb-4 bg-slate-50/50 border-t border-slate-100">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 mt-4">
                  Підготовлені позиції ({pendingBomItems.length})
                </p>
                <div className="space-y-2 max-h-52 overflow-y-auto custom-scrollbar pr-1">
                  {pendingBomItems.map((item, index) => (
                    <div key={index} className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
                      <div className="flex-1 min-w-0 mr-3">
                        <p className="text-xs font-bold text-slate-800 truncate">{item.display_name}</p>
                        <p className="text-[10px] font-bold text-slate-400 mt-0.5">
                          {item.quantity_planned} {item.unit} · 
                          <span className={item.currency === 'UAH' ? 'text-amber-600' : 'text-slate-500'}>
                            {item.currency === 'USD' ? ' $' : ' ₴'}{item.unit_sale_price.toLocaleString('uk-UA')} / од.
                          </span>
                          <span className="text-slate-600 ml-2 font-black">
                            (= ${item.unit_sale_price_usd.toFixed(2)})
                          </span>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removePendingItem(index)}
                        className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors shrink-0"
                      >
                        <FaTimes size={12}/>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="p-4 border-t border-slate-100 flex gap-3 bg-white rounded-b-3xl shrink-0">
              <button
                type="button"
                onClick={() => {
                  setIsAddModalOpen(false);
                  setPendingBomItems([]);
                  clearAddForm();
                  setAddLineType('equipment');
                }}
                className="flex-1 py-3.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
              >
                Скасувати
              </button>
              <button
                type="button"
                onClick={saveAllPendingItems}
                disabled={isAdding || pendingBomItems.length === 0}
                className="flex-2 px-6 py-3.5 text-xs font-black text-white bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 disabled:text-slate-500 uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-slate-900/20 whitespace-nowrap"
              >
                {isAdding ? 'Зберігаємо...' : `Зберегти всі позиції${pendingBomItems.length > 0 ? ` (${pendingBomItems.length})` : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {isDirectModalOpen && directItem && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in custom-scrollbar overflow-y-auto">
          <form onSubmit={submitDirectOrder} className="bg-white rounded-3xl shadow-2xl w-full max-w-md flex flex-col overflow-visible relative">
            <div className="p-6 border-b border-slate-100 bg-slate-900 text-white flex justify-between items-center rounded-t-3xl shrink-0">
              <div>
                <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2"><FaTruckLoading className="text-amber-400"/> Пряма поставка</h3>
                <p className="text-[10px] font-medium mt-1 text-slate-400 line-clamp-1">{directItem.product_name}</p>
              </div>
              <button type="button" onClick={() => setIsDirectModalOpen(false)} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"><FaTimes size={16}/></button>
            </div>
            
            <div className="p-6 space-y-5 bg-slate-50/50">
              <div className="relative" ref={supplierDropdownRef}>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Постачальник *</label>
                <div className="relative w-full cursor-text" onClick={() => setIsSupplierDropdownOpen(true)}>
                  <input 
                    type="text" placeholder="Оберіть або додайте нового..." value={supplierSearch}
                    onChange={(e) => { setSupplierSearch(e.target.value); setIsSupplierDropdownOpen(true); if (e.target.value === '') setDirectData({...directData, supplier_id: ''}); }}
                    className="w-full pl-4 pr-10 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-amber-500 transition-colors"
                  />
                  <FaSearch className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={12}/>
                </div>
                
                {isSupplierDropdownOpen && (
                  <div className="absolute z-[210] top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto custom-scrollbar">
                    {suppliersList.filter(s => s.name.toLowerCase().includes(supplierSearch.toLowerCase())).map(s => (
                      <div key={s.id} onClick={() => { setDirectData({...directData, supplier_id: s.id}); setSupplierSearch(s.name); setIsSupplierDropdownOpen(false); }} className="px-4 py-3 text-sm font-bold text-slate-700 hover:bg-amber-50 hover:text-slate-900 cursor-pointer border-b border-slate-50 last:border-0">
                        {s.name}
                      </div>
                    ))}
                    
                    {supplierSearch.trim().length > 0 && suppliersList.filter(s => s.name.toLowerCase().includes(supplierSearch.toLowerCase())).length === 0 && (
                      <div className="p-2 border-t border-slate-100 bg-slate-50">
                        <button type="button" onClick={handleCreateSupplier} disabled={isAddingSupplier} className="w-full py-2.5 bg-amber-100 text-slate-800 hover:bg-amber-500 hover:text-slate-900 rounded-lg text-xs font-black uppercase tracking-widest transition-colors">
                          {isAddingSupplier ? 'Додаємо...' : `Додати "${supplierSearch}"`}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Кількість до замовлення *</label>
                <div className="flex items-center gap-3">
                  <input 
                    type="number" step="any" min="0.1" required
                    value={directData.quantity} onChange={(e) => setDirectData({...directData, quantity: e.target.value})}
                    className="w-full text-xl font-black p-3 bg-white border border-slate-200 rounded-xl outline-none focus:border-amber-500"
                  />
                  <span className="text-sm font-black text-slate-500 uppercase">{directItem.unit}</span>
                </div>
                <p className="text-[10px] font-bold text-slate-400 mt-2 ml-1">
                  Поточний дефіцит на об'єкті: {directItem.quantity_shortage} {directItem.unit}
                </p>
              </div>

              <div className="pt-2 border-t border-slate-100">
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Коментар до поставки</label>
                <textarea
                  rows="2"
                  value={directData.notes}
                  onChange={(e) => setDirectData({...directData, notes: e.target.value})}
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-amber-500 resize-none transition-colors"
                  placeholder="Коментар до прямої поставки: термін, контакт, умови..."
                />
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 flex gap-3 bg-white rounded-b-3xl shrink-0">
               <button type="button" onClick={() => setIsDirectModalOpen(false)} className="flex-1 py-3.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors">Скасувати</button>
               <button type="submit" disabled={isDirectSubmitting} className="flex-1 py-3.5 text-xs font-black text-white bg-slate-900 hover:bg-slate-800 uppercase tracking-widest rounded-xl transition-colors shadow-lg shadow-slate-900/20">
                 {isDirectSubmitting ? 'ОФОРМЛЕННЯ...' : 'ЗАМОВИТИ'}
               </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}