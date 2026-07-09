import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { 
  FaPlus, FaSearch, FaTimes, FaBuilding, FaUser, 
  FaFolderOpen, FaArrowRight, FaSolarPanel, FaPhoneAlt, FaEdit, FaSave
} from 'react-icons/fa';

export default function ClientsPage() {
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Стейт для модалки СТВОРЕННЯ
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    client_type: 'Фізична особа', 
    name: '',
    company_name: '',
    business_sphere: '', // НОВЕ ПОЛЕ: Сфера діяльності
    phone: '',
    lead_source: '',
    notes: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Стейт для модалки ПЕРЕГЛЯДУ та РЕДАГУВАННЯ КЛІЄНТА
  const [selectedClient, setSelectedClient] = useState(null);
  const [clientDeals, setClientDeals] = useState([]);
  const [loadingDeals, setLoadingDeals] = useState(false);
  
  // Стейти для режиму редагування
  const [isEditingClient, setIsEditingClient] = useState(false);
  const [editClientForm, setEditClientForm] = useState(null);

  const fetchClients = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('clients')
        .select(`*, deals(id)`) 
        .order('created_at', { ascending: false });

      if (error) throw error;
      setClients(data || []);
    } catch (error) {
      console.error('Помилка завантаження клієнтів:', error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // --- СТВОРЕННЯ КЛІЄНТА ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    const payload = { ...formData };
    if (payload.client_type === 'Фізична особа') {
        payload.company_name = null;
        payload.business_sphere = null;
    }

    try {
      const { data: newClient, error: clientError } = await supabase.from('clients').insert([payload]).select().single();
      if (clientError) throw clientError;

      const { data: stages } = await supabase.from('deal_stages').select('*').order('position').limit(1);
      const firstStage = stages?.[0];

      const { error: dealError } = await supabase.from('deals').insert([{
        client_id: newClient.id, stage_id: firstStage?.id, stage: firstStage?.name || 'Нова Угода',
        goal: 'Не вказано', status: 'В роботі', final_budget: 0
      }]);
      if (dealError) throw dealError;
      
      setIsModalOpen(false);
      setFormData({ client_type: 'Фізична особа', name: '', company_name: '', business_sphere: '', phone: '', lead_source: '', notes: '' });
      fetchClients(); 
    } catch (error) {
      alert('Помилка при створенні клієнта або угоди: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- ВІДКРИТТЯ ДЕТАЛЕЙ КЛІЄНТА ---
  const handleOpenClientDetails = async (client) => {
    setSelectedClient(client);
    setIsEditingClient(false); // Завжди відкриваємо в режимі перегляду
    setLoadingDeals(true);
    
    const { data } = await supabase.from('deals').select('*').eq('client_id', client.id).order('created_at', { ascending: false });
    setClientDeals(data || []);
    setLoadingDeals(false);
  };

  // --- ІНІЦІАЛІЗАЦІЯ РЕДАГУВАННЯ ---
  const handleEditInit = () => {
    setEditClientForm({
      name: selectedClient.name || '',
      company_name: selectedClient.company_name || '',
      business_sphere: selectedClient.business_sphere || '',
      phone: selectedClient.phone || '',
      lead_source: selectedClient.lead_source || '',
      notes: selectedClient.notes || ''
    });
    setIsEditingClient(true);
  };

  // --- ЗБЕРЕЖЕННЯ ОНОВЛЕНОГО КЛІЄНТА ---
  const handleSaveClientEdit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    const payload = { ...editClientForm };
    if (selectedClient.client_type === 'Фізична особа') {
        payload.company_name = null;
        payload.business_sphere = null;
    }

    const { error } = await supabase.from('clients').update(payload).eq('id', selectedClient.id);

    if (!error) {
      const updatedClient = { ...selectedClient, ...payload };
      setSelectedClient(updatedClient); // Оновлюємо модалку
      setClients(clients.map(c => c.id === updatedClient.id ? updatedClient : c)); // Оновлюємо таблицю
      setIsEditingClient(false);
    } else {
      alert('Помилка оновлення: ' + error.message);
    }
    setIsSubmitting(false);
  };

  const filteredClients = clients.filter(c => {
    if (!c) return false;
    const search = searchTerm.toLowerCase();
    return (
      (c.name && c.name.toLowerCase().includes(search)) || 
      (c.phone && c.phone.includes(search)) || 
      (c.company_name && c.company_name.toLowerCase().includes(search)) ||
      (c.custom_id && c.custom_id.toString().includes(search))
    );
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8 space-y-6 md:space-y-8 bg-slate-50 min-h-full">
      
      {/* ПАНЕЛЬ КЕРУВАННЯ */}
      <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-200 flex flex-col md:flex-row items-center gap-6 shadow-sm shrink-0">
        <div className="flex-1 w-full">
           <h1 className="text-xl md:text-2xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-3">
             <div className="p-2.5 bg-amber-500 text-slate-900 rounded-xl shadow-lg shadow-amber-500/20"><FaUser size={20}/></div>
             База Клієнтів
           </h1>
        </div>

        <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
          <div className="relative w-full md:w-80">
            <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Пошук клієнта або ID..."
              className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <button
            onClick={() => setIsModalOpen(true)}
            className="w-full md:w-auto bg-slate-900 hover:bg-slate-800 text-amber-500 px-8 py-3.5 rounded-xl font-black text-xs transition-all flex items-center justify-center gap-2 uppercase tracking-widest shadow-lg shadow-slate-900/10 active:scale-95"
          >
            <FaPlus size={14} /> НОВИЙ КЛІЄНТ
          </button>
        </div>
      </div>

      {/* ТАБЛИЦЯ КЛІЄНТІВ */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100 text-slate-500 text-[10px] font-black uppercase tracking-widest">
                <th className="p-5">ID</th>
                <th className="p-5">Клієнт / Компанія</th>
                <th className="p-5">Контакти</th>
                <th className="p-5">Джерело</th>
                <th className="p-5 text-center">Угод</th>
                <th className="p-5 text-right">Дата</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan="6" className="text-center p-12 text-slate-400 font-bold uppercase tracking-widest animate-pulse">Завантаження бази...</td></tr>
              ) : filteredClients.length === 0 ? (
                <tr><td colSpan="6" className="text-center p-12 text-slate-400 font-bold">Клієнтів не знайдено</td></tr>
              ) : (
                filteredClients.map((client) => (
                  <tr key={client.id} onClick={() => handleOpenClientDetails(client)} className="hover:bg-amber-50/30 transition-colors cursor-pointer group">
                    <td className="p-5 text-xs font-mono font-bold text-slate-400">#{client.custom_id}</td>
                    <td className="p-5">
                      <div className="flex items-center gap-4">
                        <div className={`flex items-center justify-center w-10 h-10 rounded-xl shrink-0 transition-colors ${client.client_type === 'Юридична особа' ? 'bg-amber-100 text-amber-700 group-hover:bg-amber-500 group-hover:text-white' : 'bg-slate-100 text-slate-600 group-hover:bg-slate-900 group-hover:text-white'}`}>
                          {client.client_type === 'Юридична особа' ? <FaBuilding size={16}/> : <FaUser size={16}/>}
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 text-sm group-hover:text-amber-600 transition-colors">{client.name}</div>
                          {client.company_name && <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wide mt-0.5 flex items-center gap-1">{client.company_name} {client.business_sphere && <span className="lowercase text-amber-600 font-medium bg-amber-50 px-1.5 rounded">({client.business_sphere})</span>}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="p-5"><div className="text-sm font-bold text-slate-700 flex items-center gap-2"><FaPhoneAlt className="text-slate-300" size={10}/> {client.phone || '—'}</div></td>
                    <td className="p-5"><span className="px-3 py-1.5 bg-slate-100 text-slate-500 rounded-lg text-[9px] font-black uppercase tracking-widest border border-slate-200">{client.lead_source || 'Не вказано'}</span></td>
                    <td className="p-5 text-center"><div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-50 border border-slate-200 text-xs font-black text-slate-700">{client.deals?.length || 0}</div></td>
                    <td className="p-5 text-right text-xs font-bold text-slate-400">{new Date(client.created_at).toLocaleDateString('uk-UA')}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* МОДАЛКА ПЕРЕГЛЯДУ ТА РЕДАГУВАННЯ КЛІЄНТА */}
      {selectedClient && (
        <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center bg-slate-900/60 backdrop-blur-sm md:p-4">
          <div className="bg-white rounded-t-3xl md:rounded-3xl shadow-2xl w-full max-w-3xl h-[90vh] md:h-auto md:max-h-[90vh] flex flex-col overflow-hidden animate-slide-up md:animate-fade-in">
            
            <div className="p-5 md:p-8 border-b border-slate-100 flex justify-between items-start bg-slate-50 shrink-0">
              <div className="flex items-center gap-4">
                 <div className={`p-4 rounded-2xl hidden sm:flex ${selectedClient.client_type === 'Юридична особа' ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-700'}`}>
                    {selectedClient.client_type === 'Юридична особа' ? <FaBuilding size={24}/> : <FaUser size={24}/>}
                 </div>
                 <div>
                    <h3 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">{selectedClient.name}</h3>
                    <p className="text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">
                      {selectedClient.company_name || selectedClient.client_type} 
                      {selectedClient.business_sphere && ` • ${selectedClient.business_sphere}`} 
                      {selectedClient.phone && ` • ${selectedClient.phone}`}
                    </p>
                 </div>
              </div>
              <button onClick={() => setSelectedClient(null)} className="p-2 text-slate-400 hover:bg-slate-200 rounded-full transition-colors"><FaTimes size={20}/></button>
            </div>

            <div className="p-5 md:p-8 flex-1 overflow-y-auto custom-scrollbar bg-white">
               
               <div className="flex justify-between items-center mb-6">
                 <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest border-l-4 border-amber-500 pl-3">
                   {isEditingClient ? 'Редагування профілю' : 'Угоди та Інформація'}
                 </h4>
                 {!isEditingClient ? (
                   <button onClick={handleEditInit} className="text-[10px] font-bold text-amber-600 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-lg uppercase transition-colors flex items-center gap-1.5">
                     <FaEdit size={12}/> Змінити дані
                   </button>
                 ) : (
                   <button onClick={() => setIsEditingClient(false)} className="text-[10px] font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg uppercase transition-colors flex items-center gap-1.5">
                     <FaTimes size={12}/> Скасувати
                   </button>
                 )}
               </div>

               {isEditingClient ? (
                 // --- ФОРМА РЕДАГУВАННЯ ---
                 <form id="editClientForm" onSubmit={handleSaveClientEdit} className="space-y-5 animate-fade-in">
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">
                        {selectedClient.client_type === 'Юридична особа' ? 'Контактна особа' : 'ПІБ клієнта'} *
                      </label>
                      <input type="text" required value={editClientForm.name} onChange={e => setEditClientForm({...editClientForm, name: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-amber-500 outline-none text-sm font-bold" />
                    </div>

                    {selectedClient.client_type === 'Юридична особа' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        <div>
                          <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Назва компанії *</label>
                          <input type="text" required value={editClientForm.company_name} onChange={e => setEditClientForm({...editClientForm, company_name: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-amber-500 outline-none text-sm font-bold" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Сфера діяльності</label>
                          <select value={editClientForm.business_sphere} onChange={e => setEditClientForm({...editClientForm, business_sphere: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-amber-500 outline-none text-sm font-bold">
                            <option value="">Не вказано</option>
                            <option value="Магазин / Торгівля">Магазин / Торгівля</option>
                            <option value="СТО / Автобізнес">СТО / Автобізнес</option>
                            <option value="Медичний заклад">Медичний заклад / Аптека</option>
                            <option value="Заклад освіти">Заклад освіти</option>
                            <option value="Комунальне підприємство">Комунальне підприємство</option>
                            <option value="Виробництво / Завод">Виробництво / Завод</option>
                            <option value="Сільське господарство">Сільське господарство</option>
                            <option value="Офісний центр">Офісний центр</option>
                            <option value="HoReCa">Готелі / Ресторани / Кафе</option>
                            <option value="Інше">Інше</option>
                          </select>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Телефон</label>
                        <input type="tel" value={editClientForm.phone} onChange={e => setEditClientForm({...editClientForm, phone: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-amber-500 outline-none text-sm font-bold" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Джерело</label>
                        <select value={editClientForm.lead_source} onChange={e => setEditClientForm({...editClientForm, lead_source: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-amber-500 outline-none text-sm font-bold">
                          <option value="">Оберіть...</option>
                          <option value="TikTok">TikTok</option>
                          <option value="Instagram">Instagram</option>
                          <option value="Google">Google / Сайт</option>
                          <option value="Рекомендація">Рекомендація</option>
                          <option value="Холодний дзвінок">Холодний дзвінок</option>
                          <option value="Інше">Інше</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Примітки</label>
                      <textarea value={editClientForm.notes} onChange={e => setEditClientForm({...editClientForm, notes: e.target.value})} rows="3" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-amber-500 outline-none text-sm font-medium resize-none" placeholder="Додаткова інформація..."></textarea>
                    </div>
                    
                    <button type="submit" disabled={isSubmitting || !editClientForm.name} className="w-full py-3.5 bg-amber-500 hover:bg-amber-400 text-slate-900 rounded-xl font-black text-xs uppercase tracking-widest transition-colors shadow-lg shadow-amber-500/20">
                      {isSubmitting ? 'Збереження...' : 'Зберегти зміни'}
                    </button>
                 </form>
               ) : (
                 // --- РЕЖИМ ПЕРЕГЛЯДУ (СПИСОК УГОД) ---
                 <div className="space-y-4 animate-fade-in">
                   {loadingDeals ? (
                     <div className="p-8 text-center text-slate-400 font-bold animate-pulse uppercase">Завантаження угод...</div>
                   ) : clientDeals.length > 0 ? (
                     clientDeals.map(deal => (
                       <div key={deal.id} onClick={() => navigate(`/deals/${deal.id}`)} className="group flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl border border-slate-200 hover:border-amber-500 hover:shadow-md cursor-pointer transition-all bg-white">
                          <div>
                            <div className="flex items-center gap-3 mb-2">
                               <span className="text-[10px] font-black font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded">№ {deal.custom_id}</span>
                               <span className="text-[10px] font-black uppercase text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">{deal.stage}</span>
                            </div>
                            <h4 className="text-sm font-black text-slate-800 leading-tight mb-1">{deal.title || 'Угода без назви'}</h4>
                            <p className="text-[10px] font-bold text-slate-500 uppercase">Вартість: {Number(deal.final_budget).toLocaleString()} $ • Ціль: {deal.goal}</p>
                          </div>
                          <div className="flex items-center justify-between md:justify-end w-full md:w-auto gap-4">
                            <span className="text-[10px] font-bold text-slate-400">{new Date(deal.created_at).toLocaleDateString()}</span>
                            <button className="w-8 h-8 rounded-full bg-slate-50 text-slate-400 group-hover:bg-amber-500 group-hover:text-white flex items-center justify-center transition-colors"><FaArrowRight size={12}/></button>
                          </div>
                       </div>
                     ))
                   ) : (
                     <div className="p-10 text-center border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 font-medium text-sm bg-slate-50">
                       У цього клієнта ще немає створених угод.
                     </div>
                   )}
                   
                   {selectedClient.notes && (
                     <div className="mt-8">
                       <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Примітки по клієнту</h4>
                       <div className="p-4 bg-amber-50/50 border border-amber-100 rounded-xl text-sm font-medium text-slate-700">
                         {selectedClient.notes}
                       </div>
                     </div>
                   )}
                 </div>
               )}
            </div>
          </div>
        </div>
      )}

      {/* МОДАЛКА СТВОРЕННЯ НОВОГО КЛІЄНТА */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-end md:items-center justify-center bg-slate-900/60 backdrop-blur-sm md:p-4">
          <div className="bg-white rounded-t-3xl md:rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col h-[90vh] md:h-auto md:max-h-[90vh] animate-slide-up md:animate-fade-in">
            
            <div className="p-5 md:p-8 border-b border-slate-100 flex justify-between items-center bg-slate-900 text-white shrink-0 rounded-t-3xl md:rounded-t-none">
              <div className="flex items-center gap-3">
                 <div className="p-2 bg-amber-500 text-slate-900 rounded-lg hidden sm:block"><FaUser size={20}/></div>
                 <div>
                    <h3 className="text-base md:text-lg font-black uppercase tracking-tight">Новий клієнт</h3>
                    <p className="text-[9px] md:text-[10px] text-amber-500 font-bold uppercase mt-0.5 tracking-widest">+ Автоматична угода</p>
                 </div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-2 bg-white/10 text-white hover:bg-white/20 rounded-full transition-colors"><FaTimes size={16} /></button>
            </div>

            <form id="clientForm" onSubmit={handleSubmit} className="p-5 md:p-8 overflow-y-auto custom-scrollbar space-y-6 bg-slate-50/50 flex-1">
              
              <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex gap-2">
                  {['Фізична особа', 'Юридична особа'].map(type => (
                     <label key={type} className={`flex-1 flex items-center justify-center gap-2 p-3 border rounded-xl cursor-pointer transition-all text-xs sm:text-sm font-bold ${formData.client_type === type ? 'border-amber-500 bg-amber-50 text-amber-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                       <input type="radio" name="client_type" value={type} checked={formData.client_type === type} onChange={handleChange} className="hidden" />
                       {type}
                     </label>
                  ))}
                </div>
              </div>

              <div className="bg-white p-4 md:p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">
                    {formData.client_type === 'Юридична особа' ? 'Контактна особа' : 'ПІБ клієнта'} *
                  </label>
                  <input type="text" name="name" required value={formData.name} onChange={handleChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-amber-500 outline-none transition-colors text-sm font-bold" placeholder="Іван Іванов" />
                </div>

                {formData.client_type === 'Юридична особа' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Назва компанії *</label>
                      <input type="text" name="company_name" required value={formData.company_name} onChange={handleChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-amber-500 outline-none transition-colors text-sm font-bold" placeholder="ТОВ СонцеПром" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Сфера діяльності</label>
                      <select name="business_sphere" value={formData.business_sphere} onChange={handleChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-amber-500 outline-none transition-colors text-sm font-bold">
                        <option value="">Оберіть нішу...</option>
                        <option value="Магазин / Торгівля">Магазин / Торгівля</option>
                        <option value="СТО / Автобізнес">СТО / Автобізнес</option>
                        <option value="Медичний заклад">Медичний заклад / Аптека</option>
                        <option value="Заклад освіти">Заклад освіти</option>
                        <option value="Комунальне підприємство">Комунальне підприємство</option>
                        <option value="Виробництво / Завод">Виробництво / Завод</option>
                        <option value="Сільське господарство">Сільське господарство</option>
                        <option value="Офісний центр">Офісний центр</option>
                        <option value="HoReCa">Готелі / Ресторани / Кафе</option>
                        <option value="Інше">Інше</option>
                      </select>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Телефон</label>
                    <input type="tel" name="phone" value={formData.phone} onChange={handleChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-amber-500 outline-none transition-colors text-sm font-bold" placeholder="+38 (000) 000-00-00" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Джерело ліда</label>
                    <select name="lead_source" value={formData.lead_source} onChange={handleChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-amber-500 outline-none transition-colors text-sm font-bold">
                      <option value="">Оберіть джерело...</option>
                      <option value="TikTok">TikTok</option>
                      <option value="Instagram">Instagram</option>
                      <option value="Google">Google / Сайт</option>
                      <option value="Рекомендація">Рекомендація</option>
                      <option value="Холодний дзвінок">Холодний дзвінок</option>
                      <option value="Інше">Інше</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Примітки</label>
                  <textarea name="notes" value={formData.notes} onChange={handleChange} rows="3" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-amber-500 outline-none transition-colors text-sm font-medium resize-none" placeholder="Додаткова інформація..."></textarea>
                </div>
              </div>

              <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl flex items-start gap-3">
                 <FaSolarPanel className="text-emerald-600 mt-1 shrink-0"/>
                 <p className="text-[10px] sm:text-xs font-bold text-emerald-800">
                   Увага: Після збереження для цього клієнта буде автоматично створено нову базову угоду на першому етапі.
                 </p>
              </div>

            </form>

            <div className="p-4 md:p-6 border-t border-slate-100 flex gap-3 bg-white shrink-0">
              <button type="button" onClick={() => setIsModalOpen(false)} className="w-1/3 py-3.5 text-xs sm:text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors">Скасувати</button>
              <button form="clientForm" type="submit" disabled={isSubmitting || !formData.name} className="w-2/3 py-3.5 bg-amber-500 hover:bg-amber-400 text-slate-900 rounded-xl font-black text-xs uppercase tracking-widest transition-colors disabled:opacity-50 shadow-lg shadow-amber-500/20 active:scale-95 flex items-center justify-center gap-2">
                {isSubmitting ? 'СТВОРЕННЯ...' : 'ЗБЕРЕГТИ КЛІЄНТА'}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}