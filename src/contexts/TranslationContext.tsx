import React, { createContext, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { LanguageCode } from '../types';

type TranslationObject = Record<string, any>;

interface TranslationContextType {
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
  t: (key: string, params?: Record<string, string>) => string;
  isRTL: boolean;
}

const TranslationContext = createContext<TranslationContextType | undefined>(undefined);

// Desteklenen dillerde RTL kullanılmıyor.
const RTL_LANGUAGES: LanguageCode[] = [];

const translations: Record<LanguageCode, TranslationObject> = {
  tr: require('../i18n/tr.json'),
  th: require('../i18n/th.json'),
};

export const TranslationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<LanguageCode>('tr');

  const setLanguage = (lang: LanguageCode) => {
    setLanguageState(lang);
    // Dil tercihini localStorage'a kaydet
    // Bu kısım storage.ts'de entegre edilecek
  };

  const t = (key: string, params?: Record<string, string>): string => {
    const keys = key.split('.');
    let value: any = translations[language];

    for (const k of keys) {
      value = value?.[k];
    }

    if (typeof value !== 'string') {
      // Fallback to Turkish if translation not found
      value = translations.tr;
      for (const k of keys) {
        value = value?.[k];
      }
      if (typeof value !== 'string') {
        return key; // Return key if no translation found
      }
    }

    // Parametre değiştirme
    if (params) {
      Object.entries(params).forEach(([param, val]) => {
        value = value.replace(new RegExp(`{{${param}}}`, 'g'), val);
      });
    }

    return value;
  };

  const isRTL = RTL_LANGUAGES.includes(language);

  useEffect(() => {
    // React Native'de global "document" olmayabilir; tarayıcıda varsa kullan.
    const webDocument =
      Platform.OS === 'web' && typeof document !== 'undefined'
        ? document
        : undefined;

    webDocument?.documentElement?.setAttribute('dir', isRTL ? 'rtl' : 'ltr');
  }, [isRTL]);

  return (
    <TranslationContext.Provider value={{ language, setLanguage, t, isRTL }}>
      {children}
    </TranslationContext.Provider>
  );
};

export const useTranslation = () => {
  const context = useContext(TranslationContext);
  if (!context) {
    throw new Error('useTranslation must be used within a TranslationProvider');
  }
  return context;
};