import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { translate } from '../i18n/strings';

// UI display language - distinct from users.preferred_language (a case
// record field the backend stores per Section 4.1, editable via Settings'
// language Dropdown). This one is purely client-side, persisted locally, and
// applies before a session even exists (Language Select is the User App's
// first screen - Section 8 - reachable before login).
const LanguageContext = createContext(null);
const STORAGE_KEY = 'mansakha_ui_language';

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(null); // null = not yet chosen
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((code) => {
      setLanguageState(code);
      setIsLoading(false);
    });
  }, []);

  const setLanguage = useCallback(async (code) => {
    setLanguageState(code);
    await AsyncStorage.setItem(STORAGE_KEY, code);
  }, []);

  const t = useCallback((key) => translate(language || 'en', key), [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, isLoading, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
