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
  const options = { id: message, duration: 5000 };
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
      <Toaster
        position="top-right"
        richColors
        closeButton
        icons={{
          success: <CheckCircle size={18} />,
          error: <AlertCircle size={18} />,
          info: <Info size={18} />,
        }}
        toastOptions={{ classNames: { toast: 'rounded-lg shadow-md text-sm' } }}
      />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
