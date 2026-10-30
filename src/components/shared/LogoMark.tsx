import React from 'react';

interface LogoMarkProps {
  /** Width and height in pixels. */
  size?: number;
  /**
   * Tile colour. "dark" matches the favicon and the homepage header.
   * "nav" is one step lighter so the tile still shows against the
   * slate-800 top bar.
   */
  tone?: 'dark' | 'nav';
  className?: string;
}

/**
 * The LineList mark: three case rows, each with a leading marker, on a
 * rounded tile. Same geometry as public/favicon.svg, so the tab icon, the
 * homepage and the app all show one logo. Decorative: always sits next to
 * the word "LineList", so it is hidden from screen readers.
 */
export const LogoMark: React.FC<LogoMarkProps> = ({ size = 32, tone = 'dark', className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    aria-hidden="true"
    focusable="false"
    className={className}
  >
    <rect width="32" height="32" rx="6" fill={tone === 'nav' ? '#334155' : '#1e293b'} />
    <circle cx="8" cy="10" r="1.9" fill="#3b82f6" />
    <rect x="12.5" y="8.5" width="12.5" height="3" rx="1.5" fill="#3b82f6" opacity="0.45" />
    <circle cx="8" cy="16" r="1.9" fill="#3b82f6" />
    <rect x="12.5" y="14.5" width="12.5" height="3" rx="1.5" fill="#3b82f6" />
    <circle cx="8" cy="22" r="1.9" fill="#3b82f6" />
    <rect x="12.5" y="20.5" width="12.5" height="3" rx="1.5" fill="#3b82f6" opacity="0.45" />
  </svg>
);
