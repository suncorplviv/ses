import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { 
  FaTimes, FaFolderOpen, FaChevronLeft, FaChevronRight, FaExternalLinkAlt, 
  FaExpand, FaCamera, FaThLarge, FaFilePdf, FaFileWord, FaFileExcel, FaFileAlt
} from 'react-icons/fa';

// Допоміжні функції для Google Drive
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

// Визначення типу файлу для іконок
const getFileType = (fileName) => {
  if (!fileName) return 'file';
  const ext = fileName.split('.').pop().toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'image';
  if (['pdf'].includes(ext)) return 'pdf';
  if (['doc', 'docx', 'rtf'].includes(ext)) return 'word';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'excel';
  return 'file';
};

export default function UniversalDocumentViewer({ dealId, title = "Документи та файли", isOpen, onClose }) {
  const [loading, setLoading] = useState(true);
  
  const [documents, setDocuments] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeTab, setActiveTab] = useState('all');
  const [lightboxIndex, setLightboxIndex] = useState(null); 

  useEffect(() => {
    if (isOpen && dealId) fetchData();
  }, [isOpen, dealId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Завантажуємо всі документи прив'язані до угоди
      const { data: docs, error } = await supabase
        .from('deal_documents')
        .select('*')
        .eq('deal_id', dealId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error("Помилка завантаження файлів:", error);
      } else if (docs) {
        setDocuments(docs);
        
        // Динамічно формуємо унікальні категорії з наявних файлів
        const uniqueCategories = [...new Set(docs.map(d => d.category).filter(Boolean))];
        setCategories(uniqueCategories);
      }
    } catch (error) {
      console.error("Помилка:", error);
    } finally {
      setLoading(false);
    }
  };

  // Фільтрація файлів за активною вкладкою
  const visibleFiles = activeTab === 'all' 
    ? documents 
    : documents.filter(doc => doc.category === activeTab);

  // Для лайтбоксу беремо тільки зображення з поточного списку видимих
  const imageFiles = visibleFiles.filter(f => getFileType(f.file_name) === 'image');

  const openFile = (file) => {
    const type = getFileType(file.file_name);
    if (type === 'image') {
      const idx = imageFiles.findIndex(p => p.id === file.id);
      if (idx !== -1) setLightboxIndex(idx);
    } else {
      // Якщо це не картинка, відразу відкриваємо лінк у новій вкладці
      window.open(getDirectDriveUrl(file.public_url), '_blank');
    }
  };

  const closeLightbox = () => setLightboxIndex(null);
  const lightboxPrev = () => setLightboxIndex((prev) => (prev - 1 + imageFiles.length) % imageFiles.length);
  const lightboxNext = () => setLightboxIndex((prev) => (prev + 1) % imageFiles.length);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') { if (lightboxIndex !== null) closeLightbox(); else onClose(); }
      if (e.key === 'ArrowLeft' && lightboxIndex !== null) lightboxPrev();
      if (e.key === 'ArrowRight' && lightboxIndex !== null) lightboxNext();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [lightboxIndex, imageFiles]);

  const renderFileIcon = (type) => {
    switch (type) {
      case 'pdf': return <FaFilePdf className="text-rose-500 w-8 h-8 md:w-10 md:h-10" />;
      case 'word': return <FaFileWord className="text-blue-500 w-8 h-8 md:w-10 md:h-10" />;
      case 'excel': return <FaFileExcel className="text-emerald-500 w-8 h-8 md:w-10 md:h-10" />;
      default: return <FaFileAlt className="text-slate-400 w-8 h-8 md:w-10 md:h-10" />;
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-slate-950/70 backdrop-blur-md p-0 sm:p-4 transition-all animate-fadeIn">
        <div className="bg-slate-50 rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-6xl h-[92vh] sm:h-[88vh] flex flex-col overflow-hidden border border-slate-200/50">

          {/* ХЕДЕР */}
          <div className="sticky top-0 z-10 px-6 py-4 bg-white border-b border-slate-200 flex justify-between items-center shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-tr from-indigo-500 to-violet-600 text-white rounded-xl shadow-md shadow-indigo-500/20">
                <FaFolderOpen size={16}/>
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">{title}</h3>
                <p className="text-xs font-semibold text-indigo-600 tracking-wide">
                  {documents.length} файлів знайдено
                </p>
              </div>
            </div>
            <button 
              onClick={onClose} 
              className="p-2.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all duration-200"
            >
              <FaTimes size={18}/>
            </button>
          </div>

          {/* ОСНОВНИЙ КОНТЕНТ */}
          <div className="flex-1 flex flex-col overflow-hidden bg-white">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400">
                <div className="w-9 h-9 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin"></div>
                <p className="text-xs font-bold tracking-wider uppercase text-slate-500">Завантаження бази файлів...</p>
              </div>
            ) : documents.length === 0 ? (
              <div className="flex items-center justify-center h-full text-slate-400 font-medium bg-slate-50 border-t border-slate-200">
                Документів для цієї угоди ще не завантажено.
              </div>
            ) : (
              <>
                {/* ТАБ-НАВІГАЦІЯ (ДИНАМІЧНА) */}
                <div className="bg-slate-50/80 px-4 pt-3 border-b border-slate-200 flex items-center overflow-x-auto no-scrollbar gap-1 shrink-0">
                  <button
                    onClick={() => setActiveTab('all')}
                    className={`px-4 py-2.5 text-xs font-bold tracking-wide uppercase transition-all border-b-2 whitespace-nowrap flex items-center gap-2 ${
                      activeTab === 'all' 
                        ? 'border-indigo-600 text-indigo-600' 
                        : 'border-transparent text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    <FaThLarge size={12}/> Всі файли ({documents.length})
                  </button>
                  {categories.map(category => {
                    const count = documents.filter(d => d.category === category).length;
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

                {/* СІТКА ФАЙЛІВ */}
                <div className="p-5 overflow-y-auto flex-1 bg-slate-50/30">
                  {visibleFiles.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                      {visibleFiles.map((file) => {
                        const fileType = getFileType(file.file_name);
                        const isImage = fileType === 'image';
                        const thumbUrl = isImage ? getDriveThumbnailUrl(file.public_url) : null;

                        return (
                          <div 
                            key={file.id}
                            onClick={() => openFile(file)}
                            className="group relative flex flex-col aspect-[4/3] rounded-xl overflow-hidden border border-slate-200/80 hover:border-indigo-500 hover:shadow-md transition-all duration-300 bg-white cursor-pointer"
                          >
                            {isImage && thumbUrl ? (
                              <img
                                src={thumbUrl}
                                alt={file.file_name}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                              />
                            ) : null}
                            
                            {/* Заглушка для документів (PDF, Word) або битих картинок */}
                            <div
                              className="w-full h-full items-center justify-center flex-col gap-3 text-slate-400 p-3"
                              style={{ display: (isImage && thumbUrl) ? 'none' : 'flex' }}
                            >
                              {renderFileIcon(fileType)}
                              <span className="text-[10px] sm:text-xs font-semibold text-center truncate w-full text-slate-600">
                                {file.file_name || 'Документ'}
                              </span>
                            </div>
                            
                            {/* ОВЕРЛЕЙ ПРИ НАВЕДЕННІ */}
                            <div className="absolute inset-0 bg-slate-950/0 group-hover:bg-slate-950/20 transition-all duration-300 flex items-center justify-center">
                              {isImage ? (
                                <FaExpand className="text-white opacity-0 group-hover:opacity-100 transition-all duration-300 scale-75 group-hover:scale-100 drop-shadow" size={18}/>
                              ) : (
                                <FaExternalLinkAlt className="text-white opacity-0 group-hover:opacity-100 transition-all duration-300 scale-75 group-hover:scale-100 drop-shadow" size={16}/>
                              )}
                            </div>

                            {/* БЕДЖ КАТЕГОРІЇ */}
                            {activeTab === 'all' && file.category && (
                              <span className="absolute bottom-2 left-2 px-2 py-0.5 bg-slate-900/70 text-white text-[8px] font-bold uppercase rounded tracking-wider backdrop-blur-sm">
                                {file.category}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-10 text-slate-400 font-medium text-xs">
                      У цій категорії файли відсутні.
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ПОВНОЕКРАННИЙ ЛАЙТБОКС ТІЛЬКИ ДЛЯ ЗОБРАЖЕНЬ */}
      {lightboxIndex !== null && imageFiles[lightboxIndex] && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/95 backdrop-blur-md transition-all"
          onClick={closeLightbox}
        >
          {imageFiles.length > 1 && (
            <button 
              onClick={(e) => { e.stopPropagation(); lightboxPrev(); }}
              className="absolute left-3 sm:left-6 z-10 p-3 text-white/70 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition-all focus:outline-none"
            >
              <FaChevronLeft size={20}/>
            </button>
          )}

          <div className="relative max-w-5xl max-h-[82vh] mx-14 sm:mx-24 flex flex-col items-center justify-center" onClick={e => e.stopPropagation()}>
            <img
              src={getDriveThumbnailUrl(imageFiles[lightboxIndex].public_url)?.replace('w400', 'w1200') || ''}
              alt={imageFiles[lightboxIndex].file_name}
              className="max-h-[75vh] max-w-full object-contain rounded-lg shadow-2xl select-none animate-scaleIn"
              onError={(e) => { e.target.src = getDriveThumbnailUrl(imageFiles[lightboxIndex].public_url) || ''; }}
            />
            
            <div className="w-full mt-4 flex flex-col sm:flex-row sm:items-center justify-between text-white/90 gap-3">
              <div className="truncate">
                <span className="text-xs sm:text-sm font-bold block truncate">{imageFiles[lightboxIndex].file_name}</span>
                <span className="text-[9px] text-indigo-400 font-bold uppercase tracking-wider mt-0.5 block">
                  Категорія: {imageFiles[lightboxIndex].category || 'Без категорії'}
                </span>
              </div>
              
              <div className="flex items-center justify-end gap-3 shrink-0">
                <span className="text-[11px] font-mono bg-white/10 px-2.5 py-1 rounded-md text-white/70">
                  {lightboxIndex + 1} / {imageFiles.length}
                </span>
                <a
                  href={getDirectDriveUrl(imageFiles[lightboxIndex].public_url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-xl transition-colors shadow-lg shadow-indigo-600/20"
                >
                  Оригінал <FaExternalLinkAlt size={9}/>
                </a>
              </div>
            </div>
          </div>

          {imageFiles.length > 1 && (
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