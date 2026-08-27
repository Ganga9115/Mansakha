import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import ToastContainer from '../components/ToastContainer';

// Replaces "every failed action shows the raw thrown Error.message in a
// plain <div>" as the only feedback mechanism - a real success/error/info
// toast any page can fire via useToast(), conceptually mirroring
// frontend/src/context/ToastContext.js (the Expo app) but implemented as
// plain React + Tailwind since this is a CRA web app, not React Native.
const ToastContext = createContext(null);

let nextId = 1;
const AUTO_DISMISS_MS = 4000;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    clearTimeout(timers.current[id]);
    delete timers.current[id];
  }, []);

  // A repeated failure (e.g. a slow endpoint the user keeps retrying) used to
  // stack a fresh toast on top of every earlier one with the identical
  // message, growing into a wall of duplicate "Failed to fetch" banners.
  // Same message showing again now replaces the old one instead of piling
  // up alongside it.
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
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
