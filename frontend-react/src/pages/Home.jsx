import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
    TrendingUp, 
    CreditCard, 
    Truck, 
    Boxes, 
    Clock,
    X
} from 'lucide-react';
import DateFilterPopover from '../components/DateFilterPopover';

const Home = () => {
    const navigate = useNavigate();

    // Data States
    const [sales, setSales] = useState([]);
    const [salesReturns, setSalesReturns] = useState([]);
    const [payments, setPayments] = useState([]);
    const [purchases, setPurchases] = useState([]);
    const [purchaseReturns, setPurchaseReturns] = useState([]);
    const [vendorPayments, setVendorPayments] = useState([]);
    const [items, setItems] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [vendors, setVendors] = useState([]);

    // Today's Date Filter Helper
    const getTodayFilter = () => {
        const today = new Date();
        const formatStr = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
        return {
            start: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0),
            end: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999),
            label: formatStr(today),
            type: 'day'
        };
    };

    // Date Filter State (default to Today)
    const [dateFilter, setDateFilter] = useState(getTodayFilter);

    const handleDateFilterChange = (val) => {
        if (!val) {
            setDateFilter(getTodayFilter());
        } else {
            setDateFilter(val);
        }
    };

    const isTodaySelected = useMemo(() => {
        if (!dateFilter) return false;
        const today = getTodayFilter();
        return dateFilter.label === today.label && dateFilter.type === 'day';
    }, [dateFilter]);

    // Load All Business Data
    useEffect(() => {
        const fetchDashboardData = async () => {
            try {
                const [
                    resSales, 
                    resReturns, 
                    resPayments, 
                    resPurchases, 
                    resPReturns, 
                    resVPayments, 
                    resItems, 
                    resCusts, 
                    resVendors
                ] = await Promise.all([
                    fetch('/api/sales').then(r => r.json()).catch(() => []),
                    fetch('/api/sales-returns').then(r => r.json()).catch(() => []),
                    fetch('/api/payments').then(r => r.json()).catch(() => []),
                    fetch('/api/purchase-invoices').then(r => r.json()).catch(() => []),
                    fetch('/api/purchase-returns').then(r => r.json()).catch(() => []),
                    fetch('/api/vendor-payments').then(r => r.json()).catch(() => []),
                    fetch('/api/items').then(r => r.json()).catch(() => []),
                    fetch('/api/customers').then(r => r.json()).catch(() => []),
                    fetch('/api/vendors').then(r => r.json()).catch(() => [])
                ]);

                setSales(Array.isArray(resSales) ? resSales : []);
                setSalesReturns(Array.isArray(resReturns) ? resReturns : []);
                setPayments(Array.isArray(resPayments) ? resPayments : []);
                setPurchases(Array.isArray(resPurchases) ? resPurchases : []);
                setPurchaseReturns(Array.isArray(resPReturns) ? resPReturns : []);
                setVendorPayments(Array.isArray(resVPayments) ? resVPayments : []);
                setItems(Array.isArray(resItems) ? resItems : []);
                setCustomers(Array.isArray(resCusts) ? resCusts : []);
                setVendors(Array.isArray(resVendors) ? resVendors : []);
            } catch (err) {
                console.error("Failed to load dashboard data", err);
            }
        };

        fetchDashboardData();
    }, []);

    // Date Filter Helper
    const matchesDateFilter = (dateStr) => {
        if (!dateFilter || !dateFilter.start || !dateFilter.end) return true;
        if (!dateStr) return false;

        let itemTime;
        if (typeof dateStr === 'string' && dateStr.includes('/')) {
            const parts = dateStr.split('/');
            if (parts.length === 3) {
                const day = parseInt(parts[0], 10);
                const month = parseInt(parts[1], 10) - 1;
                let year = parseInt(parts[2], 10);
                if (year < 100) year += 2000;
                itemTime = new Date(year, month, day).getTime();
            } else {
                itemTime = new Date(dateStr).getTime();
            }
        } else {
            itemTime = new Date(dateStr).getTime();
        }

        if (isNaN(itemTime)) return false;

        const start = new Date(dateFilter.start.getFullYear(), dateFilter.start.getMonth(), dateFilter.start.getDate(), 0, 0, 0).getTime();
        const end = new Date(dateFilter.end.getFullYear(), dateFilter.end.getMonth(), dateFilter.end.getDate(), 23, 59, 59, 999).getTime();

        return itemTime >= start && itemTime <= end;
    };

    // Filtered Datasets based on Date Filter
    const filteredSales = useMemo(() => sales.filter(s => matchesDateFilter(s.date)), [sales, dateFilter]);
    const filteredSalesReturns = useMemo(() => salesReturns.filter(r => matchesDateFilter(r.date)), [salesReturns, dateFilter]);
    const filteredPayments = useMemo(() => payments.filter(p => matchesDateFilter(p.date)), [payments, dateFilter]);
    const filteredPurchases = useMemo(() => purchases.filter(p => matchesDateFilter(p.date)), [purchases, dateFilter]);
    const filteredPurchaseReturns = useMemo(() => purchaseReturns.filter(pr => matchesDateFilter(pr.date)), [purchaseReturns, dateFilter]);

    // ==========================================
    // SCORECARD METRIC CALCULATIONS
    // ==========================================
    const totalSalesAmount = useMemo(() => {
        return filteredSales.reduce((acc, s) => acc + (parseFloat(s.grandTotal || s.totalAmount || s.total) || 0), 0);
    }, [filteredSales]);

    const totalSalesReturnAmount = useMemo(() => {
        return filteredSalesReturns.reduce((acc, r) => acc + (parseFloat(r.grandTotal || r.totalAmount || r.refundAmount) || 0), 0);
    }, [filteredSalesReturns]);

    const netSales = Math.max(0, totalSalesAmount - totalSalesReturnAmount);

    // Global Amount to Receive (Customer Pending)
    const globalCustomerPending = useMemo(() => {
        // Unpaid amount across all sales invoices (including Walk-in and registered customers)
        const totalInvoicePending = sales.reduce((sum, s) => {
            const grand = parseFloat(s.grandTotal || s.totalAmount || s.total || s.amount || 0);
            const paid = parseFloat(s.receivedAmount !== undefined ? s.receivedAmount : (s.paidAmount !== undefined ? s.paidAmount : (s.paid_amount || 0)));
            const pending = s.pendingToReceive !== undefined ? parseFloat(s.pendingToReceive) : (s.pending_to_receive !== undefined ? parseFloat(s.pending_to_receive) : Math.max(0, grand - paid));
            return sum + (isNaN(pending) ? 0 : Math.max(0, pending));
        }, 0);

        // Add any customer opening balances
        const totalCustomerOpening = customers.reduce((sum, c) => {
            return sum + Math.max(0, parseFloat(c.openingBalance || c.opening_balance || 0));
        }, 0);

        return Math.max(0, totalInvoicePending + totalCustomerOpening);
    }, [sales, customers]);

    // Total Purchases Amount
    const totalPurchaseAmount = useMemo(() => {
        return filteredPurchases.reduce((acc, p) => acc + (parseFloat(p.amount || p.grandTotal || p.total) || 0), 0);
    }, [filteredPurchases]);

    // Global Pending to Pay (Vendor Pending)
    const globalVendorPending = useMemo(() => {
        // Unpaid amount across all purchase invoices
        const totalPiPending = purchases.reduce((sum, p) => {
            const grand = parseFloat(p.amount || p.grandTotal || p.total || 0);
            const paid = parseFloat(p.paidAmount !== undefined ? p.paidAmount : (p.paid_amount || 0));
            const pending = p.pendingToPay !== undefined ? parseFloat(p.pendingToPay) : (p.pending_to_pay !== undefined ? parseFloat(p.pending_to_pay) : Math.max(0, grand - paid));
            return sum + (isNaN(pending) ? 0 : Math.max(0, pending));
        }, 0);

        // Add any vendor opening balances
        const totalVendorOpening = vendors.reduce((sum, v) => {
            return sum + Math.max(0, parseFloat(v.openingBalance || v.opening_balance || 0));
        }, 0);

        return Math.max(0, totalPiPending + totalVendorOpening);
    }, [purchases, vendors]);

    // Total Inventory Valuation (Stock * PurchasePrice)
    const inventoryValuation = useMemo(() => {
        return items.reduce((acc, itm) => {
            const qty = parseFloat(itm.stock) || 0;
            const pPrice = parseFloat(itm.purchasePrice !== undefined ? itm.purchasePrice : itm.purchaseAmount) || 0;
            return acc + (qty * pPrice);
        }, 0);
    }, [items]);

    // ==========================================
    // TOP SELLING PRODUCTS
    // ==========================================
    const topSellingProducts = useMemo(() => {
        const itemMap = {};

        filteredSales.forEach(sale => {
            (sale.items || []).forEach(row => {
                const code = row.code || (row.item && row.item.code);
                const name = row.name || (row.item && row.item.name) || 'Product';
                const qty = parseFloat(row.qty || row.quantity) || 0;
                const rate = parseFloat(row.rate || row.price || 0);
                const total = qty * rate;

                if (!itemMap[code]) {
                    itemMap[code] = { code, name, qty: 0, total: 0 };
                }
                itemMap[code].qty += qty;
                itemMap[code].total += total;
            });
        });

        return Object.values(itemMap)
            .sort((a, b) => b.total - a.total)
            .slice(0, 5);
    }, [filteredSales]);

    // ==========================================
    // CATEGORY SALES BREAKDOWN
    // ==========================================
    const categoryBreakdown = useMemo(() => {
        const catMap = {};

        filteredSales.forEach(sale => {
            (sale.items || []).forEach(row => {
                const code = row.code || (row.item && row.item.code);
                const matchedItem = items.find(i => String(i.code) === String(code));
                const catName = (matchedItem && matchedItem.category) || 'General';
                const qty = parseFloat(row.qty || row.quantity) || 0;
                const rate = parseFloat(row.rate || row.price || 0);
                const total = qty * rate;

                catMap[catName] = (catMap[catName] || 0) + total;
            });
        });

        const totalRev = Object.values(catMap).reduce((a, b) => a + b, 0) || 1;
        const colors = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#6366F1'];

        return Object.entries(catMap)
            .map(([category, amount], idx) => ({
                category,
                amount,
                percentage: Math.round((amount / totalRev) * 100),
                color: colors[idx % colors.length]
            }))
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 5);
    }, [filteredSales, items]);

    // ==========================================
    // MONTHLY / RECENT CASH FLOW CHART (Last 6 Months)
    // ==========================================
    const monthlyComparison = useMemo(() => {
        const months = [];
        const now = new Date();

        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const mYear = d.getFullYear();
            const mMonth = d.getMonth();
            const monthLabel = d.toLocaleString('en-US', { month: 'short' });

            const parseDateObj = (dateStr) => {
                if (!dateStr) return null;
                if (typeof dateStr === 'string' && dateStr.includes('/')) {
                    const parts = dateStr.split('/');
                    if (parts.length === 3) {
                        return new Date(parts[2], parts[1] - 1, parts[0]);
                    }
                }
                return new Date(dateStr);
            };

            const mSales = sales.filter(s => {
                const sd = parseDateObj(s.date);
                return sd && !isNaN(sd.getTime()) && sd.getFullYear() === mYear && sd.getMonth() === mMonth;
            }).reduce((acc, s) => acc + (parseFloat(s.grandTotal || s.totalAmount) || 0), 0);

            const mPurchases = purchases.filter(p => {
                const pd = parseDateObj(p.date);
                return pd && !isNaN(pd.getTime()) && pd.getFullYear() === mYear && pd.getMonth() === mMonth;
            }).reduce((acc, p) => acc + (parseFloat(p.amount || p.grandTotal) || 0), 0);

            months.push({
                label: monthLabel,
                sales: mSales,
                purchases: mPurchases
            });
        }

        const maxVal = Math.max(...months.map(m => Math.max(m.sales, m.purchases)), 1000);
        return { months, maxVal };
    }, [sales, purchases]);

    // ==========================================
    // TOP CUSTOMERS WITH PENDING DUES
    // ==========================================
    const topDebtors = useMemo(() => {
        const debtorMap = new Map();

        // 1. Group all invoice pending amounts by customer
        sales.forEach(s => {
            const cId = s.customerId ? String(s.customerId) : (s.customerName ? s.customerName.toLowerCase() : 'walk-in');
            const cName = s.customerName || 'Walk In Customer';
            const grand = parseFloat(s.grandTotal || s.totalAmount || s.total || s.amount || 0);
            const paid = parseFloat(s.receivedAmount !== undefined ? s.receivedAmount : (s.paidAmount !== undefined ? s.paidAmount : (s.paid_amount || 0)));
            const pending = s.pendingToReceive !== undefined ? parseFloat(s.pendingToReceive) : (s.pending_to_receive !== undefined ? parseFloat(s.pending_to_receive) : Math.max(0, grand - paid));

            if (!debtorMap.has(cId)) {
                const matchedCust = customers.find(c => String(c.id) === String(s.customerId) || (c.customerName || c.name || '').toLowerCase() === cName.toLowerCase());
                debtorMap.set(cId, {
                    id: s.customerId || cId,
                    name: cName,
                    mobile: matchedCust?.mobile || s.customerMobile || '-',
                    totalPurchases: 0,
                    pending: 0
                });
            }
            const record = debtorMap.get(cId);
            record.totalPurchases += grand;
            record.pending += Math.max(0, isNaN(pending) ? 0 : pending);
        });

        // 2. Add customer opening balances
        customers.forEach(c => {
            const cId = String(c.id);
            const openBal = parseFloat(c.openingBalance || c.opening_balance || 0);
            if (!debtorMap.has(cId)) {
                debtorMap.set(cId, {
                    id: c.id,
                    name: c.customerName || c.name || 'Customer',
                    mobile: c.mobile || '-',
                    totalPurchases: 0,
                    pending: Math.max(0, openBal)
                });
            } else if (openBal > 0) {
                debtorMap.get(cId).pending += openBal;
            }
        });

        return Array.from(debtorMap.values())
            .filter(c => c.pending > 0)
            .sort((a, b) => b.pending - a.pending)
            .slice(0, 5);
    }, [sales, customers]);

    // ==========================================
    // RECENT INVOICES (Latest 5)
    // ==========================================
    const recentInvoices = useMemo(() => {
        return [...sales]
            .reverse()
            .slice(0, 5);
    }, [sales]);

    // ==========================================
    // RECENT PAYMENTS RECEIVED (Latest 5)
    // ==========================================
    const recentPayments = useMemo(() => {
        return [...payments]
            .reverse()
            .slice(0, 5);
    }, [payments]);

    const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        if (typeof dateStr === 'string' && dateStr.includes('/')) return dateStr;
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', backgroundColor: '#F8FAFC', padding: '20px 24px', fontFamily: 'Manrope, sans-serif' }}>
            
            {/* 1. TOP HEADER WITH SALES-LIST-STYLE DATE FILTER */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
                <div>
                    <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#000B58', margin: '0 0 4px 0' }}>
                        Sri Parvathi Hardwares
                    </h1>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748B', fontSize: '13px' }}>
                        <span>Business Dashboard</span>
                        <span>•</span>
                        <span>{new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    </div>
                </div>

                {/* Date Filter matching Sales List */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <DateFilterPopover 
                        value={dateFilter}
                        onChange={handleDateFilterChange}
                        align="right"
                    />
                    {!isTodaySelected && (
                        <button 
                            onClick={() => setDateFilter(getTodayFilter())}
                            style={{ 
                                background: 'white', 
                                border: '1px solid var(--border-color)', 
                                borderRadius: '6px', 
                                height: '38px', 
                                width: '38px', 
                                cursor: 'pointer', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center', 
                                color: 'var(--text-muted)', 
                                padding: '0', 
                                boxSizing: 'border-box' 
                            }}
                            title="Reset to Today">
                            <X style={{ width: '16px', height: '16px' }} />
                        </button>
                    )}
                </div>
            </div>

            {/* 2. FIVE KEY METRIC SCORECARDS */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '16px', marginBottom: '20px' }}>
                
                {/* 1. Total Sales */}
                <div style={{ background: '#EFF6FF', border: '1px solid #DBEAFE', borderRadius: '8px', padding: '14px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '85px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '13px', fontWeight: '500', color: '#475569' }}>Total Sales</span>
                        <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: '#DBEAFE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <TrendingUp size={15} color="#1D4ED8" />
                        </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '6px' }}>
                        <span style={{ fontSize: '11.5px', color: '#64748B' }}>{filteredSales.length} Bills</span>
                        <span style={{ fontSize: '20px', fontWeight: '700', color: '#000B58' }}>
                            ₹{netSales.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                    </div>
                </div>

                {/* 2. Amount To Receive (Customer Pending) */}
                <div style={{ background: '#FEF2F2', border: '1px solid #FEE2E2', borderRadius: '8px', padding: '14px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '85px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '13px', fontWeight: '500', color: '#475569' }}>Amount to Receive</span>
                        <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Clock size={15} color="#DC2626" />
                        </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '6px' }}>
                        <span style={{ fontSize: '11.5px', color: '#64748B' }}>Customer Dues</span>
                        <span style={{ fontSize: '20px', fontWeight: '700', color: '#EF4444' }}>
                            ₹{globalCustomerPending.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                    </div>
                </div>

                {/* 3. Total Purchases */}
                <div style={{ background: '#F5F3FF', border: '1px solid #E9D5FF', borderRadius: '8px', padding: '14px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '85px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '13px', fontWeight: '500', color: '#475569' }}>Total Purchases</span>
                        <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: '#E9D5FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Truck size={15} color="#7C3AED" />
                        </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '6px' }}>
                        <span style={{ fontSize: '11.5px', color: '#64748B' }}>{filteredPurchases.length} Invoices</span>
                        <span style={{ fontSize: '20px', fontWeight: '700', color: '#6D28D9' }}>
                            ₹{totalPurchaseAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                    </div>
                </div>

                {/* 4. Pending to Pay (Vendor Pending) */}
                <div style={{ background: '#FFFBEB', border: '1px solid #FEF3C7', borderRadius: '8px', padding: '14px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '85px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '13px', fontWeight: '500', color: '#475569' }}>Pending to Pay</span>
                        <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <CreditCard size={15} color="#D97706" />
                        </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '6px' }}>
                        <span style={{ fontSize: '11.5px', color: '#64748B' }}>Supplier Dues</span>
                        <span style={{ fontSize: '20px', fontWeight: '700', color: '#D97706' }}>
                            ₹{globalVendorPending.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                    </div>
                </div>

                {/* 5. Inventory Valuation */}
                <div style={{ background: '#ECFDF5', border: '1px solid #D1FAE5', borderRadius: '8px', padding: '14px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '85px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '13px', fontWeight: '500', color: '#475569' }}>Stock Valuation</span>
                        <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Boxes size={15} color="#059669" />
                        </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '6px' }}>
                        <span style={{ fontSize: '11.5px', color: '#64748B' }}>{items.length} Items</span>
                        <span style={{ fontSize: '20px', fontWeight: '700', color: '#10B981' }}>
                            ₹{inventoryValuation.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                    </div>
                </div>

            </div>

            {/* 3. VISUAL ANALYTICS & BREAKDOWN (3-Column Grid) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px', marginBottom: '20px' }}>
                
                {/* 3A. 6-Month Cash Flow Trend (Sales vs Purchases) */}
                <div style={{ background: 'white', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <div>
                            <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#1E293B', margin: '0 0 2px 0' }}>Revenue vs Purchases</h3>
                            <span style={{ fontSize: '12px', color: '#64748B' }}>6-Month Performance</span>
                        </div>
                        <div style={{ display: 'flex', gap: '12px', fontSize: '12px' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#475569' }}>
                                <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#000B58' }}></span> Sales
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#475569' }}>
                                <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#CBD5E1' }}></span> Purchase
                            </span>
                        </div>
                    </div>

                    {/* Interactive Bar Chart Visualization */}
                    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', height: '170px', padding: '10px 4px 0 4px', borderBottom: '1px solid #E2E8F0', gap: '8px' }}>
                        {monthlyComparison.months.map((m, idx) => {
                            const salesHeight = Math.max(8, Math.round((m.sales / monthlyComparison.maxVal) * 140));
                            const purchaseHeight = Math.max(8, Math.round((m.purchases / monthlyComparison.maxVal) * 140));

                            return (
                                <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: '6px' }}>
                                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '140px' }}>
                                        {/* Sales Bar */}
                                        <div 
                                            title={`Sales: ₹${m.sales.toLocaleString('en-IN')}`}
                                            style={{ 
                                                width: '18px', 
                                                height: `${salesHeight}px`, 
                                                background: '#000B58', 
                                                borderRadius: '3px 3px 0 0',
                                                transition: 'height 0.3s ease'
                                            }} 
                                        />
                                        {/* Purchase Bar */}
                                        <div 
                                            title={`Purchases: ₹${m.purchases.toLocaleString('en-IN')}`}
                                            style={{ 
                                                width: '18px', 
                                                height: `${purchaseHeight}px`, 
                                                background: '#CBD5E1', 
                                                borderRadius: '3px 3px 0 0',
                                                transition: 'height 0.3s ease'
                                            }} 
                                        />
                                    </div>
                                    <span style={{ fontSize: '11.5px', color: '#64748B', fontWeight: '500' }}>{m.label}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* 3B. Top 5 Best-Selling Products */}
                <div style={{ background: 'white', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                        <div>
                            <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#1E293B', margin: '0 0 2px 0' }}>Top Selling Products</h3>
                            <span style={{ fontSize: '12px', color: '#64748B' }}>By revenue contribution</span>
                        </div>
                        <Link to="/items" style={{ fontSize: '12px', color: '#2563EB', textDecoration: 'none', fontWeight: '600' }}>View All</Link>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, justifyContent: 'center' }}>
                        {topSellingProducts.length > 0 ? topSellingProducts.map((p, idx) => (
                            <div key={p.code || idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: idx !== topSellingProducts.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                                    <span style={{ fontSize: '12px', fontWeight: '700', color: '#94A3B8', width: '16px' }}>#{idx + 1}</span>
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ fontSize: '13px', fontWeight: '600', color: '#1E293B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                                        <div style={{ fontSize: '11px', color: '#64748B' }}>{p.qty} Qty sold</div>
                                    </div>
                                </div>
                                <div style={{ fontSize: '13px', fontWeight: '700', color: '#000B58', flexShrink: 0 }}>
                                    ₹{p.total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                            </div>
                        )) : (
                            <div style={{ textAlign: 'center', padding: '24px', color: '#94A3B8', fontSize: '13px' }}>
                                No sales transactions yet.
                            </div>
                        )}
                    </div>
                </div>

                {/* 3C. Category Sales Contribution */}
                <div style={{ background: 'white', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                        <div>
                            <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#1E293B', margin: '0 0 2px 0' }}>Sales by Category</h3>
                            <span style={{ fontSize: '12px', color: '#64748B' }}>Category distribution</span>
                        </div>
                        <Link to="/categories" style={{ fontSize: '12px', color: '#2563EB', textDecoration: 'none', fontWeight: '600' }}>Manage</Link>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, justifyContent: 'center' }}>
                        {categoryBreakdown.length > 0 ? categoryBreakdown.map((cat, idx) => (
                            <div key={idx}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', marginBottom: '4px' }}>
                                    <span style={{ fontWeight: '600', color: '#1E293B' }}>{cat.category}</span>
                                    <span style={{ fontWeight: '600', color: '#475569' }}>₹{cat.amount.toLocaleString('en-IN')} ({cat.percentage}%)</span>
                                </div>
                                <div style={{ height: '6px', width: '100%', background: '#F1F5F9', borderRadius: '3px', overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${Math.min(100, Math.max(5, cat.percentage))}%`, background: cat.color, borderRadius: '3px' }} />
                                </div>
                            </div>
                        )) : (
                            <div style={{ textAlign: 'center', padding: '24px', color: '#94A3B8', fontSize: '13px' }}>
                                No category data available.
                            </div>
                        )}
                    </div>
                </div>

            </div>

            {/* 4. ACTIVITY & TRANSACTION TABLES (3-Column Layout) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '16px' }}>
                
                {/* 4A. Recent Sales Invoices */}
                <div style={{ background: 'white', border: '1px solid var(--border-color)', borderRadius: '8px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#1E293B', margin: 0 }}>Recent Sales</h3>
                        <Link to="/sales" style={{ fontSize: '12px', color: '#2563EB', textDecoration: 'none', fontWeight: '600' }}>View All</Link>
                    </div>
                    <div style={{ overflowX: 'auto', flex: 1 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ height: '36px', background: '#F8FAFC' }}>
                                    <th style={{ padding: '8px 12px', fontSize: '11.5px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>Bill No</th>
                                    <th style={{ padding: '8px 12px', fontSize: '11.5px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>Customer</th>
                                    <th style={{ padding: '8px 12px', fontSize: '11.5px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>Date</th>
                                    <th style={{ padding: '8px 12px', fontSize: '11.5px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', textAlign: 'right' }}>Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recentInvoices.length > 0 ? recentInvoices.map((inv, idx) => {
                                    const amt = parseFloat(inv.grandTotal || inv.totalAmount) || 0;
                                    return (
                                        <tr 
                                            key={inv.id || idx}
                                            onClick={() => navigate('/sales')}
                                            style={{ height: '38px', cursor: 'pointer', borderBottom: '1px solid #F1F5F9' }}
                                            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F8FAFC'}
                                            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                        >
                                            <td style={{ padding: '8px 12px', fontSize: '12.5px', color: '#2563EB', fontWeight: '500' }}>{inv.invoiceNo || inv.invoiceNumber || '-'}</td>
                                            <td style={{ padding: '8px 12px', fontSize: '12.5px', color: '#1E293B' }}>{inv.customerName || 'Walk-in'}</td>
                                            <td style={{ padding: '8px 12px', fontSize: '12px', color: '#64748B' }}>{formatDate(inv.date)}</td>
                                            <td style={{ padding: '8px 12px', fontSize: '12.5px', fontWeight: '600', color: '#000B58', textAlign: 'right' }}>₹{amt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                        </tr>
                                    );
                                }) : (
                                    <tr>
                                        <td colSpan="4" style={{ padding: '24px', textAlign: 'center', color: '#94A3B8', fontSize: '13px' }}>No sales recorded.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* 4B. Top Customer Dues (Receivables) */}
                <div style={{ background: 'white', border: '1px solid var(--border-color)', borderRadius: '8px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#1E293B', margin: 0 }}>Pending Customer Dues</h3>
                        <Link to="/sales#customer" style={{ fontSize: '12px', color: '#2563EB', textDecoration: 'none', fontWeight: '600' }}>Customers</Link>
                    </div>
                    <div style={{ overflowX: 'auto', flex: 1 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ height: '36px', background: '#F8FAFC' }}>
                                    <th style={{ padding: '8px 12px', fontSize: '11.5px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>Customer</th>
                                    <th style={{ padding: '8px 12px', fontSize: '11.5px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>Mobile</th>
                                    <th style={{ padding: '8px 12px', fontSize: '11.5px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', textAlign: 'right' }}>Pending Due</th>
                                </tr>
                            </thead>
                            <tbody>
                                {topDebtors.length > 0 ? topDebtors.map((debtor, idx) => (
                                    <tr 
                                        key={debtor.id || idx}
                                        onClick={() => navigate('/sales#customer')}
                                        style={{ height: '38px', cursor: 'pointer', borderBottom: '1px solid #F1F5F9' }}
                                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F8FAFC'}
                                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                    >
                                        <td style={{ padding: '8px 12px', fontSize: '12.5px', color: '#2563EB', fontWeight: '500' }}>{debtor.name}</td>
                                        <td style={{ padding: '8px 12px', fontSize: '12px', color: '#64748B' }}>{debtor.mobile}</td>
                                        <td style={{ padding: '8px 12px', fontSize: '12.5px', fontWeight: '700', color: '#EF4444', textAlign: 'right' }}>₹{debtor.pending.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan="3" style={{ padding: '24px', textAlign: 'center', color: '#10B981', fontSize: '13px' }}>All customer balances are clear!</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* 4C. Recent Payments Received */}
                <div style={{ background: 'white', border: '1px solid var(--border-color)', borderRadius: '8px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#1E293B', margin: 0 }}>Recent Amount Received</h3>
                        <Link to="/sales#amountReceived" style={{ fontSize: '12px', color: '#2563EB', textDecoration: 'none', fontWeight: '600' }}>View All</Link>
                    </div>
                    <div style={{ overflowX: 'auto', flex: 1 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ height: '36px', background: '#F8FAFC' }}>
                                    <th style={{ padding: '8px 12px', fontSize: '11.5px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>Rec. No</th>
                                    <th style={{ padding: '8px 12px', fontSize: '11.5px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>Customer</th>
                                    <th style={{ padding: '8px 12px', fontSize: '11.5px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>Date</th>
                                    <th style={{ padding: '8px 12px', fontSize: '11.5px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', textAlign: 'right' }}>Paid</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recentPayments.length > 0 ? recentPayments.map((pmt, idx) => {
                                    const amt = parseFloat(pmt.amount !== undefined ? pmt.amount : (pmt.paidAmount !== undefined ? pmt.paidAmount : (pmt.receivedAmount || 0))) || 0;
                                    return (
                                        <tr 
                                            key={pmt.id || idx}
                                            onClick={() => navigate('/sales#amountReceived')}
                                            style={{ height: '38px', cursor: 'pointer', borderBottom: '1px solid #F1F5F9' }}
                                            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F8FAFC'}
                                            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                        >
                                            <td style={{ padding: '8px 12px', fontSize: '12.5px', color: '#2563EB', fontWeight: '500' }}>{pmt.arNo || pmt.paymentNumber || pmt.voucherNo || '-'}</td>
                                            <td style={{ padding: '8px 12px', fontSize: '12.5px', color: '#1E293B' }}>{pmt.customerName || '-'}</td>
                                            <td style={{ padding: '8px 12px', fontSize: '12px', color: '#64748B' }}>{formatDate(pmt.date)}</td>
                                            <td style={{ padding: '8px 12px', fontSize: '12.5px', fontWeight: '700', color: '#10B981', textAlign: 'right' }}>₹{amt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                        </tr>
                                    );
                                }) : (
                                    <tr>
                                        <td colSpan="4" style={{ padding: '24px', textAlign: 'center', color: '#94A3B8', fontSize: '13px' }}>No payments received yet.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>

        </div>
    );
};

export default Home;
