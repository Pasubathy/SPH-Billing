// date-filter.js
document.addEventListener('DOMContentLoaded', () => {
    const popup = document.getElementById('globalDateFilterPopup');
    if (!popup) return;
    const tabs = popup.querySelectorAll('.date-tab-btn');
    const content = document.getElementById('datePickerContent');
    
    let activeTarget = null;
    let currentViewDate = new Date();
    let currentSelectedRange = { start: null, end: null };
    let tempCustomStart = null;
    
    // Store filters for each list
    // target -> { type: 'day'|'week'|'month'|'year'|'custom', start: Date, end: Date, label: string }
    window.dateFilters = {
        salesList: null,
        customerList: null,
        arList: null
    };

    const filterBtns = document.querySelectorAll('.date-filter-btn');

    filterBtns.forEach(btn => {
        if (!btn) return;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const target = btn.getAttribute('data-target');

            if (e.target.closest('.clear-date-icon')) {
                window.dateFilters[target] = null;
                const btnText = btn.querySelector('.date-filter-text');
                if (btnText) btnText.textContent = 'Date';
                
                let iconEl = btn.querySelector('svg') || btn.querySelector('i');
                if (iconEl) {
                    const newIcon = document.createElement('i');
                    newIcon.setAttribute('data-lucide', 'chevron-down');
                    newIcon.style.width = '14px';
                    newIcon.style.height = '14px';
                    newIcon.style.color = 'var(--text-muted)';
                    btn.replaceChild(newIcon, iconEl);
                    if (window.lucide) lucide.createIcons({ root: btn });
                }
                
                if (popup.style.display === 'block') {
                    popup.style.display = 'none';
                    activeTarget = null;
                }
                
                if (window.triggerWorkspaceRender) window.triggerWorkspaceRender(target);
                return;
            }

            if (activeTarget === target && popup.style.display === 'block') {
                popup.style.display = 'none';
                activeTarget = null;
                return;
            }
            
            activeTarget = target;
            const rect = btn.getBoundingClientRect();
            popup.style.top = (rect.bottom + window.scrollY + 8) + 'px';
            
            // Adjust left if offscreen
            if (rect.left + window.scrollX + 280 > window.innerWidth) {
                popup.style.left = (window.innerWidth - 300) + 'px';
            } else {
                popup.style.left = (rect.left + window.scrollX) + 'px';
            }
            
            popup.style.display = 'block';
            
            const currentFilter = window.dateFilters[target];
            const type = currentFilter ? currentFilter.type : 'day';
            switchTab(type);
        });
    });

    document.addEventListener('click', (e) => {
        if (popup && popup.style.display === 'block' && !e.composedPath().includes(popup) && !e.target.closest('.date-filter-btn')) {
            popup.style.display = 'none';
            activeTarget = null;
        }
    });

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            switchTab(tab.getAttribute('data-tab'));
        });
    });

    function switchTab(tabId) {
        tabs.forEach(t => {
            if (t.getAttribute('data-tab') === tabId) {
                t.classList.add('active');
                t.style.background = '#000B58';
                t.style.color = 'white';
                const icon = t.querySelector('i');
                if(icon) icon.style.color = '#22c55e';
            } else {
                t.classList.remove('active');
                t.style.background = '#F8FAFC';
                t.style.color = 'var(--text-main)';
                const icon = t.querySelector('i');
                if(icon) icon.style.color = '#CBD5E1';
            }
        });

        content.innerHTML = '';
        currentViewDate = new Date(); 
        tempCustomStart = null;
        
        if (tabId === 'day' || tabId === 'week') {
            renderCalendar(tabId);
        } else if (tabId === 'month') {
            renderMonthGrid();
        } else if (tabId === 'year') {
            renderYearGrid();
        } else if (tabId === 'custom') {
            renderCustomRange();
        }
    }

    function renderCalendar(mode) {
        const year = currentViewDate.getFullYear();
        const month = currentViewDate.getMonth();
        
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        
        let html = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <button id="calPrevMonth" style="background: none; border: 1px solid var(--border-color); border-radius: 6px; padding: 4px 8px; cursor: pointer;"><i data-lucide="chevron-left" style="width: 16px; height: 16px;"></i></button>
                <div style="font-weight: 600;">${monthNames[month]} ${year}</div>
                <button id="calNextMonth" style="background: none; border: 1px solid var(--border-color); border-radius: 6px; padding: 4px 8px; cursor: pointer;"><i data-lucide="chevron-right" style="width: 16px; height: 16px;"></i></button>
            </div>
            <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; text-align: center; margin-bottom: 8px;">
                <div style="font-size: 12px; color: var(--text-muted); font-weight: 500;">Su</div>
                <div style="font-size: 12px; color: var(--text-muted); font-weight: 500;">Mo</div>
                <div style="font-size: 12px; color: var(--text-muted); font-weight: 500;">Tu</div>
                <div style="font-size: 12px; color: var(--text-muted); font-weight: 500;">We</div>
                <div style="font-size: 12px; color: var(--text-muted); font-weight: 500;">Th</div>
                <div style="font-size: 12px; color: var(--text-muted); font-weight: 500;">Fr</div>
                <div style="font-size: 12px; color: var(--text-muted); font-weight: 500;">Sa</div>
            </div>
            <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; text-align: center;" id="calendarDays">
        `;
        
        let startPadding = firstDay.getDay();
        for (let i = 0; i < startPadding; i++) {
            html += `<div></div>`;
        }
        
        for (let d = 1; d <= lastDay.getDate(); d++) {
            const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
            const isToday = (new Date().toDateString() === new Date(year, month, d).toDateString());
            let bg = 'transparent';
            let color = 'var(--text-main)';
            let br = '6px';
            
            html += `<div class="cal-day-cell" data-date="${dateStr}" style="padding: 6px 0; cursor: pointer; border-radius: ${br}; background: ${bg}; color: ${color}; font-size: 12px; font-weight: ${isToday ? '600' : '400'};">${d}</div>`;
        }
        
        html += `</div>`;
        content.innerHTML = html;
        if(window.lucide) lucide.createIcons();
        
        document.getElementById('calPrevMonth').onclick = () => {
            currentViewDate.setMonth(currentViewDate.getMonth() - 1);
            renderCalendar(mode);
        };
        document.getElementById('calNextMonth').onclick = () => {
            currentViewDate.setMonth(currentViewDate.getMonth() + 1);
            renderCalendar(mode);
        };
        
        document.querySelectorAll('.cal-day-cell').forEach(cell => {
            cell.onclick = (e) => {
                const dateParts = e.target.getAttribute('data-date').split('-');
                const selectedDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
                
                if (mode === 'day') {
                    applySelection('day', selectedDate, selectedDate);
                } else if (mode === 'week') {
                    const day = selectedDate.getDay();
                    const diffToMonday = selectedDate.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is sunday
                    const startOfWeek = new Date(selectedDate.setDate(diffToMonday));
                    const endOfWeek = new Date(startOfWeek);
                    endOfWeek.setDate(startOfWeek.getDate() + 6);
                    applySelection('week', startOfWeek, endOfWeek);
                }
            };
            
            // Hover effect for week
            if (mode === 'week') {
                cell.onmouseenter = (e) => {
                    const rowCells = [];
                    let el = e.target;
                    while(el.previousElementSibling && el.previousElementSibling.classList.contains('cal-day-cell')){
                        if(Array.from(el.parentNode.children).indexOf(el) % 7 === 0) break;
                        rowCells.push(el.previousElementSibling);
                        el = el.previousElementSibling;
                    }
                    el = e.target;
                    rowCells.push(el);
                    while(el.nextElementSibling && el.nextElementSibling.classList.contains('cal-day-cell')){
                        if(Array.from(el.parentNode.children).indexOf(el) % 7 === 6) break;
                        rowCells.push(el.nextElementSibling);
                        el = el.nextElementSibling;
                    }
                    document.querySelectorAll('.cal-day-cell').forEach(c => c.style.background = 'transparent');
                    rowCells.forEach(c => c.style.background = '#F1F5F9');
                };
                cell.onmouseleave = () => {
                    document.querySelectorAll('.cal-day-cell').forEach(c => c.style.background = 'transparent');
                };
            } else {
                cell.onmouseenter = (e) => e.target.style.background = '#F1F5F9';
                cell.onmouseleave = (e) => e.target.style.background = 'transparent';
            }
        });
    }

    function renderMonthGrid() {
        const year = currentViewDate.getFullYear();
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        
        let html = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <button id="calPrevYear" style="background: none; border: 1px solid var(--border-color); border-radius: 6px; padding: 4px 8px; cursor: pointer;"><i data-lucide="chevron-left" style="width: 16px; height: 16px;"></i></button>
                <div style="font-weight: 600;">${year}</div>
                <button id="calNextYear" style="background: none; border: 1px solid var(--border-color); border-radius: 6px; padding: 4px 8px; cursor: pointer;"><i data-lucide="chevron-right" style="width: 16px; height: 16px;"></i></button>
            </div>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; text-align: center;">
        `;
        
        monthNames.forEach((m, idx) => {
            html += `<div class="cal-month-cell" data-month="${idx}" style="padding: 8px 0; cursor: pointer; border-radius: 8px; font-size: 13px;">${m}</div>`;
        });
        
        html += `</div>`;
        content.innerHTML = html;
        if(window.lucide) lucide.createIcons();
        
        document.getElementById('calPrevYear').onclick = () => {
            currentViewDate.setFullYear(currentViewDate.getFullYear() - 1);
            renderMonthGrid();
        };
        document.getElementById('calNextYear').onclick = () => {
            currentViewDate.setFullYear(currentViewDate.getFullYear() + 1);
            renderMonthGrid();
        };
        
        document.querySelectorAll('.cal-month-cell').forEach(cell => {
            cell.onmouseenter = (e) => e.target.style.background = '#F1F5F9';
            cell.onmouseleave = (e) => e.target.style.background = 'transparent';
            cell.onclick = (e) => {
                const m = parseInt(e.target.getAttribute('data-month'));
                const start = new Date(year, m, 1);
                const end = new Date(year, m + 1, 0);
                applySelection('month', start, end);
            };
        });
    }

    function renderYearGrid() {
        const startYear = Math.floor(currentViewDate.getFullYear() / 12) * 12;
        
        let html = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <button id="calPrevDecade" style="background: none; border: 1px solid var(--border-color); border-radius: 6px; padding: 4px 8px; cursor: pointer;"><i data-lucide="chevron-left" style="width: 16px; height: 16px;"></i></button>
                <div style="font-weight: 600;">${startYear} - ${startYear + 11}</div>
                <button id="calNextDecade" style="background: none; border: 1px solid var(--border-color); border-radius: 6px; padding: 4px 8px; cursor: pointer;"><i data-lucide="chevron-right" style="width: 16px; height: 16px;"></i></button>
            </div>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; text-align: center;">
        `;
        
        for (let i = 0; i < 12; i++) {
            const y = startYear + i;
            html += `<div class="cal-year-cell" data-year="${y}" style="padding: 8px 0; cursor: pointer; border-radius: 8px; font-size: 13px;">${y}</div>`;
        }
        
        html += `</div>`;
        content.innerHTML = html;
        if(window.lucide) lucide.createIcons();
        
        document.getElementById('calPrevDecade').onclick = () => {
            currentViewDate.setFullYear(currentViewDate.getFullYear() - 12);
            renderYearGrid();
        };
        document.getElementById('calNextDecade').onclick = () => {
            currentViewDate.setFullYear(currentViewDate.getFullYear() + 12);
            renderYearGrid();
        };
        
        document.querySelectorAll('.cal-year-cell').forEach(cell => {
            cell.onmouseenter = (e) => e.target.style.background = '#F1F5F9';
            cell.onmouseleave = (e) => e.target.style.background = 'transparent';
            cell.onclick = (e) => {
                const y = parseInt(e.target.getAttribute('data-year'));
                const start = new Date(y, 0, 1);
                const end = new Date(y, 11, 31);
                applySelection('year', start, end);
            };
        });
    }

    function renderCustomRange() {
        let html = `
            <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px;">
                <div style="display: flex; flex-direction: column; gap: 4px;">
                    <label style="font-size: 12px; color: var(--text-muted);">From Date</label>
                    <input type="date" id="customStartDate" style="height: 38px; border: 1px solid var(--border-color); border-radius: 6px; padding: 0 12px; font-family: inherit; font-size: 13px; outline: none; width: 100%; box-sizing: border-box;">
                </div>
                <div style="display: flex; flex-direction: column; gap: 4px;">
                    <label style="font-size: 12px; color: var(--text-muted);">To Date</label>
                    <input type="date" id="customEndDate" style="height: 38px; border: 1px solid var(--border-color); border-radius: 6px; padding: 0 12px; font-family: inherit; font-size: 13px; outline: none; width: 100%; box-sizing: border-box;">
                </div>
            </div>
            <button id="applyCustomBtn" style="width: 100%; height: 38px; border: none; border-radius: 6px; background: #000B58; color: white; font-weight: 500; cursor: pointer;">Apply</button>
        `;
        content.innerHTML = html;
        
        document.getElementById('applyCustomBtn').onclick = () => {
            const s = document.getElementById('customStartDate').value;
            const e = document.getElementById('customEndDate').value;
            if (s && e) {
                applySelection('custom', new Date(s), new Date(e));
            }
        };
    }

    function applySelection(type, start, end) {
        if (!activeTarget) return;
        
        // Format dates
        const formatStr = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth()+1).padStart(2, '0')}/${d.getFullYear()}`;
        
        let label = '';
        if (type === 'day') {
            label = formatStr(start);
        } else if (type === 'week') {
            label = `${formatStr(start)} - ${formatStr(end)}`;
        } else if (type === 'month') {
            const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            label = `${monthNames[start.getMonth()]} ${start.getFullYear()}`;
        } else if (type === 'year') {
            label = `${start.getFullYear()}`;
        } else if (type === 'custom') {
            label = `${formatStr(start)} - ${formatStr(end)}`;
        }
        
        window.dateFilters[activeTarget] = { type, start, end, label };
        
        const btn = document.querySelector(`button[data-target="${activeTarget}"]`);
        if (btn) {
            const btnText = btn.querySelector('.date-filter-text');
            if (btnText) btnText.textContent = label;

            let iconEl = btn.querySelector('svg') || btn.querySelector('i');
            if (iconEl) {
                const newIcon = document.createElement('i');
                newIcon.setAttribute('data-lucide', 'x');
                newIcon.className = 'clear-date-icon';
                newIcon.style.width = '14px';
                newIcon.style.height = '14px';
                newIcon.style.color = 'var(--text-muted)';
                newIcon.style.cursor = 'pointer';
                btn.replaceChild(newIcon, iconEl);
                if (window.lucide) lucide.createIcons({ root: btn });
            }
        }
        
        popup.style.display = 'none';
        
        // Trigger table re-render
        if (window.triggerWorkspaceRender) {
            window.triggerWorkspaceRender(activeTarget);
        }
    }

    window.clearDateFilter = function(target) {
        if (!window.dateFilters || !window.dateFilters[target]) return;
        
        window.dateFilters[target] = null;
        const btn = document.querySelector(`button[data-target="${target}"]`);
        if (btn) {
            const btnText = btn.querySelector('.date-filter-text');
            if (btnText) btnText.textContent = 'Date';
            
            let iconEl = btn.querySelector('svg') || btn.querySelector('i');
            if (iconEl) {
                const newIcon = document.createElement('i');
                newIcon.setAttribute('data-lucide', 'chevron-down');
                newIcon.style.width = '14px';
                newIcon.style.height = '14px';
                newIcon.style.color = 'var(--text-muted)';
                btn.replaceChild(newIcon, iconEl);
                if (window.lucide) lucide.createIcons({ root: btn });
            }
        }
    };

    window.checkDateFilter = function(dateStr, filterObj) {
        if (!filterObj || filterObj.type === 'all' || !dateStr) return true;
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return true;
        
        const start = filterObj.start;
        const end = filterObj.end;
        
        // Strip time from d for accurate start/end comparisons
        const checkDate = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        const startTime = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
        const endTime = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999).getTime();

        return checkDate >= startTime && checkDate <= endTime;
    };
});
