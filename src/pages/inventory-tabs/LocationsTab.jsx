import React from 'react';
import { FaWarehouse, FaHardHat, FaTruck, FaGlobe, FaBox } from 'react-icons/fa';

const locationTypes = {
  warehouse: { label: 'Фізичний склад', icon: <FaWarehouse />, color: 'text-emerald-600 bg-emerald-50' },
  crew: { label: 'Бригада (Авто)', icon: <FaHardHat />, color: 'text-amber-600 bg-amber-50' },
  transit: { label: 'Транзит / В дорозі', icon: <FaTruck />, color: 'text-slate-600 bg-slate-100' },
  supplier: { label: 'Постачальник', icon: <FaGlobe />, color: 'text-indigo-600 bg-indigo-50' },
  virtual: { label: 'Віртуальна', icon: <FaGlobe />, color: 'text-slate-500 bg-slate-50' }
};

export default function LocationsTab({ locations, searchTerm, onOpenLocationModal }) {
  // Фільтруємо: прибираємо об'єкти угод (project_site) і шукаємо по назві
  const filteredLocations = (locations || [])
    .filter(l => l.type !== 'project_site')
    .filter(l => l.name?.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <table className="w-full text-left border-collapse">
      <thead>
        <tr className="border-b border-slate-200 text-[10px] uppercase tracking-widest text-slate-400">
          <th className="pb-3 font-black pl-2">Назва локації</th>
          <th className="pb-3 font-black">Тип</th>
          <th className="pb-3 font-black">Статус</th>
          <th className="pb-3 font-black text-right pr-2">Дії</th>
        </tr>
      </thead>
      <tbody className="text-sm font-medium text-slate-700">
        {filteredLocations.map(l => {
          const typeInfo = locationTypes[l.type] || locationTypes.virtual;
          return (
            <tr key={l.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
              <td className="py-4 pl-2">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${typeInfo.color}`}>
                    {typeInfo.icon}
                  </div>
                  <div className="flex flex-col">
                    <span className="font-bold text-slate-900">{l.name}</span>
                    {l.notes && <span className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">{l.notes}</span>}
                  </div>
                </div>
              </td>
              <td className="py-4">
                <span className="text-xs font-bold text-slate-600">{typeInfo.label}</span>
              </td>
              <td className="py-4">
                {l.is_default && (
                  <span className="bg-amber-100 text-amber-700 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border border-amber-200">
                    Основний склад
                  </span>
                )}
                {!l.is_active && (
                  <span className="bg-rose-50 text-rose-600 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border border-rose-100 ml-2">
                    Архів
                  </span>
                )}
              </td>
              <td className="py-4 text-right pr-2">
                <button 
                  onClick={() => onOpenLocationModal(l)}
                  className="text-amber-500 hover:text-amber-600 text-xs font-bold uppercase tracking-widest transition-colors"
                >
                  Редагувати
                </button>
              </td>
            </tr>
          );
        })}
        {filteredLocations.length === 0 && (
          <tr>
            <td colSpan="4" className="text-center py-10 text-slate-400 font-bold text-xs uppercase tracking-widest">
              Локацій не знайдено
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}