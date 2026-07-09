import React from 'react';
import { FaExclamationTriangle, FaTrash, FaTimes } from 'react-icons/fa';

// Універсальне вікно підтвердження у стилі CRM (замість браузерного window.confirm)
export default function ConfirmDialog({
  isOpen,
  title = 'Підтвердіть дію',
  message,
  confirmLabel = 'Так, видалити',
  cancelLabel = 'Скасувати',
  danger = true,
  onConfirm,
  onCancel
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="p-6 text-center">
          <div className={`w-14 h-14 mx-auto rounded-2xl flex items-center justify-center mb-4 ${danger ? 'bg-rose-50 text-rose-500' : 'bg-amber-50 text-amber-500'}`}>
            {danger ? <FaTrash size={20}/> : <FaExclamationTriangle size={20}/>}
          </div>
          <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">{title}</h3>
          {message && (
            <p className="text-xs font-medium text-slate-500 mt-2 leading-relaxed break-words">{message}</p>
          )}
        </div>
        <div className="p-4 border-t border-slate-100 flex gap-3 bg-slate-50/50">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-3 text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            <FaTimes size={10}/> {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`flex-1 py-3 text-xs font-black text-white uppercase tracking-widest rounded-xl transition-colors shadow-md ${danger ? 'bg-rose-500 hover:bg-rose-600 shadow-rose-500/20' : 'bg-amber-500 hover:bg-amber-400 text-slate-900 shadow-amber-500/20'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
