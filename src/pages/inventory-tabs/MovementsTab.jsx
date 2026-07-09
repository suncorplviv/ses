import React, { useState } from 'react';
import { 
  FaArrowDown, FaArrowUp, FaFileExcel, FaFilter, FaHistory, 
  FaClipboardList, FaChevronLeft, FaChevronRight 
} from 'react-icons/fa';
import * as XLSX from 'xlsx';

const movementLabels = {
  receive: 'Прихід',
  transfer: 'Переміщення',
  issue_to_deal: 'Видача на об\'єкт',
  return: 'Повернення',
  write_off: 'Списання',
  adjustment: 'Інвентаризація',
  in: 'Прихід',
  out: 'Видача',
  sale: 'Продаж',
  sale_return: 'Повернення з продажу'
};

const isOutgoingMovement = (type) => ['out', 'write_off', 'issue_to_deal', 'sale'].includes(type);
const isIncomingMovement = (type) => ['in', 'receive', 'return', 'sale_return'].includes(type);
const isNeutralMovement = (type) => ['transfer', 'adjustment'].includes(type);

export default function MovementsTab({ movements, searchTerm }) {
  // Стейти для фільтрів
  const [filterType, setFilterType] = useState('all'); 
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Стейт для пагінації
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Логіка фільтрації
  const filteredMovements = movements.filter(m => {
    const term = (searchTerm || '').toLowerCase();
    const matchSearch = term === '' || 
      m.products?.name?.toLowerCase().includes(term) ||
      m.products?.sku?.toLowerCase().includes(term) ||
      m.document_number?.toLowerCase().includes(term) ||
      m.deals?.custom_id?.toString().includes(term) ||
      m.from_location?.name?.toLowerCase().includes(term) ||
      m.to_location?.name?.toLowerCase().includes(term) ||
      m.sales?.clients?.name?.toLowerCase().includes(term);

    const isOut = isOutgoingMovement(m.movement_type);
    const matchType = filterType === 'all' 
      ? true 
      : (filterType === 'in' && isIncomingMovement(m.movement_type))
        || (filterType === 'out' && isOut)
        || (filterType === 'other' && isNeutralMovement(m.movement_type));

    const movementDate = new Date(m.created_at);
    const matchDateFrom = !dateFrom ? true : movementDate >= new Date(dateFrom);
    
    let matchDateTo = true;
    if (dateTo) {
      const endOfDay = new Date(dateTo);
      endOfDay.setHours(23, 59, 59, 999);
      matchDateTo = movementDate <= endOfDay;
    }

    return matchSearch && matchType && matchDateFrom && matchDateTo;
  });

  // Логіка пагінації (розраховуємо скільки сторінок і які елементи показувати)
  const totalPages = Math.ceil(filteredMovements.length / itemsPerPage);
  const visiblePage = Math.min(currentPage, totalPages || 1);
  
  const paginatedMovements = filteredMovements.slice(
    (visiblePage - 1) * itemsPerPage,
    visiblePage * itemsPerPage
  );

  // Експорт в Excel (експортуємо ВСІ відфільтровані дані, а не тільки одну сторінку!)
  const handleExportExcel = () => {
    if (filteredMovements.length === 0) {
      alert("Немає даних для експорту!");
      return;
    }

    const exportData = filteredMovements.map(m => ({
      'Дата і час': new Date(m.created_at).toLocaleString('uk-UA'),
      'Тип операції': movementLabels[m.movement_type] || m.movement_type,
      'Товар': m.products?.name || 'Невідомий товар',
      'SKU': m.products?.sku || '-',
      'Кількість': `${isOutgoingMovement(m.movement_type) ? '-' : isNeutralMovement(m.movement_type) ? '' : '+'}${m.quantity}`,
      'Угода / Продаж': m.deals ? `СЕС №${m.deals.custom_id}` : m.sales ? `Продаж №${m.sales.custom_id}` : '-',
      'Звідки': m.from_location?.name || (m.movement_type === 'sale_return' ? `Клієнт: ${m.sales?.clients?.name || ''}` : '-'),
      'Куди': m.to_location?.name || (m.movement_type === 'sale' ? `Клієнт: ${m.sales?.clients?.name || ''}` : '-'),
      'Документ': m.document_number || '-',
      'Відповідальний': m.users?.full_name || 'Система',
      'Коментар': m.notes || '-'
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Історія_Руху");

    const fileName = `Рух_товарів_${new Date().toLocaleDateString('uk-UA')}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  return (
    <div className="space-y-6 flex flex-col h-full">
      
      {/* ПАНЕЛЬ ФІЛЬТРІВ */}
      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex flex-col xl:flex-row gap-4 items-end xl:items-center justify-between shrink-0">
        <div className="flex flex-col md:flex-row gap-4 w-full xl:w-auto">
          <div className="flex-1 md:flex-none">
            <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1 flex items-center gap-1.5"><FaFilter/> Тип операції</label>
            <select 
              value={filterType} onChange={(e) => { setFilterType(e.target.value); setCurrentPage(1); }}
              className="w-full md:w-48 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:border-amber-500 cursor-pointer"
            >
              <option value="all">Всі операції</option>
              <option value="in">Тільки Прихід</option>
              <option value="out">Видача / Списання</option>
              <option value="other">Переміщення / Інвентаризація</option>
            </select>
          </div>

          <div className="flex gap-2 w-full md:w-auto">
            <div className="flex-1 md:w-40">
              <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Від</label>
              <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setCurrentPage(1); }} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:border-amber-500 cursor-pointer"/>
            </div>
            <div className="flex-1 md:w-40">
              <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">До</label>
              <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setCurrentPage(1); }} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:border-amber-500 cursor-pointer"/>
            </div>
          </div>
        </div>

        <button 
          onClick={handleExportExcel}
          className="w-full xl:w-auto px-6 py-2.5 bg-emerald-50 hover:bg-emerald-500 text-emerald-600 hover:text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 border border-emerald-200 hover:border-emerald-500 shadow-sm active:scale-95"
        >
          <FaFileExcel size={14} /> В Excel
        </button>
      </div>

      {/* КОНТЕЙНЕР ТАБЛИЦІ (щоб кнопки пагінації завжди були внизу) */}
      <div className="flex-1 flex flex-col justify-between overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-[10px] uppercase tracking-widest text-slate-400">
                <th className="pb-4 font-black pl-2">Дата і Час</th>
                <th className="pb-4 font-black">Операція</th>
                <th className="pb-4 font-black">Товар</th>
                <th className="pb-4 font-black text-center">К-сть</th>
                <th className="pb-4 font-black">Документ / Об'єкт</th>
                <th className="pb-4 font-black text-right pr-2">Відповідальний</th>
              </tr>
            </thead>
            <tbody className="text-sm font-medium text-slate-700">
              {paginatedMovements.map(m => {
                const isOut = isOutgoingMovement(m.movement_type);
                const isNeutral = isNeutralMovement(m.movement_type);
                const label = movementLabels[m.movement_type] || m.movement_type;
                return (
                  <tr key={m.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors group">
                    <td className="py-4 pl-2">
                      <div className="font-bold text-slate-800">
                        {new Date(m.created_at).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {new Date(m.created_at).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td className="py-4">
                      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${
                        isNeutral ? 'bg-sky-50 text-sky-600' : isOut ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'
                      }`}>
                        {isOut ? <FaArrowUp size={10} /> : <FaArrowDown size={10} />}
                        {label}
                      </div>
                    </td>
                    <td className="py-4">
                      <div className="font-bold text-slate-900 group-hover:text-amber-600 transition-colors line-clamp-1">{m.products?.name}</div>
                      {m.products?.sku && <div className="text-[10px] text-slate-400 font-mono mt-0.5">SKU: {m.products.sku}</div>}
                    </td>
                    <td className="py-4 text-center">
                      <span className={`inline-block px-3 py-1 rounded-lg font-black text-sm ${
                        isNeutral ? 'bg-sky-100 text-sky-700' : isOut ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {isOut ? '-' : isNeutral ? '' : '+'}{m.quantity}
                      </span>
                    </td>
                    <td className="py-4">
                      {m.deals ? (
                        <div className="text-xs font-bold text-amber-600 bg-amber-50 inline-block px-2 py-1 rounded">
                          СЕС №{m.deals.custom_id}
                        </div>
                      ) : m.sales ? (
                        <div className="text-xs font-bold text-emerald-600 bg-emerald-50 inline-block px-2 py-1 rounded">
                          Продаж №{m.sales.custom_id}
                        </div>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                      {m.document_number && (
                        <div className="text-[10px] font-mono text-slate-500 mt-1 flex items-center gap-1">
                           <FaClipboardList /> {m.document_number}
                        </div>
                      )}
                      {m.movement_type === 'sale' ? (
                        <div className="text-[10px] font-bold text-slate-400 mt-1">
                          {m.from_location?.name || 'Склад'} → Клієнт: {m.sales?.clients?.name || '—'}
                        </div>
                      ) : m.movement_type === 'sale_return' ? (
                        <div className="text-[10px] font-bold text-slate-400 mt-1">
                          Клієнт: {m.sales?.clients?.name || '—'} → {m.to_location?.name || 'Склад'}
                        </div>
                      ) : (m.from_location?.name || m.to_location?.name) && (
                        <div className="text-[10px] font-bold text-slate-400 mt-1">
                          {m.from_location?.name || 'Постачальник'} → {m.to_location?.name || 'Списано'}
                        </div>
                      )}
                    </td>
                    <td className="py-4 text-right pr-2">
                      <div className="text-xs font-bold text-slate-600">{m.users?.full_name || 'Система'}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filteredMovements.length === 0 && (
            <div className="py-20 flex flex-col items-center justify-center text-slate-400 bg-slate-50/50 rounded-3xl border-2 border-dashed border-slate-200 mt-4">
              <div className="p-4 bg-white rounded-2xl shadow-sm mb-4"><FaHistory size={32} className="opacity-20"/></div>
              <p className="font-black uppercase text-xs tracking-widest">Операцій не знайдено</p>
              <p className="text-[10px] font-bold mt-1 text-center px-4">
                За вашим запитом та обраними фільтрами нічого не знайдено.
              </p>
            </div>
          )}
        </div>

        {/* ПАГІНАЦІЯ */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-100 shrink-0">
            <div className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
              Сторінка <span className="text-slate-700 bg-slate-100 px-2 py-1 rounded-md">{visiblePage}</span> з {totalPages}
            </div>
            
            <div className="flex gap-2">
              <button 
                onClick={() => setCurrentPage(p => p - 1)} 
                disabled={visiblePage === 1}
                className="flex items-center gap-2 px-4 py-2 bg-slate-50 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-amber-50 hover:text-amber-600 transition-colors disabled:opacity-50 disabled:hover:bg-slate-50 disabled:hover:text-slate-600"
              >
                <FaChevronLeft size={10} /> Попередня
              </button>
              
              <button 
                onClick={() => setCurrentPage(p => p + 1)} 
                disabled={visiblePage === totalPages}
                className="flex items-center gap-2 px-4 py-2 bg-slate-50 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-amber-50 hover:text-amber-600 transition-colors disabled:opacity-50 disabled:hover:bg-slate-50 disabled:hover:text-slate-600"
              >
                Наступна <FaChevronRight size={10} />
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
