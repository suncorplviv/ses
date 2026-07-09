import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { FaBox, FaListUl, FaExchangeAlt, FaPlus, FaSearch, FaShoppingCart, FaWarehouse } from 'react-icons/fa';

// Імпортуємо модалки
import ProductModal from '../modals/ProductModal';
import StockMovementModal from '../modals/StockMovementModal';
import LocationModal from '../modals/LocationModal';
import PurchaseOrderModal from '../modals/PurchaseOrderModal';
import ReserveDetailsModal from '../modals/ReserveDetailsModal'; // ДОДАНО

// Імпортуємо компоненти-вкладки
import CatalogTab from './inventory-tabs/CatalogTab';
import StockTab from './inventory-tabs/StockTab';
import MovementsTab from './inventory-tabs/MovementsTab';
import PurchaseOrdersTab from './inventory-tabs/PurchaseOrdersTab';

export default function Inventory() {
  const [activeTab, setActiveTab] = useState('stock'); 
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Дані з БД
  const [products, setProducts] = useState([]);
  const [stockAvailable, setStockAvailable] = useState([]);
  const [movements, setMovements] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);

  // Стейти модалок
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  
  const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);
  const [selectedStockItem, setSelectedStockItem] = useState(null);
  const [movementAction, setMovementAction] = useState('receive');

  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);

  const [isPoModalOpen, setIsPoModalOpen] = useState(false);
  const [selectedPo, setSelectedPo] = useState(null);

  // Стейт нової модалки резервів (ДОДАНО)
  const [isReserveModalOpen, setIsReserveModalOpen] = useState(false);
  const [selectedReserveProductId, setSelectedReserveProductId] = useState(null);

  useEffect(() => {
    fetchInventoryData();
  }, [activeTab]);

  const fetchInventoryData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'catalog') {
        const { data, error } = await supabase.from('products').select(`*, product_categories(name)`).order('name');
        if (!error) setProducts(data || []);
        
      } else if (activeTab === 'stock') {
        const [{ data, error }, { data: minStockRows }] = await Promise.all([
          supabase
            .from('v_stock_available')
            .select('*')
            .order('category_name')
            .order('product_name')
            .order('location_name'),
          supabase.from('products').select('id, min_stock_quantity')
        ]);

        if (!error) {
          const minStockByProduct = {};
          (minStockRows || []).forEach(p => { minStockByProduct[p.id] = Number(p.min_stock_quantity || 0); });
          const enriched = (data || []).map(row => ({
            ...row,
            min_stock_quantity: minStockByProduct[row.product_id] || 0
          }));
          setStockAvailable(enriched);
        }

      } else if (activeTab === 'movements') {
        const { data, error } = await supabase
          .from('stock_movements')
          .select(`
            *,
            products(name, sku, unit),
            users(full_name),
            deals(custom_id),
            sales(custom_id, clients(name)),
            from_location:stock_locations!stock_movements_from_location_id_fkey(name),
            to_location:stock_locations!stock_movements_to_location_id_fkey(name)
          `)
          .order('created_at', { ascending: false })
          .limit(100);
        if (!error) setMovements(data || []);
        
      } else if (activeTab === 'purchase_orders') {
        const { data, error } = await supabase
          .from('purchase_orders')
          .select(`
            *,
            suppliers(name),
            destination_location:stock_locations!purchase_orders_destination_location_id_fkey(name)
          `)
          .order('created_at', { ascending: false });
        if (!error) setPurchaseOrders(data || []);
      }
    } catch (error) {
      console.error("Помилка завантаження даних:", error);
    } finally {
      setLoading(false);
    }
  };

  // Хендлери для відкриття модалок
  const handleOpenProductModal = (product = null) => {
    setSelectedProduct(product);
    setIsProductModalOpen(true);
  };

  const handleOpenMovementModal = (item, actionType) => {
    setSelectedStockItem(item);
    setMovementAction(actionType);
    setIsMovementModalOpen(true);
  };

  const handleOpenLocationModal = (location = null) => {
    setSelectedLocation(location);
    setIsLocationModalOpen(true);
  };

  const handleOpenPoModal = (po = null) => {
    setSelectedPo(po);
    setIsPoModalOpen(true);
  };

  // Хендлер для відкриття резервів (ДОДАНО)
  const handleOpenReserveModal = (productId) => {
    setSelectedReserveProductId(productId);
    setIsReserveModalOpen(true);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 px-4 sm:px-6 lg:px-8 py-6 md:py-8 space-y-6">
      
      {/* ПАНЕЛЬ КЕРУВАННЯ */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm shrink-0">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-6">
          <h1 className="text-xl md:text-2xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-3">
            <div className="p-2.5 bg-slate-900 text-amber-500 rounded-xl shadow-lg shadow-slate-900/20"><FaBox size={20}/></div>
            Склад та Номенклатура
          </h1>

          <div className="flex w-full lg:w-auto items-center gap-3">
            <div className="relative w-full lg:w-64">
              <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" placeholder="Пошук..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all"/>
            </div>
            
            {activeTab === 'catalog' && (
              <button onClick={() => handleOpenProductModal()} className="bg-amber-500 hover:bg-amber-400 text-slate-900 px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center gap-2 shadow-lg shadow-amber-500/20 whitespace-nowrap">
                <FaPlus size={14} /> Додати товар
              </button>
            )}
            
            {activeTab === 'stock' && (
              <button onClick={() => handleOpenLocationModal()} className="bg-slate-900 hover:bg-slate-800 text-white px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center gap-2 shadow-lg shadow-slate-900/20 whitespace-nowrap">
                <FaWarehouse size={14} /> Додати склад / постачальника
              </button>
            )}

            {activeTab === 'purchase_orders' && (
              <button onClick={() => handleOpenPoModal()} className="bg-slate-900 hover:bg-slate-800 text-white px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center gap-2 shadow-lg shadow-slate-900/20 whitespace-nowrap">
                <FaPlus size={14} /> Створити замовлення
              </button>
            )}
          </div>
        </div>

        {/* НАВІГАЦІЯ ТАБІВ */}
        <div className="flex bg-slate-100 p-1.5 rounded-2xl overflow-x-auto custom-scrollbar">
          {[
            { id: 'catalog', icon: <FaListUl />, label: 'Каталог обладнання' },
            { id: 'stock', icon: <FaBox />, label: 'Залишки на складі' },
            { id: 'purchase_orders', icon: <FaShoppingCart />, label: 'Закупівлі (PO)' },
            { id: 'movements', icon: <FaExchangeAlt />, label: 'Рух товарів' }
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 text-xs font-black uppercase tracking-widest rounded-xl transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}>
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* КОНТЕНТНА ЧАСТИНА (РЕНДЕР ВКЛАДОК) */}
      <div className="flex-1 bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        {loading ? (
          <div className="flex-1 flex items-center justify-center"><div className="text-slate-400 font-bold uppercase tracking-widest text-sm animate-pulse">Завантаження...</div></div>
        ) : (
          <div className="flex-1 overflow-auto custom-scrollbar p-6">
            {activeTab === 'catalog' && (
              <CatalogTab products={products} searchTerm={searchTerm} onOpenProductModal={handleOpenProductModal} />
            )}
            {activeTab === 'stock' && (
              <StockTab 
                stockAvailable={stockAvailable} 
                searchTerm={searchTerm} 
                onOpenMovementModal={handleOpenMovementModal} 
                onOpenReserveDetails={handleOpenReserveModal} // ДОДАНО
              />
            )}
            {activeTab === 'purchase_orders' && (
              <PurchaseOrdersTab purchaseOrders={purchaseOrders} searchTerm={searchTerm} onOpenPoModal={handleOpenPoModal} />
            )}
            {activeTab === 'movements' && (
              <MovementsTab movements={movements} searchTerm={searchTerm} />
            )}
          </div>
        )}
      </div>

      {/* Рендер модалок */}
      {isProductModalOpen && (
        <ProductModal isOpen={isProductModalOpen} onClose={() => setIsProductModalOpen(false)} productToEdit={selectedProduct} onSaveSuccess={fetchInventoryData} />
      )}
      
      {isMovementModalOpen && (
        <StockMovementModal isOpen={isMovementModalOpen} onClose={() => setIsMovementModalOpen(false)} stockItem={selectedStockItem} actionType={movementAction} onSaveSuccess={fetchInventoryData} />
      )}
      
      {isLocationModalOpen && (
        <LocationModal isOpen={isLocationModalOpen} onClose={() => setIsLocationModalOpen(false)} locationToEdit={selectedLocation} onSaveSuccess={fetchInventoryData} />
      )}

      {isPoModalOpen && (
        <PurchaseOrderModal isOpen={isPoModalOpen} onClose={() => setIsPoModalOpen(false)} poToEdit={selectedPo} onSaveSuccess={fetchInventoryData} />
      )}

      {/* Рендер нової модалки резервів (ДОДАНО) */}
      {isReserveModalOpen && (
        <ReserveDetailsModal 
          isOpen={isReserveModalOpen} 
          onClose={() => setIsReserveModalOpen(false)} 
          productId={selectedReserveProductId} 
        />
      )}
    </div>
  );
}