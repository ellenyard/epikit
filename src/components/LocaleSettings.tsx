/**
 * LocaleSettings Component
 *
 * Provides format-based selection for number and date display preferences.
 * Instead of asking users to select a country, this asks what format they prefer,
 * making it more intuitive for global users.
 */
import { useLocale } from '../contexts/LocaleContext';
import type { NumberFormat, DateFormat } from '../contexts/LocaleContext';

interface LocaleSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

interface NumberFormatOption {
  format: NumberFormat;
  label: string;
  example: string;
  description: string;
}

const NUMBER_FORMAT_OPTIONS: NumberFormatOption[] = [
  {
    format: 'period-decimal',
    label: 'Period decimal',
    example: '1,234.56',
    description: 'Common in US, UK, China, Japan, Korea, India, Australia',
  },
  {
    format: 'comma-decimal',
    label: 'Comma decimal',
    example: '1.234,56',
    description: 'Common in Europe, Latin America, Indonesia, Vietnam',
  },
  {
    format: 'space-grouping',
    label: 'Space grouping',
    example: '1 234,56',
    description: 'Common in France, Russia, Central Asia, parts of Africa',
  },
  {
    format: 'arabic',
    label: 'Arabic numerals',
    example: '١٬٢٣٤٫٥٦',
    description: 'Arabic-speaking regions',
  },
];

interface DateFormatOption {
  format: DateFormat;
  label: string;
  example: string;
}

const DATE_FORMAT_OPTIONS: DateFormatOption[] = [
  {
    format: 'DD/MM/YYYY',
    label: 'Day / Month / Year',
    example: '26/01/2025',
  },
  {
    format: 'MM/DD/YYYY',
    label: 'Month / Day / Year',
    example: '01/26/2025',
  },
  {
    format: 'YYYY-MM-DD',
    label: 'Year - Month - Day (ISO)',
    example: '2025-01-26',
  },
];

export function LocaleSettings({ isOpen, onClose }: LocaleSettingsProps) {
  const { config, setNumberFormat, setDateFormat } = useLocale();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Number & Date Format</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <div className="space-y-8">
            {/* Number Format Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">
                Number Format
              </label>
              <p className="text-sm text-gray-500 mb-4">
                How should numbers be displayed? This affects decimal points and thousand separators.
              </p>
              <div className="space-y-2">
                {NUMBER_FORMAT_OPTIONS.map((option) => (
                  <label
                    key={option.format}
                    className={`flex items-start p-4 border rounded-lg cursor-pointer transition-colors ${
                      config.numberFormat === option.format
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="numberFormat"
                      value={option.format}
                      checked={config.numberFormat === option.format}
                      onChange={() => setNumberFormat(option.format)}
                      className="w-4 h-4 mt-0.5 text-blue-600 focus:ring-blue-500"
                    />
                    <div className="ml-3 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-900">
                          {option.label}
                        </span>
                        <span className="text-sm font-mono text-gray-700 bg-gray-100 px-2 py-0.5 rounded">
                          {option.example}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {option.description}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Date Format Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">
                Date Format
              </label>
              <p className="text-sm text-gray-500 mb-4">
                How should dates be displayed?
              </p>
              <div className="space-y-2">
                {DATE_FORMAT_OPTIONS.map((option) => (
                  <label
                    key={option.format}
                    className={`flex items-center p-4 border rounded-lg cursor-pointer transition-colors ${
                      config.dateFormat === option.format
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="dateFormat"
                      value={option.format}
                      checked={config.dateFormat === option.format}
                      onChange={() => setDateFormat(option.format)}
                      className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                    />
                    <div className="ml-3 flex-1 flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900">
                        {option.label}
                      </span>
                      <span className="text-sm font-mono text-gray-700 bg-gray-100 px-2 py-0.5 rounded">
                        {option.example}
                      </span>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* CSV Export Notice */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-amber-900 mb-2 flex items-center">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                CSV Export Note
              </h3>
              <p className="text-sm text-amber-800">
                CSV exports always use period (.) as the decimal separator for compatibility with statistical software, regardless of your display preference.
              </p>
            </div>

            {/* Current Settings Preview */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-900 mb-3">Preview</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Decimal number:</span>
                  <span className="ml-2 font-mono">3{config.decimalSeparator}14159</span>
                </div>
                <div>
                  <span className="text-gray-500">Large number:</span>
                  <span className="ml-2 font-mono">1{config.thousandsSeparator}234{config.thousandsSeparator}567</span>
                </div>
                <div>
                  <span className="text-gray-500">Percentage:</span>
                  <span className="ml-2 font-mono">45{config.decimalSeparator}7%</span>
                </div>
                <div>
                  <span className="text-gray-500">CSV delimiter:</span>
                  <span className="ml-2 font-mono">{config.csvDelimiter === ';' ? 'semicolon (;)' : 'comma (,)'}</span>
                </div>
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
