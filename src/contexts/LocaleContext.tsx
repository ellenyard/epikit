import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';

export type SupportedLocale = 'en-US' | 'fr-FR' | 'es-ES' | 'de-DE' | 'pt-BR' | 'ar-SA';

export interface LocaleConfig {
  locale: SupportedLocale;
  decimalSeparator: string;
  thousandsSeparator: string;
  csvDecimalSeparator: string; // For R compatibility, always use '.'
  csvDelimiter: string;
  dateFormat: string;
}

const LOCALE_CONFIGS: Record<SupportedLocale, LocaleConfig> = {
  'en-US': {
    locale: 'en-US',
    decimalSeparator: '.',
    thousandsSeparator: ',',
    csvDecimalSeparator: '.',
    csvDelimiter: ',',
    dateFormat: 'MM/DD/YYYY',
  },
  'fr-FR': {
    locale: 'fr-FR',
    decimalSeparator: ',',
    thousandsSeparator: ' ',
    csvDecimalSeparator: '.',
    csvDelimiter: ';',
    dateFormat: 'DD/MM/YYYY',
  },
  'es-ES': {
    locale: 'es-ES',
    decimalSeparator: ',',
    thousandsSeparator: '.',
    csvDecimalSeparator: '.',
    csvDelimiter: ';',
    dateFormat: 'DD/MM/YYYY',
  },
  'de-DE': {
    locale: 'de-DE',
    decimalSeparator: ',',
    thousandsSeparator: '.',
    csvDecimalSeparator: '.',
    csvDelimiter: ';',
    dateFormat: 'DD.MM.YYYY',
  },
  'pt-BR': {
    locale: 'pt-BR',
    decimalSeparator: ',',
    thousandsSeparator: '.',
    csvDecimalSeparator: '.',
    csvDelimiter: ';',
    dateFormat: 'DD/MM/YYYY',
  },
  'ar-SA': {
    locale: 'ar-SA',
    decimalSeparator: '٫',
    thousandsSeparator: '٬',
    csvDecimalSeparator: '.',
    csvDelimiter: ',',
    dateFormat: 'DD/MM/YYYY',
  },
};

interface LocaleContextType {
  config: LocaleConfig;
  setLocale: (locale: SupportedLocale) => void;
  availableLocales: SupportedLocale[];
}

const LocaleContext = createContext<LocaleContextType | undefined>(undefined);

function detectBrowserLocale(): SupportedLocale {
  const browserLocale = navigator.language;

  // Exact match
  if (browserLocale in LOCALE_CONFIGS) {
    return browserLocale as SupportedLocale;
  }

  // Language prefix match (e.g., 'fr-CA' -> 'fr-FR')
  const languagePrefix = browserLocale.split('-')[0];
  const matchingLocale = Object.keys(LOCALE_CONFIGS).find(
    (locale) => locale.startsWith(languagePrefix)
  );

  if (matchingLocale) {
    return matchingLocale as SupportedLocale;
  }

  // Default fallback
  return 'en-US';
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<SupportedLocale>(() => {
    // Try to load from localStorage first
    const savedLocale = localStorage.getItem('epikit-locale');
    if (savedLocale && savedLocale in LOCALE_CONFIGS) {
      return savedLocale as SupportedLocale;
    }

    // Otherwise detect from browser
    return detectBrowserLocale();
  });

  const setLocale = (newLocale: SupportedLocale) => {
    setLocaleState(newLocale);
    localStorage.setItem('epikit-locale', newLocale);
  };

  const value: LocaleContextType = {
    config: LOCALE_CONFIGS[locale],
    setLocale,
    availableLocales: Object.keys(LOCALE_CONFIGS) as SupportedLocale[],
  };

  return (
    <LocaleContext.Provider value={value}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error('useLocale must be used within LocaleProvider');
  }
  return context;
}
