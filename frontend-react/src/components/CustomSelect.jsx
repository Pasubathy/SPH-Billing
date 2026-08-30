import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

/**
 * CustomSelect - Reusable styled dropdown replacing native <select>
 *
 * Props:
 *  value        – current selected value
 *  onChange     – (value) => void
 *  options      – Array of { value, label } objects
 *  placeholder  – string shown when nothing is selected
 *  icon         – optional Lucide icon element shown as prefix
 *  width        – CSS width string (default '100%')
 *  height       – CSS height string (default '38px')
 *  disabled     – boolean
 *  className    – extra class on wrapper
 *  style        – extra styles on wrapper
 *  inline       – if true, renders a compact inline variant (for use inside input groups)
 */
const CustomSelect = ({
  value = '',
  onChange,
  options = [],
  placeholder = 'Select',
  icon = null,
  width = '100%',
  height = '38px',
  borderRadius = '8px',
  disabled = false,
  className = '',
  style = {},
  triggerStyle = {},
  inline = false,
  menuDirection = 'auto',
  minWidth = null,
}) => {
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState(menuDirection === 'up' ? 'up' : 'down');
  const ref = useRef(null);

  const selected = options.find(o => String(o.value) === String(value));
  const hasValue = selected !== undefined && String(value) !== '' && String(value) !== 'All';

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Determine menuDirection dynamically if auto
  useEffect(() => {
    if (menuDirection === 'up') {
      setDirection('up');
    } else if (menuDirection === 'down') {
      setDirection('down');
    } else if (open && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      if (spaceBelow < 220 && rect.top > spaceBelow) {
        setDirection('up');
      } else {
        setDirection('down');
      }
    }
  }, [open, menuDirection]);

  const handleSelect = (val) => {
    if (onChange) onChange(val);
    setOpen(false);
  };

  // ── Inline variant (compact, for inside input-group rows like "without tax") ──
  if (inline) {
    return (
      <div
        ref={ref}
        style={{
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          height: '100%',
          borderLeft: '1px solid var(--border-color)',
          background: '#F1F5F9',
          borderTopRightRadius: '5px',
          borderBottomRightRadius: '5px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          ...style,
        }}
        className={className}
      >
        <div
          onClick={() => !disabled && setOpen(!open)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '0 8px',
            fontSize: '12px',
            fontFamily: 'inherit',
            color: 'var(--text-main)',
            whiteSpace: 'nowrap',
            userSelect: 'none',
            height: '100%',
          }}
        >
          <span>{selected ? selected.label : placeholder}</span>
          <ChevronDown
            size={11}
            style={{ transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none', color: '#94A3B8' }}
          />
        </div>

        {open && (
          <div style={{
            position: 'absolute',
            bottom: 'calc(100% + 4px)',
            right: 0,
            background: 'white',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            zIndex: 9999,
            minWidth: '130px',
            padding: '4px',
            overflow: 'hidden',
          }}>
            {options.map((opt) => {
              const isSelected = String(opt.value) === String(value);
              return (
                <InlineOption
                  key={opt.value}
                  label={opt.label}
                  isSelected={isSelected}
                  onSelect={() => handleSelect(opt.value)}
                />
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Standard full dropdown ──
  return (
    <div
      ref={ref}
      style={{ position: 'relative', width, ...style }}
      className={className}
    >
      {/* Trigger */}
      <div
        onClick={() => !disabled && setOpen(!open)}
        style={{
          height,
          padding: '0 10px',
          border: open ? '1px solid var(--primary-color)' : '1px solid var(--border-color)',
          borderRadius,
          backgroundColor: disabled ? '#F8FAFC' : 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: disabled ? 'not-allowed' : 'pointer',
          gap: '6px',
          boxShadow: open ? '0 0 0 2px rgba(0,11,88,0.08)' : 'none',
          transition: 'all 0.15s ease',
          userSelect: 'none',
          opacity: disabled ? 0.6 : 1,
          boxSizing: 'border-box',
          ...triggerStyle,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flex: 1 }}>
          {icon && (
            <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
              {React.cloneElement(icon, {
                size: 13,
                color: '#94A3B8',
              })}
            </span>
          )}
          <span style={{
            color: hasValue ? 'var(--text-main)' : '#64748B',
            fontSize: '13px',
            fontWeight: hasValue ? '500' : '400',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {selected ? selected.label : placeholder}
          </span>
        </div>
        <ChevronDown
          size={13}
          color="#94A3B8"
          style={{ transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none', flexShrink: 0 }}
        />
      </div>

      {/* Panel */}
      {open && (
        <div style={{
          position: 'absolute',
          top: direction === 'up' ? 'auto' : 'calc(100% + 4px)',
          bottom: direction === 'up' ? 'calc(100% + 4px)' : 'auto',
          left: 0,
          right: 0,
          minWidth: minWidth !== null ? minWidth : (parseInt(width) < 120 ? width : '160px'),
          background: 'white',
          border: '1px solid var(--border-color)',
          borderRadius: '10px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.06)',
          zIndex: 9999,
          padding: '6px',
          maxHeight: '240px',
          overflowY: 'auto',
        }}>
          {options.map((opt, i) => {
            const isSelected = String(opt.value) === String(value);
            const isFirst = i === 0;
            const needsDivider = opt._divider;

            return (
              <React.Fragment key={opt.value}>
                {needsDivider && (
                  <div style={{ height: '1px', background: 'var(--border-color)', margin: '4px 0' }} />
                )}
                <DropdownOption
                  label={opt.label}
                  isSelected={isSelected}
                  onSelect={() => handleSelect(opt.value)}
                />
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ── Internal option renderers ──
function DropdownOption({ label, isSelected, onSelect }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '7px 10px',
        borderRadius: '6px',
        fontSize: '13px',
        cursor: 'pointer',
        fontWeight: isSelected ? '600' : '400',
        color: isSelected ? 'var(--primary-color)' : 'var(--text-main)',
        background: isSelected ? '#EEF2FF' : hovered ? '#F8FAFC' : 'transparent',
        transition: 'background 0.1s',
      }}
    >
      <span>{label}</span>
      {isSelected && <Check size={13} color="var(--primary-color)" />}
    </div>
  );
}

function InlineOption({ label, isSelected, onSelect }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 10px',
        borderRadius: '5px',
        fontSize: '12px',
        cursor: 'pointer',
        fontWeight: isSelected ? '600' : '400',
        color: isSelected ? 'var(--primary-color)' : 'var(--text-main)',
        background: isSelected ? '#EEF2FF' : hovered ? '#F8FAFC' : 'transparent',
        whiteSpace: 'nowrap',
      }}
    >
      <span>{label}</span>
      {isSelected && <Check size={11} color="var(--primary-color)" style={{ marginLeft: '6px' }} />}
    </div>
  );
}

export default CustomSelect;
