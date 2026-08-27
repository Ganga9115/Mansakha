import React from 'react';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

// Same red-bordered/red-text palette already used for inline errors across
// this app (e.g. staff/Login.jsx's `bg-red-50 text-red-700 border-red-100`
// error box) - the toast error variant reuses it instead of inventing a new
// one; success/info are the sensible green/blue equivalents.
const VARIANT = {
  success: { icon: CheckCircle, classes: 'bg-emerald-50 text-emerald-700 border-emerald-100', iconClass: 'text-emerald-500' },
  error: { icon: AlertCircle, classes: 'bg-red-50 text-red-700 border-red-100', iconClass: 'text-red-500' },
  info: { icon: Info, classes: 'bg-blue-50 text-blue-700 border-blue-100', iconClass: 'text-blue-500' },
};

function ToastRow({ toast, onDismiss }) {
  const { icon: Icon, classes, iconClass } = VARIANT[toast.type] || VARIANT.info;
  return (
    <div
      role="alert"
      className={`flex items-start gap-2.5 px-4 py-3 rounded-lg text-sm border shadow-md w-80 max-w-full pointer-events-auto ${classes}`}
    >
      <Icon size={18} className={`shrink-0 mt-0.5 ${iconClass}`} />
      <p className="flex-1 leading-snug">{toast.message}</p>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        className="shrink-0 opacity-60 hover:opacity-100 transition"
      >
        <X size={15} />
      </button>
    </div>
  );
}

// Fixed top-right stack, newest toast at the bottom of the stack (appended).
// `pointer-events-none` on the wrapper + `pointer-events-auto` on each row
// so the empty space around toasts never blocks clicks on the page below.
export default function ToastContainer({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => <ToastRow key={t.id} toast={t} onDismiss={onDismiss} />)}
    </div>
  );
}
