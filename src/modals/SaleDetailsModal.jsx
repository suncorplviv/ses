import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthProvider';
import * as XLSX from 'xlsx';
import {
  FaTimes, FaUser, FaBuilding, FaMoneyBillWave, FaHistory, FaBoxOpen,
  FaCheck, FaEdit, FaTrash, FaBan, FaWarehouse, FaCashRegister, FaFileExcel
} from 'react-icons/fa';

const paymentStatusLabels = {
  unpaid: { label: 'Неоплачено', color: 'bg-rose-50 text-rose-600 border-rose-100' },
  partial: { label: 'Часткова оплата', color: 'bg-amber-50 text-amber-600 border-amber-100' },
  paid: { label: 'Оплачено повністю', color: 'bg-emerald-50 text-emerald-600 border-emerald-100' }
};

export default function SaleDetailsModal({ isOpen, onClose, saleId, onSaveSuccess }) {
  const { employeeProfile } = useAuth();

  const [sale, setSale] = useState(null);
  const [items, setItems] = useState([]);
  const [payments, setPayments] = useState([]);
  const [createdByName, setCreatedByName] = useState('');
  const [loading, setLoading] = useState(true);

  const [paymentForm, setPaymentForm] = useState({ amount_usd: '', exchange_rate: '', amount_uah: '', payment_method: 'Готівка', payment_category: 'Повна оплата', notes: '' });
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  const [editingPaymentId, setEditingPaymentId] = useState(null);
  const [editingPaymentForm, setEditingPaymentForm] = useState({ amount_usd: '', amount_uah: '', payment_method: '', payment_category: '', notes: '' });
  const [isUpdatingPayment, setIsUpdatingPayment] = useState(false);

  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [isSubmittingCancel, setIsSubmittingCancel] = useState(false);

  const getCurrentUserId = async () => {
    if (employeeProfile?.id) return employeeProfile.id;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) throw new Error('Не визначено поточного користувача.');
    return user.id;
  };

  useEffect(() => {
    if (isOpen && saleId) fetchAll();
  }, [isOpen, saleId]);

  const fetchAll = async () => {
    setLoading(true);
    setIsCancelling(false); setCancelReason('');

    const { data: saleData } = await supabase
      .from('sales')
      .select('*, clients(name, phone, client_type, company_name), stock_locations(name)')
      .eq('id', saleId)
      .single();
    setSale(saleData);

    if (saleData?.created_by) {
      const { data: userData } = await supabase.from('users').select('full_name').eq('id', saleData.created_by).maybeSingle();
      setCreatedByName(userData?.full_name || '');
    } else {
      setCreatedByName('');
    }

    const { data: itemsData } = await supabase.from('sale_items').select('*').eq('sale_id', saleId).order('created_at');
    setItems(itemsData || []);

    const { data: paymentsData } = await supabase.from('payments').select('*, users(full_name)').eq('sale_id', saleId).order('payment_date', { ascending: false });
    setPayments(paymentsData || []);

    setLoading(false);
  };

  const updateSalePaymentTotals = async () => {
    const { data: allPayments } = await supabase.from('payments').select('amount_usd').eq('sale_id', saleId);
    const totalUsd = allPayments?.reduce((sum, p) => sum + (parseFloat(p.amount_usd) || 0), 0) || 0;
    const revenue = parseFloat(sale?.total_revenue_usd) || 0;
    const status = totalUsd <= 0 ? 'unpaid' : totalUsd >= revenue ? 'paid' : 'partial';
    await supabase.from('sales').update({ amount_paid_usd: totalUsd, payment_status: status }).eq('id', saleId);
  };

  const handlePaymentAmountChange = (field, value) => {
    setPaymentForm(prev => {
      const next = { ...prev, [field]: value };
      const rate = parseFloat(next.exchange_rate) || 0;
      if (rate <= 0) return next;
      if (field === 'amount_usd') next.amount_uah = value ? (parseFloat(value) * rate).toFixed(2) : '';
      else if (field === 'amount_uah') next.amount_usd = value ? (parseFloat(value) / rate).toFixed(2) : '';
      return next;
    });
  };

  const handleEditPaymentAmountChange = (field, value) => {
    setEditingPaymentForm(prev => {
      const next = { ...prev, [field]: value };
      return next;
    });
  };

  const handleAddPayment = async (e) => {
    e.preventDefault();
    const amount = parseFloat(paymentForm.amount_usd);
    if (!amount || isNaN(amount) || amount <= 0) return alert('Введіть коректну суму ($)');

    setIsSubmittingPayment(true);
    try {
      const userId = await getCurrentUserId();
      const { error } = await supabase.from('payments').insert([{
        sale_id: saleId,
        client_id: sale.client_id,
        amount_usd: amount,
        exchange_rate: parseFloat(paymentForm.exchange_rate) || null,
        amount_uah: parseFloat(paymentForm.amount_uah) || 0,
        payment_method: paymentForm.payment_method,
        payment_category: paymentForm.payment_category,
        payment_date: new Date().toISOString(),
        created_by: userId,
        notes: paymentForm.notes || null
      }]);
      if (error) throw error;

      await updateSalePaymentTotals();
      setPaymentForm({ amount_usd: '', exchange_rate: '', amount_uah: '', payment_method: 'Готівка', payment_category: 'Повна оплата', notes: '' });
      await fetchAll();
      onSaveSuccess();
    } catch (error) {
      alert('Помилка: ' + error.message);
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  const startEditingPayment = (payment) => {
    setEditingPaymentId(payment.id);
    setEditingPaymentForm({
      amount_usd: payment.amount_usd || '',
      amount_uah: payment.amount_uah || '',
      payment_method: payment.payment_method || '',
      payment_category: payment.payment_category || '',
      notes: payment.notes || ''
    });
  };

  const handleUpdatePayment = async () => {
    const amount = parseFloat(editingPaymentForm.amount_usd);
    if (!amount || isNaN(amount) || amount <= 0) return alert('Введіть коректну суму ($)');

    setIsUpdatingPayment(true);
    try {
      await supabase.from('payments').update({
        amount_usd: amount,
        amount_uah: parseFloat(editingPaymentForm.amount_uah) || 0,
        payment_method: editingPaymentForm.payment_method,
        payment_category: editingPaymentForm.payment_category,
        notes: editingPaymentForm.notes || null
      }).eq('id', editingPaymentId);

      await updateSalePaymentTotals();
      setEditingPaymentId(null);
      await fetchAll();
      onSaveSuccess();
    } catch (error) {
      alert('Помилка оновлення платежу: ' + error.message);
    } finally {
      setIsUpdatingPayment(false);
    }
  };

  const handleDeletePayment = async (paymentId) => {
    if (!window.confirm('Ви дійсно хочете видалити цей запис про оплату?')) return;
    try {
      await supabase.from('payments').delete().eq('id', paymentId);
      await updateSalePaymentTotals();
      await fetchAll();
      onSaveSuccess();
    } catch (error) {
      alert('Помилка видалення платежу: ' + error.message);
    }
  };

  const handleExportSale = () => {
    if (items.length === 0) return alert('У продажу немає позицій для експорту.');

    const rows = items.map(item => ({
      'Позиція': item.line_type === 'custom' ? item.custom_name : item.product_name_snapshot,
      'Кількість': Number(item.quantity),
      'Од.': item.unit || '',
      'Ціна за од. ($)': Number(item.unit_sale_price_usd || 0),
      'Сума ($)': Number(item.line_revenue_usd || 0)
    }));
    rows.push({ 'Позиція': 'РАЗОМ', 'Кількість': '', 'Од.': '', 'Ціна за од. ($)': '', 'Сума ($)': items.reduce((sum, i) => sum + Number(i.line_revenue_usd || 0), 0) });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Продаж');
    XLSX.writeFile(workbook, `Продаж_№${sale.custom_id}_${sale.clients?.name || 'клієнт'}.xlsx`);
  };

  const handleConfirmCancel = async () => {
    setIsSubmittingCancel(true);
    try {
      const userId = await getCurrentUserId();
      const { error } = await supabase.rpc('erp_cancel_sale', { p_sale_id: saleId, p_performed_by: userId, p_reason: cancelReason || null });
      if (error) throw error;
      await fetchAll();
      onSaveSuccess();
    } catch (error) {
      alert('Помилка скасування: ' + error.message);
    } finally {
      setIsSubmittingCancel(false);
    }
  };

  if (!isOpen) return null;

  if (loading || !sale) {
    return (
      <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
        <div className="bg-white rounded-3xl shadow-2xl p-12 text-slate-400 font-bold uppercase tracking-widest text-sm animate-pulse">Завантаження...</div>
      </div>
    );
  }

  const isCancelled = sale.status === 'cancelled';
  const payStatusInfo = paymentStatusLabels[sale.payment_status] || paymentStatusLabels.unpaid;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in custom-scrollbar overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col my-auto overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-900 text-white shrink-0">
          <div>
            <h3 className="text-lg font-black uppercase tracking-tight flex items-center gap-2">
              <FaCashRegister className="text-amber-400" /> Продаж #{sale.custom_id}
            </h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase mt-1 tracking-widest flex items-center gap-2 flex-wrap">
              <span className="flex items-center gap-1.5">
                {sale.clients?.client_type === 'Юридична особа' ? <FaBuilding /> : <FaUser />} {sale.clients?.name}
              </span>
              <span>• <FaWarehouse className="inline mb-0.5" /> {sale.stock_locations?.name || 'Склад не вказано'}</span>
              {createdByName && <span>• Провів: {createdByName}</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleExportSale} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors" title="Експортувати продаж для клієнта (без собівартості)"><FaFileExcel size={16} /></button>
            <button onClick={onClose} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"><FaTimes size={18} /></button>
          </div>
        </div>

        <div className="p-6 md:p-8 space-y-8 bg-slate-50/50 flex-1 overflow-y-auto custom-scrollbar">

          <div className="bg-white p-5 rounded-2xl border border-slate-200 flex flex-wrap gap-6 justify-between items-center shadow-sm">
            <div className="grid grid-cols-3 gap-6">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Виручка</p>
                <p className="font-black text-slate-900 mt-1">${Number(sale.total_revenue_usd || 0).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Собівартість</p>
                <p className="font-black text-slate-500 mt-1">${Number(sale.total_cost_usd || 0).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Прибуток</p>
                <p className={`font-black mt-1 ${Number(sale.total_profit_usd || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>${Number(sale.total_profit_usd || 0).toLocaleString()}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Статус</p>
              <div className="mt-1 flex gap-2 justify-end">
                {isCancelled && <span className="bg-rose-100 text-rose-700 px-3 py-1 rounded-lg text-xs font-black uppercase">Скасовано</span>}
                <span className={`px-3 py-1 rounded-lg text-xs font-black uppercase border ${payStatusInfo.color}`}>{payStatusInfo.label}</span>
              </div>
            </div>
          </div>

          {/* ОПЛАТИ */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6">
              <h4 className="font-black text-sm uppercase tracking-widest text-slate-800 flex items-center gap-2 shrink-0"><FaMoneyBillWave className="text-emerald-500" /> Оплати</h4>

              {!isCancelled && sale.payment_status !== 'paid' && (
                <form onSubmit={handleAddPayment} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex-1 w-full">
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-end">
                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 mb-1">Сума ($)</label>
                      <input type="number" min="0.01" step="any" required placeholder="0.00" value={paymentForm.amount_usd} onChange={e => handlePaymentAmountChange('amount_usd', e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-emerald-500" />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 mb-1">Курс / Сума (₴)</label>
                      <div className="flex gap-1">
                        <input type="number" min="0" step="any" placeholder="Курс" value={paymentForm.exchange_rate} onChange={e => handlePaymentAmountChange('exchange_rate', e.target.value)} className="w-1/2 px-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-emerald-500" />
                        <input type="number" min="0" step="any" placeholder="₴" value={paymentForm.amount_uah} onChange={e => handlePaymentAmountChange('amount_uah', e.target.value)} className="w-1/2 px-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-emerald-500" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 mb-1">Метод</label>
                      <select value={paymentForm.payment_method} onChange={e => setPaymentForm({ ...paymentForm, payment_method: e.target.value })} className="w-full px-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-emerald-500 cursor-pointer">
                        <option value="Готівка">Готівка</option>
                        <option value="Картка">Картка</option>
                        <option value="Банківський переказ">Банківський переказ</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 mb-1">Призначення</label>
                      <select value={paymentForm.payment_category} onChange={e => setPaymentForm({ ...paymentForm, payment_category: e.target.value })} className="w-full px-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-emerald-500 cursor-pointer">
                        <option value="Повна оплата">Повна оплата</option>
                        <option value="Часткова оплата">Часткова оплата</option>
                        <option value="Аванс">Аванс</option>
                      </select>
                    </div>
                    <button type="submit" disabled={isSubmittingPayment} className="w-full py-2 bg-emerald-500 hover:bg-emerald-400 text-white rounded-lg text-xs font-black uppercase tracking-widest transition-colors shadow-sm disabled:opacity-50">{isSubmittingPayment ? '...' : 'Внести'}</button>
                  </div>
                </form>
              )}
            </div>

            {payments.length > 0 && (
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-[10px] uppercase font-black text-slate-400 tracking-widest border-b border-slate-100">
                  <tr>
                    <th className="p-3 pl-5"><FaHistory className="inline mb-0.5 mr-1" /> Транзакція</th>
                    <th className="p-3">Метод / Призначення</th>
                    <th className="p-3 text-right pr-5">Сума / Дії</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payments.map(pay => (
                    <tr key={pay.id} className="hover:bg-slate-50">
                      {editingPaymentId === pay.id ? (
                        <td colSpan="3" className="p-3 bg-amber-50/50">
                          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end p-2 bg-white border border-amber-200 rounded-xl shadow-sm">
                            <div>
                              <label className="block text-[9px] font-bold text-slate-400 mb-1">Сума ($)</label>
                              <input type="number" min="0.01" step="any" value={editingPaymentForm.amount_usd} onChange={e => handleEditPaymentAmountChange('amount_usd', e.target.value)} className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded text-xs outline-none focus:border-amber-500" />
                            </div>
                            <div>
                              <label className="block text-[9px] font-bold text-slate-400 mb-1">Сума (₴)</label>
                              <input type="number" min="0" step="any" value={editingPaymentForm.amount_uah} onChange={e => handleEditPaymentAmountChange('amount_uah', e.target.value)} className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded text-xs outline-none focus:border-amber-500" />
                            </div>
                            <div>
                              <select value={editingPaymentForm.payment_category} onChange={e => setEditingPaymentForm({ ...editingPaymentForm, payment_category: e.target.value })} className="w-full px-1 py-1.5 bg-slate-50 border border-slate-200 rounded text-[10px] font-bold mt-4">
                                <option>Повна оплата</option><option>Часткова оплата</option><option>Аванс</option>
                              </select>
                            </div>
                            <div>
                              <select value={editingPaymentForm.payment_method} onChange={e => setEditingPaymentForm({ ...editingPaymentForm, payment_method: e.target.value })} className="w-full px-1 py-1.5 bg-slate-50 border border-slate-200 rounded text-[10px] font-bold mt-4">
                                <option>Готівка</option><option>Картка</option><option>Банківський переказ</option>
                              </select>
                            </div>
                            <div className="flex gap-2">
                              <button onClick={handleUpdatePayment} disabled={isUpdatingPayment} className="flex-1 py-1.5 bg-emerald-500 text-white rounded text-[10px] font-black shadow-sm hover:bg-emerald-600"><FaCheck className="mx-auto" /></button>
                              <button onClick={() => setEditingPaymentId(null)} className="flex-1 py-1.5 bg-slate-200 text-slate-600 rounded text-[10px] font-black hover:bg-slate-300"><FaTimes className="mx-auto" /></button>
                            </div>
                          </div>
                        </td>
                      ) : (
                        <>
                          <td className="p-3 pl-5">
                            <span className="font-bold text-slate-800">{new Date(pay.payment_date).toLocaleDateString('uk-UA')}</span>
                            <span className="text-[10px] text-slate-400 ml-2 font-mono">{new Date(pay.payment_date).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}</span>
                            <div className="text-[10px] font-bold text-slate-500 mt-0.5">Провів: {pay.users?.full_name} {pay.notes ? `(${pay.notes})` : ''}</div>
                          </td>
                          <td className="p-3">
                            <div className="flex flex-col gap-1">
                              <span className="text-[10px] font-black uppercase text-slate-700">{pay.payment_category}</span>
                              <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[9px] font-bold w-fit">{pay.payment_method}</span>
                            </div>
                          </td>
                          <td className="p-3 text-right pr-5">
                            <div className="flex justify-end items-center gap-3">
                              <div className="text-right">
                                <div className="font-black text-emerald-600">+ ${Number(pay.amount_usd || 0).toLocaleString()}</div>
                                {pay.amount_uah > 0 && <div className="text-[10px] text-slate-400 font-bold">+{Number(pay.amount_uah).toLocaleString()} ₴</div>}
                              </div>
                              <div className="flex flex-col gap-1 border-l border-slate-200 pl-3 ml-1">
                                <button onClick={() => startEditingPayment(pay)} className="text-slate-400 hover:text-amber-500 p-1 bg-slate-50 hover:bg-amber-50 rounded transition-colors" title="Редагувати"><FaEdit size={10} /></button>
                                <button onClick={() => handleDeletePayment(pay.id)} className="text-slate-400 hover:text-rose-500 p-1 bg-slate-50 hover:bg-rose-50 rounded transition-colors" title="Видалити"><FaTrash size={10} /></button>
                              </div>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* ПОЗИЦІЇ */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <h4 className="p-4 border-b border-slate-100 font-black text-sm uppercase tracking-widest text-slate-800 bg-slate-50/50 flex items-center gap-2"><FaBoxOpen className="text-amber-500" /> Позиції продажу</h4>
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-[10px] uppercase font-black text-slate-400 tracking-widest border-b border-slate-200">
                <tr><th className="p-4">Позиція</th><th className="p-4 text-center">К-сть</th><th className="p-4 text-center">Собівартість</th><th className="p-4 text-center">Ціна продажу</th><th className="p-4 text-right">Маржа</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map(item => {
                  const lineProfit = Number(item.line_revenue_usd || 0) - Number(item.line_cost_usd || 0);
                  return (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-4">
                        <p className="font-bold text-slate-800 text-sm">{item.line_type === 'custom' ? item.custom_name : item.product_name_snapshot}</p>
                        <p className="text-[10px] font-mono text-slate-400">{item.line_type === 'custom' ? 'Довільна позиція' : `SKU: ${item.product_sku_snapshot || '-'}`}</p>
                      </td>
                      <td className="p-4 text-center font-black text-slate-800">{item.quantity} <span className="text-xs text-slate-400">{item.unit}</span></td>
                      <td className="p-4 text-center font-bold text-slate-500">${Number(item.unit_cost_price_usd || 0).toFixed(2)}</td>
                      <td className="p-4 text-center font-bold text-slate-800">${Number(item.unit_sale_price_usd || 0).toFixed(2)}</td>
                      <td className={`p-4 text-right font-black ${lineProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>${lineProfit.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {sale.notes && (
            <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-4 text-sm font-medium text-slate-700">{sale.notes}</div>
          )}

          {isCancelled && sale.cancel_reason && (
            <div className="bg-rose-50 border border-rose-100 rounded-xl p-4 text-sm font-medium text-rose-700">Причина скасування: {sale.cancel_reason}</div>
          )}
        </div>

        <div className="p-6 border-t border-slate-100 flex justify-between items-center bg-white shrink-0 gap-3">
          {!isCancelled ? (
            isCancelling ? (
              <div className="flex items-center gap-2 flex-1">
                <input type="text" placeholder="Причина скасування (необов'язково)" value={cancelReason} onChange={e => setCancelReason(e.target.value)} className="flex-1 px-3 py-2 border border-rose-200 bg-rose-50 rounded-lg text-xs font-bold outline-none focus:border-rose-500" />
                <button onClick={handleConfirmCancel} disabled={isSubmittingCancel} className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-lg text-xs font-black uppercase tracking-widest">{isSubmittingCancel ? '...' : 'Підтвердити'}</button>
                <button onClick={() => setIsCancelling(false)} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-xs font-black uppercase tracking-widest">Назад</button>
              </div>
            ) : (
              <button onClick={() => setIsCancelling(true)} className="px-4 py-2 text-rose-500 hover:bg-rose-50 rounded-xl text-xs font-black uppercase tracking-widest transition-colors flex items-center gap-2"><FaBan size={12} /> Скасувати продаж</button>
            )
          ) : <div></div>}
          <button onClick={onClose} className="px-6 py-3.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-colors">Закрити</button>
        </div>
      </div>
    </div>
  );
}
