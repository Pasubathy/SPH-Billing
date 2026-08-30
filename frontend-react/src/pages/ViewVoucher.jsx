import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { 
    ArrowLeft, 
    Printer, 
    PenLine, 
    CheckCircle2, 
    Receipt, 
    Wallet, 
    Calendar, 
    User, 
    FileText,
    ArrowUpRight,
    ArrowDownLeft
} from 'lucide-react';
import { numberToWords } from '../utils/numberToWords';
import apiFetch from '../utils/api';

const ViewVoucher = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const [searchParams] = useSearchParams();
    const autoPrint = searchParams.get('print') === 'true';

    const [voucher, setVoucher] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        fetchVoucher();
    }, [id]);

    const fetchVoucher = async () => {
        setLoading(true);
        try {
            const res = await apiFetch(`/api/vouchers/${id}`);
            if (res.ok) {
                const data = await res.json();
                setVoucher(data);
                if (autoPrint) {
                    setTimeout(() => {
                        window.print();
                    }, 500);
                }
            } else {
                setError('Voucher not found');
            }
        } catch (e) {
            setError('Failed to load voucher');
        } finally {
            setLoading(false);
        }
    };

    const handlePrint = () => {
        window.print();
    };

    if (loading) {
        return (
            <div style={{ padding: '40px', textAlign: 'center', color: '#94A3B8' }}>
                Loading voucher details...
            </div>
        );
    }

    if (error || !voucher) {
        return (
            <div style={{ padding: '40px', textAlign: 'center' }}>
                <h3 style={{ color: '#DC2626' }}>{error || 'Voucher not found'}</h3>
                <button
                    onClick={() => navigate('/voucher')}
                    style={{
                        marginTop: '12px',
                        padding: '8px 16px',
                        borderRadius: '6px',
                        border: '1px solid #CBD5E1',
                        backgroundColor: 'white',
                        cursor: 'pointer'
                    }}
                >
                    Back to Vouchers
                </button>
            </div>
        );
    }

    const isPayment = (voucher.voucherType || 'Payment').toLowerCase() === 'payment';
    const amountNum = parseFloat(voucher.amount) || 0;
    const words = voucher.amountInWords || numberToWords(amountNum);

    return (
        <div className="view-voucher-page" style={{ padding: '24px', maxWidth: '850px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Screen Action Toolbar (Hidden during print) */}
            <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <button
                        onClick={() => navigate('/voucher')}
                        style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '8px',
                            border: '1px solid #CBD5E1',
                            backgroundColor: '#FFFFFF',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            color: '#475569'
                        }}
                    >
                        <ArrowLeft size={18} />
                    </button>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: '#0F172A' }}>
                            {voucher.voucherNo}
                        </h1>
                        <span style={{ fontSize: '12.5px', color: '#64748B' }}>
                            {isPayment ? 'Payment Voucher (Expense)' : 'Receipt Voucher (Income)'}
                        </span>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button
                        onClick={() => navigate(`/voucher/edit/${voucher.id}`)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '8px 16px',
                            borderRadius: '8px',
                            border: '1px solid #CBD5E1',
                            backgroundColor: '#FFFFFF',
                            color: '#334155',
                            fontSize: '13px',
                            fontWeight: '600',
                            cursor: 'pointer'
                        }}
                    >
                        <PenLine size={15} />
                        <span>Edit</span>
                    </button>
                    <button
                        onClick={handlePrint}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '8px 18px',
                            borderRadius: '8px',
                            border: 'none',
                            backgroundColor: '#000B58',
                            color: '#FFFFFF',
                            fontSize: '13px',
                            fontWeight: '600',
                            cursor: 'pointer',
                            boxShadow: '0 2px 6px rgba(0, 11, 88, 0.2)'
                        }}
                    >
                        <Printer size={15} />
                        <span>Print Voucher</span>
                    </button>
                </div>
            </div>

            {/* Printable Voucher Paper */}
            <div 
                className="voucher-paper"
                style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '12px',
                    border: '1px solid #E2E8F0',
                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.05)',
                    padding: '36px 40px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '24px'
                }}
            >
                {/* Header: Company Details & Logo */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #000B58', paddingBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <img src="/Images/Logo.png" alt="SPH Logo" style={{ height: '48px', objectFit: 'contain' }} />
                        <div>
                            <h2 style={{ margin: 0, fontSize: '19px', fontWeight: '800', color: '#000B58', letterSpacing: '-0.02em' }}>
                                SRI PARVATHI HARDWARES
                            </h2>
                            <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#475569', lineHeight: '1.4' }}>
                                Paints, Electricals, Plumbing & Hardware Merchants<br />
                                <b>GSTIN:</b> 33AASFS1234F1Z5 | <b>Phone:</b> +91 98765 43210
                            </p>
                        </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                        <div style={{
                            display: 'inline-block',
                            backgroundColor: isPayment ? '#FEF2F2' : '#ECFDF5',
                            border: isPayment ? '1.5px solid #F87171' : '1.5px solid #4ADE80',
                            color: isPayment ? '#DC2626' : '#16A34A',
                            padding: '6px 14px',
                            borderRadius: '6px',
                            fontSize: '14px',
                            fontWeight: '800',
                            letterSpacing: '0.5px',
                            textTransform: 'uppercase'
                        }}>
                            {isPayment ? 'Payment Voucher' : 'Receipt Voucher'}
                        </div>
                    </div>
                </div>

                {/* Metadata Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', backgroundColor: '#F8FAFC', padding: '14px 18px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '13px' }}>
                    <div>
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
                            <span style={{ color: '#64748B', width: '100px' }}>Voucher No:</span>
                            <span style={{ fontWeight: '700', color: '#000B58' }}>{voucher.voucherNo}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <span style={{ color: '#64748B', width: '100px' }}>Date:</span>
                            <span style={{ fontWeight: '600', color: '#1E293B' }}>{voucher.date}</span>
                        </div>
                    </div>

                    <div>
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
                            <span style={{ color: '#64748B', width: '110px' }}>Payment Mode:</span>
                            <span style={{ fontWeight: '600', color: '#1E293B' }}>{voucher.paymentMode}</span>
                        </div>
                        {voucher.referenceNo && (
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <span style={{ color: '#64748B', width: '110px' }}>Ref / Cheque No:</span>
                                <span style={{ fontWeight: '600', color: '#1E293B' }}>{voucher.referenceNo}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Party & Particulars Section */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', gap: '10px', fontSize: '13.5px' }}>
                        <span style={{ color: '#64748B', width: '120px', fontWeight: '600' }}>
                            {isPayment ? 'Paid To:' : 'Received From:'}
                        </span>
                        <span style={{ fontWeight: '700', color: '#0F172A', fontSize: '14px' }}>
                            {voucher.partyName || '-'}
                        </span>
                    </div>

                    {/* Table of Particulars */}
                    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '6px', fontSize: '13px' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#F1F5F9', borderBottom: '1.5px solid #CBD5E1' }}>
                                <th style={{ padding: '8px 12px', textAlign: 'left', width: '50px', color: '#475569' }}>S.No</th>
                                <th style={{ padding: '8px 12px', textAlign: 'left', color: '#475569' }}>Category / Account</th>
                                <th style={{ padding: '8px 12px', textAlign: 'left', color: '#475569' }}>Description / Narration</th>
                                <th style={{ padding: '8px 12px', textAlign: 'right', width: '140px', color: '#475569' }}>Amount (₹)</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                                <td style={{ padding: '12px', color: '#64748B' }}>1</td>
                                <td style={{ padding: '12px', fontWeight: '600', color: '#1E293B' }}>{voucher.category}</td>
                                <td style={{ padding: '12px', color: '#475569' }}>{voucher.narration || '-'}</td>
                                <td style={{ padding: '12px', textAlign: 'right', fontWeight: '700', color: '#0F172A' }}>
                                    ₹{amountNum.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                            </tr>
                            <tr style={{ backgroundColor: '#F8FAFC', fontWeight: '700', borderTop: '2px solid #CBD5E1' }}>
                                <td colSpan="3" style={{ padding: '10px 12px', textAlign: 'right', color: '#000B58' }}>
                                    TOTAL AMOUNT:
                                </td>
                                <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: '15px', color: isPayment ? '#DC2626' : '#16A34A' }}>
                                    ₹{amountNum.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                {/* Amount in Words */}
                <div style={{ backgroundColor: '#F8FAFC', padding: '12px 16px', borderRadius: '6px', border: '1px solid #E2E8F0', fontSize: '13px' }}>
                    <span style={{ color: '#64748B', fontWeight: '600', marginRight: '6px' }}>Amount in Words:</span>
                    <span style={{ fontWeight: '700', color: '#000B58' }}>{words}</span>
                </div>

                {/* Signatures Footer */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginTop: '40px', paddingTop: '20px', textAlign: 'center' }}>
                    <div style={{ borderTop: '1px dashed #CBD5E1', paddingTop: '8px' }}>
                        <span style={{ fontSize: '12px', fontWeight: '600', color: '#64748B' }}>Prepared By</span>
                    </div>
                    <div style={{ borderTop: '1px dashed #CBD5E1', paddingTop: '8px' }}>
                        <span style={{ fontSize: '12px', fontWeight: '600', color: '#64748B' }}>Verified / Approved By</span>
                    </div>
                    <div style={{ borderTop: '1px dashed #CBD5E1', paddingTop: '8px' }}>
                        <span style={{ fontSize: '12px', fontWeight: '600', color: '#64748B' }}>Receiver's Signature</span>
                    </div>
                </div>

            </div>

            {/* Print Stylesheet */}
            <style>{`
                @media print {
                    .no-print {
                        display: none !important;
                    }
                    body {
                        background: white !important;
                        margin: 0 !important;
                        padding: 0 !important;
                    }
                    .top-bar, .sidebar {
                        display: none !important;
                    }
                    .main-content {
                        margin: 0 !important;
                        padding: 0 !important;
                    }
                    .view-voucher-page {
                        padding: 0 !important;
                        max-width: 100% !important;
                    }
                    .voucher-paper {
                        box-shadow: none !important;
                        border: 1px solid #000 !important;
                        border-radius: 0 !important;
                    }
                }
            `}</style>

        </div>
    );
};

export default ViewVoucher;
