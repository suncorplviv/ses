import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthProvider';
import { 
  FaPlus, FaTools, FaTrash, FaSearch, FaTimes, 
  FaArrowLeft, FaCheckCircle, FaClipboardList, 
  FaCheckSquare, FaRegSquare, FaSolarPanel, FaBoxOpen, FaSave, FaExchangeAlt
} from 'react-icons/fa';

export default function DealAdditionalMaterials({ dealId, onBack, onCompleteTask }) {
  const { employeeProfile } = useAuth();
  
  // ДОДАНО: Перевірка прав доступу до фінансів
  const canSeeFinances = ['Менеджер з продажу', 'Директор', 'Засновник компанії'].includes(employeeProfile?.role);
  
  const [mainEquipment, setMainEquipment] = useState([]);
  const [additionalMaterials, setAdditionalMaterials] = useState([]);
  const [loading, setLoading] = useState(true);

  // СТЕЙТИ МОДАЛКИ ПОШУКУ/ДОДАВАННЯ З ІСНУЮЧИХ
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [productsList, setProductsList] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // НОВИЙ СТЕЙТ: Вибрана категорія з чек-листа
  const [selectedCategory, setSelectedCategory] = useState(null); 
  
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [quantity, setQuantity] = useState('');
  
  // ФІНАНСОВІ СТЕЙТИ (МУЛЬТИВАЛЮТНІСТЬ)
  const [itemCurrency, setItemCurrency] = useState('USD');
  const [exchangeRate, setExchangeRate] = useState(41.0);
  const [unitCostPrice, setUnitCostPrice] = useState('');
  const [unitSalePrice, setUnitSalePrice] = useState('');

  const [isAdding, setIsAdding] = useState(false);
  const [pendingBomItems, setPendingBomItems] = useState([]);

  // СТЕЙТИ ДЛЯ ШВИДКОГО СТВОРЕННЯ НОВОГО ТОВАРУ
  const [isCreateProductModalOpen, setIsCreateProductModalOpen] = useState(false);
  const [isCreatingProduct, setIsCreatingProduct] = useState(false);
  const [newProductForm, setNewProductForm] = useState({
    name: '',
    sku: '',
    unit: 'шт', 
    product_type: 'consumable',
    currency: 'USD',
    cost_price: '',
    sale_price: ''
  });

  // ЧЕК-ЛИСТ ПРИВ'ЯЗАНИЙ ДО PRODUCT_TYPE (БД)
  const tzChecklist = [
    { id: 'cable', label: 'Кабель (AC/DC)', types: ['cable'] },
    { id: 'mounts', label: 'Кріплення / конструкції', types: ['fastener', 'rack'] },
    { id: 'mc4', label: 'Конектори (MC4)', types: ['connector'] },
    { id: 'protection', label: 'Захист (автомати, ПЗВ)', types: ['protection'] },
    { id: 'pipes', label: 'Гофра / труби', types: ['pipe'] },
    { id: 'grounding', label: 'Заземлення', types: ['grounding'] },
    { id: 'consumables', label: 'Розхідники (стяжки, ізолента)', types: ['consumable'] }
  ];

  const getCurrentUserId = async () => {
    if (employeeProfile?.id) return employeeProfile.id;
    const { data: { user } } = await supabase.auth.getUser();
    return user.id;
  };

  const fetchBom = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('v_deal_bom_fulfillment')
      .select('*')
      .eq('deal_id', dealId);

    if (error) {
      console.error("Помилка специфікації:", error);
      setLoading(false);
      return;
    }

    const productIds = [...new Set((data || []).map(item => item.product_id).filter(Boolean))];
    let stockData = [];
    let productTypes = {};
    
    if (productIds.length > 0) {
      const [{ data: stock }, { data: prods }] = await Promise.all([
        supabase.from('v_stock_available').select('product_id, available_stock').in('product_id', productIds).eq('location_type', 'warehouse'),
        supabase.from('products').select('id, product_type').in('id', productIds)
      ]);
      
      stockData = stock || [];
      (prods || []).forEach(p => productTypes[p.id] = p.product_type);
    }

    const availabilityByProduct = {};
    stockData.forEach(row => {
      availabilityByProduct[row.product_id] = (availabilityByProduct[row.product_id] || 0) + Number(row.available_stock || 0);
    });
    
    const mainTypes = ['inverter_hybrid_hv', 'inverter_hybrid_lv', 'inverter_grid', 'battery', 'bms', 'panel', 'datalogger'];
    const mainKeywords = /deye|longi|інвертор|панель|акб|акумулятор|батарея|bms|huawei|solis|pylontech|jinko|trina|risen/i;

    const allEquipment = (data || [])
      .filter(item => item.line_type === 'equipment')
      .map(item => {
        const pType = productTypes[item.product_id];
        let isMain = false;
        
        if (mainTypes.includes(pType)) {
           isMain = true;
        } else if (pType) {
           isMain = false; 
        } else {
           isMain = mainKeywords.test(item.product_name);
        }

        return {
          ...item,
          product_type: pType,
          quantity_actual: Number(item.quantity_mounted || 0),
          available_qty: availabilityByProduct[item.product_id] || 0,
          is_fully_covered: Number(item.quantity_shortage || 0) === 0,
          is_main: isMain
        };
      })
      .sort((a, b) => a.product_name.localeCompare(b.product_name));

    setMainEquipment(allEquipment.filter(item => item.is_main));
    setAdditionalMaterials(allEquipment.filter(item => !item.is_main));
    setLoading(false);
  };

  useEffect(() => {
    fetchBom();
  }, [dealId]);

  useEffect(() => {
    if (isAddModalOpen && (selectedCategory || searchQuery.length >= 2)) {
      const timer = setTimeout(() => { fetchProducts(); }, 300);
      return () => clearTimeout(timer);
    } else {
      setProductsList([]); 
      setSelectedProduct(null);
    }
  }, [isAddModalOpen, searchQuery, selectedCategory]);

  const fetchProducts = async () => {
    let q = supabase
      .from('products')
      .select('id, name, sku, unit, product_type, sale_price, cost_price, currency')
      .eq('is_active', true);

    if (selectedCategory) {
      const categoryConfig = tzChecklist.find(c => c.id === selectedCategory);
      if (categoryConfig) {
        q = q.in('product_type', categoryConfig.types);
      }
    }

    if (searchQuery.trim().length > 0) {
      q = q.or(`name.ilike.%${searchQuery.trim()}%,sku.ilike.%${searchQuery.trim()}%`);
    }

    const { data, error } = await q.limit(50);
    
    if (!error && data) {
      const mainTypes = ['inverter_hybrid_hv', 'inverter_hybrid_lv', 'inverter_grid', 'battery', 'bms', 'panel', 'datalogger'];
      const mainKeywords = /deye|longi|інвертор|панель|акб|акумулятор|батарея|bms|huawei|solis|pylontech|jinko|trina|risen/i;
      
      const filteredForAddModal = data.filter(p => {
         if (mainTypes.includes(p.product_type)) return false; 
         if (!p.product_type && mainKeywords.test(p.name)) return false; 
         return true;
      });
      
      setProductsList(filteredForAddModal); 
    }
  };

  const handleAddToQueue = () => {
    const qty = parseFloat(quantity);
    // Беремо ціни зі стейту. Навіть якщо інженер їх не бачить (input прихований), 
    // туди вже підставились дефолтні значення з бази при кліку на товар.
    const cost = parseFloat(unitCostPrice) || 0;
    const sale = parseFloat(unitSalePrice) || 0;
    const rate = parseFloat(exchangeRate) || 1;

    if (!selectedProduct) return alert('Оберіть товар зі списку.');
    if (!(qty > 0)) return alert('Кількість має бути більшою за нуль.');

    // Розрахунок USD
    const costUsd = itemCurrency === 'USD' ? cost : (cost / rate);
    const saleUsd = itemCurrency === 'USD' ? sale : (sale / rate);

    const newItem = {
      product_id: selectedProduct.id,
      display_name: selectedProduct.name,
      unit: selectedProduct.unit || 'шт',
      quantity_planned: qty,
      unit_price: cost,
      unit_sale_price: sale,
      currency: itemCurrency,
      exchange_rate: rate,
      unit_price_usd: costUsd,
      unit_sale_price_usd: saleUsd
    };

    setPendingBomItems(prev => [...prev, newItem]);
    setSelectedProduct(null);
    setQuantity('');
    setUnitCostPrice('');
    setUnitSalePrice('');
  };

  const saveAllPendingItems = async () => {
    setIsAdding(true);
    const payload = pendingBomItems.map(item => ({
      deal_id: dealId,
      product_id: item.product_id,
      line_type: 'equipment',
      quantity_planned: item.quantity_planned,
      unit_price: item.unit_price,
      unit_sale_price: item.unit_sale_price,
      currency: item.currency,
      exchange_rate: item.exchange_rate,
      unit_price_usd: item.unit_price_usd,
      unit_sale_price_usd: item.unit_sale_price_usd,
      added_by: employeeProfile?.id
    }));

    const { error } = await supabase.from('deal_bom').insert(payload);

    if (error) {
      alert('Помилка збереження: ' + error.message);
    } else {
      setPendingBomItems([]);
      setIsAddModalOpen(false);
      setSearchQuery('');
      setSelectedCategory(null);
      fetchBom();
    }
    setIsAdding(false);
  };

  const handleRemoveFromBom = async (bomId) => {
    if (!window.confirm("Видалити позицію додаткового матеріалу?")) return;
    await supabase.from('deal_bom').delete().eq('id', bomId);
    fetchBom();
  };

  const handleReserve = async (item) => {
    const quantityToReserve = Math.min(Number(item.quantity_shortage || 0), Number(item.available_qty || 0));
    if (quantityToReserve <= 0) return alert('Немає вільного залишку на складі.');

    try {
      const userId = await getCurrentUserId();
      await supabase.rpc('erp_reserve_bom_item', {
        p_bom_id: item.bom_id, p_location_id: null, p_quantity: quantityToReserve, p_performed_by: userId, p_notes: `Резерв матеріалів`
      });
      fetchBom();
    } catch (error) { alert('Помилка резервування: ' + error.message); }
  };

  const handleCreateNewProduct = async (e) => {
    e.preventDefault();
    if (!newProductForm.name.trim()) return alert("Назва товару є обов'язковою!");

    setIsCreatingProduct(true);
    try {
      const { data, error } = await supabase.from('products').insert([{
        name: newProductForm.name,
        sku: newProductForm.sku,
        unit: newProductForm.unit,
        product_type: newProductForm.product_type,
        currency: newProductForm.currency,
        cost_price: parseFloat(newProductForm.cost_price) || 0,
        sale_price: parseFloat(newProductForm.sale_price) || 0,
        is_active: true,
        is_tracked: true
      }]).select();

      if (error) throw error;

      if (data && data.length > 0) {
        const createdProduct = data[0];
        setIsCreateProductModalOpen(false);
        setSelectedProduct(createdProduct);
        setUnitCostPrice(createdProduct.cost_price || 0);
        setUnitSalePrice(createdProduct.sale_price || 0);
        setItemCurrency(createdProduct.currency || 'USD');
        setProductsList([createdProduct]);
        
        const matchingCategory = tzChecklist.find(c => c.types.includes(createdProduct.product_type));
        if (matchingCategory) setSelectedCategory(matchingCategory.id);
        setSearchQuery('');
      }
    } catch (error) {
      alert("Помилка при створенні товару: " + error.message);
    } finally {
      setIsCreatingProduct(false);
    }
  };

  const isAllCovered = additionalMaterials.length > 0 && additionalMaterials.every(item => item.is_fully_covered || item.quantity_actual >= item.quantity_planned);

  if (loading) return <div className="p-8 text-center text-slate-400 font-bold text-sm animate-pulse flex-1 flex items-center justify-center min-h-[50vh]">Завантаження специфікації...</div>;

  return (
    <div className="flex flex-col h-full bg-slate-50 min-h-screen">
      
      {/* HEADER */}
      <div className="bg-white mx-4 md:mx-6 mt-4 px-5 py-4 border border-slate-200 rounded-2xl flex justify-between items-center shadow-sm shrink-0">
        <button onClick={onBack} className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 rounded-xl text-xs font-black uppercase tracking-widest transition-colors">
          <FaArrowLeft size={12}/> Назад
        </button>
        
        <div className="text-center mx-4">
          <h2 className="text-sm md:text-base font-black text-slate-900 uppercase tracking-tight flex items-center justify-center gap-2">
            <FaTools className="text-purple-500"/> Підготовка до монтажу
          </h2>
          <p className="text-[10px] font-bold text-slate-400 mt-0.5">Формування додаткових матеріалів</p>
        </div>

        <div className="flex items-center gap-3">
          {isAllCovered && onCompleteTask && (
            <button onClick={onCompleteTask} className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-md shadow-emerald-500/30">
              <FaCheckCircle size={14}/> Завершити етап
            </button>
          )}
          <button onClick={() => setIsAddModalOpen(true)} className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-md shadow-purple-600/30 active:scale-95 whitespace-nowrap">
            <FaPlus size={12}/> Додати матеріали
          </button>
        </div>
      </div>

      <div className="p-4 md:p-6 flex-1 overflow-y-auto space-y-6">
        
        {/* ТАБЛИЦЯ 1: ОСНОВНЕ ОБЛАДНАННЯ */}
        {mainEquipment.length > 0 && (
          <div className="bg-slate-50 border border-slate-200 rounded-2xl shadow-sm overflow-hidden mb-2">
            <div className="bg-slate-100/50 px-5 py-3 border-b border-slate-200">
              <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <FaSolarPanel className="text-slate-400" /> Основне обладнання на об'єкт (Довідково)
              </h3>
            </div>
            <table className="w-full text-left border-collapse table-auto">
              <thead className="bg-white">
                <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                  <th className="py-3 px-5 w-3/4">Найменування</th>
                  <th className="py-3 px-5 text-right w-1/4">Затверджена кількість</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 bg-white">
                {mainEquipment.map(item => (
                  <tr key={item.bom_id}>
                    <td className="py-3 px-5 border-r border-slate-50">
                      <p className="font-bold text-xs text-slate-800">{item.product_name}</p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">{item.sku || 'Без артикулу'}</p>
                    </td>
                    <td className="py-3 px-5 text-right bg-slate-50/30">
                      <span className="font-black text-slate-900 text-sm">{Number(item.quantity_planned)}</span>
                      <span className="text-[9px] text-slate-500 ml-1.5">{item.unit}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ТАБЛИЦЯ 2: ДОДАТКОВІ МАТЕРІАЛИ */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden animate-fade-in">
          <div className="bg-slate-900 px-5 py-3 border-b border-slate-800 flex justify-between items-center">
             <h3 className="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-2">
               <FaBoxOpen className="text-purple-400" /> Додаткові матеріали до закупівлі
             </h3>
          </div>
          <table className="w-full text-left border-collapse table-auto">
            <thead className="bg-slate-50">
              <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200">
                <th className="py-4 px-5">Матеріал</th>
                <th className="py-4 px-4 text-center">Потреба</th>
                <th className="py-4 px-4 text-center">На складі</th>
                <th className="py-4 px-4 text-center">Статус</th>
                <th className="py-4 px-5 text-right">Дії</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {additionalMaterials.length === 0 ? (
                <tr>
                  <td colSpan="5" className="py-16 text-center text-slate-400 font-medium bg-slate-50/50">
                    <FaClipboardList className="mx-auto text-slate-300 text-3xl mb-3"/>
                    <p className="font-black uppercase tracking-widest text-[10px]">Список матеріалів порожній</p>
                    <p className="text-[9px] mt-1.5 opacity-80">Використовуйте кнопку "Додати матеріали" та чек-лист для заповнення</p>
                  </td>
                </tr>
              ) : (
                additionalMaterials.map((item) => {
                  const quantityPlanned = Number(item.quantity_planned || 0);
                  const quantityShortage = Number(item.quantity_shortage || 0);
                  const availableQty = Number(item.available_qty || 0);
                  const quantityReserved = Number(item.quantity_reserved || 0);
                  
                  return (
                    <tr key={item.bom_id} className="hover:bg-purple-50/30 transition-colors">
                      <td className="py-4 px-5">
                        <p className="font-bold text-sm text-slate-800">{item.product_name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-[9px] font-bold text-slate-400 uppercase">{item.sku || 'Без артикулу'}</p>
                          {canSeeFinances && item.currency === 'UAH' && (
                            <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded text-[8px] font-black uppercase">В гривні</span>
                          )}
                        </div>
                      </td>
                      
                      <td className="py-4 px-4 text-center">
                        <span className="font-black text-slate-900 text-sm">{quantityPlanned}</span>
                        <span className="text-[9px] text-slate-500 ml-1">{item.unit}</span>
                      </td>

                      <td className="py-4 px-4 text-center">
                        <span className={`font-black text-sm ${availableQty > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                          {availableQty}
                        </span>
                      </td>
                      
                      <td className="py-4 px-4 text-center">
                        {quantityShortage === 0 ? (
                          <span className="px-2.5 py-1.5 bg-emerald-100 text-emerald-700 text-[9px] font-black uppercase rounded-lg border border-emerald-200 block w-max mx-auto">Готово</span>
                        ) : quantityReserved > 0 ? (
                          <span className="px-2.5 py-1.5 bg-amber-100 text-amber-700 text-[9px] font-black uppercase rounded-lg border border-amber-200 block w-max mx-auto">В резерві: {quantityReserved}</span>
                        ) : (
                          <span className="px-2.5 py-1.5 bg-rose-50 text-rose-600 text-[9px] font-black uppercase rounded-lg border border-rose-200 block w-max mx-auto">Дефіцит: {quantityShortage}</span>
                        )}
                      </td>
                      
                      <td className="py-4 px-5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {quantityShortage > 0 && availableQty > 0 && (
                            <button onClick={() => handleReserve(item)} className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-[9px] font-black uppercase rounded-lg transition-all shadow-sm">
                              Резерв
                            </button>
                          )}
                          <button onClick={() => handleRemoveFromBom(item.bom_id)} className="p-2 text-slate-300 hover:text-rose-500 rounded-lg hover:bg-rose-50 transition-colors" title="Видалити матеріал">
                            <FaTrash size={14}/>
                          </button>
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

      {/* МОДАЛКА ДОДАВАННЯ */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in custom-scrollbar overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl flex flex-col relative overflow-hidden h-[85vh]">
            
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-900 text-white shrink-0">
              <div>
                <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                  <FaTools className="text-purple-400"/> Закупівля додаткових матеріалів
                </h3>
                {pendingBomItems.length > 0 && (
                  <p className="text-[10px] font-bold text-amber-300 mt-0.5">
                    У списку: {pendingBomItems.length} поз.
                    {canSeeFinances && ` · $${pendingBomItems.reduce((sum, i) => sum + i.quantity_planned * (i.unit_sale_price_usd || i.unit_sale_price), 0).toLocaleString('uk-UA', {maximumFractionDigits: 2})}`}
                  </p>
                )}
              </div>
              <button onClick={() => setIsAddModalOpen(false)} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors">
                <FaTimes size={16}/>
              </button>
            </div>

            <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
              
              {/* ЛІВА КОЛОНКА - ЧЕК-ЛИСТ (КАТЕГОРІЇ) */}
              <div className="w-full md:w-1/3 bg-slate-50 border-b md:border-b-0 md:border-r border-slate-200 p-6 flex flex-col shrink-0 overflow-y-auto">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <FaClipboardList size={14}/> Обов'язковий чек-лист
                </h4>
                <div className="space-y-2">
                  {tzChecklist.map(item => {
                    const isAdded = additionalMaterials.some(b => item.types.includes(b.product_type)) || 
                                    pendingBomItems.some(p => {
                                      const prod = productsList.find(pr => pr.id === p.product_id);
                                      return prod && item.types.includes(prod.product_type);
                                    });
                    
                    return (
                      <button
                        key={item.id}
                        onClick={() => { 
                          setSelectedCategory(prev => prev === item.id ? null : item.id); 
                          setSearchQuery(''); 
                          setSelectedProduct(null); 
                        }}
                        className={`w-full flex items-center justify-between p-3.5 rounded-xl border transition-all text-left ${
                          selectedCategory === item.id 
                            ? 'bg-purple-100 border-purple-300 ring-2 ring-purple-500/10 shadow-sm' 
                            : 'bg-white border-slate-200 hover:border-purple-300 hover:bg-purple-50'
                        }`}
                      >
                        <span className={`text-xs font-bold leading-snug ${isAdded ? 'text-emerald-700' : 'text-slate-700'}`}>
                          {item.label}
                        </span>
                        {isAdded ? <FaCheckSquare className="text-emerald-500 shrink-0" size={16}/> : <FaRegSquare className="text-slate-300 shrink-0" size={16}/>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ПРАВА КОЛОНКА - ПОШУК ТА РЕЗУЛЬТАТИ */}
              <div className="w-full md:w-2/3 p-6 flex flex-col bg-white overflow-hidden">
                <div className="relative shrink-0 mb-4">
                  <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"/>
                  <input
                    autoFocus
                    type="text"
                    placeholder={selectedCategory 
                      ? `Пошук у категорії "${tzChecklist.find(c => c.id === selectedCategory)?.label}"...` 
                      : "Глобальний пошук розхідників..."}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-purple-500 transition-colors shadow-inner"
                  />
                </div>

                <div className="flex-1 overflow-y-auto bg-white border border-slate-100 rounded-xl custom-scrollbar mb-4">
                  {!selectedCategory && searchQuery.length < 2 ? (
                    <div className="h-full flex flex-col items-center justify-center p-8 text-center">
                      <FaClipboardList className="text-slate-200 text-4xl mb-3"/>
                      <span className="text-xs font-bold text-slate-400">Оберіть категорію ліворуч<br/>або почніть вводити назву для глобального пошуку</span>
                    </div>
                  ) : productsList.length === 0 ? (
                    
                    <div className="h-full flex flex-col items-center justify-center p-8 text-center">
                      <p className="text-xs font-bold text-slate-400 mb-4">
                        Товарів {searchQuery ? `із назвою "${searchQuery}" ` : ''}не знайдено
                      </p>
                      <button 
                        onClick={() => {
                          const catTypes = selectedCategory ? tzChecklist.find(c => c.id === selectedCategory)?.types : null;
                          setNewProductForm(prev => ({ 
                            ...prev, 
                            name: searchQuery,
                            product_type: catTypes ? catTypes[0] : 'consumable'
                          }));
                          setIsCreateProductModalOpen(true);
                        }}
                        className="bg-amber-500 hover:bg-amber-400 text-slate-900 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-lg transition-all"
                      >
                        <FaPlus size={12}/> Створити новий матеріал
                      </button>
                    </div>

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
                        className={`p-3.5 cursor-pointer border-b border-slate-50 last:border-0 transition-colors flex justify-between items-center ${selectedProduct?.id === p.id ? 'bg-purple-50 border-purple-100' : 'hover:bg-slate-50'}`}
                      >
                        <div className="flex flex-col min-w-0 pr-3">
                          <p className="text-xs font-bold text-slate-800 truncate">{p.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-[9px] font-bold text-slate-400 uppercase">
                              {p.sku || 'Без SKU'} • {tzChecklist.find(c => c.types.includes(p.product_type))?.label || 'Інше'}
                            </p>
                            {canSeeFinances && p.currency === 'UAH' && <span className="text-[8px] bg-amber-100 text-amber-700 px-1 py-0.5 rounded font-black">UAH</span>}
                          </div>
                        </div>
                        <span className="text-[10px] font-black text-slate-500 px-2.5 py-1 bg-slate-100 rounded-md shrink-0">{p.unit}</span>
                      </div>
                    ))
                  )}
                </div>

                {/* ФУТЕР ІЗ ЦІНАМИ (ЗАЛЕЖНО ВІД РОЛІ) */}
                {selectedProduct && (
                  <div className="pt-4 border-t border-slate-200 animate-fade-in shrink-0">
                    <div className={`grid ${canSeeFinances ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-1'} gap-3 mb-3`}>
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase mb-1 ml-1">Кількість *</label>
                        <div className="relative">
                          <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} min="0.1" step="any" className="w-full py-2.5 pl-3 pr-8 bg-white border border-slate-200 rounded-xl font-black outline-none focus:border-purple-500 shadow-inner" />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">{selectedProduct.unit}</span>
                        </div>
                      </div>
                      
                      {canSeeFinances && (
                        <>
                          <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase mb-1 ml-1">Валюта</label>
                            <div className="w-full py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-center font-black text-slate-500 text-sm">
                              {itemCurrency === 'USD' ? 'USD' : 'UAH'}
                            </div>
                          </div>
                          <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase mb-1 ml-1">Собівартість ({itemCurrency === 'USD' ? '$' : '₴'})</label>
                            <input type="number" value={unitCostPrice} onChange={(e) => setUnitCostPrice(e.target.value)} min="0" step="any" className="w-full py-2.5 px-3 bg-white border border-slate-200 rounded-xl font-black outline-none focus:border-purple-500 shadow-inner" />
                          </div>
                          <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase mb-1 ml-1">Реалізація ({itemCurrency === 'USD' ? '$' : '₴'})</label>
                            <input type="number" value={unitSalePrice} onChange={(e) => setUnitSalePrice(e.target.value)} min="0" step="any" className="w-full py-2.5 px-3 bg-purple-50 border border-purple-200 rounded-xl font-black outline-none focus:border-purple-500 shadow-inner text-purple-700" />
                          </div>
                        </>
                      )}
                    </div>

                    {canSeeFinances && itemCurrency === 'UAH' && (
                      <div className="bg-sky-50 p-2.5 rounded-xl border border-sky-100 flex items-center gap-3 mb-3">
                         <FaExchangeAlt className="text-sky-400 shrink-0 ml-1"/>
                         <div className="flex-1">
                            <label className="block text-[9px] font-black text-sky-600 uppercase mb-1">Поточний курс для маржі ($)</label>
                            <input type="number" value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)} min="1" step="any" className="w-full p-2 bg-white border border-sky-200 rounded-lg font-bold outline-none focus:border-sky-500 text-sky-800 text-sm" />
                         </div>
                         <div className="text-right shrink-0 mt-2 pr-2">
                            <p className="text-[9px] font-bold text-sky-500 uppercase">Еквівалент реалізації</p>
                            <p className="text-sm font-black text-sky-700">${((parseFloat(unitSalePrice) || 0) / (parseFloat(exchangeRate) || 1)).toFixed(2)}</p>
                         </div>
                      </div>
                    )}

                    <button type="button" onClick={handleAddToQueue} disabled={!quantity || quantity <= 0} className="w-full h-[45px] bg-purple-600 hover:bg-purple-700 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-md active:scale-95 disabled:opacity-50">
                      Додати позицію
                    </button>
                  </div>
                )}
              </div>
            </div>

            {pendingBomItems.length > 0 && (
              <div className="px-6 py-4 bg-slate-900 border-t border-slate-800 shrink-0">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                  Готові до збереження ({pendingBomItems.length})
                </p>
                <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-2">
                  {pendingBomItems.map((item, index) => (
                    <div key={index} className="flex flex-col bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 shrink-0 min-w-[150px] max-w-[200px]">
                      <div className="flex justify-between items-start mb-1">
                        <p className="text-[10px] font-bold text-white truncate" title={item.display_name}>{item.display_name}</p>
                        <button type="button" onClick={() => setPendingBomItems(prev => prev.filter((_, i) => i !== index))} className="text-slate-400 hover:text-rose-400 transition-colors ml-2">
                          <FaTimes size={10}/>
                        </button>
                      </div>
                      <div className="flex justify-between items-end">
                        <span className="text-[9px] font-black text-purple-400 bg-purple-900/50 px-1.5 py-0.5 rounded">{item.quantity_planned} {item.unit}</span>
                        {canSeeFinances && (
                          <span className="text-[9px] font-black text-emerald-400">${item.unit_sale_price_usd.toFixed(2)}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="p-4 border-t border-slate-100 flex gap-3 bg-white rounded-b-3xl shrink-0">
              <button type="button" onClick={() => setIsAddModalOpen(false)} className="flex-1 py-4 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors">
                Скасувати
              </button>
              <button 
                type="button" onClick={saveAllPendingItems} disabled={isAdding || pendingBomItems.length === 0}
                className="flex-2 px-6 py-4 text-xs font-black text-white bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-300 disabled:text-slate-500 uppercase tracking-widest rounded-xl transition-all shadow-lg active:scale-95"
              >
                {isAdding ? 'Зберігаємо...' : `Зберегти в угоду`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ПІД-МОДАЛКА: СТВОРЕННЯ НОВОГО ТОВАРУ */}
      {isCreateProductModalOpen && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-fade-in">
          <form onSubmit={handleCreateNewProduct} className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col relative overflow-hidden">
            
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 flex items-center gap-2">
                <FaPlus className="text-amber-500"/> Новий матеріал в базу
              </h3>
              <button type="button" onClick={() => setIsCreateProductModalOpen(false)} className="p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-700 rounded-full transition-colors">
                <FaTimes size={14}/>
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1.5 ml-1">Назва товару *</label>
                <input
                  required
                  type="text"
                  value={newProductForm.name}
                  onChange={e => setNewProductForm({...newProductForm, name: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-amber-500 transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-1.5 ml-1">Артикул (SKU)</label>
                  <input
                    type="text"
                    value={newProductForm.sku}
                    onChange={e => setNewProductForm({...newProductForm, sku: e.target.value})}
                    placeholder="Необов'язково"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-amber-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-1.5 ml-1">Одиниця виміру *</label>
                  <select
                    value={newProductForm.unit}
                    onChange={e => setNewProductForm({...newProductForm, unit: e.target.value})}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-amber-500 transition-colors appearance-none"
                  >
                    <option value="шт">шт</option>
                    <option value="м">метри (м)</option>
                    <option value="кг">кілограми (кг)</option>
                    <option value="уп">упаковки (уп)</option>
                    <option value="рол">рулони (рол)</option>
                    <option value="компл">комплекти</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1.5 ml-1">Категорія матеріалу *</label>
                <select
                  value={newProductForm.product_type}
                  onChange={e => setNewProductForm({...newProductForm, product_type: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-amber-500 transition-colors appearance-none"
                >
                  <option value="cable">Кабель / Провід</option>
                  <option value="fastener">Кріплення / Метизи</option>
                  <option value="connector">Конектори (MC4)</option>
                  <option value="protection">Захист (автомати, ПЗВ)</option>
                  <option value="pipe">Гофра / труби</option>
                  <option value="grounding">Заземлення</option>
                  <option value="consumable">Розхідник (стяжки, ізолента)</option>
                </select>
              </div>

              {/* ВИБІР ВАЛЮТИ ТА ЦІНИ ДЛЯ НОВОГО ТОВАРУ (ТІЛЬКИ ДЛЯ МЕНЕДЖЕРІВ) */}
              {canSeeFinances && (
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-3">
                   <div>
                     <label className="block text-[10px] font-black text-slate-500 uppercase mb-1.5 ml-1">Базова валюта</label>
                     <select
                       value={newProductForm.currency}
                       onChange={e => setNewProductForm({...newProductForm, currency: e.target.value})}
                       className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold outline-none focus:border-amber-500 transition-colors cursor-pointer"
                     >
                       <option value="USD">Долари (USD)</option>
                       <option value="UAH">Гривні (UAH)</option>
                     </select>
                   </div>
                   <div className="grid grid-cols-2 gap-3">
                     <div>
                       <label className="block text-[10px] font-black text-slate-500 uppercase mb-1 ml-1">Собівартість</label>
                       <input type="number" step="any" value={newProductForm.cost_price} onChange={e => setNewProductForm({...newProductForm, cost_price: e.target.value})} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-bold outline-none focus:border-amber-500" placeholder="0.00" />
                     </div>
                     <div>
                       <label className="block text-[10px] font-black text-slate-500 uppercase mb-1 ml-1">Реалізація</label>
                       <input type="number" step="any" value={newProductForm.sale_price} onChange={e => setNewProductForm({...newProductForm, sale_price: e.target.value})} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-bold outline-none focus:border-amber-500" placeholder="0.00" />
                     </div>
                   </div>
                </div>
              )}

            </div>

            <div className="p-4 border-t border-slate-100 flex gap-3 bg-slate-50">
              <button type="button" onClick={() => setIsCreateProductModalOpen(false)} className="flex-1 py-3 text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl transition-colors">
                Скасувати
              </button>
              <button 
                type="submit" 
                disabled={isCreatingProduct || !newProductForm.name}
                className="flex-1 py-3 text-xs font-black text-slate-900 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-300 disabled:text-slate-500 uppercase tracking-widest rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
              >
                {isCreatingProduct ? 'Збереження...' : <><FaSave size={14}/> Зберегти</>}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}