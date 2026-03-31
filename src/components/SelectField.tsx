import React, { useEffect, useRef, useState } from 'react';
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
}

export const SelectField = <T,>({
  label,
  value,
  onChange,
  options,
  icon: Icon,
  className = '',
}: SelectFieldProps<T>) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedOption = options.find(opt => opt.value === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={`flex flex-col gap-2 ${className}`} ref={containerRef}>
      <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
        {Icon && <Icon className="w-4 h-4 text-slate-400" />}
        {label}
      </label>
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`w-full flex items-center justify-between bg-white border text-slate-800 rounded-xl px-4 py-3 text-sm outline-none transition-all cursor-pointer shadow-sm hover:border-slate-300
            ${isOpen ? 'border-slate-300 ring-2 ring-slate-100' : 'border-slate-200'}
          `}
        >
          <span className="truncate">{selectedOption?.label || String(value)}</span>
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 4, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
              className="absolute z-50 w-full bg-white border border-slate-200 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.12)] overflow-hidden p-1.5"
            >
              <div className="max-h-60 overflow-y-auto scrollbar-hide">
                {options.map(opt => (
                  <button
                    key={String(opt.value)}
                    type="button"
                    onClick={() => {
                      onChange(opt.value);
                      setIsOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2.5 text-sm transition-all flex items-center justify-between rounded-xl mb-0.5 last:mb-0
                      ${value === opt.value
                        ? 'bg-slate-50 text-slate-900 font-semibold'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                  >
                    {opt.label}
                    {value === opt.value && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
