import React, { useMemo, useState } from 'react';
import {
  FaArrowDown,
  FaCheckCircle,
  FaChevronDown,
  FaChevronLeft,
  FaChevronRight,
  FaChevronUp,
  FaFileExcel,
  FaFilter,
  FaMapMarkerAlt,
  FaWarehouse
} from 'react-icons/fa';
import * as XLSX from 'xlsx';

const WORKING_LOCATION_TYPES = ['warehouse'];

const locationTypeLabels = {
  warehouse: 'Склад'
};

// ДОДАНО: проп onOpenReserveDetails
export default function StockTab({ stockAvailable, searchTerm, onOpenMovementModal, onOpenReserveDetails }) {
  const [showFilters, setShowFilters] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [expandedProducts, setExpandedProducts] = useState({});
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const groupedStock = useMemo(() => {
    const groups = new Map();

    (stockAvailable || [])
      // ЗМІНЕНО: Пропускаємо склади АБО записи, де є резерв
      .filter(row => WORKING_LOCATION_TYPES.includes(row.location_type) || Number(row.reserved_stock) > 0)
      .forEach(row => {
        const key = row.product_id;
        const current = groups.get(key) || {
          product_id: row.product_id,
          product_name: row.product_name,
          custom_id: row.custom_id,
          sku: row.sku,
          unit: row.unit,
          category_name: row.category_name,
          product_type: row.product_type,
          physical_stock: 0,
          reserved_stock: 0,
          available_stock: 0,
          locations: []
        };

        const physical = Number(row.physical_stock || 0);
        const reserved = Number(row.reserved_stock || 0);
        const available = Number(row.available_stock || 0);

        current.physical_stock += physical;
        current.reserved_stock += reserved;
        current.available_stock += available;
        
        // Додаємо локацію тільки якщо вона справді є (щоб не плодити пусті рядки для віртуального резерву)
        if (row.location_id) {
          current.locations.push({
            ...row,
            physical_stock: physical,
            reserved_stock: reserved,
            available_stock: available
          });
        }

        groups.set(key, current);
      });

    return Array.from(groups.values()).sort((a, b) => {
      const byCategory = (a.category_name || '').localeCompare(b.category_name || '', 'uk');
      if (byCategory !== 0) return byCategory;
      return (a.product_name || '').localeCompare(b.product_name || '', 'uk');
    });
  }, [stockAvailable]);

  const categories = useMemo(
    () => [...new Set(groupedStock.map(s => s.category_name).filter(Boolean))],
    [groupedStock]
  );

  const filteredStock = groupedStock.filter(item => {
    const term = (searchTerm || '').toLowerCase();
    const matchesSearch = !term ||
      item.product_name?.toLowerCase().includes(term) ||
      item.sku?.toLowerCase().includes(term) ||
      item.locations.some(location => location.location_name?.toLowerCase().includes(term));

    const matchesStatus = filterStatus === 'all'
      ? true
      : filterStatus === 'available'
        ? item.available_stock > 0
        : filterStatus === 'reserved'
          ? item.reserved_stock > 0
          : item.available_stock <= 0;

    const matchesCategory = filterCategory === 'all' ? true : item.category_name === filterCategory;

    return matchesSearch && matchesStatus && matchesCategory;
  });

  const totalPages = Math.ceil(filteredStock.length / itemsPerPage);
  const visiblePage = Math.min(currentPage, totalPages || 1);
  const paginatedData = filteredStock.slice((visiblePage - 1) * itemsPerPage, visiblePage * itemsPerPage);

  const toggleProduct = (productId) => {
    setExpandedProducts(prev => ({ ...prev, [productId]: !prev[productId] }));
  };

  const handleExportStock = () => {
    if (filteredStock.length === 0) {
      alert('Немає даних для витягу.');
      return;
    }

    const exportRows = [];
    filteredStock.forEach(item => {
      exportRows.push({
        'Товар': item.product_name || '',
        'SKU': item.sku || item.custom_id || '',
        'Категорія': item.category_name || '',
        'Одиниця': item.unit || '',
        'Фізично всього': item.physical_stock,
        'Резерв всього': item.reserved_stock,
        'Вільно всього': item.available_stock,
        'Локація': 'Разом'
      });

      item.locations.forEach(location => {
        exportRows.push({
          'Товар': item.product_name || '',
          'SKU': item.sku || item.custom_id || '',
          'Категорія': item.category_name || '',
          'Одиниця': item.unit || '',
          'Фізично всього': location.physical_stock,
          'Резерв всього': location.reserved_stock,
          'Вільно всього': location.available_stock,
          'Локація': location.location_name || ''
        });
      });
    });

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Залишки');
    XLSX.writeFile(workbook, `Залишки_складу_${new Date().toLocaleDateString('uk-UA')}.xlsx`);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
            <FaWarehouse className="text-amber-500" /> Робочі залишки
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Показані тільки ваші склади. Об'єкти угод, постачальники, транзит і віртуальні локації не дублюють цю таблицю.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
          >
            <FaFilter /> Фільтри {showFilters ? <FaChevronUp /> : <FaChevronDown />}
          </button>
          <button
            onClick={handleExportStock}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-50 hover:bg-emerald-500 text-emerald-600 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-emerald-100"
          >
            <FaFileExcel /> Витяг
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in">
          <div>
            <label className="block text-[9px] font-black text-slate-400 uppercase mb-1 ml-1">Статус залишків</label>
            <select
              value={filterStatus}
              onChange={(e) => { setFilterStatus(e.target.value); setCurrentPage(1); }}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-amber-500"
            >
              <option value="all">Всі товари</option>
              <option value="available">Є вільний залишок</option>
              <option value="reserved">Є резерв</option>
              <option value="zero">Немає вільного залишку</option>
            </select>
          </div>
          <div>
            <label className="block text-[9px] font-black text-slate-400 uppercase mb-1 ml-1">Категорія</label>
            <select
              value={filterCategory}
              onChange={(e) => { setFilterCategory(e.target.value); setCurrentPage(1); }}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-amber-500"
            >
              <option value="all">Всі категорії</option>
              {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          </div>
        </div>
      )}

      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 text-[10px] uppercase tracking-widest text-slate-400">
              <th className="pb-4 font-black pl-2">Товар</th>
              <th className="pb-4 font-black text-center">Фізично</th>
              <th className="pb-4 font-black text-center">Резерв</th>
              <th className="pb-4 font-black text-center">Вільно</th>
              <th className="pb-4 font-black text-right pr-2">Склади</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {paginatedData.map((item) => {
              const isExpanded = !!expandedProducts[item.product_id];
              const hasNoFreeStock = item.available_stock <= 0;

              return (
                <React.Fragment key={item.product_id}>
                  <tr className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="py-4 pl-2">
                      <div className="font-bold text-slate-900">{item.product_name}</div>
                      <div className="text-[10px] font-mono text-slate-400">SKU: {item.sku || item.custom_id || '-'}</div>
                      {item.category_name && (
                        <div className="mt-1 text-[9px] font-black text-slate-400 uppercase">{item.category_name}</div>
                      )}
                    </td>

                    <td className="py-4 text-center font-black text-slate-800">
                      {item.physical_stock} <span className="text-[10px] text-slate-400">{item.unit}</span>
                    </td>
                    
                    {/* ЗМІНЕНО: Колонка резерву стала клікабельною кнопкою */}
                    <td className="py-4 text-center font-black text-amber-600">
                      {item.reserved_stock > 0 ? (
                        <button 
                          onClick={() => onOpenReserveDetails && onOpenReserveDetails(item.product_id)}
                          className="inline-flex items-center justify-center min-w-[32px] px-2 py-1 bg-amber-50 hover:bg-amber-500 hover:text-white text-amber-600 rounded-lg transition-colors shadow-sm"
                          title="Показати об'єкти"
                        >
                          {item.reserved_stock}
                        </button>
                      ) : (
                        <span className="text-slate-300">0</span>
                      )}
                    </td>
                    
                    <td className="py-4 text-center">
                      <span className={`inline-flex items-center justify-center min-w-[44px] py-1 px-3 rounded-lg font-black text-xs ${
                        hasNoFreeStock ? 'bg-rose-50 text-rose-600 border border-rose-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                      }`}>
                        {item.available_stock}
                      </span>
                    </td>
                    <td className="py-4 text-right pr-2">
                      <button
                        onClick={() => toggleProduct(item.product_id)}
                        disabled={item.locations.length === 0}
                        className="inline-flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors disabled:opacity-50"
                      >
                        {item.locations.length} {item.locations.length === 1 ? 'локація' : 'локації'}
                        {isExpanded ? <FaChevronUp size={10} /> : <FaChevronDown size={10} />}
                      </button>
                    </td>
                  </tr>

                  {isExpanded && item.locations.length > 0 && (
                    <tr className="border-b border-slate-100 bg-slate-50/70">
                      <td colSpan="5" className="p-0">
                        <div className="p-3 space-y-2">
                          {item.locations.map(location => (
                            <div
                              key={`${location.product_id}-${location.location_id}`}
                              className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <FaMapMarkerAlt className="text-slate-400 shrink-0" size={12} />
                                  <span className="font-bold text-slate-800 text-sm truncate">{location.location_name}</span>
                                  <span className="text-[9px] font-black uppercase text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                                    {locationTypeLabels[location.location_type] || location.location_type}
                                  </span>
                                </div>
                                <div className="mt-1 text-[10px] font-bold text-slate-500">
                                  Фізично: {location.physical_stock} | Резерв: {location.reserved_stock} | Вільно: {location.available_stock}
                                </div>
                              </div>

                              <div className="flex justify-end gap-2 shrink-0">
                                <button
                                  title="Прихід"
                                  onClick={() => onOpenMovementModal(location, 'receive')}
                                  className="p-2.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white rounded-xl transition-all shadow-sm active:scale-90"
                                >
                                  <FaArrowDown size={14} />
                                </button>
                                <button
                                  title="Інвентаризація"
                                  onClick={() => onOpenMovementModal(location, 'adjust')}
                                  className="p-2.5 bg-slate-900 text-white hover:bg-amber-500 hover:text-slate-900 rounded-xl transition-all shadow-sm active:scale-90"
                                >
                                  <FaCheckCircle size={14} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>

        {filteredStock.length === 0 && (
          <div className="py-16 text-center text-slate-400 font-bold text-xs uppercase tracking-widest border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50">
            Робочих залишків не знайдено
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-4 border-t border-slate-100">
          <div className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
            Стор <span className="text-slate-700">{visiblePage}</span> з {totalPages}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setCurrentPage(p => p - 1)} disabled={visiblePage === 1} className="p-2 bg-slate-100 rounded-lg disabled:opacity-30"><FaChevronLeft size={12} /></button>
            <button onClick={() => setCurrentPage(p => p + 1)} disabled={visiblePage === totalPages} className="p-2 bg-slate-100 rounded-lg disabled:opacity-30"><FaChevronRight size={12} /></button>
          </div>
        </div>
      )}
    </div>
  );
}