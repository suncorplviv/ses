import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthProvider';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FaTimes, FaFileContract, FaSave, FaCloudUploadAlt, FaTrash, FaFileAlt, FaCheckCircle, FaPlus
} from 'react-icons/fa';

export default function DocumentUploadModal({ dealId, dealLabel, taskId, taskTitle, category, isOpen, onClose, onSave }) {
  const { employeeProfile } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Стан для зберігання файлів по категоріях: { 'Назва категорії': [File, File] }
  const [filesByCategory, setFilesByCategory] = useState({});

  // Власні (введені вручну) типи документів
  const [customCategories, setCustomCategories] = useState([]);
  const [newCategoryName, setNewCategoryName] = useState('');

  // Кількість вже завантажених файлів по категоріях (для порядкового номера в імені)
  const [existingCounts, setExistingCounts] = useState({});

  // Визначення доступних категорій на основі назви завдання
  const baseCategories = useMemo(() => {
    if (category && category !== 'Інше' && category !== 'Інший документ') {
      return [category];
    }

    const title = (taskTitle || '').toLowerCase();

    if (title.includes('комерційн') || title.includes('кп')) {
      return ['Комерційна пропозиція (КП)'];
    } 
    
    if (title.includes('технічного рішення') || title.includes('розкладки фем')) {
      return [
        '3D візуалізація', 
        'Схема підключення', 
        'Стрінгування', 
        'Технічне креслення'
      ];
    } 
    
    if (title.includes('підготовка та підписання договору')) {
      return ['Договір', 'Рахунок-фактура'];
    } 
    
    if (title.includes('закриття угоди') || title.includes('підписання документів та закриття')) {
      return [
        'ТТН', 
        'Видаткова накладна', 
        'Акт виконаних робіт',
        'Договір', 
        'Рахунок-фактура'
      ];
    }

    return [
      'Комерційна пропозиція (КП)',
      'Технічне рішення / Схема',
      'Договір',
      'Рахунок-фактура',
      'Видаткова накладна / Акт'
    ];
  }, [taskTitle, category]);

  // Базові категорії + власноруч додані типи
  const availableCategories = useMemo(() => {
    return [...baseCategories, ...customCategories.filter(c => !baseCategories.includes(c))];
  }, [baseCategories, customCategories]);

  // Очищення стану при відкритті + підрахунок вже завантажених файлів для нумерації
  useEffect(() => {
    if (isOpen) {
      setFilesByCategory({});
      setCustomCategories([]);
      setNewCategoryName('');
      setExistingCounts({});

      if (dealId) {
        supabase
          .from('deal_documents')
          .select('category')
          .eq('deal_id', dealId)
          .then(({ data }) => {
            const counts = {};
            (data || []).forEach(d => {
              if (d.category) counts[d.category] = (counts[d.category] || 0) + 1;
            });
            setExistingCounts(counts);
          });
      }
    }
  }, [isOpen, dealId]);

  const handleAddCustomCategory = () => {
    const name = newCategoryName.trim();
    if (!name) return;
    if (availableCategories.includes(name)) {
      setNewCategoryName('');
      return;
    }
    setCustomCategories(prev => [...prev, name]);
    setNewCategoryName('');
  };

  const cleanForFileName = (str) =>
    (str || '').replace(/[\/\\?%*:|"<>]/g, '-').replace(/\s+/g, ' ').trim();

  // Шаблон імені: {Тип документа}_{Назва угоди}_{Дата}_{Порядковий №}.{розширення}
  const getStandardizedName = (catName, file, indexInCategory) => {
    const cleanCat = cleanForFileName(catName);
    const cleanDeal = cleanForFileName(dealLabel) || `Угода-${String(dealId).substring(0, 6)}`;
    const dateStr = new Date().toLocaleDateString('uk-UA');
    const seq = (existingCounts[catName] || 0) + indexInCategory + 1;
    const originalName = file.name || '';
    const ext = originalName.includes('.') ? '.' + originalName.split('.').pop() : '';
    return `${cleanCat}_${cleanDeal}_${dateStr}_${String(seq).padStart(2, '0')}${ext}`;
  };

  const handleFileChange = (catName, e) => {
    const files = Array.from(e.target.files);
    
    setFilesByCategory(prev => {
      const currentCategoryFiles = prev[catName] || [];
      const combined = [...currentCategoryFiles, ...files];
      
      if (combined.length > 10) {
        alert(`Можна завантажити максимум 10 файлів для категорії "${catName}".`);
        return { ...prev, [catName]: combined.slice(0, 10) };
      }
      return { ...prev, [catName]: combined };
    });
  };

  const handleRemoveFile = (catName, indexToRemove) => {
    setFilesByCategory(prev => {
      const currentCategoryFiles = prev[catName] || [];
      const filtered = currentCategoryFiles.filter((_, idx) => idx !== indexToRemove);
      
      if (filtered.length === 0) {
        const newState = { ...prev };
        delete newState[catName];
        return newState;
      }
      
      return { ...prev, [catName]: filtered };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!dealId || dealId === 'undefined' || dealId === 'null') {
      alert("Критична помилка: ID угоди не знайдено! Перезавантажте сторінку.");
      return;
    }

    const categoriesToUpload = Object.keys(filesByCategory);
    if (categoriesToUpload.length === 0) {
      alert("Будь ласка, прикріпіть хоча б один файл у будь-яку категорію!");
      return;
    }

    setIsSubmitting(true);

    try {
      const uploadPromises = categoriesToUpload.map(async (catName) => {
        const files = filesByCategory[catName];
        const uploadData = new FormData();
        uploadData.append('deal_id', dealId);
        uploadData.append('category', catName); 
        
        files.forEach((file, idx) => {
          // Застосовуємо стандартизоване ім'я: Тип_Угода_Дата_№
          const finalName = getStandardizedName(catName, file, idx);
          uploadData.append('files', file, finalName);
        });

        const response = await fetch('https://docsuncorp.suncorplv.workers.dev/upload', {
          method: 'POST',
          body: uploadData
        });

        if (!response.ok) {
          throw new Error(`Помилка сервера при завантаженні "${catName}": ${response.status}`);
        }
        return { category: catName, count: files.length };
      });

      const results = await Promise.all(uploadPromises);

      const logDetails = results.map(r => `${r.count} шт. (${r.category})`).join(', ');
      await supabase.from('deal_activity_log').insert([{
        deal_id: dealId,
        user_id: employeeProfile?.id,
        action: `Завантажено документи: ${logDetails} (Завдання: "${taskTitle}")`
      }]);

      setFilesByCategory({});
      if (onSave) onSave(); 
      
    } catch (error) {
      alert("Помилка завантаження документа: " + error.message);
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalFilesCount = Object.values(filesByCategory).reduce((acc, files) => acc + files.length, 0);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          exit={{ opacity: 0 }} 
          className="absolute inset-0 bg-slate-900/70 backdrop-blur-md"
        />
        
        <motion.div 
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          className="relative bg-slate-50 rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
        >
          <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-white shrink-0">
            <div className="flex items-center gap-4">
               <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center shadow-sm">
                 <FaFileContract size={20} />
               </div>
               <div className="min-w-0 pr-4">
                 <h3 className="text-xl font-bold text-slate-800 tracking-tight">Документація</h3>
                 <p className="text-xs font-semibold text-slate-500 mt-1 truncate" title={taskTitle}>
                   {taskTitle || 'Прикріплення файлу'}
                 </p>
               </div>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-2 rounded-full transition-colors bg-slate-100 hover:bg-slate-200 shrink-0">
              <FaTimes size={16} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 overflow-y-auto custom-scrollbar">
            <div className="mb-6">
              <h4 className="text-sm font-bold text-slate-700 uppercase tracking-widest mb-1">
                Необхідні документи
              </h4>
              <p className="text-xs text-slate-500">
                Завантажте файли у відповідні блоки нижче. Назви стандартизуються автоматично: <span className="font-bold text-slate-600">Тип_Угода_Дата_№</span>
              </p>
            </div>

            {/* ВЛАСНИЙ ТИП ДОКУМЕНТА */}
            <div className="mb-5 p-4 bg-white border border-slate-200 rounded-2xl">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                Потрібен інший тип документа? Створіть власний
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCustomCategory(); } }}
                  placeholder="Напр: Технічні умови, Дозвіл, Протокол..."
                  className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-amber-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={handleAddCustomCategory}
                  disabled={!newCategoryName.trim()}
                  className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors flex items-center gap-2 whitespace-nowrap"
                >
                  <FaPlus size={10}/> Додати блок
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {availableCategories.map(cat => {
                const categoryFiles = filesByCategory[cat] || [];
                const hasFiles = categoryFiles.length > 0;

                return (
                  <div 
                    key={cat} 
                    className={`border-2 rounded-2xl p-4 transition-all flex flex-col ${
                      hasFiles 
                        ? 'border-emerald-200 bg-emerald-50/30' 
                        : 'border-dashed border-slate-200 bg-white hover:border-amber-300'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <h5 className="text-sm font-bold text-slate-700 leading-tight pr-2">
                        {cat}
                      </h5>
                      {hasFiles && <FaCheckCircle className="text-emerald-500 shrink-0 mt-0.5" size={14}/>}
                    </div>

                    <label className="flex flex-col items-center justify-center cursor-pointer group flex-grow mb-3 min-h-[80px] bg-slate-50/50 rounded-xl border border-slate-100 hover:bg-amber-50/50 transition-colors">
                       <FaCloudUploadAlt className={`text-2xl mb-1 transition-colors ${hasFiles ? 'text-emerald-400' : 'text-slate-300 group-hover:text-amber-500'}`}/>
                       <span className="text-[10px] font-bold text-slate-500 uppercase">
                         {hasFiles ? 'Додати ще' : 'Обрати файли'}
                       </span>
                       <input 
                         type="file" 
                         multiple 
                         onChange={(e) => handleFileChange(cat, e)}
                         className="hidden" 
                       />
                    </label>

                    {/* Список вибраних файлів з відображенням майбутньої стандартизованої назви */}
                    {hasFiles && (
                      <div className="space-y-2 mt-auto">
                        {categoryFiles.map((file, idx) => {
                          const systemName = getStandardizedName(cat, file, idx);
                          return (
                            <div key={idx} className="flex flex-col p-2.5 bg-white border border-emerald-100 rounded-xl shadow-sm space-y-1">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 overflow-hidden">
                                  <FaFileAlt className="text-emerald-500 shrink-0" size={12}/>
                                  <span className="text-[10px] font-bold text-slate-700 truncate" title={file.name}>
                                    {file.name}
                                  </span>
                                </div>
                                <button 
                                  type="button" 
                                  onClick={() => handleRemoveFile(cat, idx)}
                                  className="text-slate-400 hover:text-rose-500 p-1 rounded-md transition-colors shrink-0"
                                >
                                  <FaTrash size={10}/>
                                </button>
                              </div>
                              <div className="text-[9px] font-semibold text-slate-400 bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded truncate" title={systemName}>
                                <span className="text-purple-600 font-bold">Системна назва:</span> {systemName}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </form>

          <div className="p-6 border-t border-slate-200 flex justify-between items-center bg-white shrink-0">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
              Всього файлів: <span className="text-slate-800">{totalFilesCount}</span>
            </span>
            <div className="flex gap-3">
              <button 
                type="button" onClick={onClose} disabled={isSubmitting}
                className="px-6 py-3 text-xs font-bold uppercase tracking-widest text-slate-500 hover:bg-slate-100 bg-slate-50 rounded-xl transition-colors disabled:opacity-50"
              >
                Скасувати
              </button>
              <button 
                onClick={handleSubmit}
                disabled={isSubmitting || totalFilesCount === 0}
                className="px-8 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-all flex items-center justify-center shadow-lg shadow-emerald-500/20 active:scale-95 disabled:opacity-50 gap-2"
              >
                {isSubmitting ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                ) : <><FaSave size={14}/> Зберегти</>}
              </button>
            </div>
          </div>

        </motion.div>
      </div>
    </AnimatePresence>
  );
}