import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { FaTimes, FaSave, FaBoxOpen, FaLayerGroup, FaDollarSign, FaBolt, FaChevronDown, FaSearch, FaCheck } from 'react-icons/fa';

const UNIT_OPTIONS = [
  { value: 'шт', label: 'Штуки (шт)' },
  { value: 'м', label: 'Метри (м)' },
  { value: 'компл', label: 'Комплект' },
  { value: 'уп', label: 'Упаковка' },
  { value: 'рол', label: 'Рулони (рол)' },
  { value: 'кг', label: 'Кілограми (кг)' },
  { value: 'послуга', label: 'Послуга' },
];

export default function ProductModal({ isOpen, onClose, productToEdit, onSaveSuccess }) {
  const [categories, setCategories] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Стейт для розумного пошуку категорій
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState('');
  const categoryDropdownRef = useRef(null);

  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    category_id: '',
    product_type: '', // Додано для синхронізації з чек-листами
    unit: 'шт',
    currency: 'USD', // Додано: базова валюта товару
    cost_price: 0,
    sale_price: 0,
    power_kw: '',
    capacity_kwh: '',
    voltage_type: '',
    is_tracked: true
  });

  async function fetchCategories() {
    const { data } = await supabase.from('product_categories').select('*').order('name');
    if (data) {
      setCategories(data);
    }
  }

  useEffect(() => {
    if (isOpen) {
      fetchCategories();
    }
  }, [isOpen]);

  // Заповнення форми при редагуванні або створенні
  useEffect(() => {
    if (isOpen && categories.length > 0) {
      if (productToEdit) {
        setFormData({
          name: productToEdit.name || '',
          sku: productToEdit.sku || '',
          category_id: productToEdit.category_id || '',
          product_type: productToEdit.product_type || '',
          unit: productToEdit.unit || 'шт',
          currency: productToEdit.currency || 'USD', // Підтягуємо існуючу валюту
          cost_price: productToEdit.cost_price || 0,
          sale_price: productToEdit.sale_price || 0,
          power_kw: productToEdit.power_kw || '',
          capacity_kwh: productToEdit.capacity_kwh || '',
          voltage_type: productToEdit.voltage_type || '',
          is_tracked: productToEdit.is_tracked ?? true
        });
        
        const cat = categories.find(c => c.id === productToEdit.category_id);
        if (cat) setCategorySearch(cat.name);
      } else {
        setFormData({
          name: '', sku: '', category_id: '', product_type: '', unit: 'шт', 
          currency: 'USD', cost_price: 0, sale_price: 0, power_kw: '', capacity_kwh: '', voltage_type: '', is_tracked: true
        });
        setCategorySearch('');
      }
    }
  }, [isOpen, productToEdit, categories]);

  // Закриття дропдауну при кліку поза ним
  useEffect(() => {
    function handleClickOutside(event) {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target)) {
        setIsCategoryDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    const payload = {
      name: formData.name,
      sku: formData.sku || null,
      category_id: formData.category_id || null,
      product_type: formData.product_type || null,
      unit: formData.unit,
      currency: formData.currency, // Зберігаємо валюту в БД
      cost_price: parseFloat(formData.cost_price) || 0,
      sale_price: parseFloat(formData.sale_price) || 0,
      power_kw: formData.power_kw ? parseFloat(formData.power_kw) : null,
      capacity_kwh: formData.capacity_kwh ? parseFloat(formData.capacity_kwh) : null,
      voltage_type: formData.voltage_type || null,
      is_tracked: formData.is_tracked
    };

    let error;
    if (productToEdit?.id) {
      const { error: updateError } = await supabase.from('products').update(payload).eq('id', productToEdit.id);
      error = updateError;
    } else {
      const { error: insertError } = await supabase.from('products').insert([payload]);
      error = insertError;
    }

    setIsSubmitting(false);

    if (error) {
      alert('Помилка збереження: ' + error.message);
    } else {
      onSaveSuccess();
      onClose();
    }
  };

  if (!isOpen) return null;

  // Динамічне визначення полів на основі системного коду категорії
  const selectedCategory = categories.find(c => c.id === formData.category_id);
  const categoryCode = selectedCategory?.code || '';
  
  // Надійні перевірки за системним кодом замість текстового пошуку назви
  const isPowerRequired = categoryCode.startsWith('inverter') || categoryCode === 'panel';
  const isCapacityRequired = categoryCode.startsWith('battery');

  const filteredCategories = categories.filter(c =>
    c.name.toLowerCase().includes(categorySearch.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm sm:p-4 animate-fade-in">
      
      {/* ОСНОВНИЙ КОНТЕЙНЕР МОДАЛКИ */}
      <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-3xl flex flex-col h-[90vh] sm:h-auto sm:max-h-[90vh] overflow-hidden">
        
        {/* Хедер модалки */}
        <div className="p-5 md:p-6 border-b border-slate-100 flex justify-between items-center bg-slate-900 text-white shrink-0 sm:rounded-t-3xl">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500 text-slate-900 rounded-lg"><FaBoxOpen size={18}/></div>
            <div>
              <h3 className="text-base md:text-lg font-black uppercase tracking-tight">
                {productToEdit ? 'Редагування товару' : 'Новий товар'}
              </h3>
              <p className="text-[9px] md:text-[10px] text-amber-500 font-bold uppercase mt-0.5 tracking-widest">Каталог обладнання</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 bg-white/10 text-white hover:bg-white/20 rounded-full transition-colors">
            <FaTimes size={16} />
          </button>
        </div>

        {/* Тіло форми */}
        <form id="productForm" onSubmit={handleSubmit} className="p-4 md:p-6 space-y-5 bg-slate-50/50 flex-1 overflow-y-auto custom-scrollbar">
          
          {/* Блок 1: Основна інформація */}
          <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center gap-2 mb-2 text-slate-800"><FaLayerGroup className="text-amber-500"/><h4 className="font-black text-xs md:text-sm uppercase tracking-widest">Основне</h4></div>
            
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Назва товару *</label>
              <input type="text" required placeholder="Напр: Інвертор Deye 12kW" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-amber-500 transition-colors shadow-inner"/>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1.6fr)_minmax(180px,0.8fr)] gap-4">
                <div className="relative" ref={categoryDropdownRef}>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Категорія</label>
                  <div 
                    className="relative w-full cursor-text"
                    onClick={() => setIsCategoryDropdownOpen(true)}
                  >
                    <input 
                      type="text" 
                      placeholder="Оберіть або знайдіть категорію..." 
                      value={categorySearch}
                      onChange={(e) => {
                        setCategorySearch(e.target.value);
                        setIsCategoryDropdownOpen(true);
                        // Очищаємо ID та product_type, якщо поле порожнє
                        if (e.target.value === '') setFormData({...formData, category_id: '', product_type: ''});
                      }}
                      className="w-full pl-4 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-amber-500 transition-colors shadow-inner"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                      {isCategoryDropdownOpen ? <FaSearch size={12}/> : <FaChevronDown size={12}/>}
                    </div>
                  </div>

                  {isCategoryDropdownOpen && (
                    <div className="absolute z-[200] top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-60 overflow-y-auto custom-scrollbar">
                      {filteredCategories.length > 0 ? (
                        filteredCategories.map(c => (
                          <div 
                            key={c.id} 
                            onClick={() => {
                              setFormData({
                                ...formData, 
                                category_id: c.id,
                                product_type: c.code // Одразу зберігаємо системний код
                              });
                              setCategorySearch(c.name);
                              setIsCategoryDropdownOpen(false);
                            }}
                            className="px-4 py-3 text-xs md:text-sm font-bold text-slate-700 hover:bg-amber-50 hover:text-amber-600 cursor-pointer transition-colors border-b border-slate-50 last:border-0 flex items-center justify-between gap-3"
                          >
                            <span className="truncate">{c.name}</span>
                            {formData.category_id === c.id && <FaCheck className="text-amber-500 shrink-0" size={12} />}
                          </div>
                        ))
                      ) : (
                        <div className="px-4 py-4 text-xs font-bold text-slate-400 text-center">
                          Нічого не знайдено
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Од. виміру</label>
                  <select value={formData.unit} onChange={e => setFormData({...formData, unit: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-amber-500 cursor-pointer transition-colors appearance-none shadow-inner">
                    {UNIT_OPTIONS.map(unit => (
                      <option key={unit.value} value={unit.value}>{unit.label}</option>
                    ))}
                  </select>
                </div>
            </div>

            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Артикул (SKU)</label>
              <input type="text" placeholder="Необов'язково" value={formData.sku} onChange={e => setFormData({...formData, sku: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-amber-500 transition-colors shadow-inner"/>
            </div>
          </div>

          {/* Блок 2: Технічні параметри */}
          {(isPowerRequired || isCapacityRequired) && (
            <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4 animate-fade-in">
              <div className="flex items-center gap-2 mb-2 text-slate-800"><FaBolt className="text-amber-500"/><h4 className="font-black text-xs md:text-sm uppercase tracking-widest">Характеристики</h4></div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {isPowerRequired && (
                  <div className="animate-fade-in">
                    <label className="block text-[10px] font-black text-amber-600 uppercase mb-1.5 ml-1">Потужність (кВт) *</label>
                    <input type="number" step="0.1" required value={formData.power_kw} onChange={e => setFormData({...formData, power_kw: e.target.value})} className="w-full px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm font-bold outline-none focus:border-amber-500 transition-colors shadow-inner"/>
                  </div>
                )}
                {isCapacityRequired && (
                  <div className="animate-fade-in">
                    <label className="block text-[10px] font-black text-emerald-600 uppercase mb-1.5 ml-1">Ємність (кВт*год) *</label>
                    <input type="number" step="0.1" required value={formData.capacity_kwh} onChange={e => setFormData({...formData, capacity_kwh: e.target.value})} className="w-full px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm font-bold outline-none focus:border-emerald-500 transition-colors shadow-inner"/>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Блок 3: Фінанси */}
          <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center gap-2 mb-2 text-slate-800"><FaDollarSign className="text-amber-500"/><h4 className="font-black text-xs md:text-sm uppercase tracking-widest">Фінанси та облік</h4></div>
            
            {/* Перемикач валюти */}
            <div className="mb-2">
               <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Базова валюта товару</label>
               <div className="flex bg-slate-50 p-1.5 rounded-xl border border-slate-200 w-fit shadow-inner">
                 <button 
                   type="button" 
                   onClick={() => setFormData({...formData, currency: 'USD'})}
                   className={`px-6 py-2 text-xs font-black uppercase tracking-widest rounded-lg transition-all ${formData.currency === 'USD' ? 'bg-white text-emerald-600 shadow-sm border border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}
                 >
                   Долар (USD)
                 </button>
                 <button 
                   type="button" 
                   onClick={() => setFormData({...formData, currency: 'UAH'})}
                   className={`px-6 py-2 text-xs font-black uppercase tracking-widest rounded-lg transition-all ${formData.currency === 'UAH' ? 'bg-white text-amber-600 shadow-sm border border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}
                 >
                   Гривня (UAH)
                 </button>
               </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">
                  Собівартість ({formData.currency === 'USD' ? '$' : '₴'})
                </label>
                <input type="number" step="any" value={formData.cost_price} onChange={e => setFormData({...formData, cost_price: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-amber-500 transition-colors shadow-inner"/>
                <p className="text-[9px] text-slate-400 mt-1.5 ml-1 font-medium leading-tight">Історія зміни ціни зберігається автоматично</p>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">
                  Ціна продажу ({formData.currency === 'USD' ? '$' : '₴'})
                </label>
                <input type="number" step="any" value={formData.sale_price} onChange={e => setFormData({...formData, sale_price: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-amber-500 transition-colors shadow-inner"/>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 mt-2">
              <label className="flex items-center gap-3 cursor-pointer p-3 md:p-4 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors">
                <input type="checkbox" checked={formData.is_tracked} onChange={e => setFormData({...formData, is_tracked: e.target.checked})} className="w-4 h-4 md:w-5 md:h-5 text-amber-500 rounded focus:ring-amber-500"/>
                <span className="text-[10px] md:text-xs font-black uppercase text-slate-700 tracking-widest">Вести складський облік (Залишки)</span>
              </label>
            </div>
          </div>
          
          <div className="h-4"></div>
        </form>

        {/* Футер */}
        <div className="p-4 md:p-5 border-t border-slate-100 flex gap-3 bg-white shrink-0 sm:rounded-b-3xl">
          <button type="button" onClick={onClose} className="w-1/3 py-3.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors uppercase tracking-widest">Скасувати</button>
          <button form="productForm" type="submit" disabled={isSubmitting} className="w-2/3 py-3.5 bg-amber-500 hover:bg-amber-400 text-slate-900 text-xs font-black uppercase tracking-widest rounded-xl transition-colors disabled:opacity-50 shadow-lg shadow-amber-500/20 active:scale-95 flex items-center justify-center gap-2">
            <FaSave size={14} />
            {isSubmitting ? 'ЗБЕРЕЖЕННЯ...' : 'ЗБЕРЕГТИ ТОВАР'}
          </button>
        </div>
      </div>
    </div>
  );
}