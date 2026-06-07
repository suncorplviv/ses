import React from 'react';

export default function CatalogTab({ products, searchTerm, onOpenProductModal }) {
  const filteredProducts = products.filter(p => 
    p.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.sku?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <table className="w-full text-left border-collapse">
      <thead>
        <tr className="border-b border-slate-200 text-[10px] uppercase tracking-widest text-slate-400">
          <th className="pb-3 font-black">Артикул / Назва</th>
          <th className="pb-3 font-black">Категорія</th>
          <th className="pb-3 font-black">Собівартість</th>
          <th className="pb-3 font-black text-right">Дії</th>
        </tr>
      </thead>
      <tbody className="text-sm font-medium text-slate-700">
        {filteredProducts.map(p => (
          <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
            <td className="py-4">
              <div className="flex flex-col">
                <span className="font-bold text-slate-900">{p.name}</span>
                <span className="text-[10px] text-slate-400 font-mono">SKU: {p.sku || p.custom_id || 'Не задано'}</span>
              </div>
            </td>
            <td className="py-4">
              <span className="bg-slate-100 px-2.5 py-1 rounded-lg text-xs font-bold text-slate-600">
                {p.product_categories?.name || 'Без категорії'}
              </span>
            </td>
            <td className="py-4 font-black text-emerald-600">${p.cost_price || '0.00'}</td>
            <td className="py-4 text-right">
              <button 
                onClick={() => onOpenProductModal(p)}
                className="text-amber-500 hover:text-amber-600 text-xs font-bold uppercase tracking-widest"
              >
                Редагувати
              </button>
            </td>
          </tr>
        ))}
        {filteredProducts.length === 0 && (
          <tr>
            <td colSpan="4" className="text-center py-10 text-slate-400 font-bold text-xs uppercase tracking-widest">
              Каталог порожній
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}