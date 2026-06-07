import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { 
  FaTimes, FaSave, FaBolt, FaHome, FaChargingStation, 
  FaCamera, FaUpload, FaPlus, FaTrash, FaSolarPanel, 
  FaCommentDots, FaChevronDown, FaExclamationTriangle 
} from 'react-icons/fa';

export default function SiteSurveyModal({ dealId, isOpen, onClose, onSave }) {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [systemType, setSystemType] = useState('Гібридна');
  
  const [roofPlanes, setRoofPlanes] = useState([
    { roof_type: 'Скатний', roof_material: 'Металочерепиця', orientation: 'Південь', tilt_angle: '', width: '', length: '' }
  ]);

  const [formData, setFormData] = useState({
    grid_phase: 3, grid_power_kw: '', meter_type: '', monthly_bill: '', 
    consumption_kw: '', comment: ''
  });

  const [uploadFiles, setUploadFiles] = useState({
    'Щитова': [],
    'Лічильник': [],
    'Площини': [],
    'Інвертор': []
  });

  useEffect(() => {
    if (isOpen) fetchSurvey();
  }, [isOpen]);

  const fetchSurvey = async () => {
    const { data } = await supabase.from('site_surveys').select('*').eq('deal_id', dealId).single();
    if (data) {
      setFormData({
        grid_phase: data.grid_phase || 3, grid_power_kw: data.grid_power_kw || '',
        meter_type: data.meter_type || '', monthly_bill: data.monthly_bill || '',
        consumption_kw: data.consumption_kw || '', comment: data.comment || ''
      });
      if (data.system_type) setSystemType(data.system_type);
      
      if (data.roof_planes && data.roof_planes.length > 0) {
        const migratedPlanes = data.roof_planes.map(plane => ({
          ...plane,
          roof_type: plane.roof_type || data.roof_type || 'Скатний',
          roof_material: plane.roof_material || data.roof_material || 'Металочерепиця'
        }));
        setRoofPlanes(migratedPlanes);
      }
    }
  };

  const handleAddPlane = () => { 
    if (roofPlanes.length < 5) {
      const lastPlane = roofPlanes[roofPlanes.length - 1];
      setRoofPlanes([...roofPlanes, { 
        roof_type: lastPlane ? lastPlane.roof_type : 'Скатний', 
        roof_material: lastPlane ? lastPlane.roof_material : 'Металочерепиця', 
        orientation: 'Південь', tilt_angle: '', width: '', length: '' 
      }]); 
    }
  };
  
  const handleRemovePlane = (index) => { setRoofPlanes(roofPlanes.filter((_, i) => i !== index)); };
  
  const handlePlaneChange = (index, field, value) => { 
    const newPlanes = [...roofPlanes]; 
    newPlanes[index][field] = value; 
    setRoofPlanes(newPlanes); 
  };

  const handleFileChange = (category, newFiles) => {
    setErrorMsg('');
    setUploadFiles(prev => {
      const existingFiles = prev[category];
      const combined = [...existingFiles, ...Array.from(newFiles)];
      if (combined.length > 10) alert(`Максимум 10 фото для категорії "${category}".`);
      return { ...prev, [category]: combined.slice(0, 10) };
    });
  };

  const handleRemoveFile = (category, fileIndex) => {
    setUploadFiles(prev => ({ ...prev, [category]: prev[category].filter((_, index) => index !== fileIndex) }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    const totalSelectedFiles = Object.values(uploadFiles).flat().length;
    
    if (totalSelectedFiles === 0) {
      setErrorMsg("Щоб завершити замір, обов'язково додайте хоча б одне фото об'єкта.");
      const formContainer = document.getElementById('surveyForm');
      if (formContainer) formContainer.scrollTo({ top: formContainer.scrollHeight, behavior: 'smooth' });
      return; 
    }

    setLoading(true);

    const totalArea = roofPlanes.reduce((sum, p) => sum + ((parseFloat(p.width) || 0) * (parseFloat(p.length) || 0)), 0);
    const primaryTilt = parseFloat(roofPlanes[0]?.tilt_angle) || 0;
    const allOrientations = roofPlanes.map(p => p.orientation).join(', ');

    const primaryRoofType = roofPlanes[0]?.roof_type || 'Скатний';
    const primaryRoofMaterial = roofPlanes[0]?.roof_material || 'Металочерепиця';

    const sanitizedData = {
      ...formData,
      grid_power_kw: formData.grid_power_kw === '' ? null : parseFloat(formData.grid_power_kw),
      monthly_bill: formData.monthly_bill === '' ? null : parseFloat(formData.monthly_bill),
      consumption_kw: formData.consumption_kw === '' ? null : parseFloat(formData.consumption_kw),
    };

    const { error: dbError } = await supabase.from('site_surveys').upsert({
      deal_id: dealId, ...sanitizedData, 
      system_type: systemType, 
      roof_planes: roofPlanes, 
      roof_type: primaryRoofType, 
      roof_material: primaryRoofMaterial,
      tilt_angle: primaryTilt, available_area: totalArea, orientation: allOrientations.substring(0, 255), is_complete: true
    });

    if (dbError) {
      setErrorMsg("Помилка збереження в базу даних: " + dbError.message);
      setLoading(false);
      return;
    }

    const baseUrl = 'https://docsuncorp.suncorplv.workers.dev';
    const uploadPromises = [];

    Object.entries(uploadFiles).forEach(([category, filesArray]) => {
      if (filesArray.length === 0) return; 
      const uploadData = new FormData();
      uploadData.append('deal_id', dealId);
      uploadData.append('category', category);
      filesArray.forEach(file => uploadData.append('files', file));

      uploadPromises.push(
        fetch(`${baseUrl}/upload`, { method: 'POST', body: uploadData })
          .then(async (res) => {
            if (!res.ok) {
              const txt = await res.text().catch(() => '');
              throw new Error(`Сервер повернув статус ${res.status} для категорії "${category}". ${txt}`);
            }
            return res.json();
          })
      );
    });

    try {
      if (uploadPromises.length > 0) {
        await Promise.all(uploadPromises);
      }
      setLoading(false);
      onSave(); 
    } catch (uploadError) {
      console.error("Помилка відправки файлів на API:", uploadError);
      setErrorMsg(`Текстові дані збережено, але фотографії не завантажились. Перевірте з'єднання з сервером API (${baseUrl}).`);
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center bg-slate-900/80 backdrop-blur-sm md:p-4">
      <div className="bg-white rounded-t-3xl md:rounded-3xl shadow-2xl w-full max-w-4xl h-[90vh] md:h-auto md:max-h-[90vh] flex flex-col animate-slide-up md:animate-fade-in">
        
        <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-900 text-white shrink-0 rounded-t-3xl md:rounded-t-3xl">
          <div className="flex items-center gap-3">
             <div className="p-2 bg-amber-500 text-slate-900 rounded-lg hidden sm:block"><FaBolt size={18}/></div>
             <div>
                <h3 className="text-base md:text-lg font-black uppercase tracking-tight leading-tight">Акт технічного заміру</h3>
                <p className="text-[9px] md:text-[10px] text-amber-500 font-bold uppercase mt-0.5 tracking-widest">Чек-лист інженера</p>
             </div>
          </div>
          <button onClick={onClose} className="p-2 bg-white/10 text-white hover:bg-white/20 rounded-full transition-colors"><FaTimes size={16}/></button>
        </div>

        <form id="surveyForm" onSubmit={handleSubmit} className="p-4 md:p-8 overflow-y-auto custom-scrollbar space-y-6 md:space-y-8 bg-slate-50/50 flex-1 relative">
          
          <section className="bg-white p-4 md:p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 text-amber-500 border-b border-slate-100 pb-2 mb-4">
              <FaSolarPanel size={16}/> <h4 className="text-[10px] md:text-xs font-black uppercase tracking-widest text-slate-800">Проєктована система</h4>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
               {['Мережева', 'Гібридна', 'Автономна'].map(type => (
                 <label key={type} className={`flex-1 flex items-center justify-center gap-2 p-3 border rounded-xl cursor-pointer transition-all text-sm ${systemType === type ? 'border-amber-500 bg-amber-50 text-amber-800 font-bold' : 'border-slate-200 text-slate-600'}`}>
                   <input type="radio" name="system_type" value={type} checked={systemType === type} onChange={() => setSystemType(type)} className="hidden" />
                   {type}
                 </label>
               ))}
            </div>
          </section>

          <section className="bg-white p-4 md:p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 text-blue-500 border-b border-slate-100 pb-2 mb-4">
              <FaChargingStation size={16}/> <h4 className="text-[10px] md:text-xs font-black uppercase tracking-widest text-slate-800">Електромережа</h4>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Фази</label>
                <select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none" value={formData.grid_phase} onChange={e => setFormData({...formData, grid_phase: e.target.value})}>
                  <option value={1}>1 фаза</option><option value={3}>3 фази</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Потужність (кВт)</label>
                <input type="number" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none" value={formData.grid_power_kw} onChange={e => setFormData({...formData, grid_power_kw: e.target.value})} placeholder="Напр: 15"/>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Тип лічильника</label>
                <select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none" value={formData.meter_type} onChange={e => setFormData({...formData, meter_type: e.target.value})}>
                  <option value="">Оберіть...</option><option value="Однотарифний">Однотарифний</option><option value="Двотарифний">Двотарифний</option><option value="Двонаправлений">Двонаправлений</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Споживання (кВт/міс)</label>
                <input type="number" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none" value={formData.consumption_kw} onChange={e => setFormData({...formData, consumption_kw: e.target.value})} placeholder="Напр: 500"/>
              </div>
            </div>
          </section>

          <section className="bg-white p-4 md:p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 text-emerald-500 border-b border-slate-100 pb-2 mb-4">
               <FaHome size={16}/> <h4 className="text-[10px] md:text-xs font-black uppercase tracking-widest text-slate-800">Покрівля та Площини</h4>
            </div>

            <div className="space-y-4">
              {roofPlanes.map((plane, idx) => (
                <div key={idx} className="bg-slate-50 p-4 rounded-xl border border-slate-200 relative">
                  
                  <div className="flex justify-between items-center mb-3 border-b border-slate-200 pb-2">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                      Площина #{idx + 1}
                    </span>
                    {roofPlanes.length > 1 && (
                      <button type="button" onClick={() => handleRemovePlane(idx)} className="p-1.5 text-rose-400 hover:bg-rose-100 hover:text-rose-600 rounded-lg transition-colors">
                        <FaTrash size={12}/>
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Тип даху</label>
                      <select className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-sm font-bold outline-none focus:border-emerald-400" 
                        value={plane.roof_type} onChange={e => handlePlaneChange(idx, 'roof_type', e.target.value)}>
                        <option value="Скатний">Скатний</option>
                        <option value="Плоский">Плоский</option>
                        <option value="Наземна">Наземна конструкція</option>
                        <option value="Навіс">Навіс</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Матеріал</label>
                      <select className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-sm font-bold outline-none focus:border-emerald-400" 
                        value={plane.roof_material} onChange={e => handlePlaneChange(idx, 'roof_material', e.target.value)}>
                        <option value="Металочерепиця">Металочерепиця</option>
                        <option value="Профнастил">Профнастил</option>
                        <option value="Фальц">Фальцева покрівля</option>
                        <option value="Бітумна">Бітумна черепиця</option>
                        <option value="Керамічна">Керамічна черепиця</option>
                        <option value="Шифер">Шифер</option>
                        <option value="Руберойд">Руберойд (Євроруберойд)</option>
                        <option value="ПВХ-мембрана">ПВХ-мембрана</option>
                        <option value="Полікарбонат">Полікарбонат</option>
                        <option value="Грунт">Грунт (для наземної)</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Орієнтація</label>
                      <select className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-sm font-bold outline-none focus:border-emerald-400" 
                        value={plane.orientation} onChange={e => handlePlaneChange(idx, 'orientation', e.target.value)}>
                        <option value="Південь">Південь</option>
                        <option value="Пд-Схід">Південний схід</option>
                        <option value="Пд-Захід">Південний захід</option>
                        <option value="Схід">Схід</option>
                        <option value="Захід">Захід</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Кут (°)</label>
                      <input type="number" className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-sm font-bold outline-none focus:border-emerald-400" 
                        value={plane.tilt_angle} onChange={e => handlePlaneChange(idx, 'tilt_angle', e.target.value)} placeholder="35"/>
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Ширина (м)</label>
                      <input type="number" className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-sm font-bold outline-none focus:border-emerald-400" 
                        value={plane.width} onChange={e => handlePlaneChange(idx, 'width', e.target.value)} placeholder="8.5"/>
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Довжина (м)</label>
                      <input type="number" className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-sm font-bold outline-none focus:border-emerald-400" 
                        value={plane.length} onChange={e => handlePlaneChange(idx, 'length', e.target.value)} placeholder="4.2"/>
                    </div>
                  </div>
                </div>
              ))}
              
              {roofPlanes.length < 5 && (
                <button type="button" onClick={handleAddPlane} className="w-full py-3 flex justify-center items-center gap-2 text-xs font-bold text-emerald-600 bg-emerald-50 rounded-xl border border-emerald-200 border-dashed mt-2 hover:bg-emerald-100 transition-colors">
                  <FaPlus /> Додати ще одну площину
                </button>
              )}
            </div>
          </section>

          <section className="bg-white p-4 md:p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 text-indigo-500 border-b border-slate-100 pb-2 mb-4">
              <FaCamera size={16}/> <h4 className="text-[10px] md:text-xs font-black uppercase tracking-widest text-slate-800">Фотофіксація об'єкта</h4>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {['Щитова', 'Лічильник', 'Площини', 'Інвертор'].map(category => (
                <div key={category} className="border border-slate-200 p-3 rounded-xl flex flex-col gap-3 bg-slate-50 transition-all focus-within:border-indigo-400">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-700">{category}</span>
                    {uploadFiles[category].length > 0 && (
                      <span className="text-[9px] font-black text-indigo-400">{uploadFiles[category].length}/10</span>
                    )}
                  </div>
                  
                  {uploadFiles[category].length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      {uploadFiles[category].map((file, idx) => (
                        <div key={idx} className="flex justify-between items-center bg-white p-1.5 border border-slate-100 rounded-lg shadow-sm">
                          <span className="text-[10px] text-slate-600 truncate max-w-[80%]">{file.name}</span>
                          <button type="button" onClick={() => handleRemoveFile(category, idx)} className="p-1 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded transition-colors">
                            <FaTrash size={10} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {uploadFiles[category].length < 10 && (
                    <label className="cursor-pointer flex items-center justify-center gap-2 p-2 mt-1 border border-dashed border-indigo-200 bg-indigo-50/50 text-indigo-500 rounded-lg text-[10px] font-bold hover:bg-indigo-100 hover:border-indigo-300 transition-all">
                      <FaUpload size={10} /> Додати фото
                      <input type="file" multiple accept="image/*" onChange={(e) => handleFileChange(category, e.target.files)} className="hidden" />
                    </label>
                  )}
                </div>
              ))}
            </div>
          </section>

          <details className="bg-white rounded-2xl border border-slate-200 shadow-sm group">
            <summary className="p-4 md:p-6 flex items-center justify-between cursor-pointer list-none outline-none">
              <div className="flex items-center gap-2 text-slate-500">
                <FaCommentDots size={16}/> 
                <h4 className="text-[10px] md:text-xs font-black uppercase tracking-widest text-slate-800">Коментарі (Нотатки)</h4>
              </div>
              <span className="text-slate-400 group-open:rotate-180 transition-transform duration-200"><FaChevronDown size={12} /></span>
            </summary>
            <div className="px-4 pb-4 md:px-6 md:pb-6 border-t border-slate-100 pt-4">
              <textarea 
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none resize-none focus:border-slate-300 transition-colors" rows="3"
                value={formData.comment} onChange={e => setFormData({...formData, comment: e.target.value})} placeholder="Особливості об'єкта, побажання клієнта..."
              />
            </div>
          </details>

        </form>

        {errorMsg && (
          <div className="px-4 md:px-6 py-3 bg-rose-50 border-t border-rose-100 flex items-start gap-3 animate-fade-in">
            <div className="text-rose-500 mt-0.5"><FaExclamationTriangle size={14} /></div>
            <p className="text-xs font-bold text-rose-700 flex-1">{errorMsg}</p>
            <button onClick={() => setErrorMsg('')} className="text-rose-400 hover:text-rose-600 transition-colors"><FaTimes size={14} /></button>
          </div>
        )}

        <div className="p-4 md:p-6 border-t border-slate-200 bg-white shrink-0 flex gap-3 shadow-[0_-10px_20px_rgba(0,0,0,0.05)]">
          <button type="button" onClick={onClose} className="w-1/3 py-3.5 text-sm font-bold text-slate-600 bg-slate-100 rounded-xl transition-colors hover:bg-slate-200">Скасувати</button>
          <button form="surveyForm" type="submit" disabled={loading} className="w-2/3 py-3.5 bg-amber-500 text-slate-900 rounded-xl font-black text-xs md:text-sm uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-amber-500/30 transition-all hover:bg-amber-400 disabled:opacity-50">
            {loading ? (
              <div className="w-4 h-4 border-2 border-slate-900/30 border-t-slate-900 rounded-full animate-spin"></div>
            ) : <><FaSave size={16} /> Зберегти та відправити</>}
          </button>
        </div>

      </div>
    </div>
  );
}