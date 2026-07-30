import React, { useState, useEffect, useRef } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';

const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function CustomDatePicker({ value, onChange, style }) {
    const [isOpen, setIsOpen] = useState(false);
    const [viewDate, setViewDate] = useState(value ? new Date(value) : new Date());
    
    const containerRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelectDate = (d) => {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        onChange(`${yyyy}-${mm}-${dd}`);
        setIsOpen(false);
    };

    const displayFormat = () => {
        if (!value) return 'DD-MM-YYYY';
        const parts = value.split('-');
        if (parts.length === 3) {
            return `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
        return value;
    };

    const renderCalendar = () => {
        const year = viewDate.getFullYear();
        const month = viewDate.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        
        let startPadding = firstDay.getDay();
        const days = [];
        for (let i = 0; i < startPadding; i++) {
            days.push(null);
        }
        for (let d = 1; d <= lastDay.getDate(); d++) {
            days.push(new Date(year, month, d));
        }

        const selectedDateStr = value || '';

        return (
            <div style={{ padding: '12px', background: 'white', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', border: '1px solid var(--border-color)', width: '260px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <button type="button" onClick={(e) => { e.stopPropagation(); setViewDate(new Date(year, month - 1, 1)); }} style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer' }}>
                        <ChevronLeft style={{ width: '16px', height: '16px' }} />
                    </button>
                    <div style={{ fontWeight: '600', fontSize: '14px', color: 'var(--text-main)' }}>{monthNames[month]} {year}</div>
                    <button type="button" onClick={(e) => { e.stopPropagation(); setViewDate(new Date(year, month + 1, 1)); }} style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer' }}>
                        <ChevronRight style={{ width: '16px', height: '16px' }} />
                    </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', textAlign: 'center', marginBottom: '8px' }}>
                    {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                        <div key={d} style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '500' }}>{d}</div>
                    ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', textAlign: 'center' }}>
                    {days.map((d, i) => {
                        if (!d) return <div key={i}></div>;
                        const isToday = new Date().toDateString() === d.toDateString();
                        const yyyy = d.getFullYear();
                        const mm = String(d.getMonth() + 1).padStart(2, '0');
                        const dd = String(d.getDate()).padStart(2, '0');
                        const dateStr = `${yyyy}-${mm}-${dd}`;
                        const isSelected = dateStr === selectedDateStr;

                        return (
                            <div 
                                key={i} 
                                onClick={(e) => { e.stopPropagation(); handleSelectDate(d); }}
                                style={{ 
                                    padding: '6px 0', 
                                    cursor: 'pointer', 
                                    borderRadius: '6px',
                                    fontSize: '12px', 
                                    fontWeight: isSelected || isToday ? '600' : '400',
                                    color: isSelected ? 'white' : 'var(--text-main)',
                                    background: isSelected ? '#000B58' : 'transparent',
                                    transition: 'all 0.2s ease'
                                }}
                                onMouseEnter={(e) => { if(!isSelected) e.target.style.background = '#F1F5F9' }}
                                onMouseLeave={(e) => { if(!isSelected) e.target.style.background = 'transparent' }}
                            >
                                {d.getDate()}
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    return (
        <div style={{ position: 'relative', width: '100%' }} ref={containerRef}>
            <div 
                onClick={() => setIsOpen(!isOpen)}
                style={{ 
                    ...style, 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between', 
                    cursor: 'pointer',
                    background: 'white'
                }}
            >
                <span style={{ color: value ? 'inherit' : 'var(--text-muted)' }}>{displayFormat()}</span>
                <CalendarIcon style={{ width: '16px', height: '16px', color: 'var(--text-muted)' }} />
            </div>

            {isOpen && (
                <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 1000 }}>
                    {renderCalendar()}
                </div>
            )}
        </div>
    );
}
