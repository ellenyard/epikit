import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * Number format types based on decimal/grouping conventions
 * These are format-based, not country-based, to accommodate global users
 */
export type NumberFormat = 'period-decimal' | 'comma-decimal' | 'space-grouping' | 'arabic';

/**
 * Date format options
 */
export type DateFormat = 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD';

export interface LocaleConfig {
  numberFormat: NumberFormat;
  dateFormat: DateFormat;
  decimalSeparator: string;
  thousandsSeparator: string;
  csvDecimalSeparator: string; // For R compatibility, always use '.'
  csvDelimiter: string;
  // Internal locale code for Intl.NumberFormat
  intlLocale: string;
}

interface NumberFormatConfig {
  decimalSeparator: string;
  thousandsSeparator: string;
  csvDelimiter: string;
  intlLocale: string;
}

const NUMBER_FORMAT_CONFIGS: Record<NumberFormat, NumberFormatConfig> = {
  'period-decimal': {
    decimalSeparator: '.',
    thousandsSeparator: ',',
    csvDelimiter: ',',
    intlLocale: 'en-US',
  },
  'comma-decimal': {
    decimalSeparator: ',',
    thousandsSeparator: '.',
    csvDelimiter: ';',
    intlLocale: 'de-DE',
  },
  'space-grouping': {
    decimalSeparator: ',',
    thousandsSeparator: ' ',
    csvDelimiter: ';',
    intlLocale: 'fr-FR',
  },
  'arabic': {
    decimalSeparator: '٫',
    thousandsSeparator: '٬',
    csvDelimiter: ',',
    intlLocale: 'ar-SA',
  },
};

function buildLocaleConfig(numberFormat: NumberFormat, dateFormat: DateFormat): LocaleConfig {
  const numConfig = NUMBER_FORMAT_CONFIGS[numberFormat];
  return {
    numberFormat,
    dateFormat,
    decimalSeparator: numConfig.decimalSeparator,
    thousandsSeparator: numConfig.thousandsSeparator,
    csvDecimalSeparator: '.', // Always period for R compatibility
    csvDelimiter: numConfig.csvDelimiter,
    intlLocale: numConfig.intlLocale,
  };
}

interface LocaleContextType {
  config: LocaleConfig;
  setNumberFormat: (format: NumberFormat) => void;
  setDateFormat: (format: DateFormat) => void;
  availableNumberFormats: NumberFormat[];
  availableDateFormats: DateFormat[];
  // Legacy compatibility
  setLocale: (locale: string) => void;
}

const LocaleContext = createContext<LocaleContextType | undefined>(undefined);

/**
 * Detect appropriate number format from browser locale
 */
function detectNumberFormat(): NumberFormat {
  const browserLocale = navigator.language;
  const lang = browserLocale.split('-')[0];

  // Arabic-speaking regions
  if (lang === 'ar') {
    return 'arabic';
  }

  // French, Russian, and related languages use space grouping
  if (['fr', 'ru', 'uk', 'be', 'kk', 'ky', 'uz', 'tg'].includes(lang)) {
    return 'space-grouping';
  }

  // Most of Europe, Latin America, Africa use comma decimal
  if (['de', 'es', 'pt', 'it', 'nl', 'pl', 'cs', 'sk', 'hu', 'ro', 'bg', 'hr', 'sl', 'sr', 'tr', 'el', 'id', 'vi', 'sw'].includes(lang)) {
    return 'comma-decimal';
  }

  // Default to period decimal (US/UK/Asia)
  return 'period-decimal';
}

/**
 * Detect appropriate date format from browser locale
 */
function detectDateFormat(): DateFormat {
  const browserLocale = navigator.language;

  // US uses MM/DD/YYYY
  if (browserLocale.startsWith('en-US')) {
    return 'MM/DD/YYYY';
  }

  // Most of the world uses DD/MM/YYYY
  return 'DD/MM/YYYY';
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [numberFormat, setNumberFormatState] = useState<NumberFormat>(() => {
    const saved = localStorage.getItem('epikit-number-format');
    if (saved && saved in NUMBER_FORMAT_CONFIGS) {
      return saved as NumberFormat;
    }
    // Check for legacy locale setting and migrate
    const legacyLocale = localStorage.getItem('epikit-locale');
    if (legacyLocale) {
      localStorage.removeItem('epikit-locale');
      if (legacyLocale === 'en-US') return 'period-decimal';
      if (legacyLocale === 'fr-FR') return 'space-grouping';
      if (legacyLocale === 'ar-SA') return 'arabic';
      if (['de-DE', 'es-ES', 'pt-BR'].includes(legacyLocale)) return 'comma-decimal';
    }
    return detectNumberFormat();
  });

  const [dateFormat, setDateFormatState] = useState<DateFormat>(() => {
    const saved = localStorage.getItem('epikit-date-format');
    if (saved && ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'].includes(saved)) {
      return saved as DateFormat;
    }
    return detectDateFormat();
  });

  const setNumberFormat = (format: NumberFormat) => {
    setNumberFormatState(format);
    localStorage.setItem('epikit-number-format', format);
  };

  const setDateFormat = (format: DateFormat) => {
    setDateFormatState(format);
    localStorage.setItem('epikit-date-format', format);
  };

  // Legacy compatibility for any code using setLocale
  const setLocale = (locale: string) => {
    if (locale === 'en-US') setNumberFormat('period-decimal');
    else if (locale === 'fr-FR') setNumberFormat('space-grouping');
    else if (locale === 'ar-SA') setNumberFormat('arabic');
    else setNumberFormat('comma-decimal');
  };

  const value: LocaleContextType = {
    config: buildLocaleConfig(numberFormat, dateFormat),
    setNumberFormat,
    setDateFormat,
    availableNumberFormats: Object.keys(NUMBER_FORMAT_CONFIGS) as NumberFormat[],
    availableDateFormats: ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'],
    setLocale,
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
