import React, { createContext, useContext } from 'react';
import { Toaster, toast as sonnerToast } from 'sonner';
import { CheckCircle, AlertCircle, Info } from 'lucide-react';

// Toasts now render through sonner (the same library FarmConnect uses) so we
// get its built-in slide/fade transitions, stacking, and swipe-to-dismiss for
// free - the previous hand-rolled ToastContainer had none of that (toasts
// just popped in/out with no animation). useToast()'s show/success/error/info
// API is unchanged, so none of this app's callers needed to change.
const ToastContext = createContext(null);

function show(message, type = 'info') {
  // Passing the message text as sonner's `id` makes a repeated identical
  // message update the existing toast in place instead of stacking a
  // duplicate - matches the old ToastContext's dedup behavior exactly.
  const options = { id: message, duration: 3000 };
  if (type === 'success') return sonnerToast.success(message, options);
  if (type === 'error') return sonnerToast.error(message, options);
  return sonnerToast.info(message, options);
}

const toast = {
  show,
  success: (message) => show(message, 'success'),
  error: (message) => show(message, 'error'),
  info: (message) => show(message, 'info'),
};

export function ToastProvider({ children }) {
  return (
    <ToastContext.Provider value={toast}>
      {children}
      {/* Dropped `richColors` - its solid flat-fill background (e.g. plain
          red for an error) is the flat, unpolished look this was asked to
          fix. White card + colored left accent + colored icon reads as far
          more considered, matching the floating-card treatment already
          built for the mobile app's own toast (Toast.js). */}
      <Toaster
        position="top-right"
        closeButton
        icons={{
          success: <CheckCircle size={18} className="text-emerald-600" />,
          error: <AlertCircle size={18} className="text-rose-600" />,
          info: <Info size={18} className="text-[#3D5A80]" />,
        }}
        toastOptions={{
          classNames: {
            toast: 'rounded-xl shadow-lg border border-gray-100 bg-white px-4 py-3.5',
            title: 'text-sm font-semibold text-gray-800',
            description: 'text-xs text-gray-500',
            closeButton: 'bg-gray-50 border-gray-200 text-gray-400 hover:text-gray-600',
            success: '!border-l-4 !border-l-emerald-500',
            error: '!border-l-4 !border-l-rose-500',
            info: '!border-l-4 !border-l-[#519BCE]',
          },
        }}
      />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
