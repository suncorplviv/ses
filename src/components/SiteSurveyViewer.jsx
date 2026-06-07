import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { 
  FaTimes, FaBolt, FaChevronLeft, FaChevronRight, FaExternalLinkAlt, FaExpand, FaCamera, FaThLarge
} from 'react-icons/fa';

const getDriveThumbnailUrl = (publicUrl) => {
  if (!publicUrl) return null;
  const match = publicUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (!match) return null;
  return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w400`;
};

const getDirectDriveUrl = (publicUrl) => {
  if (!publicUrl) return publicUrl;
  const match = publicUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (!match) return publicUrl;
  return `https://drive.google.com/file/d/${match[1]}/view`;
};

const PHOTO_CATEGORIES = ['Інвертор', 'Площини', 'Лічильник', 'Щитова'];

export default function SiteSurveyViewer({ dealId, isOpen, onClose }) {
  const [loading, setLoading] = useState(true);
  const [surveyData, setSurveyData] = useState(null);
  
  // Фото та фільтрація
  const [photos, setPhotos] = useState({});
  const [allPhotosFlat, setAllPhotosFlat] = useState([]);
  const [activeTab, setActiveTab] = useState('all'); // 'all' або конкретна категорія
  const [lightboxIndex, setLightboxIndex] = useState(null); 

  useEffect(() => {
    if (isOpen && dealId) fetchData();
  }, [isOpen, dealId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: surveys, error: surveyError } = await supabase
        .from('site_surveys')
        .select(`*, deal:deals(title)`)
        .eq('deal_id', dealId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (surveyError) console.error("Помилка заміру:", surveyError);
      else if (surveys && surveys.length > 0) setSurveyData(surveys[0]);
      else setSurveyData(null);

      const { data: docs, error: docsError } = await supabase
        .from('deal_documents')
        .select('*')
        .eq('deal_id', dealId)
        .in('category', PHOTO_CATEGORIES)
        .order('created_at', { ascending: true });

      if (docsError) {
        console.error("Помилка фото:", docsError);
      } else if (docs) {
        const grouped = docs.reduce((acc, file) => {
          const cat = file.category;
          if (!acc[cat]) acc[cat] = [];
          acc[cat].push(file);
          return acc;
        }, {});
        
        setPhotos(grouped);
        setAllPhotosFlat(PHOTO_CATEGORIES.flatMap(cat => grouped[cat] || []));
      }
    } catch (error) {
      console.error("Помилка отримання даних:", error);
    } finally {
      setLoading(false);
    }
  };

  const openLightbox = (photoId) => {
    const idx = allPhotosFlat.findIndex(p => p.id === photoId);
    if (idx !== -1) setLightboxIndex(idx);
  };

  const closeLightbox = () => setLightboxIndex(null);
  const lightboxPrev = () => setLightboxIndex((prev) => (prev - 1 + allPhotosFlat.length) % allPhotosFlat.length);
  const lightboxNext = () => setLightboxIndex((prev) => (prev + 1) % allPhotosFlat.length);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') { if (lightboxIndex !== null) closeLightbox(); else onClose(); }
      if (e.key === 'ArrowLeft' && lightboxIndex !== null) lightboxPrev();
      if (e.key === 'ArrowRight' && lightboxIndex !== null) lightboxNext();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [lightboxIndex, allPhotosFlat]);

  if (!isOpen) return null;

  // Визначаємо, які фото показувати в сітці залежно від обраної вкладки
  const visiblePhotos = activeTab === 'all' 
    ? allPhotosFlat 
    : (photos[activeTab] || []);

  return (
    <>
      <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-slate-950/70 backdrop-blur-md p-0 sm:p-4 transition-all animate-fadeIn">
        <div className="bg-slate-50 rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-6xl h-[92vh] sm:h-[88vh] flex flex-col overflow-hidden border border-slate-200/50">

          {/* СТИЛЬНИЙ ХЕДЕР */}
          <div className="sticky top-0 z-10 px-6 py-4 bg-white border-b border-slate-200 flex justify-between items-center shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-tr from-indigo-500 to-violet-600 text-white rounded-xl shadow-md shadow-indigo-500/20">
                <FaBolt size={16}/>
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">Технічний огляд об'єкта</h3>
                <p className="text-xs font-semibold text-indigo-600 tracking-wide">{surveyData?.deal?.title || 'Специфікація заміру'}</p>
              </div>
            </div>
            <button 
              onClick={onClose} 
              className="p-2.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all duration-200"
            >
              <FaTimes size={18}/>
            </button>
          </div>

          {/* ОСНОВНИЙ СКРОЛ-КОНТЕНТ */}
          <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-6">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-full min-h-[350px] gap-3 text-slate-400">
                <div className="w-9 h-9 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin"></div>
                <p className="text-xs font-bold tracking-wider uppercase text-slate-500">Синхронізація з базою даних...</p>
              </div>
            ) : !surveyData ? (
              <div className="flex items-center justify-center h-full min-h-[350px] text-slate-400 font-medium bg-white rounded-2xl border border-slate-200">
                Технічні дані для цієї угоди ще не заповнено.
              </div>
            ) : (
              <>
                {/* ВЕРХНЯ СЕКЦІЯ: ХАРАКТЕРИСТИКИ ТА ДАХ */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  
                  {/* ТЕХНІЧНИЙ ПАСПОРТ СИСТЕМИ */}
                  <div className="lg:col-span-5 space-y-5 flex flex-col">
                    <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm flex-1">
                      <div className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-3">Тип рішення</div>
                      <div className="inline-block px-4 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-xl font-bold text-sm shadow-sm shadow-indigo-600/10 mb-5">
                        {surveyData.system_type || 'Не визначено'}
                      </div>

                      <div className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-3 border-t border-slate-100 pt-4">Параметри електромережі</div>
                      <div className="grid grid-cols-2 gap-3">
                        <MetricCard label="Мережа" value={surveyData.grid_phase ? `${surveyData.grid_phase} ф.` : '-'} />
                        <MetricCard label="Потужність" value={surveyData.grid_power_kw ? `${surveyData.grid_power_kw} кВт` : '-'} />
                        <MetricCard label="Лічильник" value={surveyData.meter_type || '-'} />
                        <MetricCard label="Споживання" value={surveyData.consumption_kw ? `${surveyData.consumption_kw} кВт` : '-'} />
                      </div>

                      {surveyData.grid_limits && (
                        <div className="mt-4 p-3.5 bg-amber-50/70 border border-amber-200/60 rounded-xl text-xs text-amber-800 font-medium leading-relaxed">
                          ⚡️ <span className="font-bold">Обмеження:</span> {surveyData.grid_limits}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ПОКРІВЛЯ ТА ПЛОЩИНИ */}
                  <div className="lg:col-span-7 flex flex-col">
                    <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm flex-1">
                      <div className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-4">Конструкція покрівлі</div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {surveyData.roof_planes && surveyData.roof_planes.length > 0 ? (
                          surveyData.roof_planes.map((plane, idx) => (
                            <div key={idx} className="p-4 bg-slate-50 rounded-xl border border-slate-200/50 flex flex-col justify-between">
                              <span className="text-[9px] font-black text-indigo-600 uppercase tracking-wider bg-indigo-50 px-2 py-0.5 rounded self-start mb-3">
                                Площина #{idx + 1}
                              </span>
                              <div className="space-y-2 text-xs">
                                <div className="flex justify-between border-b border-slate-100 pb-1.5"><span className="text-slate-400">Матеріал:</span> <span className="font-bold text-slate-800">{plane.roof_material || surveyData.roof_material || '-'}</span></div>
                                <div className="flex justify-between border-b border-slate-100 pb-1.5"><span className="text-slate-400">Кут / Азимут:</span> <span className="font-bold text-slate-800">{plane.tilt_angle ? `${plane.tilt_angle}°` : '-'} / {plane.orientation || '-'}</span></div>
                                <div className="flex justify-between"><span className="text-slate-400">Розміри:</span> <span className="font-bold text-slate-800">{plane.width || '-'} × {plane.length || '-'} м</span></div>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/50 sm:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-4">
                            <PlaneParam label="Тип даху" value={surveyData.roof_type} />
                            <PlaneParam label="Матеріал" value={surveyData.roof_material} />
                            <PlaneParam label="Орієнтація" value={surveyData.orientation} />
                            <PlaneParam label="Площа" value={surveyData.available_area ? `${surveyData.available_area} м²` : null} />
                          </div>
                        )}
                      </div>

                      {surveyData.comment && (
                        <div className="mt-4 p-4 bg-slate-50 rounded-xl border border-slate-200/40 text-xs text-slate-600 whitespace-pre-wrap leading-relaxed italic">
                          "{surveyData.comment}"
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* НОВА UX ФОТОГАЛЕРЕЯ З ВКЛАДКАМИ */}
                <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
                  
                  {/* ТАБ-НАВІГАЦІЯ */}
                  <div className="bg-slate-50/80 px-4 pt-3 border-b border-slate-200 flex items-center overflow-x-auto no-scrollbar gap-1">
                    <button
                      onClick={() => setActiveTab('all')}
                      className={`px-4 py-2.5 text-xs font-bold tracking-wide uppercase transition-all border-b-2 whitespace-nowrap flex items-center gap-2 ${
                        activeTab === 'all' 
                          ? 'border-indigo-600 text-indigo-600' 
                          : 'border-transparent text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      <FaThLarge size={12}/> Всі фото ({allPhotosFlat.length})
                    </button>
                    {PHOTO_CATEGORIES.map(category => {
                      const count = photos[category]?.length || 0;
                      if (count === 0) return null; // ховаємо вкладку, якщо фотографій немає
                      return (
                        <button
                          key={category}
                          onClick={() => setActiveTab(category)}
                          className={`px-4 py-2.5 text-xs font-bold tracking-wide uppercase transition-all border-b-2 whitespace-nowrap ${
                            activeTab === category 
                              ? 'border-indigo-600 text-indigo-600' 
                              : 'border-transparent text-slate-400 hover:text-slate-600'
                          }`}
                        >
                          {category} ({count})
                        </button>
                      );
                    })}
                  </div>

                  {/* СІТКА ЗОБРАЖЕНЬ ПОТОЧНОЇ ВКЛАДКИ */}
                  <div className="p-5">
                    {visiblePhotos.length > 0 ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {visiblePhotos.map((photo) => {
                          const thumbUrl = getDriveThumbnailUrl(photo.public_url);
                          return (
                            <div 
                              key={photo.id}
                              onClick={() => openLightbox(photo.id)}
                              className="group relative aspect-[4/3] rounded-xl overflow-hidden border border-slate-200/80 hover:border-indigo-500 hover:shadow-md transition-all duration-300 bg-slate-50 cursor-pointer"
                            >
                              {thumbUrl ? (
                                <img
                                  src={thumbUrl}
                                  alt={photo.file_name}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                  onError={(e) => {
                                    e.target.style.display = 'none';
                                    e.target.nextSibling.style.display = 'flex';
                                  }}
                                />
                              ) : null}
                              <div
                                className="w-full h-full items-center justify-center flex-col gap-1.5 text-slate-400 p-3 bg-slate-50"
                                style={{ display: thumbUrl ? 'none' : 'flex' }}
                              >
                                <FaCamera size={16}/>
                                <span className="text-[10px] font-semibold text-center truncate w-full">{photo.file_name || 'Зображення'}</span>
                              </div>
                              
                              {/* ОВЕРЛЕЙ ПРИ НАВЕДЕННІ */}
                              <div className="absolute inset-0 bg-slate-950/0 group-hover:bg-slate-950/30 transition-all duration-300 flex items-center justify-center">
                                <FaExpand className="text-white opacity-0 group-hover:opacity-100 transition-all duration-300 scale-75 group-hover:scale-100 drop-shadow" size={18}/>
                              </div>

                              {/* БЕДЖ КАТЕГОРІЇ (потрібен, коли обрано вкладку "Всі фото") */}
                              {activeTab === 'all' && (
                                <span className="absolute bottom-2 left-2 px-2 py-0.5 bg-slate-900/70 text-white text-[8px] font-bold uppercase rounded tracking-wider backdrop-blur-sm">
                                  {photo.category}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-10 text-slate-400 font-medium text-xs">
                        У цій категорії зображення відсутні.
                      </div>
                    )}
                  </div>

                </div>
              </>
            )}
          </div>

        </div>
      </div>

      {/* ПОВНОЕКРАННИЙ ЛАЙТБОКС */}
      {lightboxIndex !== null && allPhotosFlat[lightboxIndex] && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/95 backdrop-blur-md transition-all"
          onClick={closeLightbox}
        >
          {allPhotosFlat.length > 1 && (
            <button 
              onClick={(e) => { e.stopPropagation(); lightboxPrev(); }}
              className="absolute left-3 sm:left-6 z-10 p-3 text-white/70 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition-all focus:outline-none"
            >
              <FaChevronLeft size={20}/>
            </button>
          )}

          <div className="relative max-w-5xl max-h-[82vh] mx-14 sm:mx-24 flex flex-col items-center justify-center" onClick={e => e.stopPropagation()}>
            <img
              src={getDriveThumbnailUrl(allPhotosFlat[lightboxIndex].public_url)?.replace('w400', 'w1200') || ''}
              alt={allPhotosFlat[lightboxIndex].file_name}
              className="max-h-[75vh] max-w-full object-contain rounded-lg shadow-2xl select-none animate-scaleIn"
              onError={(e) => { e.target.src = getDriveThumbnailUrl(allPhotosFlat[lightboxIndex].public_url) || ''; }}
            />
            
            <div className="w-full mt-4 flex flex-col sm:flex-row sm:items-center justify-between text-white/90 gap-3">
              <div className="truncate">
                <span className="text-xs sm:text-sm font-bold block truncate">{allPhotosFlat[lightboxIndex].file_name}</span>
                <span className="text-[9px] text-indigo-400 font-bold uppercase tracking-wider mt-0.5 block">Категорія: {allPhotosFlat[lightboxIndex].category}</span>
              </div>
              
              <div className="flex items-center justify-end gap-3 shrink-0">
                <span className="text-[11px] font-mono bg-white/10 px-2.5 py-1 rounded-md text-white/70">
                  {lightboxIndex + 1} / {allPhotosFlat.length}
                </span>
                <a
                  href={getDirectDriveUrl(allPhotosFlat[lightboxIndex].public_url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-xl transition-colors shadow-lg shadow-indigo-600/20"
                >
                  Оригінал <FaExternalLinkAlt size={9}/>
                </a>
              </div>
            </div>
          </div>

          {allPhotosFlat.length > 1 && (
            <button 
              onClick={(e) => { e.stopPropagation(); lightboxNext(); }}
              className="absolute right-3 sm:right-6 z-10 p-3 text-white/70 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition-all focus:outline-none"
            >
              <FaChevronRight size={20}/>
            </button>
          )}

          <button 
            onClick={closeLightbox}
            className="absolute top-4 right-4 p-3 text-white/60 hover:text-white bg-white/5 hover:bg-rose-500 rounded-full transition-all focus:outline-none"
          >
            <FaTimes size={16}/>
          </button>
        </div>
      )}
    </>
  );
}

// --- СТИЛІЗОВАНІ МІКРО-КОМПОНЕНТИ ---

function MetricCard({ label, value }) {
  return (
    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex flex-col justify-between">
      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">{label}</span>
      <span className="text-xs sm:text-sm font-bold text-slate-800 mt-1 truncate" title={value}>{value}</span>
    </div>
  );
}

function PlaneParam({ label, value }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] font-semibold text-slate-400 uppercase">{label}</span>
      <span className="text-xs font-bold text-slate-700 mt-0.5">{value || '-'}</span>
    </div>
  );
}