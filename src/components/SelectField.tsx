import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, ChevronDown, LucideIcon } from 'lucide-react';

export interface SelectFieldOption<T = any> {
  label: string;
  value: T;
}

interface SelectFieldProps<T = any> {
  label: string;
  value: T;
  onChange: (val: T) => void;
  options: SelectFieldOption<T>[];
  icon?: LucideIcon;
  className?: string;
  buttonClassName?: string;
  allowCustomInput?: boolean;
  customInputPlaceholder?: string;
}

const normalizeCustomDimensionValue = (value: string) =>
  value.replace(/[xX×＊*]/g, 'x').replace(/\s+/g, '').toLowerCase();

const parseCustomDimensionValue = (value: string) => {
  const normalized = normalizeCustomDimensionValue(value);
  const match = normalized.match(/^(\d{2,5})x(\d{2,5})$/);
  if (!match) {
    return null;
  }

  const width = parseInt(match[1], 10);
  const height = parseInt(match[2], 10);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  if (width > 8192 || height > 8192) {
    return null;
  }

  return `${width}x${height}`;
};

export const SelectField = <T,>({
  label,
  value,
  onChange,
  options,
  icon: Icon,
  className = '',
  buttonClassName = '',
  allowCustomInput = false,
  customInputPlaceholder = '自定义尺寸，例如 1008x1000',
}: SelectFieldProps<T>) => {
  const [isOpen, setIsOpen] = useState(false);
  const [customInputDraft, setCustomInputDraft] = useState('');
  const [menuPlacement, setMenuPlacement] = useState<'up' | 'down'>('down');
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const selectedOption = options.find(opt => opt.value === value);

  useEffect(() => {
    if (!allowCustomInput) {
      return;
    }

    if (selectedOption) {
      setCustomInputDraft('');
      return;
    }

    setCustomInputDraft(String(value ?? '').trim());
  }, [allowCustomInput, selectedOption, value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        (!menuRef.current || !menuRef.current.contains(target))
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen || !buttonRef.current) {
      return;
    }

    const updateMenuPosition = () => {
      if (!buttonRef.current) {
        return;
      }

      const rect = buttonRef.current.getBoundingClientRect();
      const viewportPadding = 16;
      const gap = 8;
      const estimatedHeight = Math.min(options.length * 44 + 12, 252);
      const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
      const spaceAbove = rect.top - viewportPadding;
      const nextPlacement = spaceBelow < estimatedHeight && spaceAbove > spaceBelow ? 'up' : 'down';
      const availableSpace = nextPlacement === 'up' ? spaceAbove : spaceBelow;
      const maxHeight = Math.max(120, Math.min(240, availableSpace - gap));

      setMenuPlacement(nextPlacement);
      setMenuStyle({
        left: rect.left,
        width: rect.width,
        maxHeight,
        ...(nextPlacement === 'up'
          ? { bottom: window.innerHeight - rect.top + gap }
          : { top: rect.bottom + gap }),
      });
    };

    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);

    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [isOpen, options.length]);

  const commitCustomInput = () => {
    if (!allowCustomInput) {
      return false;
    }

    const parsed = parseCustomDimensionValue(customInputDraft);
    if (!parsed) {
      return false;
    }

    onChange(parsed as T);
    return true;
  };

  const menuContent = (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={menuRef}
          initial={{ opacity: 0, y: menuPlacement === 'up' ? 8 : -8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: menuPlacement === 'up' ? 8 : -8, scale: 0.98 }}
          transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
          style={menuStyle}
          className="vx-select-menu fixed z-[200] overflow-hidden rounded-2xl p-1.5"
        >
          <div className="scrollbar-hide overflow-y-auto" style={{ maxHeight: menuStyle.maxHeight }}>
            {allowCustomInput && (
              <div className="sticky top-0 z-[1] bg-[rgba(18,22,32,0.96)] px-1 pb-2">
                <input
                  type="text"
                  value={customInputDraft}
                  onChange={event => {
                    const nextValue = event.target.value;
                    setCustomInputDraft(nextValue);
                    const parsed = parseCustomDimensionValue(nextValue);
                    if (parsed) {
                      onChange(parsed as T);
                    }
                  }}
                  onBlur={() => {
                    if (!customInputDraft.trim()) {
                      if (!selectedOption) {
                        setCustomInputDraft(String(value ?? ''));
                      }
                      return;
                    }

                    const committed = commitCustomInput();
                    if (!committed) {
                      setCustomInputDraft(selectedOption ? '' : String(value ?? ''));
                    }
                  }}
                  onKeyDown={event => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      const committed = commitCustomInput();
                      if (committed) {
                        setIsOpen(false);
                      } else {
                        setCustomInputDraft(selectedOption ? '' : String(value ?? ''));
                      }
                    }
                  }}
                  placeholder={customInputPlaceholder}
                  className="vx-input w-full rounded-xl px-4 py-3 text-sm shadow-sm transition-all"
                />
              </div>
            )}
            {options.map(opt => (
              <button
                key={String(opt.value)}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                className={`vx-select-option mb-0.5 flex w-full cursor-pointer items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition-all last:mb-0 ${
                  value === opt.value
                    ? 'vx-select-option-active font-semibold'
                    : ''
                }`}
              >
                {opt.label}
                {value === opt.value && <CheckCircle2 className="h-3.5 w-3.5 text-[var(--vx-brand-2)]" />}
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  const hasLabel = Boolean(label);

  return (
    <div className={`flex flex-col ${hasLabel ? 'gap-2' : 'gap-0'} ${className}`} ref={containerRef}>
      {hasLabel && (
        <label className="vx-field-label flex items-center gap-2 text-sm font-bold">
          {Icon && <Icon className="h-4 w-4 text-[var(--vx-text-muted)]" />}
          {label}
        </label>
      )}
      <div className="relative">
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setIsOpen(prev => !prev)}
          className={`vx-input flex w-full cursor-pointer items-center justify-between rounded-2xl px-4 py-3 text-left text-sm shadow-sm transition ${buttonClassName}`}
        >
          <div className="min-w-0">
            <span className="block truncate">
              {selectedOption ? selectedOption.label : String(value ?? '') || customInputPlaceholder}
            </span>
          </div>
          <ChevronDown className={`ml-3 h-4 w-4 shrink-0 text-[var(--vx-text-muted)] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        {typeof document !== 'undefined' ? createPortal(menuContent, document.body) : null}
      </div>
    </div>
  );
};
