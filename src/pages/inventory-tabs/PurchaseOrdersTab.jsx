import React, { useState, useMemo } from 'react';
import { 
  FaFileInvoice, FaBuilding, FaMapMarkerAlt, FaTruckLoading, 
  FaChevronLeft, FaChevronRight, FaFileExcel, FaFilter, 
  FaChevronDown, FaChevronUp 
} from 'react-icons/fa';
import * as XLSX from 'xlsx';

const statusLabels = {
  draft: { label: 'Чернетка', color: 'bg-slate-100 text-slate-600 border-slate-200' },
  ordered: { label: 'Очікується', color: 'bg-sky-100 text-sky-700 border-sky-200' },
  pending: { label: 'Очікується', color: 'bg-sky-100 text-sky-700 border-sky-200' },
  partially_received: { label: 'Частково отримано', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  received: { label: 'Виконано', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  cancelled: { label: 'Скасовано', color: 'bg-rose-100 text-rose-700 border-rose-200' }
};

const paymentStatusLabels = {
  unpaid: { label: 'Неоплачено', color: 'bg-rose-50 text-rose-600 border-rose-100' },
  realization: { label: 'Під реалізацію', color: 'bg-purple-50 text-purple-600 border-purple-100' },
  advance: { label: 'Аванс', color: 'bg-sky-50 text-sky-600 border-sky-100' },
  partial: { label: 'Часткова оплата', color: 'bg-amber-50 text-amber-600 border-amber-100' },
  paid: { label: 'Оплачено повністю', color: 'bg-emerald-50 text-emerald-600 border-emerald-100' }
};

export default function PurchaseOrdersTab({ purchaseOrders, searchTerm, onOpenPoModal }) {
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Стейти для фільтрів
  const [showFilters, setShowFilters] = useState(false);
  const [filterPaymentStatus, setFilterPaymentStatus] = useState('all');
  const [filterSupplier, setFilterSupplier] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Отримуємо унікальних постачальників для розумного пошуку-підказки
  const uniqueSuppliers = useMemo(() => {
    const map = new Map();
    (purchaseOrders || []).forEach(po => {
      if (po.suppliers?.name) map.set(po.suppliers.name, po.suppliers.name);
    });
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b, 'uk'));
  }, [purchaseOrders]);

  // Загальна фільтрація
  const filteredOrders = (purchaseOrders || []).filter(po => {
    // 1. Пошук з головної панелі (по номерах)
    const term = (searchTerm || '').toLowerCase();
    const matchesGlobalSearch = !term || 
           po.document_number?.toLowerCase().includes(term) || 
           po.supplier_document_number?.toLowerCase().includes(term);

    // 2. Фільтр за статусом оплати
    const matchesPayment = filterPaymentStatus === 'all' || po.payment_status === filterPaymentStatus;

    // 3. Фільтр за постачальником
    const suppTerm = filterSupplier.toLowerCase();
    const matchesSupplier = !suppTerm || (po.suppliers?.name || '').toLowerCase().includes(suppTerm);

    // 4. Фільтр по датах (created_at)
    const poDate = new Date(po.created_at);
    const matchesDateFrom = !dateFrom ? true : poDate >= new Date(dateFrom);
    
    let matchesDateTo = true;
    if (dateTo) {
      const endOfDay = new Date(dateTo);
      endOfDay.setHours(23, 59, 59, 999);
      matchesDateTo = poDate <= endOfDay;
    }

    return matchesGlobalSearch && matchesPayment && matchesSupplier && matchesDateFrom && matchesDateTo;
  });

  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);
  const visiblePage = Math.min(currentPage, totalPages || 1);
  const paginatedOrders = filteredOrders.slice((visiblePage - 1) * itemsPerPage, visiblePage * itemsPerPage);

  // Функція витягу в Excel
  const handleExportExcel = () => {
    if (filteredOrders.length === 0) {
      alert("Немає даних для експорту!");
      return;
    }

    const headers = [
      'Внутрішній номер', 'Документ постачальника', 'Дата створення', 'Постачальник', 
      'Тип доставки', 'Локація', 'Всього ($)', 'Сплачено ($)', 'Курс валют', 
      'Всього (₴)', 'Сплачено (₴)', 'Статус оплати', 'Статус доставки'
    ];

    let sumTotalUsd = 0;
    let sumPaidUsd = 0;
    let sumTotalUah = 0;
    let sumPaidUah = 0;

    const dataRows = filteredOrders.map(po => {
      const totalUsd = Number(po.total_amount || 0);
      const paidUsd = Number(po.amount_paid || 0);
      const totalUah = Number(po.total_amount_uah || 0);
      const paidUah = Number(po.amount_paid_uah || 0);

      sumTotalUsd += totalUsd;
      sumPaidUsd += paidUsd;
      sumTotalUah += totalUah;
      sumPaidUah += paidUah;

      return [
        po.document_number || `PO-${po.id.substring(0,6).toUpperCase()}`,
        po.supplier_document_number || '-',
        new Date(po.created_at).toLocaleDateString('uk-UA'),
        po.suppliers?.name || 'Невідомий',
        po.delivery_type === 'direct_to_site' ? 'Прямо на об\'єкт' : 'На склад',
        po.destination_location?.name || '-',
        totalUsd,
        paidUsd,
        Number(po.exchange_rate || 0),
        totalUah,
        paidUah,
        paymentStatusLabels[po.payment_status]?.label || po.payment_status,
        statusLabels[po.status]?.label || po.status
      ];
    });

    const emptyRow = Array(13).fill('');
    const totalsRow = [
      'ВСЬОГО / ПІДСУМОК:', '', '', '', '', '', 
      sumTotalUsd, sumPaidUsd, '', sumTotalUah, sumPaidUah, '', ''
    ];

    const worksheetData = [headers, ...dataRows, emptyRow, totalsRow];
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

    worksheet['!cols'] = [
      { wch: 16 }, { wch: 22 }, { wch: 15 }, { wch: 30 }, 
      { wch: 18 }, { wch: 25 }, { wch: 12 }, { wch: 12 }, 
      { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 20 }
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Закупівлі (PO)");
    const fileName = `Реєстр_закупівель_${new Date().toLocaleDateString('uk-UA')}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  return (
    <div className="flex flex-col h-full space-y-4">
      
      {/* ПАНЕЛЬ ІНСТРУМЕНТІВ: Фільтри та Excel */}
      <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div>
          <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
            Реєстр Закупівель
          </h2>
          <p className="text-[10px] text-slate-500 mt-1 uppercase font-bold tracking-widest">
            Всього знайдено: {filteredOrders.length}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
              showFilters ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            <FaFilter /> Фільтри {showFilters ? <FaChevronUp /> : <FaChevronDown />}
          </button>
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-50 hover:bg-emerald-500 text-emerald-600 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-emerald-200 hover:border-emerald-500 shadow-sm active:scale-95"
          >
            <FaFileExcel size={12} /> В Excel
          </button>
        </div>
      </div>

      {/* БЛОК ФІЛЬТРІВ */}
      {showFilters && (
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl animate-fade-in shrink-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-[9px] font-black text-slate-400 uppercase mb-1.5 ml-1">Статус оплати</label>
              <select
                value={filterPaymentStatus}
                onChange={(e) => { setFilterPaymentStatus(e.target.value); setCurrentPage(1); }}
                className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-amber-500 cursor-pointer transition-colors"
              >
                <option value="all">Всі статуси</option>
                <option value="unpaid">Неоплачені</option>
                <option value="advance">Аванс</option>
                <option value="partial">Часткова оплата</option>
                <option value="realization">Під реалізацію</option>
                <option value="paid">Оплачено повністю</option>
              </select>
            </div>
            
            <div>
              <label className="block text-[9px] font-black text-slate-400 uppercase mb-1.5 ml-1">Постачальник</label>
              <input
                type="text"
                list="suppliers-list"
                placeholder="Почніть вводити назву..."
                value={filterSupplier}
                onChange={(e) => { setFilterSupplier(e.target.value); setCurrentPage(1); }}
                className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-amber-500 transition-colors"
              />
              <datalist id="suppliers-list">
                {uniqueSuppliers.map(name => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="block text-[9px] font-black text-slate-400 uppercase mb-1.5 ml-1">Від дати</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setCurrentPage(1); }}
                className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-amber-500 transition-colors cursor-pointer"
              />
            </div>

            <div>
              <label className="block text-[9px] font-black text-slate-400 uppercase mb-1.5 ml-1">До дати</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setCurrentPage(1); }}
                className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-amber-500 transition-colors cursor-pointer"
              />
            </div>
          </div>
        </div>
      )}

      {/* ТАБЛИЦЯ */}
      <div className="flex-1 overflow-auto custom-scrollbar bg-white rounded-2xl border border-slate-200">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-white z-10 shadow-sm">
            <tr className="border-b border-slate-200 text-[10px] uppercase tracking-widest text-slate-400">
              <th className="py-4 px-4 font-black text-left">Замовлення</th>
              <th className="py-4 px-4 font-black text-left">Постачальник</th>
              <th className="py-4 px-4 font-black text-left">Фінанси та Оплата</th>
              <th className="py-4 px-4 font-black text-center">Статус доставки</th>
              <th className="py-4 px-4 font-black text-right">Дії</th>
            </tr>
          </thead>
          <tbody className="text-sm font-medium text-slate-700 divide-y divide-slate-100">
            {paginatedOrders.map(po => {
              const statusInfo = statusLabels[po.status] || statusLabels.draft;
              const payStatusInfo = paymentStatusLabels[po.payment_status] || paymentStatusLabels.unpaid;
              const isDirect = po.delivery_type === 'direct_to_site';

              return (
                <tr key={po.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="py-4 px-4 text-left">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${po.status === 'received' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-700'}`}>
                        <FaFileInvoice size={16} />
                      </div>
                      <div>
                        <span className="font-bold text-slate-900 block">{po.document_number || `PO-${po.id.substring(0,6).toUpperCase()}`}</span>
                        {po.supplier_document_number && (
                          <span className="text-[9px] font-black text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded mt-1 block w-fit">
                            Дог/Інв: {po.supplier_document_number}
                          </span>
                        )}
                        <span className="text-[10px] text-slate-400 font-mono mt-1 block">
                          {new Date(po.created_at).toLocaleDateString('uk-UA')}
                        </span>
                      </div>
                    </div>
                  </td>
                  
                  <td className="py-4 px-4 text-left">
                    <div className="flex items-center gap-1.5 font-bold text-slate-800">
                      <FaBuilding className="text-slate-400" size={12}/> {po.suppliers?.name || 'Невідомий'}
                    </div>
                    <div className="mt-2 flex flex-col gap-1">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 w-fit rounded text-[9px] font-black uppercase tracking-widest border ${isDirect ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                        {isDirect ? <FaMapMarkerAlt size={8}/> : <FaTruckLoading size={8}/>}
                        {isDirect ? 'На об\'єкт' : 'На склад'}
                      </span>
                    </div>
                  </td>

                  <td className="py-4 px-4 text-left">
                    <div className="flex flex-col gap-1">
                      <div className="text-xs font-black text-slate-900">
                        ${Number(po.total_amount || 0).toLocaleString()} <span className="text-[10px] font-bold text-slate-400">/ спл. ${Number(po.amount_paid || 0).toLocaleString()}</span>
                      </div>
                      {po.total_amount_uah > 0 && (
                        <div className="text-[10px] text-slate-500 font-bold mt-0.5">
                          {Number(po.total_amount_uah).toLocaleString()} ₴ <span className="text-[9px] font-medium text-slate-400">/ спл. {Number(po.amount_paid_uah || 0).toLocaleString()} ₴</span>
                        </div>
                      )}
                      <div className="mt-1.5">
                        <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest border shadow-sm ${payStatusInfo.color}`}>
                          {payStatusInfo.label}
                        </span>
                      </div>
                    </div>
                  </td>

                  <td className="py-4 px-4 text-center">
                    <span className={`inline-block px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border shadow-sm ${statusInfo.color}`}>
                      {statusInfo.label}
                    </span>
                  </td>
                  
                  <td className="py-4 px-4 text-right">
                    <button 
                      onClick={() => onOpenPoModal(po)}
                      className="text-slate-600 hover:text-slate-900 text-xs font-bold uppercase tracking-widest transition-colors px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl"
                    >
                      Деталі
                    </button>
                  </td>
                </tr>
              );
            })}
            {filteredOrders.length === 0 && (
              <tr>
                <td colSpan="5" className="text-center py-16 text-slate-400 font-bold text-xs uppercase tracking-widest border-2 border-dashed border-slate-100 m-4 rounded-xl">
                  Замовлень за обраними фільтрами не знайдено
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ПАГІНАЦІЯ */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2 shrink-0">
          <div className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
            Сторінка <span className="text-slate-700 bg-slate-100 px-2 py-1 rounded-md">{visiblePage}</span> з {totalPages}
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => setCurrentPage(p => p - 1)} disabled={visiblePage === 1}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-amber-50 hover:text-amber-600 hover:border-amber-200 transition-all disabled:opacity-50 shadow-sm"
            >
              <FaChevronLeft size={10} /> Попередня
            </button>
            <button 
              onClick={() => setCurrentPage(p => p + 1)} disabled={visiblePage === totalPages}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-amber-50 hover:text-amber-600 hover:border-amber-200 transition-all disabled:opacity-50 shadow-sm"
            >
              Наступна <FaChevronRight size={10} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}