import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import Toast from '../components/Toast';

// Replaces "mutation either navigates away or shows inline text" as the only
// feedback mechanism - a real success/error/info toast any screen can fire.
const ToastContext = createContext(null);

let nextId = 1;
const AUTO_DISMISS_MS = 3500;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    clearTimeout(timers.current[id]);
    delete timers.current[id];
  }, []);

  // Same message showing again (e.g. a slow endpoint the user keeps
  // retrying) replaces the old toast instead of stacking a duplicate
  // alongside it.
  const show = useCallback((message, type = 'info') => {
    const id = nextId++;
    setToasts((prev) => {
      const dup = prev.find((t) => t.message === message);
      if (dup) clearTimeout(timers.current[dup.id]);
      return [...prev.filter((t) => t.message !== message), { id, message, type }];
    });
    timers.current[id] = setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    return id;
  }, [dismiss]);

  const toast = {
    show,
    success: (message) => show(message, 'success'),
    error: (message) => show(message, 'error'),
    info: (message) => show(message, 'info'),
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <Toast toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
