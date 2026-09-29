import React, { useRef } from 'react';

interface MoneyInputProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  required?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
  mode?: 'money' | 'percentage';
}

const formatNumber = (value: number): string => new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(value);

export default function MoneyInput({
  value,
  onChange,
  className,
  placeholder,
  required,
  autoFocus,
  disabled,
  mode = 'money',
}: MoneyInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const formatValue = (rawValue: string) => {
    if (mode === 'percentage') {
      const trimmed = rawValue.trim();
      if (!trimmed) return '';
      const normalized = trimmed.includes(',')
        ? trimmed.replace(/\./g, '').replace(',', '.')
        : trimmed;
      if (!normalized || !/^\d+(?:\.\d*)?$/.test(normalized)) return value;
      const number = Number(normalized);
      return Number.isFinite(number) ? formatNumber(number) : value;
    }

    const digits = rawValue.replace(/\D/g, '');
    if (!digits) return '';
    return formatNumber(parseInt(digits, 10) / 100);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(formatValue(e.target.value));
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    if (!value || value === '0,00') {
      const len = e.target.value.length;
      setTimeout(() => inputRef.current?.setSelectionRange(len, len), 0);
    }
  };

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={handleChange}
      onFocus={handleFocus}
      className={className}
      placeholder={placeholder}
      required={required}
      autoFocus={autoFocus}
      disabled={disabled}
      inputMode={mode === 'percentage' ? 'decimal' : 'numeric'}
    />
  );
}
