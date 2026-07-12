import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthProvider';
import { 
  FaTimes, FaTruckLoading, FaSave, FaBoxOpen, FaPlus, 
  FaEye, FaSpinner, FaMapMarkerAlt, FaHashtag, FaCheckCircle, 
  FaUserTie, FaSearch, FaPhoneAlt, FaMoneyBillWave, FaMapSigns 
} from 'react-icons/fa';

export default function DeliveryOrganizationModal({ isOpen, onClose, deal, task, onSave }) {
  const { employeeProfile } = useAuth();
  
  const [mode, setMode] = useState('loading'); 
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [bomItems, setBomItems] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [deliveredQuantities, setDeliveredQuantities] = useState({});
  const [selectedDelivery, setSelectedDelivery] = useState(null);
  
  // Дані для автозаповнення адреси
  const [siteSurveyData, setSiteSurveyData] = useState(null);

  // Стейт форми доставки
  const [selectedItems, setSelectedItems] = useState({});
  const [formData, setFormData] = useState({
    delivery_at: '',
    address: '',
    client_contact: deal?.clients?.phone || '',
    receiver_name: deal?.clients?.name || '',
    tracking_number: '',
    shipping_cost: '',       // вартість у гривні
    exchange_rate: '',       // курс ₴/$ для перерахунку у витрати
    cost_payer: 'company',
    notes: ''
  });

  // USD-еквівалент вартості доставки (для витрат компанії)
  const shippingCostUsd = (() => {
    const uah = parseFloat(formData.shipping_cost) || 0;
    const rate = parseFloat(formData.exchange_rate) || 0;
    return uah > 0 && rate > 0 ? uah / rate : 0;
  })();

  // Логіка перевізників (Combobox)
  const [carriers, setCarriers] = useState([]);
  const [searchCarrier, setSearchCarrier] = useState('');
  const [showCarrierDropdown, setShowCarrierDropdown] = useState(false);
  const [selectedCarrier, setSelectedCarrier] = useState(null);
  
  // Логіка СТВОРЕННЯ нового перевізника
  const [isCreatingCarrier, setIsCreatingCarrier] = useState(false);
  const [newCarrierData, setNewCarrierData] = useState({
    name: '', type: 'external_company', contact_person: '', phone: ''
  });

  // Логіка задачі
  const [completeTask, setCompleteTask] = useState(false);

  const dropdownRef = useRef(null);

  useEffect(() => {
    if (isOpen && deal?.id) {
      fetchData();
    }
  }, [isOpen, deal, task]);

  // Закриття дропдауну при кліку поза ним
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowCarrierDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchData = async () => {
    setMode('loading');
    try {
      // 1. Завантажуємо BOM
      const { data: bom } = await supabase
        .from('deal_bom')
        .select(`id, quantity_planned, products (name, sku, unit)`)
        .eq('deal_id', deal.id)
        .eq('line_type', 'equipment')
        .order('created_at', { ascending: true });
      
      setBomItems(bom || []);

      // 2. Отримуємо дані з site_surveys (безпечно дістаємо НАЙСВІЖІШИЙ запис)
      let fullAddress = deal?.objects?.address || '';
      const { data: surveys } = await supabase
        .from('site_surveys')
        .select('region, city, geolocation')
        .eq('deal_id', deal.id)
        .order('created_at', { ascending: false })
        .limit(1);
      
      const survey = surveys?.[0];

      if (survey) {
        setSiteSurveyData(survey);
        
        // Формуємо розумну адресу з усіх наявних частин
        const addressParts = [];
        if (survey.region) addressParts.push(survey.region);
        if (survey.city) addressParts.push(survey.city);
        if (deal?.objects?.address) addressParts.push(deal.objects.address);
        if (survey.geolocation) addressParts.push(`Geo: ${survey.geolocation}`);
        
        if (addressParts.length > 0) {
          fullAddress = addressParts.join(', ');
        }
      }

      // 3. Завантажуємо перевізників
      const { data: carriersData } = await supabase
        .from('carriers')
        .select('*')
        .eq('is_active', true)
        .order('name', { ascending: true });
      setCarriers(carriersData || []);

      // 4. Існуючі доставки
      const { data: existingDeliveries } = await supabase
        .from('deal_deliveries')
        .select(`
          *,
          carriers (name, phone),
          deal_delivery_items ( id, quantity, bom_id, deal_bom ( products (name, sku, unit) ) )
        `)
        .eq('deal_id', deal.id)
        .order('created_at', { ascending: false });

      setDeliveries(existingDeliveries || []);

      // 5. Вираховуємо залишки
      const qtyMap = {};
      (existingDeliveries || []).forEach(d => {
        d.deal_delivery_items.forEach(item => {
          qtyMap[item.bom_id] = (qtyMap[item.bom_id] || 0) + Number(item.quantity);
        });
      });
      setDeliveredQuantities(qtyMap);
      
      if (existingDeliveries && existingDeliveries.length > 0) {
        setMode('list');
      } else {
        prepareCreateForm(bom || [], qtyMap, fullAddress);
      }
    } catch (error) {
      console.error("Помилка завантаження даних:", error);
    }
  };

  const prepareCreateForm = (items = bomItems, qtyMap = deliveredQuantities, prefilledAddress = null) => {
    const initialSelected = {};
    items.forEach(item => {
      const remaining = Number(item.quantity_planned) - (qtyMap[item.id] || 0);
      if (remaining > 0) {
        initialSelected[item.id] = { selected: true, qty: remaining }; 
      }
    });
    setSelectedItems(initialSelected);
    
    setFormData(prev => ({
      ...prev,
      address: prefilledAddress !== null ? prefilledAddress : prev.address,
      tracking_number: '',
      shipping_cost: '',
      exchange_rate: '',
      cost_payer: 'company',
      notes: ''
    }));
    
    setSelectedCarrier(null);
    setSearchCarrier('');
    setIsCreatingCarrier(false);
    setCompleteTask(false);
    setNewCarrierData({ name: '', type: 'external_company', contact_person: '', phone: '' });
    setMode('create');
  };

  const handleCarrierSelect = (carrier) => {
    setSelectedCarrier(carrier);
    setSearchCarrier(carrier.name);
    setShowCarrierDropdown(false);
    setIsCreatingCarrier(false);
  };

  const filteredCarriers = carriers.filter(c => 
    c.name.toLowerCase().includes(searchCarrier.toLowerCase()) || 
    (c.phone && c.phone.includes(searchCarrier))
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const itemsToDeliver = Object.entries(selectedItems)
      .filter(([_, data]) => data.selected && Number(data.qty) > 0)
      .map(([bom_id, data]) => ({ bom_id, quantity: Number(data.qty) }));

    // Валідація
    if (itemsToDeliver.length === 0) return alert('Оберіть хоча б один товар для відвантаження!');
    if (!selectedCarrier && !isCreatingCarrier) return alert('Оберіть перевізника зі списку або створіть нового!');
    if (isCreatingCarrier && !newCarrierData.name.trim()) return alert('Введіть назву перевізника!');
    if (formData.shipping_cost && Number(formData.shipping_cost) < 0) return alert('Вартість доставки не може бути від\'ємною!');
    // Якщо доставку оплачує компанія — потрібен курс, щоб зафіксувати витрату в USD
    if (formData.cost_payer === 'company' && Number(formData.shipping_cost) > 0 && !(parseFloat(formData.exchange_rate) > 0)) {
      return alert('Вкажіть курс ₴/$ — вартість доставки рахується у витрати компанії в доларовому еквіваленті.');
    }

    setIsSubmitting(true);
    try {
      let finalCarrierId = selectedCarrier?.id;

      // Якщо створюємо нового перевізника
      if (isCreatingCarrier) {
        const { data: newC, error: cErr } = await supabase
          .from('carriers')
          .insert([{ 
            name: newCarrierData.name.trim(), 
            type: newCarrierData.type,
            contact_person: newCarrierData.contact_person.trim() || null,
            phone: newCarrierData.phone.trim() || null
          }])
          .select()
          .single();
        if (cErr) throw cErr;
        finalCarrierId = newC.id;
      }

      // Зберігаємо накладну (вартість у ₴ + курс + USD-еквівалент)
      const { data: delivery, error: dError } = await supabase.from('deal_deliveries').insert([{
        deal_id: deal.id,
        task_id: task?.id || null,
        carrier_id: finalCarrierId,
        tracking_number: formData.tracking_number || null,
        shipping_cost: formData.shipping_cost ? Number(formData.shipping_cost) : 0,
        currency: 'UAH',
        exchange_rate: parseFloat(formData.exchange_rate) || null,
        shipping_cost_usd: shippingCostUsd > 0 ? Number(shippingCostUsd.toFixed(2)) : null,
        cost_payer: formData.cost_payer,
        delivery_at: formData.delivery_at || null,
        address: formData.address,
        client_contact: formData.client_contact,
        receiver_name: formData.receiver_name,
        notes: formData.notes,
        status: 'planned',
        created_by: employeeProfile?.id
      }]).select().single();

      if (dError) throw dError;

      // Витрата компанії: якщо доставку оплачуємо ми — фіксуємо у Видатках (каса)
      if (formData.cost_payer === 'company' && shippingCostUsd > 0) {
        const CATEGORY_NAME = 'Логістика / Доставка';
        let { data: cat } = await supabase
          .from('expense_categories')
          .select('id')
          .eq('name', CATEGORY_NAME)
          .maybeSingle();
        if (!cat) {
          const { data: newCat, error: catErr } = await supabase
            .from('expense_categories')
            .insert([{ name: CATEGORY_NAME, created_by: employeeProfile?.id || null }])
            .select('id')
            .single();
          if (catErr) throw catErr;
          cat = newCat;
        }

        const carrierNameForExpense = isCreatingCarrier ? newCarrierData.name.trim() : selectedCarrier?.name;
        const { error: expErr } = await supabase.from('expenses').insert([{
          category_id: cat.id,
          deal_id: deal.id,
          amount_usd: Number(shippingCostUsd.toFixed(2)),
          exchange_rate: parseFloat(formData.exchange_rate),
          amount_uah: Number(formData.shipping_cost),
          expense_date: formData.delivery_at ? new Date(formData.delivery_at).toISOString() : new Date().toISOString(),
          notes: `Доставка по СЕС №${deal.custom_id} (${carrierNameForExpense || 'перевізник'})${formData.tracking_number ? `, ТТН ${formData.tracking_number}` : ''}`,
          created_by: employeeProfile?.id || null
        }]);
        if (expErr) throw expErr;
      }

      // Зберігаємо товари у накладну
      const itemsPayload = itemsToDeliver.map(item => ({
        delivery_id: delivery.id,
        bom_id: item.bom_id,
        quantity: item.quantity,
        status: 'shipped'
      }));
      await supabase.from('deal_delivery_items').insert(itemsPayload);

      // Ручне закриття задачі (якщо чекбокс активний)
      let taskActionNote = '';
      if (completeTask && task?.id) {
        await supabase.from('tasks')
          .update({ status: 'Виконана', completed_at: new Date().toISOString() })
          .eq('id', task.id);
        taskActionNote = ' та завершив завдання';
      }

      // Логування
      const carrierNameForLog = isCreatingCarrier ? newCarrierData.name : selectedCarrier.name;
      await supabase.from('deal_activity_log').insert([{
        deal_id: deal.id, user_id: employeeProfile?.id, stage_id: task?.stage_id || deal.stage_id,
        entity_type: 'task', action: `Створив накладну на доставку (${carrierNameForLog}). Вартість: ${formData.shipping_cost ? formData.shipping_cost + ' ₴' : 'Не вказана'}${taskActionNote}`
      }]);

      if (onSave) onSave();
      await fetchData(); 
      
    } catch (error) {
      alert('Помилка збереження: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-fade-in custom-scrollbar overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl flex flex-col my-auto overflow-hidden">
        
        {/* HEADER */}
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-900 text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${mode === 'view' ? 'bg-emerald-500' : 'bg-amber-500'} text-slate-900`}>
              {mode === 'view' ? <FaCheckCircle size={18}/> : <FaTruckLoading size={18} />}
            </div>
            <div>
              <h3 className="text-lg font-black uppercase tracking-tight">
                {mode === 'view' ? 'Деталі відправки' : 'Організація логістики'}
              </h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5 tracking-widest">
                Об'єкт: СЕС №{deal?.custom_id}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors">
            <FaTimes size={18} />
          </button>
        </div>

        {/* LOADING MODE */}
        {mode === 'loading' && (
          <div className="p-20 flex flex-col items-center justify-center text-slate-400">
            <FaSpinner className="animate-spin mb-4" size={32} />
            <p className="text-xs font-black uppercase tracking-widest">Обробка даних...</p>
          </div>
        )}

        {/* LIST MODE: СПИСОК ІСНУЮЧИХ ДОСТАВОК */}
        {mode === 'list' && (
          <div className="p-6 md:p-8 space-y-6 bg-slate-50/50 max-h-[75vh] overflow-y-auto custom-scrollbar">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-2">
              <h4 className="font-black text-sm uppercase tracking-widest text-slate-800 flex items-center gap-2">
                <FaBoxOpen className="text-amber-500"/> Історія відправок по об'єкту
              </h4>
              <button onClick={() => prepareCreateForm()} className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-colors shadow-lg shadow-slate-900/20 flex items-center gap-2">
                <FaPlus size={12} /> Оформити нову доставку
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {deliveries.map((del, idx) => (
                <div key={del.id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:border-amber-300 transition-colors cursor-pointer" onClick={() => { setSelectedDelivery(del); setMode('view'); }}>
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Накладна #{deliveries.length - idx}</span>
                      <p className="font-bold text-slate-800 mt-1">{del.carriers?.name || 'Невідомий перевізник'}</p>
                    </div>
                    <div className="text-right">
                       <div className={`inline-block px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest mb-1 ${
                        del.status === 'delivered' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
                      }`}>
                        {del.status === 'delivered' ? 'Доставлено' : 'Заплановано / В дорозі'}
                      </div>
                      <div className="text-xs font-bold text-slate-600">
                        {del.shipping_cost > 0 ? `${del.shipping_cost} ₴${del.shipping_cost_usd ? ` (~$${Number(del.shipping_cost_usd).toFixed(2)})` : ''}` : 'Вартість не вказана'}
                      </div>
                    </div>
                  </div>
                  
                  {del.tracking_number && (
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 mb-2">
                      <FaHashtag className="text-slate-400"/> ТТН: <span className="font-mono text-amber-600">{del.tracking_number}</span>
                    </div>
                  )}
                  
                  <div className="flex items-center gap-1.5 text-[10px] font-medium text-slate-500 mb-4 line-clamp-2">
                    <FaMapMarkerAlt className="text-emerald-500 shrink-0"/> {del.address || 'Без адреси'}
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex justify-between items-center">
                    <span className="text-[10px] font-bold text-slate-400">
                      Позицій: <strong className="text-slate-700">{del.deal_delivery_items?.length || 0}</strong>
                    </span>
                    <span className="text-[10px] font-black uppercase tracking-widest text-amber-500 flex items-center gap-1 group-hover:text-amber-600">
                      Переглянути деталі <FaEye size={10}/>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* VIEW MODE: ПЕРЕГЛЯД ДЕТАЛЕЙ */}
        {mode === 'view' && selectedDelivery && (
          <div className="p-6 md:p-8 space-y-6 bg-slate-50/50 max-h-[75vh] overflow-y-auto custom-scrollbar">
            <button onClick={() => setMode('list')} className="text-[10px] font-black uppercase text-amber-600 tracking-widest hover:text-amber-700 flex items-center gap-1 mb-2">
              ← Повернутись до всіх відправок
            </button>
            
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div className="md:col-span-2">
                  <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Перевізник</p>
                  <p className="font-black text-slate-800">{selectedDelivery.carriers?.name || '-'}</p>
                  {selectedDelivery.carriers?.phone && (
                    <p className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-1"><FaPhoneAlt size={8}/> {selectedDelivery.carriers.phone}</p>
                  )}
                </div>
                <div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Номер ТТН</p>
                  <p className="font-bold text-slate-800 font-mono">{selectedDelivery.tracking_number || 'Не вказано'}</p>
                </div>
                <div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Вартість доставки</p>
                  <p className="font-bold text-slate-800">
                    {selectedDelivery.shipping_cost > 0 ? `${selectedDelivery.shipping_cost} ₴` : '-'}
                    {selectedDelivery.shipping_cost_usd > 0 && (
                      <span className="text-emerald-600 ml-1">(~${Number(selectedDelivery.shipping_cost_usd).toFixed(2)})</span>
                    )}
                  </p>
                  <p className="text-[9px] text-slate-500 uppercase mt-0.5 font-bold">
                    Оплачує: {selectedDelivery.cost_payer === 'client' ? 'Клієнт' : 'Компанія'}
                    {selectedDelivery.cost_payer !== 'client' && selectedDelivery.shipping_cost_usd > 0 && ' · У видатках'}
                  </p>
                </div>
                <div className="md:col-span-4">
                  <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Об'єкт / Адреса</p>
                  <p className="font-medium text-slate-800">{selectedDelivery.address || '-'}</p>
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <h4 className="p-4 border-b border-slate-100 font-black text-sm uppercase tracking-widest text-slate-800 bg-slate-50 flex items-center gap-2">
                <FaBoxOpen className="text-emerald-500"/> Вміст накладної
              </h4>
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-black text-slate-400 tracking-widest">
                  <tr>
                    <th className="p-4 w-12 text-center">№</th>
                    <th className="p-4">Найменування</th>
                    <th className="p-4 text-center">Відправлено</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedDelivery.deal_delivery_items?.map((item, idx) => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="p-4 text-center font-bold text-slate-400">{idx + 1}</td>
                      <td className="p-4">
                        <div className="font-bold text-slate-800">{item.deal_bom?.products?.name}</div>
                        <div className="text-[10px] font-mono text-slate-400 mt-0.5">SKU: {item.deal_bom?.products?.sku || '-'}</div>
                      </td>
                      <td className="p-4 text-center">
                        <span className="inline-block px-3 py-1 bg-emerald-50 text-emerald-700 font-black rounded-lg border border-emerald-100">
                          {item.quantity} <span className="text-[10px] text-emerald-500 ml-0.5">{item.deal_bom?.products?.unit}</span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {selectedDelivery.notes && (
              <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl text-sm text-amber-900">
                <strong className="block text-[10px] uppercase tracking-widest text-amber-700 mb-1">Коментар до доставки</strong>
                {selectedDelivery.notes}
              </div>
            )}
          </div>
        )}

        {/* CREATE MODE: СТВОРЕННЯ НОВОЇ НАКЛАДНОЇ */}
        {mode === 'create' && (
          <form id="deliveryForm" onSubmit={handleSubmit} className="p-6 md:p-8 space-y-6 bg-slate-50/50 max-h-[75vh] overflow-y-auto custom-scrollbar">
            
            {deliveries.length > 0 && (
              <button type="button" onClick={() => setMode('list')} className="text-[10px] font-black uppercase text-amber-600 tracking-widest hover:text-amber-700 flex items-center gap-1 mb-2">
                ← Скасувати і повернутись до історії
              </button>
            )}
            
            {/* БЛОК ЛОГІСТИКИ ТА ПЕРЕВІЗНИКА */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <h4 className="font-black text-sm uppercase tracking-widest text-slate-800 mb-4 flex items-center gap-2">
                <FaTruckLoading className="text-slate-400"/> Дані Перевізника
              </h4>
              
              {!isCreatingCarrier ? (
                <div className="relative" ref={dropdownRef}>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Пошук перевізника з бази *</label>
                  <div className="relative">
                    <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input 
                      type="text"
                      placeholder="Введіть назву компанії або водія..."
                      value={searchCarrier}
                      onChange={(e) => {
                        setSearchCarrier(e.target.value);
                        setSelectedCarrier(null);
                        setShowCarrierDropdown(true);
                      }}
                      onFocus={() => setShowCarrierDropdown(true)}
                      className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-amber-500"
                    />
                  </div>
                  
                  {showCarrierDropdown && (
                    <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl max-h-60 overflow-y-auto custom-scrollbar">
                      {filteredCarriers.length > 0 ? (
                        filteredCarriers.map(c => (
                          <div 
                            key={c.id} 
                            onClick={() => handleCarrierSelect(c)}
                            className="p-3 hover:bg-slate-50 cursor-pointer border-b border-slate-50 last:border-0"
                          >
                            <div className="font-bold text-slate-800">{c.name}</div>
                            {c.phone && <div className="text-[10px] text-slate-500 font-mono mt-0.5">{c.phone}</div>}
                          </div>
                        ))
                      ) : (
                        <div className="p-4 text-center text-sm text-slate-500 font-medium">Перевізників не знайдено</div>
                      )}
                      <div className="sticky bottom-0 bg-slate-50 border-t border-slate-100 p-2">
                        <button 
                          type="button" 
                          onClick={() => { setIsCreatingCarrier(true); setShowCarrierDropdown(false); setSearchCarrier(''); setSelectedCarrier(null); }}
                          className="w-full py-2 bg-amber-100 text-amber-700 hover:bg-amber-200 font-bold text-xs rounded-lg transition-colors flex items-center justify-center gap-2"
                        >
                          <FaPlus size={10}/> Створити нового Перевізника
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-4">
                  <div className="flex justify-between items-center mb-2">
                    <h5 className="text-xs font-black uppercase text-amber-800 tracking-widest">Новий Перевізник</h5>
                    <button type="button" onClick={() => setIsCreatingCarrier(false)} className="text-[10px] text-amber-600 font-bold hover:underline">Скасувати</button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-amber-700 uppercase mb-1.5 ml-1">Назва компанії або ПІБ водія *</label>
                      <input autoFocus required value={newCarrierData.name} onChange={e => setNewCarrierData({...newCarrierData, name: e.target.value})} className="w-full px-4 py-2.5 bg-white border border-amber-200 rounded-lg text-sm font-bold outline-none focus:border-amber-500" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-amber-700 uppercase mb-1.5 ml-1">Тип</label>
                      <select value={newCarrierData.type} onChange={e => setNewCarrierData({...newCarrierData, type: e.target.value})} className="w-full px-4 py-2.5 bg-white border border-amber-200 rounded-lg text-sm font-bold outline-none focus:border-amber-500">
                        <option value="external_company">Логістична компанія (НП, Делівері)</option>
                        <option value="freelance_driver">Найманий водій</option>
                        <option value="internal">Власний автопарк</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-amber-700 uppercase mb-1.5 ml-1">Телефон водія / Контакт</label>
                      <input value={newCarrierData.phone} onChange={e => setNewCarrierData({...newCarrierData, phone: e.target.value})} className="w-full px-4 py-2.5 bg-white border border-amber-200 rounded-lg text-sm font-bold outline-none focus:border-amber-500" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-amber-700 uppercase mb-1.5 ml-1">Контактна особа (якщо компанія)</label>
                      <input value={newCarrierData.contact_person} onChange={e => setNewCarrierData({...newCarrierData, contact_person: e.target.value})} className="w-full px-4 py-2.5 bg-white border border-amber-200 rounded-lg text-sm font-bold outline-none focus:border-amber-500" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* БЛОК ФІНАНСІВ ТА ТТН */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-5">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Номер ТТН (необов'язково)</label>
                <div className="relative">
                  <FaHashtag className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={formData.tracking_number} onChange={e => setFormData({...formData, tracking_number: e.target.value})} placeholder="2045089..." className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold font-mono outline-none focus:border-amber-500" />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Вартість доставки (₴)</label>
                <div className="relative">
                  <FaMoneyBillWave className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="number" min="0" step="any" value={formData.shipping_cost} onChange={e => setFormData({...formData, shipping_cost: e.target.value})} placeholder="0.00" className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-amber-500" />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Курс (₴/$) та еквівалент</label>
                <div className="flex items-center gap-2">
                  <input type="number" min="0" step="any" value={formData.exchange_rate} onChange={e => setFormData({...formData, exchange_rate: e.target.value})} placeholder="Напр. 41.5" className="w-24 px-3 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-amber-500" />
                  <span className={`text-sm font-black whitespace-nowrap ${shippingCostUsd > 0 ? 'text-emerald-600' : 'text-slate-300'}`}>
                    = ${shippingCostUsd > 0 ? shippingCostUsd.toFixed(2) : '0.00'}
                  </span>
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Платник за доставку</label>
                <select value={formData.cost_payer} onChange={e => setFormData({...formData, cost_payer: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-amber-500">
                  <option value="company">Компанія (Ми)</option>
                  <option value="client">Клієнт</option>
                </select>
                {formData.cost_payer === 'company' && (
                  <p className="text-[9px] font-bold text-amber-600 mt-1 ml-1">Сума піде у Видатки компанії ($)</p>
                )}
              </div>
              
              <div className="md:col-span-3 border-t border-slate-100 my-1"></div>

              {/* РОЗБИТА ТА АВТОЗАПОВНЕНА АДРЕСА */}
              <div className="md:col-span-3">
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 flex items-center justify-between">
                  <span>Точна адреса доставки об'єкта *</span>
                </label>
                
                {/* Візуальні підказки з Site Survey */}
                {siteSurveyData && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {siteSurveyData.region && <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 text-[10px] font-bold rounded-md flex items-center gap-1 border border-emerald-100"><FaMapSigns size={10}/> {siteSurveyData.region}</span>}
                    {siteSurveyData.city && <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 text-[10px] font-bold rounded-md flex items-center gap-1 border border-emerald-100"><FaMapMarkerAlt size={10}/> {siteSurveyData.city}</span>}
                    {siteSurveyData.geolocation && (
                      <a href={siteSurveyData.geolocation} target="_blank" rel="noreferrer" className="px-2.5 py-1 bg-blue-50 text-blue-600 hover:text-blue-700 hover:bg-blue-100 transition-colors text-[10px] font-bold rounded-md flex items-center gap-1 border border-blue-100">
                         📍 Відкрити Геолокацію
                      </a>
                    )}
                  </div>
                )}
                
                {/* Саме поле вводу, куди все зліпилося, і де можна редагувати */}
                <input required value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} placeholder="Повна адреса куди має приїхати машина..." className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-amber-500" />
              </div>
            </div>

            {/* ЧЕК-ЛИСТ ВІДВАНТАЖЕННЯ */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <h4 className="font-black text-sm uppercase tracking-widest text-slate-800 mb-4 flex items-center gap-2">
                <FaBoxOpen className="text-amber-500"/> Що вантажимо цього разу?
              </h4>
              
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-black text-slate-400">
                    <tr>
                      <th className="p-3 w-12 text-center">Їде</th>
                      <th className="p-3">Обладнання</th>
                      <th className="p-3 text-center w-32 hidden md:table-cell">Доступно</th>
                      <th className="p-3 text-center w-32">Кількість зараз</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {bomItems.filter(item => {
                      const remaining = Number(item.quantity_planned) - (deliveredQuantities[item.id] || 0);
                      return remaining > 0;
                    }).length === 0 ? (
                      <tr>
                        <td colSpan="4" className="p-8 text-center text-slate-400 font-bold uppercase text-xs tracking-widest">
                          Увесь товар за специфікацією вже відправлено! 🎉
                        </td>
                      </tr>
                    ) : bomItems.map(item => {
                      const remaining = Number(item.quantity_planned) - (deliveredQuantities[item.id] || 0);
                      if (remaining <= 0) return null; 

                      const isSelected = selectedItems[item.id]?.selected || false;
                      
                      return (
                        <tr key={item.id} className={`transition-colors ${isSelected ? 'bg-white' : 'bg-slate-50 opacity-60'}`}>
                          <td className="p-3 text-center">
                            <input 
                              type="checkbox"
                              checked={isSelected}
                              onChange={e => setSelectedItems(prev => ({
                                ...prev, [item.id]: { ...prev[item.id], selected: e.target.checked }
                              }))}
                              className="w-5 h-5 text-amber-500 rounded focus:ring-amber-500 cursor-pointer"
                            />
                          </td>
                          <td className="p-3">
                            <div className="font-bold text-slate-800">{item.products?.name}</div>
                            <div className="text-[10px] font-mono text-slate-400 mt-0.5">SKU: {item.products?.sku || '-'}</div>
                          </td>
                          <td className="p-3 text-center font-black text-slate-400 text-xs hidden md:table-cell">
                            {remaining} {item.products?.unit}
                          </td>
                          <td className="p-3 text-center">
                            <input 
                              type="number" step="any" min="0.1" max={remaining}
                              disabled={!isSelected}
                              value={selectedItems[item.id]?.qty || ''}
                              onChange={e => setSelectedItems(prev => ({
                                ...prev, [item.id]: { ...prev[item.id], qty: e.target.value }
                              }))}
                              className="w-full p-2 text-center border border-slate-200 rounded-lg text-sm font-black outline-none focus:border-amber-500 disabled:bg-slate-100"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
               <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Коментар до відправки (для водія або менеджера)</label>
               <textarea rows="2" value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-amber-500 resize-none" placeholder="Додаткові інструкції..." />
            </div>

            {/* РУЧНЕ ЗАКРИТТЯ ЗАДАЧІ */}
            <div className="bg-slate-100 p-4 rounded-xl border border-slate-200 flex items-start gap-3">
              <input 
                type="checkbox" 
                id="completeTaskCheck"
                checked={completeTask}
                onChange={(e) => setCompleteTask(e.target.checked)}
                className="w-5 h-5 mt-0.5 text-emerald-500 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
              />
              <div>
                <label htmlFor="completeTaskCheck" className="text-sm font-bold text-slate-800 cursor-pointer">
                  Позначити задачу як виконану
                </label>
                <p className="text-xs text-slate-500 mt-1">
                  Активуйте, якщо логістика повністю спланована і угода готова рухатись далі.
                </p>
              </div>
            </div>

          </form>
        )}

        {/* FOOTER */}
        <div className="p-6 border-t border-slate-100 flex justify-end gap-3 bg-white shrink-0">
          <button type="button" onClick={onClose} className="px-6 py-3.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
            {mode === 'view' ? 'Закрити' : 'Скасувати'}
          </button>
          
          {mode === 'create' && (
            <button form="deliveryForm" type="submit" disabled={isSubmitting} className="px-8 py-3.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-colors shadow-lg shadow-slate-900/20 active:scale-95 disabled:opacity-50 flex items-center gap-2">
              <FaSave size={14} />
              {isSubmitting ? 'ЗБЕРЕЖЕННЯ...' : 'ЗБЕРЕГТИ НАКЛАДНУ'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}