import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthProvider';
import { 
  FaMoneyBillWave, FaTimes, FaPlus, FaCheckCircle, 
  FaWallet, FaCalendarAlt, FaCoins, FaHandHoldingUsd,
  FaExclamationCircle, FaTrash
} from 'react-icons/fa';

export default function DealPaymentsModal({ dealId, clientId, dealBudget, isOpen, onClose, onSave }) {
  const { employeeProfile } = useAuth();
  
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Стейт форми
  const [formData, setFormData] = useState({
    amount_usd: '',
    exchange_rate: '43.5', 
    payment_method: 'Готівка',
    payment_category: 'Аванс',
    payment_date: new Date().toISOString().slice(0, 16),
    notes: ''
  });

  // Стейт для видалення
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [paymentToDelete, setPaymentToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (isOpen && dealId) {
      fetchDealPayments();
      setErrorMessage('');
      setFormData(prev => ({ 
        ...prev, 
        amount_usd: '', 
        notes: '',
        payment_date: new Date().toISOString().slice(0, 16)
      }));
    }
  }, [isOpen, dealId]);

  const fetchDealPayments = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('deal_id', dealId)
        .order('payment_date', { ascending: false }); 

      if (error) throw error;
      setPayments(data || []);
    } catch (err) {
      console.error('Помилка завантаження платежів:', err);
      setErrorMessage('Не вдалося завантажити історію платежів');
    } finally {
      setLoading(false);
    }
  };

  const totalPaidUsd = payments.reduce((sum, p) => sum + (parseFloat(p.amount_usd) || 0), 0);
  const currentBudget = parseFloat(dealBudget || 0);
  const remainingDebtUsd = currentBudget - totalPaidUsd;

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleAddPayment = async (e) => {
    e.preventDefault();
    if (!formData.amount_usd || parseFloat(formData.amount_usd) <= 0 || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const usdValue = parseFloat(formData.amount_usd);
      const rateValue = parseFloat(formData.exchange_rate);
      const uahValue = (usdValue * rateValue).toFixed(0);

      const payload = {
        deal_id: dealId,
        client_id: clientId, 
        amount_usd: usdValue,
        exchange_rate: rateValue,
        amount_uah: parseFloat(uahValue),
        payment_method: formData.payment_method,
        payment_category: formData.payment_category,
        payment_date: new Date(formData.payment_date).toISOString(),
        created_by: employeeProfile?.id || '00000000-0000-0000-0000-000000000000',
        notes: formData.notes || null
      };

      const { error } = await supabase.from('payments').insert([payload]);
      if (error) throw error;

      setFormData(prev => ({ 
        ...prev, 
        amount_usd: '', 
        notes: '',
        payment_date: new Date().toISOString().slice(0, 16)
      }));
      
      await fetchDealPayments();
    } catch (err) {
      console.error('Помилка збереження платежу:', err);
      setErrorMessage('Помилка при збереженні транзакції: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ЛОГІКА ВИДАЛЕННЯ
  const handleDeleteClick = (payment) => {
    setPaymentToDelete(payment);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!paymentToDelete) return;
    setIsDeleting(true);
    setErrorMessage('');
    try {
      const { error } = await supabase
        .from('payments')
        .delete()
        .eq('id', paymentToDelete.id);

      if (error) throw error;

      setIsDeleteModalOpen(false);
      setPaymentToDelete(null);
      await fetchDealPayments(); // Оновлюємо дані після видалення
    } catch (error) {
      console.error('Помилка при видаленні платежу:', error);
      setErrorMessage('Помилка при видаленні платежу: ' + error.message);
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-slate-100 relative">
        
        {/* Хедер модалки */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white shrink-0 sm:rounded-t-3xl">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500 text-slate-900 rounded-xl shadow-md shadow-amber-500/10">
              <FaMoneyBillWave className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm md:text-base font-black uppercase tracking-wide">Фінансовий контроль угоди</h3>
              <p className="text-[10px] text-amber-500 font-bold tracking-widest mt-0.5 uppercase">Облік оплат та баланс</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-white hover:bg-white/20 rounded-xl transition-all">
            <FaTimes className="w-4 h-4" />
          </button>
        </div>

        {/* Основний контент */}
        <div className="p-4 md:p-6 overflow-y-auto custom-scrollbar space-y-6 flex-1 bg-slate-50/50">
          
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-100 text-rose-700 rounded-xl text-xs font-bold flex items-center gap-2">
              <FaExclamationCircle className="shrink-0" /> {errorMessage}
            </div>
          )}

          {/* Фінансові показники (Картки) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                <FaCoins /> Бюджет угоди
              </div>
              <div className="text-xl font-black text-slate-800">
                {currentBudget.toLocaleString()} $
              </div>
            </div>

            <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl shadow-sm">
              <div className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                <FaHandHoldingUsd /> Внесено всього
              </div>
              <div className="text-xl font-black text-emerald-600">
                {totalPaidUsd.toLocaleString()} $
              </div>
            </div>

            <div className={`p-4 border rounded-2xl shadow-sm transition-colors ${remainingDebtUsd > 0 ? 'bg-rose-50 border-rose-100' : 'bg-slate-50 border-slate-200'}`}>
              <div className={`text-[10px] font-black uppercase tracking-widest mb-1.5 ${remainingDebtUsd > 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                {remainingDebtUsd > 0 ? 'Залишок боргу' : 'Повністю оплачено'}
              </div>
              <div className={`text-xl font-black ${remainingDebtUsd > 0 ? 'text-rose-600' : 'text-slate-700'}`}>
                {remainingDebtUsd > 0 ? `${remainingDebtUsd.toLocaleString()} $` : '0 $'}
              </div>
            </div>
          </div>

          {/* Історія транзакцій по цій угоді */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <FaCalendarAlt /> Історія платежів за цією угодою
            </h4>
            
            {loading ? (
              <div className="text-center py-6 text-xs text-slate-400 font-bold uppercase tracking-widest animate-pulse">Завантаження...</div>
            ) : payments.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-slate-200 rounded-xl text-xs text-slate-400 font-bold bg-slate-50 uppercase tracking-widest">
                Поки що немає оплат
              </div>
            ) : (
              <div className="border border-slate-100 rounded-xl overflow-hidden max-h-40 overflow-y-auto custom-scrollbar">
                <table className="w-full text-left text-xs border-collapse min-w-[500px]">
                  <thead>
                    <tr className="bg-slate-50 text-slate-400 font-black uppercase tracking-widest border-b border-slate-100 text-[9px] sticky top-0 z-10">
                      <th className="p-3 pl-4">Дата</th>
                      <th className="p-3">Сума</th>
                      <th className="p-3">Метод / Тип</th>
                      <th className="p-3">Примітка</th>
                      <th className="p-3 pr-4 text-center">Дії</th> {/* Нова колонка */}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {payments.map((p) => {
                      const pDate = new Date(p.payment_date);
                      return (
                        <tr key={p.id} className="hover:bg-amber-50/30 transition-colors">
                          <td className="p-3 pl-4">
                            <div className="font-bold text-slate-700">{pDate.toLocaleDateString('uk-UA')}</div>
                            <div className="text-[9px] text-slate-400 uppercase">{pDate.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}</div>
                          </td>
                          <td className="p-3">
                            <div className="font-black text-emerald-600 text-sm">+{Number(p.amount_usd).toLocaleString()} $</div>
                            <div className="text-[9px] text-slate-400 font-bold uppercase">{Number(p.amount_uah).toLocaleString()} ₴</div>
                          </td>
                          <td className="p-3 space-y-1">
                            <div><span className="px-2 py-0.5 bg-slate-100 rounded text-[9px] text-slate-600 font-black uppercase">{p.payment_method}</span></div>
                            <div><span className="px-2 py-0.5 bg-amber-50 rounded text-[9px] text-amber-700 font-black uppercase border border-amber-100">{p.payment_category}</span></div>
                          </td>
                          <td className="p-3 font-medium text-slate-500 max-w-[120px] truncate" title={p.notes}>
                            {p.notes || '—'}
                          </td>
                          <td className="p-3 pr-4 text-center">
                            {/* Кнопка видалення */}
                            <button
                              onClick={() => handleDeleteClick(p)}
                              className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                              title="Видалити платіж"
                            >
                              <FaTrash size={12} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Форма внесення оплати */}
          <form id="dealPaymentForm" onSubmit={handleAddPayment} className="bg-white p-4 md:p-5 border border-slate-200 rounded-2xl space-y-4 shadow-sm">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <FaWallet className="text-amber-500 w-4 h-4" />
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest">Нове надходження</h4>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="col-span-2 md:col-span-1">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Сума ($) *</label>
                <input 
                  type="number" name="amount_usd" step="any" required
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black text-slate-800 outline-none focus:border-amber-500 transition-colors"
                  placeholder="Напр. 1500" value={formData.amount_usd} onChange={handleInputChange}
                />
              </div>

              <div className="col-span-2 md:col-span-1">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Курс (₴/$)</label>
                <input 
                  type="number" name="exchange_rate" step="any" required
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black text-slate-800 outline-none focus:border-amber-500 transition-colors"
                  value={formData.exchange_rate} onChange={handleInputChange}
                />
              </div>

              <div className="col-span-2 md:col-span-2">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Дата та час</label>
                <input 
                  type="datetime-local" name="payment_date" required
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black text-slate-700 outline-none focus:border-amber-500 transition-colors"
                  value={formData.payment_date} onChange={handleInputChange}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Форма оплати</label>
                <select 
                  name="payment_method"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black uppercase tracking-wider outline-none focus:border-amber-500 transition-colors cursor-pointer"
                  value={formData.payment_method} onChange={handleInputChange}
                >
                  <option value="Готівка">Готівка</option>
                  <option value="Картка">Картка</option>
                  <option value="Банківський переказ">Банківський переказ</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Призначення</label>
                <select 
                  name="payment_category"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black uppercase tracking-wider outline-none focus:border-amber-500 transition-colors cursor-pointer"
                  value={formData.payment_category} onChange={handleInputChange}
                >
                  <option value="Аванс">Аванс</option>
                  <option value="Часткова оплата">Часткова оплата</option>
                  <option value="Повна оплата">Повна оплата</option>
                  <option value="Кредит/Розтермінування">Кредит/Розтермінування</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Коментар</label>
              <input 
                type="text" name="notes"
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 outline-none focus:border-amber-500 transition-colors"
                placeholder="Примітка до платежу..." 
                value={formData.notes} onChange={handleInputChange}
              />
            </div>

            <div className="flex justify-end pt-2">
              <button 
                type="submit" 
                disabled={isSubmitting || !formData.amount_usd || parseFloat(formData.amount_usd) <= 0}
                className="px-6 py-3 bg-slate-900 hover:bg-slate-800 text-amber-500 rounded-xl text-xs font-black uppercase tracking-widest transition-colors disabled:opacity-40 flex items-center gap-2 shadow-lg shadow-slate-900/10"
              >
                <FaPlus className="w-3 h-3" /> 
                {isSubmitting ? 'ОБРОБКА...' : 'ЗАФІКСУВАТИ ПЛАТІЖ'}
              </button>
            </div>
          </form>

        </div>

        {/* Футер: Кнопки дій по завданню */}
        <div className="p-4 md:p-5 border-t border-slate-100 flex gap-3 bg-white shrink-0 sm:rounded-b-3xl">
          <button 
            type="button" 
            onClick={onClose}
            className="w-1/3 py-3.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors uppercase tracking-widest"
          >
            Скасувати
          </button>
          
          <button 
            type="button" 
            onClick={onSave}
            className="w-2/3 py-3.5 bg-amber-500 hover:bg-amber-400 text-slate-900 rounded-xl font-black text-xs uppercase tracking-widest transition-colors flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20"
          >
            <FaCheckCircle size={14} /> 
            ПІДТВЕРДИТИ КОНТРОЛЬ ОПЛАТ
          </button>
        </div>

        {/* МОДАЛЬНЕ ВІКНО ПІДТВЕРДЖЕННЯ ВИДАЛЕННЯ */}
        {/* z-index: 200, щоб бути поверх поточної модалки */}
        {isDeleteModalOpen && paymentToDelete && (
          <div className="absolute inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 sm:rounded-3xl">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-fade-in">
              <div className="p-5 bg-rose-50 border-b border-rose-100 flex items-center justify-center">
                <div className="p-3 bg-rose-100 rounded-full text-rose-500 shadow-sm">
                  <FaTrash size={28} />
                </div>
              </div>
              
              <div className="p-6 text-center space-y-4 bg-white">
                <h3 className="text-xl font-black text-slate-800 tracking-tight">Видалити платіж?</h3>
                <p className="text-sm font-medium text-slate-500 leading-relaxed">
                  Ви дійсно хочете безповоротно видалити транзакцію на суму <br/>
                  <span className="text-lg font-black text-rose-500 block mt-2">
                    {Number(paymentToDelete.amount_usd).toLocaleString()} $
                  </span>
                </p>
              </div>
              
              <div className="p-4 border-t border-slate-100 flex gap-3 bg-slate-50">
                <button
                  onClick={() => {
                    setIsDeleteModalOpen(false);
                    setPaymentToDelete(null);
                  }}
                  className="flex-1 py-3 text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 hover:text-slate-800 rounded-xl transition-colors uppercase tracking-widest shadow-sm"
                >
                  Скасувати
                </button>
                <button
                  onClick={confirmDelete}
                  disabled={isDeleting}
                  className="flex-1 py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-colors disabled:opacity-50 shadow-lg shadow-rose-500/20"
                >
                  {isDeleting ? 'Видалення...' : 'Видалити'}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}