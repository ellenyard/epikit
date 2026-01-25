import { useState, useRef, useEffect } from 'react';
import type { ReactNode } from 'react';

interface ContextualSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  resizable?: boolean;
  position?: 'right' | 'left';
  zIndex?: number;
  showToggleButton?: boolean;
  toggleButtonLabel?: string;
  badge?: string | number;
}

export function ContextualSidebar({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width: initialWidth = 380,
  minWidth = 280,
  maxWidth = 800,
  resizable = false,
  position = 'right',
  zIndex = 20,
  showToggleButton = false,
  toggleButtonLabel,
  badge,
}: ContextualSidebarProps) {
  const [width, setWidth] = useState(initialWidth);
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!resizable) return;
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    if (!resizable || !isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!sidebarRef.current) return;

      const containerWidth = window.innerWidth;
      const newWidth = position === 'right'
        ? containerWidth - e.clientX
        : e.clientX;

      // Constrain width between min and max
      const constrainedWidth = Math.min(Math.max(newWidth, minWidth), maxWidth);
      setWidth(constrainedWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, minWidth, maxWidth, position, resizable]);

  // Prevent text selection during resize
  useEffect(() => {
    if (isResizing) {
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
    } else {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    }
  }, [isResizing]);

  const positionClasses = position === 'right'
    ? 'right-0'
    : 'left-0';

  const resizeHandlePosition = position === 'right' ? 'left-0' : 'right-0';

  return (
    <>
      {/* Toggle Button (optional) */}
      {showToggleButton && (
        <button
          onClick={isOpen ? onClose : () => {}}
          className={`fixed ${position === 'right' ? 'right-0' : 'left-0'} top-1/2 -translate-y-1/2 flex items-center gap-1 px-2 py-3 text-sm font-medium rounded-${position === 'right' ? 'l' : 'r'}-lg shadow-lg transition-all`}
          style={{
            zIndex: zIndex + 10,
            writingMode: 'vertical-rl',
            textOrientation: 'mixed',
          }}
        >
          <span className={position === 'right' ? 'rotate-180' : ''}>
            {toggleButtonLabel || title}
          </span>
          {badge && (
            <span className="inline-flex items-center justify-center min-w-5 h-5 px-1 text-xs font-bold rounded-full bg-blue-600 text-white">
              {badge}
            </span>
          )}
        </button>
      )}

      {/* Sidebar Panel */}
      <div
        ref={sidebarRef}
        className={`fixed top-0 ${positionClasses} h-full bg-white border-${position === 'right' ? 'l' : 'r'} border-gray-200 shadow-xl transition-transform duration-300`}
        style={{
          width: `${width}px`,
          zIndex,
          transform: isOpen
            ? 'translateX(0)'
            : position === 'right'
            ? 'translateX(100%)'
            : 'translateX(-100%)',
        }}
      >
        {/* Resize Handle */}
        {resizable && isOpen && (
          <div
            className={`absolute ${resizeHandlePosition} top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500 transition-colors group`}
            onMouseDown={handleMouseDown}
          >
            <div className="absolute inset-y-0 -left-1 -right-1" />
            {/* Visual indicator on hover */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-12 bg-gray-300 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        )}

        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white">
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-gray-900 truncate">{title}</h3>
              {subtitle && (
                <p className="text-sm text-gray-500 truncate">{subtitle}</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="flex-shrink-0 ml-3 p-1 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {children}
          </div>

          {/* Footer */}
          {footer && (
            <div className="border-t border-gray-200 bg-gray-50">
              {footer}
            </div>
          )}
        </div>
      </div>

      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-25 lg:hidden"
          style={{ zIndex: zIndex - 1 }}
          onClick={onClose}
        />
      )}
    </>
  );
}
