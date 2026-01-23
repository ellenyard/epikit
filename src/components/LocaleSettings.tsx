import { useLocale } from '../contexts/LocaleContext';
import type { SupportedLocale } from '../contexts/LocaleContext';

interface LocaleSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

const LOCALE_NAMES: Record<SupportedLocale, string> = {
  'en-US': 'English (United States)',
  'fr-FR': 'Français (France)',
  'es-ES': 'Español (España)',
  'de-DE': 'Deutsch (Deutschland)',
  'pt-BR': 'Português (Brasil)',
  'ar-SA': 'العربية (السعودية)',
};

export function LocaleSettings({ isOpen, onClose }: LocaleSettingsProps) {
  const { config, setLocale, availableLocales } = useLocale();

  if (!isOpen) return null;

  const handleLocaleChange = (newLocale: SupportedLocale) => {
    setLocale(newLocale);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Language & Region Settings</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <div className="space-y-6">
            {/* Current Settings Info */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-blue-900 mb-2">Current Settings</h3>
              <div className="text-sm text-blue-800 space-y-1">
                <p>Decimal separator: <strong>{config.decimalSeparator}</strong></p>
                <p>Thousands separator: <strong>{config.thousandsSeparator}</strong></p>
                <p>CSV delimiter: <strong>{config.csvDelimiter}</strong></p>
                <p>Date format: <strong>{config.dateFormat}</strong></p>
              </div>
            </div>

            {/* Locale Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Select Language & Region
              </label>
              <div className="space-y-2">
                {availableLocales.map((locale) => (
                  <label
                    key={locale}
                    className={`flex items-center p-4 border rounded-lg cursor-pointer transition-colors ${
                      config.locale === locale
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="locale"
                      value={locale}
                      checked={config.locale === locale}
                      onChange={() => handleLocaleChange(locale)}
                      className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-3 text-sm font-medium text-gray-900">
                      {LOCALE_NAMES[locale]}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* R Integration Notice */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-yellow-900 mb-2 flex items-center">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                R Integration Compatibility
              </h3>
              <div className="text-sm text-yellow-800 space-y-1">
                <p>CSV exports always use period (.) as decimal separator for R compatibility, regardless of your locale setting.</p>
                <p>The CSV delimiter will be adjusted based on your locale:</p>
                <ul className="list-disc list-inside ml-2 mt-1">
                  <li>English (US): comma (,)</li>
                  <li>European locales: semicolon (;)</li>
                </ul>
              </div>
            </div>

            {/* Number Format Examples */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-900 mb-2">Number Format Examples</h3>
              <div className="text-sm text-gray-700 space-y-1">
                <p>Decimal number: 1{config.decimalSeparator}5</p>
                <p>Large number: 1{config.thousandsSeparator}234{config.decimalSeparator}56</p>
                <p>Percentage: 45{config.decimalSeparator}3%</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
