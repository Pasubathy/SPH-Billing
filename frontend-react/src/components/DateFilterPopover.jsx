import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, CheckCircle2, X } from 'lucide-react';

const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const shortMonthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function DateFilterPopover({ value, onChange, align = 'left' }) {
    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState('day');
    const [currentViewDate, setCurrentViewDate] = useState(new Date());
    const [popupAlign, setPopupAlign] = useState(align);
    
    // For week / custom range
    const [rangeStart, setRangeStart] = useState(null);
    const [rangeEnd, setRangeEnd] = useState(null);
    const [hoverDate, setHoverDate] = useState(null);

    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');

    const containerRef = useRef(null);

    useEffect(() => {
        if (isOpen && containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            if (align === 'right' || (rect.left + 280 > window.innerWidth - 20)) {
                setPopupAlign('right');
            } else {
                setPopupAlign('left');
            }
        }
    }, [isOpen, align]);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleApply = (type, start, end) => {
        const formatStr = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth()+1).padStart(2, '0')}/${d.getFullYear()}`;
        let label = '';
        if (type === 'day') {
            label = formatStr(start);
        } else if (type === 'week') {
            label = `${formatStr(start)} - ${formatStr(end)}`;
        } else if (type === 'month') {
            label = `${shortMonthNames[start.getMonth()]} ${start.getFullYear()}`;
        } else if (type === 'year') {
            label = `${start.getFullYear()}`;
        } else if (type === 'custom') {
            label = `${formatStr(start)} - ${formatStr(end)}`;
        }

        onChange({ start, end, label, type });
        setIsOpen(false);
        setRangeStart(null);
        setRangeEnd(null);
        setHoverDate(null);
    };

    const renderCalendar = (mode) => {
        const year = currentViewDate.getFullYear();
        const month = currentViewDate.getMonth();
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

        return (
            <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <button onClick={() => setCurrentViewDate(new Date(year, month - 1, 1))} style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer' }}>
                        <ChevronLeft style={{ width: '16px', height: '16px' }} />
                    </button>
                    <div style={{ fontWeight: '600', fontSize: '14px' }}>{monthNames[month]} {year}</div>
                    <button onClick={() => setCurrentViewDate(new Date(year, month + 1, 1))} style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer' }}>
                        <ChevronRight style={{ width: '16px', height: '16px' }} />
                    </button>
                </div>

                {mode === 'week' && (
                    <div style={{ fontSize: '11.5px', color: rangeStart && !rangeEnd ? '#2563EB' : '#64748B', fontWeight: rangeStart && !rangeEnd ? '600' : '400', textAlign: 'center', marginBottom: '8px' }}>
                        {rangeStart && !rangeEnd ? 'Click to select End Date' : 'Click to select Start Date'}
                    </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', textAlign: 'center', marginBottom: '8px' }}>
                    {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                        <div key={d} style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '500' }}>{d}</div>
                    ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', textAlign: 'center' }}>
                    {days.map((d, i) => {
                        if (!d) return <div key={i}></div>;
                        const isToday = new Date().toDateString() === d.toDateString();

                        let isStart = false;
                        let isEnd = false;
                        let isInRange = false;

                        if (mode === 'week') {
                            const dTime = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
                            const sTime = rangeStart ? new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate()).getTime() : null;
                            const eTime = rangeEnd ? new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), rangeEnd.getDate()).getTime() : null;
                            const hTime = hoverDate ? new Date(hoverDate.getFullYear(), hoverDate.getMonth(), hoverDate.getDate()).getTime() : null;

                            if (sTime && dTime === sTime) isStart = true;
                            if (eTime && dTime === eTime) isEnd = true;

                            if (sTime && eTime) {
                                isInRange = dTime > Math.min(sTime, eTime) && dTime < Math.max(sTime, eTime);
                            } else if (sTime && !eTime && hTime) {
                                isInRange = dTime > Math.min(sTime, hTime) && dTime < Math.max(sTime, hTime);
                                if (dTime === hTime && dTime !== sTime) isEnd = true;
                            }
                        }

                        let bg = 'transparent';
                        let color = 'var(--text-main)';
                        let fontWeight = isToday ? '600' : '400';

                        if (isStart || isEnd) {
                            bg = '#000B58';
                            color = 'white';
                            fontWeight = '600';
                        } else if (isInRange) {
                            bg = '#EFF6FF';
                            color = '#1D4ED8';
                            fontWeight = '500';
                        }

                        return (
                            <div 
                                key={i} 
                                onClick={() => {
                                    if (mode === 'day') {
                                        handleApply('day', d, d);
                                    } else if (mode === 'week') {
                                        if (!rangeStart || (rangeStart && rangeEnd)) {
                                            setRangeStart(d);
                                            setRangeEnd(null);
                                        } else {
                                            const s = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate());
                                            const e = new Date(d.getFullYear(), d.getMonth(), d.getDate());
                                            if (e.getTime() < s.getTime()) {
                                                setRangeStart(e);
                                                setRangeEnd(s);
                                                handleApply('week', e, s);
                                            } else {
                                                setRangeEnd(e);
                                                handleApply('week', s, e);
                                            }
                                        }
                                    }
                                }}
                                onMouseEnter={() => {
                                    if (mode === 'week' && rangeStart && !rangeEnd) {
                                        setHoverDate(d);
                                    }
                                }}
                                style={{ 
                                    padding: '6px 0', 
                                    cursor: 'pointer', 
                                    borderRadius: '6px',
                                    fontSize: '12px', 
                                    fontWeight,
                                    color,
                                    background: bg,
                                    transition: 'background 0.15s ease'
                                }}
                            >
                                {d.getDate()}
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    const renderMonthGrid = () => {
        const year = currentViewDate.getFullYear();
        return (
            <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <button onClick={() => setCurrentViewDate(new Date(year - 1, 0, 1))} style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer' }}>
                        <ChevronLeft style={{ width: '16px', height: '16px' }} />
                    </button>
                    <div style={{ fontWeight: '600', fontSize: '14px' }}>{year}</div>
                    <button onClick={() => setCurrentViewDate(new Date(year + 1, 0, 1))} style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer' }}>
                        <ChevronRight style={{ width: '16px', height: '16px' }} />
                    </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', textAlign: 'center' }}>
                    {monthNames.map((m, idx) => (
                        <div 
                            key={m} 
                            onClick={() => {
                                const start = new Date(year, idx, 1);
                                const end = new Date(year, idx + 1, 0);
                                handleApply('month', start, end);
                            }}
                            style={{ padding: '8px 0', cursor: 'pointer', borderRadius: '8px', fontSize: '13px' }}
                            onMouseEnter={(e) => e.target.style.background = '#F1F5F9'}
                            onMouseLeave={(e) => e.target.style.background = 'transparent'}
                        >
                            {m}
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    const renderYearGrid = () => {
        const startYear = Math.floor(currentViewDate.getFullYear() / 12) * 12;
        const years = Array.from({length: 12}, (_, i) => startYear + i);
        return (
            <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <button onClick={() => setCurrentViewDate(new Date(startYear - 12, 0, 1))} style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer' }}>
                        <ChevronLeft style={{ width: '16px', height: '16px' }} />
                    </button>
                    <div style={{ fontWeight: '600', fontSize: '14px' }}>{startYear} - {startYear + 11}</div>
                    <button onClick={() => setCurrentViewDate(new Date(startYear + 12, 0, 1))} style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer' }}>
                        <ChevronRight style={{ width: '16px', height: '16px' }} />
                    </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', textAlign: 'center' }}>
                    {years.map(y => (
                        <div 
                            key={y} 
                            onClick={() => {
                                const start = new Date(y, 0, 1);
                                const end = new Date(y, 11, 31);
                                handleApply('year', start, end);
                            }}
                            style={{ padding: '8px 0', cursor: 'pointer', borderRadius: '8px', fontSize: '13px' }}
                            onMouseEnter={(e) => e.target.style.background = '#F1F5F9'}
                            onMouseLeave={(e) => e.target.style.background = 'transparent'}
                        >
                            {y}
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    const renderCustomRange = () => {
        return (
            <div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>From Date</label>
                        <input 
                            type="date" 
                            value={customStart}
                            onChange={(e) => setCustomStart(e.target.value)}
                            style={{ height: '38px', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0 12px', fontFamily: 'inherit', fontSize: '13px', outline: 'none', width: '100%', boxSizing: 'border-box' }}
                        />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>To Date</label>
                        <input 
                            type="date" 
                            value={customEnd}
                            onChange={(e) => setCustomEnd(e.target.value)}
                            style={{ height: '38px', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0 12px', fontFamily: 'inherit', fontSize: '13px', outline: 'none', width: '100%', boxSizing: 'border-box' }}
                        />
                    </div>
                </div>
                <button 
                    onClick={() => {
                        if (customStart && customEnd) {
                            handleApply('custom', new Date(customStart), new Date(customEnd));
                        }
                    }}
                    style={{ width: '100%', height: '38px', border: 'none', borderRadius: '6px', background: '#000B58', color: 'white', fontWeight: '500', cursor: 'pointer' }}
                >
                    Apply
                </button>
            </div>
        );
    };

    const tabs = [
        { id: 'day', label: 'Day' },
        { id: 'week', label: 'Week' },
        { id: 'month', label: 'Month' },
        { id: 'year', label: 'Year' },
        { id: 'custom', label: 'Custom' }
    ];

    return (
        <div style={{ position: 'relative' }} ref={containerRef}>
            <button 
                onClick={() => setIsOpen(!isOpen)}
                style={{ 
                    backgroundColor: 'white', 
                    fontSize: '13px', 
                    borderRadius: '6px', 
                    height: '38px', 
                    border: '1px solid var(--border-color)', 
                    padding: '0 12px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between', 
                    gap: '8px', 
                    cursor: 'pointer', 
                    minWidth: '110px', 
                    fontFamily: 'inherit' 
                }}
            >
                <span style={{ fontWeight: value ? '500' : '400', color: value ? 'var(--text-main)' : '#64748B' }}>{value ? value.label : 'Date'}</span>
                {value ? (
                    <X 
                        style={{ width: '14px', height: '14px', color: 'var(--text-muted)' }} 
                        onClick={(e) => {
                            e.stopPropagation();
                            onChange(null);
                        }}
                    />
                ) : (
                    <ChevronDown style={{ width: '14px', height: '14px', color: 'var(--text-muted)' }} />
                )}
            </button>

            {isOpen && (
                <div style={{ 
                    position: 'absolute', 
                    top: 'calc(100% + 8px)', 
                    ...(popupAlign === 'right' ? { right: 0 } : { left: 0 }),
                    background: 'white', 
                    borderRadius: '12px', 
                    boxShadow: '0 10px 25px rgba(0,0,0,0.1)', 
                    border: '1px solid var(--border-color)', 
                    width: '280px', 
                    padding: '12px', 
                    zIndex: 2000, 
                    boxSizing: 'border-box' 
                }}>
                    <div style={{ display: 'flex', gap: '4px', marginBottom: '12px', flexWrap: 'wrap' }}>
                        {tabs.map(t => (
                            <button 
                                key={t.id}
                                onClick={() => {
                                    setActiveTab(t.id);
                                    setCurrentViewDate(new Date());
                                    setRangeStart(null);
                                    setRangeEnd(null);
                                    setHoverDate(null);
                                }}
                                style={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: '6px', 
                                    padding: '6px 12px', 
                                    borderRadius: '20px', 
                                    border: '1px solid #E2E8F0', 
                                    background: activeTab === t.id ? '#000B58' : '#F8FAFC', 
                                    color: activeTab === t.id ? 'white' : 'var(--text-main)', 
                                    fontSize: '13px', 
                                    fontWeight: '500', 
                                    cursor: 'pointer' 
                                }}
                            >
                                <CheckCircle2 style={{ width: '14px', height: '14px', color: activeTab === t.id ? '#22c55e' : '#CBD5E1' }} /> 
                                {t.label}
                            </button>
                        ))}
                    </div>

                    <div style={{ minHeight: '200px' }}>
                        {(activeTab === 'day' || activeTab === 'week') && renderCalendar(activeTab)}
                        {activeTab === 'month' && renderMonthGrid()}
                        {activeTab === 'year' && renderYearGrid()}
                        {activeTab === 'custom' && renderCustomRange()}
                    </div>
                </div>
            )}
        </div>
    );
}
