import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthProvider';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FaTimes, FaPhoneVolume, FaMapMarkerAlt, FaHome, 
  FaBuilding, FaBullseye, FaSave, FaCity, FaMap,
  FaBriefcase, FaTag
} from 'react-icons/fa';

const REGIONS = [
  "Вінницька область", "Волинська область", "Дніпропетровська область",
  "Донецька область", "Житомирська область", "Закарпатська область",
  "Запорізька область", "Івано-Франківська область", "Київська область",
  "Кіровоградська область", "Луганська область", "Львівська область",
  "Миколаївська область", "Одеська область", "Полтавська область",
  "Рівненська область", "Сумська область", "Тернопільська область",
  "Харківська область", "Херсонська область", "Хмельницька область",
  "Черкаська область", "Чернівецька область", "Чернігівська область",
  "АР Крим", "м. Київ", "м. Севастополь"
];

const NICHES = [
  "Магазин / Торгівля",
  "СТО / Автобізнес",
  "Медичний заклад / Аптека",
  "Заклад освіти",
  "Комунальне підприємство",
  "Виробництво / Завод",
  "Сільське господарство",
  "Офісний центр",
  "Готелі / Ресторани / Кафе",
  "Інше"
];

export default function InitialContactModal({ dealId, isOpen, onClose, onSave }) {
  const { employeeProfile } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  const [formData, setFormData] = useState({
    objectType: "Приватний будинок",
    companyName: '',
    niche: '',
    region: '',
    city: '',
    geolocation: '', 
    goal: 'Економія (Власне споживання)',
    notes: '' 
  });

  useEffect(() => {
    if (isOpen && dealId) {
      fetchDealData();
    }
  }, [isOpen, dealId]);

  const fetchDealData = async () => {
    setLoading(true);
    try {
      const { data: deal } = await supabase.from('deals').select('goal, notes, company_name, niche, clients(client_type)').eq('id', dealId).single();
      const { data: survey } = await supabase.from('site_surveys').select('region, city, geolocation').eq('deal_id', dealId).single();

      if (deal) {
        setFormData(prev => ({
          ...prev,
          goal: deal.goal || 'Економія (Власне споживання)',
          objectType: deal.clients?.client_type === 'Юридична особа' ? "Комерційний об'єкт" : "Приватний будинок",
          companyName: deal.company_name || '',
          niche: deal.niche || '',
          notes: deal.notes || '',
          region: survey?.region || '',
          city: survey?.city || '',
          geolocation: survey?.geolocation || ''
        }));
      }
    } catch (error) {
      console.error("Помилка завантаження даних:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const isCommercial = formData.objectType === "Комерційний об'єкт";
      
      const dealPayload = { 
        goal: formData.goal,
        notes: formData.notes,
        company_name: isCommercial ? formData.companyName : null,
        niche: isCommercial ? formData.niche : null
      };

      const { error: dealError } = await supabase
        .from('deals')
        .update(dealPayload)
        .eq('id', dealId);

      if (dealError) throw dealError;

      const { data: existingSurvey } = await supabase.from('site_surveys').select('id').eq('deal_id', dealId).single();
      
      const surveyPayload = {
        region: formData.region,
        city: formData.city,
        geolocation: formData.geolocation,
        system_type: formData.goal.includes('Резерв') ? 'Гібридна' : 'Мережева'
      };

      if (existingSurvey) {
        await supabase.from('site_surveys').update(surveyPayload).eq('id', existingSurvey.id);
      } else {
        await supabase.from('site_surveys').insert([{ deal_id: dealId, ...surveyPayload }]);
      }

      await supabase.from('deal_activity_log').insert([{
        deal_id: dealId,
        user_id: employeeProfile?.id,
        action: `Проведено кваліфікацію клієнта. ${formData.region}, ${formData.city}.`
      }]);

      if (onSave) onSave(); 
    } catch (error) {
      alert("Помилка збереження: " + error.message);
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4">
        <motion.div 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          exit={{ opacity: 0 }} 
          className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
          onClick={onClose}
        />
        
        <motion.div 
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          className="relative bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]"
        >
          <div className="p-5 md:p-6 border-b border-slate-100 flex justify-between items-center bg-slate-900 text-white shrink-0">
            <div className="flex items-center gap-3 md:gap-4">
               <div className="w-8 h-8 md:w-10 md:h-10 bg-amber-500 text-slate-900 rounded-full flex items-center justify-center shadow-lg shrink-0">
                 <FaPhoneVolume size={16} />
               </div>
               <div>
                 <h3 className="text-base md:text-lg font-black uppercase tracking-tight">Перший контакт</h3>
                 <p className="text-[9px] md:text-[10px] font-bold text-amber-500 uppercase tracking-widest mt-0.5">Базова кваліфікація ліда</p>
               </div>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-white p-2 rounded-full transition-colors bg-white/10 hover:bg-white/20 shrink-0">
              <FaTimes size={16} />
            </button>
          </div>

          {loading ? (
            <div className="p-10 md:p-12 text-center text-slate-400 font-bold uppercase tracking-widest text-[10px] md:text-xs animate-pulse">
              Підготовка форми...
            </div>
          ) : (
            <form onSubmit={handleSubmit} id="initialContactForm" className="p-5 md:p-8 overflow-y-auto custom-scrollbar flex flex-col gap-5 md:gap-6 bg-slate-50/50">
              
              <div>
                <label className="block text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1 flex items-center gap-1.5">
                  <FaHome /> Тип об'єкта
                </label>
                <div className="flex flex-col sm:flex-row gap-2.5 md:gap-3">
                  {["Приватний будинок", "Комерційний об'єкт"].map(type => (
                    <label key={type} className={`flex-1 flex items-center justify-center gap-2 p-3 border rounded-xl cursor-pointer transition-all text-xs md:text-sm font-bold ${formData.objectType === type ? 'border-amber-500 bg-white text-amber-800 shadow-sm ring-2 ring-amber-500/20' : 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>
                      <input type="radio" name="objectType" value={type} checked={formData.objectType === type} onChange={handleChange} className="hidden" />
                      {type === "Комерційний об'єкт" ? <FaBuilding /> : <FaHome />}
                      {type}
                    </label>
                  ))}
                </div>
              </div>

              {/* Усунено баг з AnimatePresence, тепер це звичайний рендер */}
              {formData.objectType === "Комерційний об'єкт" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-5 animate-fadeIn">
                  <div>
                    <label className="block text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1 flex items-center gap-1.5">
                      <FaBriefcase /> Назва компанії
                    </label>
                    <input 
                      type="text" name="companyName" required
                      value={formData.companyName} onChange={handleChange}
                      className="w-full px-3.5 py-3 md:px-4 md:py-3.5 bg-white border border-slate-200 rounded-xl text-xs md:text-sm font-bold text-slate-900 outline-none focus:border-amber-500 transition-all shadow-sm"
                      placeholder="ТОВ НоваБуд, Магазин АТБ..."
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1 flex items-center gap-1.5">
                      <FaTag /> Сфера діяльності
                    </label>
                    <select 
                      name="niche" required
                      value={formData.niche} onChange={handleChange}
                      className="w-full px-3.5 py-3 md:px-4 md:py-3.5 bg-white border border-slate-200 rounded-xl text-xs md:text-sm font-bold text-slate-900 outline-none focus:border-amber-500 transition-all shadow-sm cursor-pointer"
                    >
                      <option value="">Оберіть нішу...</option>
                      {NICHES.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-5">
                <div>
                  <label className="block text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1 flex items-center gap-1.5">
                    <FaMapMarkerAlt /> Область
                  </label>
                  <select 
                    name="region" required
                    value={formData.region} onChange={handleChange}
                    className="w-full px-3.5 py-3 md:px-4 md:py-3.5 bg-white border border-slate-200 rounded-xl text-xs md:text-sm font-bold text-slate-900 outline-none focus:border-amber-500 transition-all shadow-sm cursor-pointer"
                  >
                    <option value="">Оберіть область...</option>
                    {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1 flex items-center gap-1.5">
                    <FaCity /> Населений пункт
                  </label>
                  <input 
                    type="text" name="city" required
                    value={formData.city} onChange={handleChange}
                    className="w-full px-3.5 py-3 md:px-4 md:py-3.5 bg-white border border-slate-200 rounded-xl text-xs md:text-sm font-bold text-slate-900 outline-none focus:border-amber-500 transition-all shadow-sm"
                    placeholder="Напр: м. Київ, с. Вишневе"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-5">
                <div>
                  <label className="block text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1 flex items-center gap-1.5">
                    <FaMap /> Геолокація (GPS)
                  </label>
                  <input 
                    type="text" name="geolocation"
                    value={formData.geolocation} onChange={handleChange}
                    className="w-full px-3.5 py-3 md:px-4 md:py-3.5 bg-white border border-slate-200 rounded-xl text-xs md:text-sm font-bold text-slate-900 outline-none focus:border-amber-500 transition-all shadow-sm"
                    placeholder="Координати або посилання..."
                  />
                </div>

                <div>
                  <label className="block text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1 flex items-center gap-1.5">
                    <FaBullseye /> Ціль клієнта
                  </label>
                  <select 
                    name="goal" required
                    value={formData.goal} onChange={handleChange}
                    className="w-full px-3.5 py-3 md:px-4 md:py-3.5 bg-white border border-slate-200 rounded-xl text-xs md:text-sm font-bold text-slate-900 outline-none focus:border-amber-500 cursor-pointer shadow-sm"
                  >
                    <option value="Економія (Власне споживання)">Економія (Власне споживання)</option>
                    <option value="Резерв (Безперебійне живлення)">Резерв (Безперебійне живлення)</option>
                    <option value="Продаж (Зелений тариф)">Продаж (Зелений тариф)</option>
                    <option value="Економія + Продаж">Економія + Продаж</option>
                    <option value="Резерв + Продаж">Резерв + Продаж</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">
                  Специфіка об'єкту / Особливі деталі
                </label>
                <textarea 
                  name="notes" rows="3"
                  value={formData.notes} onChange={handleChange}
                  className="w-full px-3.5 py-3 md:px-4 md:py-3.5 bg-white border border-slate-200 rounded-xl text-xs md:text-sm font-medium text-slate-700 outline-none focus:border-amber-500 transition-all resize-none shadow-sm"
                  placeholder="Опишіть важливі деталі, наприклад: три фази, плоский дах, потрібні потужні АКБ..."
                ></textarea>
              </div>

            </form>
          )}

          <div className="p-4 md:p-6 border-t border-slate-100 flex flex-col-reverse sm:flex-row justify-end gap-2.5 md:gap-3 bg-white shrink-0 shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.05)]">
            <button 
              type="button" onClick={onClose}
              className="w-full sm:w-auto px-6 py-3 md:py-3.5 text-[10px] md:text-xs font-bold uppercase tracking-widest text-slate-500 hover:bg-slate-100 bg-slate-50 rounded-xl transition-colors"
            >
              Скасувати
            </button>
            <button 
              form="initialContactForm"
              type="submit"
              disabled={isSubmitting || loading}
              className="w-full sm:w-auto px-6 md:px-8 py-3 md:py-3.5 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl text-[10px] md:text-xs font-black uppercase tracking-widest transition-colors flex items-center justify-center shadow-lg shadow-emerald-500/30 active:scale-95 disabled:opacity-50 gap-2"
            >
              {isSubmitting ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : <><FaSave size={14}/> Зберегти та закрити задачу</>}
            </button>
          </div>

        </motion.div>
      </div>
    </AnimatePresence>
  );
}