import { useState, useEffect } from 'react';

interface AccessibilitySettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AccessibilitySettings({ isOpen, onClose }: AccessibilitySettingsProps) {
  const [highContrast, setHighContrast] = useState(false);
  const [colorblindFriendly, setColorblindFriendly] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [fontSize, setFontSize] = useState('normal');

  // Load settings from localStorage on mount
  useEffect(() => {
    const savedHighContrast = localStorage.getItem('a11y-high-contrast') === 'true';
    const savedColorblind = localStorage.getItem('a11y-colorblind-friendly') === 'true';
    const savedReducedMotion = localStorage.getItem('a11y-reduced-motion') === 'true';
    const savedFontSize = localStorage.getItem('a11y-font-size') || 'normal';

    setHighContrast(savedHighContrast);
    setColorblindFriendly(savedColorblind);
    setReducedMotion(savedReducedMotion);
    setFontSize(savedFontSize);

    // Apply settings to document
    applySettings(savedHighContrast, savedColorblind, savedReducedMotion, savedFontSize);
  }, []);

  const applySettings = (
    contrast: boolean,
    colorblind: boolean,
    motion: boolean,
    size: string
  ) => {
    const root = document.documentElement;

    // High contrast
    if (contrast) {
      root.classList.add('theme-high-contrast');
    } else {
      root.classList.remove('theme-high-contrast');
    }

    // Colorblind friendly
    if (colorblind) {
      root.classList.add('theme-colorblind-friendly');
    } else {
      root.classList.remove('theme-colorblind-friendly');
    }

    // Reduced motion
    if (motion) {
      root.style.setProperty('--animation-speed', '0.01ms');
    } else {
      root.style.removeProperty('--animation-speed');
    }

    // Font size
    root.setAttribute('data-font-size', size);
    switch (size) {
      case 'small':
        root.style.fontSize = '14px';
        break;
      case 'large':
        root.style.fontSize = '18px';
        break;
      case 'extra-large':
        root.style.fontSize = '20px';
        break;
      default:
        root.style.fontSize = '16px';
    }
  };

  const handleToggleHighContrast = () => {
    const newValue = !highContrast;
    setHighContrast(newValue);
    localStorage.setItem('a11y-high-contrast', String(newValue));
    applySettings(newValue, colorblindFriendly, reducedMotion, fontSize);
  };

  const handleToggleColorblindFriendly = () => {
    const newValue = !colorblindFriendly;
    setColorblindFriendly(newValue);
    localStorage.setItem('a11y-colorblind-friendly', String(newValue));
    applySettings(highContrast, newValue, reducedMotion, fontSize);
  };

  const handleToggleReducedMotion = () => {
    const newValue = !reducedMotion;
    setReducedMotion(newValue);
    localStorage.setItem('a11y-reduced-motion', String(newValue));
    applySettings(highContrast, colorblindFriendly, newValue, fontSize);
  };

  const handleFontSizeChange = (size: string) => {
    setFontSize(size);
    localStorage.setItem('a11y-font-size', size);
    applySettings(highContrast, colorblindFriendly, reducedMotion, size);
  };

  const handleReset = () => {
    setHighContrast(false);
    setColorblindFriendly(false);
    setReducedMotion(false);
    setFontSize('normal');
    localStorage.removeItem('a11y-high-contrast');
    localStorage.removeItem('a11y-colorblind-friendly');
    localStorage.removeItem('a11y-reduced-motion');
    localStorage.removeItem('a11y-font-size');
    applySettings(false, false, false, 'normal');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl m-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Accessibility Settings</h2>
            <p className="text-sm text-gray-600 mt-1">Customize the interface for your needs</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Close accessibility settings"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* Font Size */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Text Size</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { value: 'small', label: 'Small', size: 'A' },
                { value: 'normal', label: 'Normal', size: 'A' },
                { value: 'large', label: 'Large', size: 'A' },
                { value: 'extra-large', label: 'Extra Large', size: 'A' },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleFontSizeChange(option.value)}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    fontSize === option.value
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                >
                  <div
                    className="font-bold mb-1"
                    style={{
                      fontSize:
                        option.value === 'small'
                          ? '14px'
                          : option.value === 'large'
                          ? '18px'
                          : option.value === 'extra-large'
                          ? '20px'
                          : '16px',
                    }}
                  >
                    {option.size}
                  </div>
                  <div className="text-xs text-gray-600">{option.label}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Visual Settings */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Visual Settings</h3>
            <div className="space-y-3">
              {/* High Contrast */}
              <label className="flex items-center justify-between p-4 border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer">
                <div className="flex-1">
                  <div className="font-medium text-gray-900">High Contrast Mode</div>
                  <div className="text-sm text-gray-600">
                    Increases contrast between text and backgrounds for better readability
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={highContrast}
                  onChange={handleToggleHighContrast}
                  className="ml-4 w-6 h-6 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                />
              </label>

              {/* Colorblind Friendly */}
              <label className="flex items-center justify-between p-4 border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer">
                <div className="flex-1">
                  <div className="font-medium text-gray-900">Colorblind-Friendly Palette</div>
                  <div className="text-sm text-gray-600">
                    Uses colors that are easier to distinguish for people with color vision deficiency
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={colorblindFriendly}
                  onChange={handleToggleColorblindFriendly}
                  className="ml-4 w-6 h-6 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                />
              </label>
            </div>
          </div>

          {/* Motion Settings */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Motion & Animation</h3>
            <label className="flex items-center justify-between p-4 border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer">
              <div className="flex-1">
                <div className="font-medium text-gray-900">Reduced Motion</div>
                <div className="text-sm text-gray-600">
                  Minimizes animations and transitions to reduce distraction and motion sickness
                </div>
              </div>
              <input
                type="checkbox"
                checked={reducedMotion}
                onChange={handleToggleReducedMotion}
                className="ml-4 w-6 h-6 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
              />
            </label>
          </div>

          {/* Keyboard Navigation Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-blue-900 mb-2">Keyboard Navigation</h3>
            <div className="space-y-2 text-sm text-blue-800">
              <div className="flex items-start gap-2">
                <kbd className="px-2 py-1 bg-white border border-blue-300 rounded text-xs font-mono">Tab</kbd>
                <span>Navigate forward through interactive elements</span>
              </div>
              <div className="flex items-start gap-2">
                <kbd className="px-2 py-1 bg-white border border-blue-300 rounded text-xs font-mono">Shift+Tab</kbd>
                <span>Navigate backward through interactive elements</span>
              </div>
              <div className="flex items-start gap-2">
                <kbd className="px-2 py-1 bg-white border border-blue-300 rounded text-xs font-mono">Enter</kbd>
                <span>Activate buttons and links</span>
              </div>
              <div className="flex items-start gap-2">
                <kbd className="px-2 py-1 bg-white border border-blue-300 rounded text-xs font-mono">Esc</kbd>
                <span>Close modals and dialogs</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-between">
          <button
            onClick={handleReset}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Reset to Defaults
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
