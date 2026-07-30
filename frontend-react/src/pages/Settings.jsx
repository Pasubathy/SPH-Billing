import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload, X, ChevronLeft } from 'lucide-react';
import TopBar from '../components/TopBar';
import CustomSelect from '../components/CustomSelect';

const STATES = ['Tamil Nadu', 'Kerala', 'Karnataka', 'Andhra Pradesh', 'Maharashtra', 'Gujarat', 'Rajasthan', 'Delhi'];

const defaultAccount = { company: '', mobile: '', email: '', address: '', isGst: 'No', gstin: '', pan: '', country: 'India', state: 'Tamil Nadu', city: '', pin: '', logo: '', sign: '' };

const defaultTagSettings = {
  tsWidth: 50,
  tsHeight: 25,
  tsMarginTop: 0,
  tsMarginRight: 0,
  tsMarginBottom: 0,
  tsMarginLeft: 0,
  tsSizeCode: 12,
  tsSizeName: 14,
  tsSizePrice: 16,
  tsSizeQR: 35,
  tsOptCode: true,
  tsOptName: true,
  tsOptPrice: true,
  tsOptQR: true,
  tsAlign: 'Left'
};

const defaultInvSettings = {
  width: '3inch',
  note: 'This is a computer-generated invoice.\nGST not applicable as the business is not registered under GST.',
  invOptPhone: false,
  invOptGSTIN: false,
  invOptPAN: false,
  invOptLogo: false,
  invOptHSN: false,
  invOptTaxPct: false,
  invOptTaxAmt: false,
  invOptTotalAmt: false,
  invOptTaxBreakup: false,
  invOptTotalBreakup: false,
  invOptRound: false,
  invOptCreditBalance: false,
  invOptPaidAmt: false,
  invOptPendingAmt: false
};

const FormField = ({ label, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
    <label style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-color)' }}>{label}</label>
    {children}
  </div>
);

const inputStyle = { height: '38px', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0 12px', fontFamily: 'inherit', fontSize: '13px', outline: 'none', width: '100%', boxSizing: 'border-box' };

export default function Settings() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('myaccount');
  const [acc, setAcc] = useState(defaultAccount);
  const [tag, setTag] = useState(defaultTagSettings);
  const [inv, setInv] = useState(defaultInvSettings);
  const [toast, setToast] = useState(null);

  const is4 = inv.width === '4inch';
  const is2 = inv.width === '2inch';
  const pSpace = is4 ? '12px 16px' : is2 ? '3px 6px' : '8px 12px';
  const tSpace = is4 ? '6px 8px' : is2 ? '2px 2px' : '3px 4px';
  const rowHeight = is4 ? '24px' : is2 ? '14px' : '20px';
  const rowPadding = is4 ? '0 16px' : is2 ? '0 6px' : '0 12px';
  const borderCol = '#cbd5e1';

  useEffect(() => {
    try {
      const a = JSON.parse(localStorage.getItem('myAccountData')); if (a) setAcc(p => ({ ...p, ...a }));
      const t = JSON.parse(localStorage.getItem('tagSettings')); if (t) setTag(p => ({ ...p, ...t }));
      const i = JSON.parse(localStorage.getItem('invoiceSettings')); if (i) setInv(p => ({ ...p, ...i }));
    } catch (e) { }
  }, []);

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };

  const handleSave = () => {
    if (activeTab === 'myaccount') {
      let isValid = true;
      if (acc.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(acc.email)) {
        showToast('Please enter a valid email address', 'error');
        isValid = false;
      }
      if (acc.mobile && acc.mobile.length !== 10) {
        showToast('Please enter a valid 10-digit mobile number', 'error');
        isValid = false;
      }
      if (acc.isGst === 'Yes' && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(acc.gstin)) {
        showToast('Please enter a valid GSTIN', 'error');
        isValid = false;
      }
      if (acc.pan && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(acc.pan)) {
        showToast('Please enter a valid PAN', 'error');
        isValid = false;
      }
      if (!isValid) return;
    }

    localStorage.setItem('myAccountData', JSON.stringify(acc));
    localStorage.setItem('tagSettings', JSON.stringify(tag));
    localStorage.setItem('invoiceSettings', JSON.stringify(inv));
    showToast('Settings saved successfully', 'success');
  };

  const handleImageUpload = (e, field) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setAcc(p => ({ ...p, [field]: ev.target.result }));
    reader.readAsDataURL(file);
  };

  const ImageUpload = ({ field, label }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <label style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-color)' }}>{label}</label>
      <div style={{ width: '120px', height: '120px', border: '1px dashed var(--border-color)', borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: '#f8fafc', position: 'relative', overflow: 'hidden' }}>
        {acc[field] ? (
          <>
            <img src={acc[field]} alt={label} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            <button onClick={() => setAcc(p => ({ ...p, [field]: '' }))} style={{ position: 'absolute', top: '4px', right: '4px', background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'white' }}>
              <X size={14} />
            </button>
          </>
        ) : (
          <>
            <Upload size={20} color="var(--text-muted)" />
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px', textAlign: 'center', padding: '0 8px' }}>Upload {label}</span>
            <input type="file" accept="image/*" onChange={e => handleImageUpload(e, field)} style={{ position: 'absolute', width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }} />
          </>
        )}
      </div>
    </div>
  );

  const tabStyle = (t) => ({ height: '100%', display: 'flex', alignItems: 'center', color: activeTab === t ? '#000B58' : 'var(--text-muted)', fontWeight: activeTab === t ? '600' : '500', fontSize: '14px', cursor: 'pointer', borderBottom: activeTab === t ? '2px solid #000B58' : '2px solid transparent', position: 'relative', top: '1px', transition: '0.2s', padding: '0 4px' });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', fontFamily: 'inherit' }}>
      <TopBar />
      {/* Nav Bar */}
      <div style={{ height: '50px', background: 'white', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: '32px', height: '100%' }}>
          {[['myaccount', 'My Account'], ['tagsetting', 'Tag Setting'], ['invoicesetting', 'Invoice Setting']].map(([t, l]) => (
            <div key={t} style={tabStyle(t)} onClick={() => setActiveTab(t)}>{l}</div>
          ))}
        </div>
        <button onClick={() => navigate('/items')} style={{ border: '1px solid var(--border-color)', background: 'white', borderRadius: '6px', padding: '6px 12px', fontSize: '13px', fontWeight: '500', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <ArrowLeft size={16} /> Back to App
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px', background: '#F8FAFC' }}>

        {/* My Account */}
        {activeTab === 'myaccount' && (
          <div style={{ background: 'white', borderRadius: '12px', border: '1px solid var(--border-color)', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', gap: '24px' }}>
              <ImageUpload field="logo" label="Company Logo" />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', gap: '16px' }}>
                  <FormField label="Company Name"><input style={inputStyle} value={acc.company} onChange={e => setAcc(p => ({ ...p, company: e.target.value }))} placeholder="Enter Company Name" /></FormField>
                  <FormField label="Mobile Number"><input style={inputStyle} value={acc.mobile} onChange={e => setAcc(p => ({ ...p, mobile: e.target.value.replace(/[^0-9]/g, '').slice(0, 10) }))} placeholder="Enter Mobile Number" /></FormField>
                </div>
                <div style={{ display: 'flex', gap: '16px' }}>
                  <FormField label="Email ID"><input style={inputStyle} value={acc.email} onChange={e => setAcc(p => ({ ...p, email: e.target.value }))} placeholder="Enter Email ID" /></FormField>
                  <div style={{ flex: 1 }} />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '24px' }}>
              <FormField label="Billing Address">
                <textarea style={{ ...inputStyle, height: '100px', resize: 'none', padding: '10px' }} value={acc.address} onChange={e => setAcc(p => ({ ...p, address: e.target.value }))} />
              </FormField>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', gap: '16px' }}>
                  <FormField label="Is Business GST Registered">
                    <CustomSelect
                      value={acc.isGst}
                      onChange={val => setAcc(p => ({ ...p, isGst: val, gstin: val === 'No' ? '' : p.gstin }))}
                      options={[
                        { value: 'No', label: 'No' },
                        { value: 'Yes', label: 'Yes' }
                      ]}
                    />
                  </FormField>
                  <FormField label="GSTIN No.">
                    <input style={{ ...inputStyle, background: acc.isGst === 'No' ? '#f3f4f6' : 'white' }} value={acc.gstin} disabled={acc.isGst === 'No'} onChange={e => setAcc(p => ({ ...p, gstin: e.target.value.toUpperCase() }))} />
                  </FormField>
                </div>
                <FormField label="PAN No">
                  <input style={{ ...inputStyle, width: 'calc(50% - 8px)' }} value={acc.pan} onChange={e => setAcc(p => ({ ...p, pan: e.target.value.toUpperCase().slice(0, 10) }))} />
                </FormField>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '24px' }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', gap: '16px' }}>
                  <FormField label="Country">
                    <CustomSelect
                      value={acc.country}
                      onChange={val => setAcc(p => ({ ...p, country: val }))}
                      options={[
                        { value: 'India', label: 'India' }
                      ]}
                    />
                  </FormField>
                  <FormField label="State">
                    <CustomSelect
                      value={acc.state}
                      onChange={val => setAcc(p => ({ ...p, state: val }))}
                      options={STATES.map(s => ({ value: s, label: s }))}
                    />
                  </FormField>
                </div>
                <div style={{ display: 'flex', gap: '16px' }}>
                  <FormField label="City"><input style={inputStyle} value={acc.city} onChange={e => setAcc(p => ({ ...p, city: e.target.value }))} placeholder="Enter City" /></FormField>
                  <FormField label="Pin Code"><input style={inputStyle} value={acc.pin} onChange={e => setAcc(p => ({ ...p, pin: e.target.value.replace(/[^0-9]/g, '').slice(0, 6) }))} placeholder="Enter Pin Code" /></FormField>
                </div>
              </div>
              <ImageUpload field="sign" label="Signature" />
            </div>
          </div>
        )}

        {/* Tag Setting */}
        {activeTab === 'tagsetting' && (
          <div style={{ background: 'white', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', minHeight: '500px', overflow: 'hidden' }}>
            <div style={{ width: '420px', padding: '24px', borderRight: '1px solid var(--border-color)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <FormField label="Label Width (mm)"><input type="number" style={inputStyle} value={tag.tsWidth} onChange={e => setTag(p => ({ ...p, tsWidth: +e.target.value }))} /></FormField>
                <FormField label="Label Height (mm)"><input type="number" style={inputStyle} value={tag.tsHeight} onChange={e => setTag(p => ({ ...p, tsHeight: +e.target.value }))} /></FormField>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <FormField label="Margin Top (mm)"><input type="number" style={inputStyle} value={tag.tsMarginTop} onChange={e => setTag(p => ({ ...p, tsMarginTop: +e.target.value }))} /></FormField>
                <FormField label="Margin Right (mm)"><input type="number" style={inputStyle} value={tag.tsMarginRight} onChange={e => setTag(p => ({ ...p, tsMarginRight: +e.target.value }))} /></FormField>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <FormField label="Margin Bottom (mm)"><input type="number" style={inputStyle} value={tag.tsMarginBottom} onChange={e => setTag(p => ({ ...p, tsMarginBottom: +e.target.value }))} /></FormField>
                <FormField label="Margin Left (mm)"><input type="number" style={inputStyle} value={tag.tsMarginLeft} onChange={e => setTag(p => ({ ...p, tsMarginLeft: +e.target.value }))} /></FormField>
              </div>
              <FormField label="Content Alignment">
                <CustomSelect
                  value={tag.tsAlign}
                  onChange={val => setTag(p => ({ ...p, tsAlign: val }))}
                  options={[
                    { value: 'Left', label: 'Left' },
                    { value: 'Center', label: 'Center' },
                    { value: 'Right', label: 'Right' }
                  ]}
                />
              </FormField>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', alignItems: 'center' }}>
                <div style={{ fontWeight: '600', fontSize: '14px' }}>Field Name</div><div style={{ fontWeight: '600', fontSize: '14px' }}>Size</div>
                {[
                  ['tsOptCode', 'tsSizeCode', 'Code'],
                  ['tsOptName', 'tsSizeName', 'Item Name'],
                  ['tsOptPrice', 'tsSizePrice', 'Selling Price'],
                  ['tsOptQR', 'tsSizeQR', 'QR Code']
                ].map(([chk, sz, lbl]) => (
                  <React.Fragment key={chk}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', border: '1px solid var(--border-color)', borderRadius: '6px', height: '38px', padding: '0 8px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={tag[chk]} onChange={e => setTag(p => ({ ...p, [chk]: e.target.checked }))} /> {lbl}
                    </label>
                    <input type="number" style={inputStyle} value={tag[sz]} onChange={e => setTag(p => ({ ...p, [sz]: +e.target.value }))} />
                  </React.Fragment>
                ))}
              </div>
            </div>
            <div style={{ flex: 1, background: '#F1F5F9', padding: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ background: 'white', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: tag.tsAlign === 'Center' ? 'center' : tag.tsAlign === 'Right' ? 'flex-end' : 'flex-start', width: `${tag.tsWidth * 3.78}px`, height: `${tag.tsHeight * 3.78}px`, padding: `${tag.tsMarginTop * 3.78}px ${tag.tsMarginRight * 3.78}px ${tag.tsMarginBottom * 3.78}px ${tag.tsMarginLeft * 3.78}px`, boxSizing: 'border-box', overflow: 'hidden', gap: '8px', transition: 'all 0.3s' }}>
                {tag.tsOptQR && <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=1001`} style={{ width: `${tag.tsSizeQR / 100 * tag.tsWidth * 3.78}px`, height: `${tag.tsSizeQR / 100 * tag.tsWidth * 3.78}px`, objectFit: 'contain', flexShrink: 0 }} alt="QR" />}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', textAlign: tag.tsAlign.toLowerCase() }}>
                  {tag.tsOptCode && <div style={{ fontSize: `${tag.tsSizeCode}px`, fontWeight: '600', color: '#000' }}>1001</div>}
                  {tag.tsOptName && <div style={{ fontSize: `${tag.tsSizeName}px`, fontWeight: '600', color: '#000' }}>Nails</div>}
                  {tag.tsOptPrice && <div style={{ fontSize: `${tag.tsSizePrice}px`, fontWeight: '600', color: '#000' }}>₹150.00/Box</div>}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Invoice Setting */}
        {activeTab === 'invoicesetting' && (
          <div style={{ background: 'white', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', minHeight: '500px', overflow: 'hidden' }}>
            <div style={{ width: '420px', padding: '24px', borderRight: '1px solid var(--border-color)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '8px' }}>Label Width</div>
                <div style={{ display: 'flex', gap: '12px' }}>
                  {['4inch', '3inch', '2inch'].map(w => (
                    <label key={w} style={{ flex: 1, border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', borderColor: inv.width === w ? '#000B58' : 'var(--border-color)' }}>
                      <input type="radio" name="invWidth" value={w} checked={inv.width === w} onChange={() => setInv(p => ({ ...p, width: w }))} /> {w.replace('inch', ' Inch')}
                    </label>
                  ))}
                </div>
              </div>
              {[
                ['Header', ['invOptPhone', 'Phone Number'], ['invOptGSTIN', 'GSTIN No'], ['invOptPAN', 'PAN No'], ['invOptLogo', 'Logo']],
                ['Table Column', ['invOptHSN', 'HSN Code'], ['invOptTaxPct', 'Tax %'], ['invOptTaxAmt', 'Tax Amount'], ['invOptTotalAmt', 'Total Amt']],
                ['Price Breakup', ['invOptTaxBreakup', 'Tax'], ['invOptRound', 'Round Off'], ['invOptTotalBreakup', 'Total'], ['invOptCreditBalance', 'Credit Balance']],
                ['Amount Details', ['invOptPaidAmt', 'Paid Amount'], ['invOptPendingAmt', 'Pending Amount']]
              ].map(([title, ...fields]) => (
                <div key={title}>
                  <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '8px' }}>{title}</div>
                  <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    {fields.map(([field, label]) => (
                      <label key={field} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                        <input type="checkbox" checked={inv[field]} onChange={e => setInv(p => ({ ...p, [field]: e.target.checked }))} style={{ accentColor: '#000B58' }} /> {label}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              <div>
                <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '8px' }}>Note</div>
                <textarea style={{ ...inputStyle, height: '80px', resize: 'none', padding: '10px' }} value={inv.note} onChange={e => setInv(p => ({ ...p, note: e.target.value }))} />
              </div>
            </div>
            <div style={{ flex: 1, background: '#F1F5F9', padding: '20px 40px', overflowY: 'auto', display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
              {/* Invoice Preview */}
              <div style={{
                width: '100%',
                maxWidth: inv.width === '4inch' ? '600px' : inv.width === '2inch' ? '280px' : '420px',
                background: 'white',
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                padding: '8px',
                fontSize: inv.width === '4inch' ? '14px' : inv.width === '2inch' ? '10px' : '12px',
                fontFamily: "Inter, sans-serif",
                transition: 'all 0.3s',
                color: '#000',
              }}>
                <style>{`
                  .invoice-paper-preview th, .invoice-paper-preview td {
                    font-size: inherit !important;
                  }
                `}</style>
                <div className="invoice-paper-preview" style={{ border: `1px solid ${borderCol}`, borderRadius: '4px', overflow: 'hidden' }}>
                  
                  {/* Header Section */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: `1px solid ${borderCol}`, padding: pSpace }}>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      {inv.invOptLogo && (
                        acc.logo ? (
                          <img src={acc.logo} style={{ width: is4 ? '50px' : is2 ? '30px' : '40px', height: is4 ? '50px' : is2 ? '30px' : '40px', objectFit: 'contain' }} alt="Logo" />
                        ) : (
                          <div style={{ width: is4 ? '40px' : is2 ? '24px' : '32px', height: is4 ? '40px' : is2 ? '24px' : '32px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px' }}>
                            <span style={{ fontWeight: 'bold', fontSize: is4 ? '14px' : is2 ? '9px' : '11px', color: '#64748b' }}>SPH</span>
                          </div>
                        )
                      )}
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontSize: is4 ? '14px' : is2 ? '9px' : '11px', fontWeight: 'bold', textTransform: 'uppercase' }}>{acc.company || 'SRI PARVATHI HARDWARES'}</div>
                        <div style={{ fontSize: is4 ? '10px' : is2 ? '7px' : '8px', color: '#555', marginTop: '2px' }}>{[acc.address, acc.city].filter(Boolean).join(', ') || '31/11, Pukkulam Road, Thiyagadurgam, Kallakurichi'}</div>
                        <div style={{ fontSize: is4 ? '10px' : is2 ? '7px' : '8px', color: '#555' }}>{[acc.state, acc.country].filter(Boolean).join(', ') + (acc.pin ? ` - ${acc.pin}` : '') || 'Tamil Nadu - 606 206'}</div>
                        {inv.invOptPhone && <div style={{ fontSize: is4 ? '10px' : is2 ? '7px' : '8px', color: '#555' }}>Ph No : <b>{acc.mobile || '9994121042'}</b></div>}
                        {(inv.invOptGSTIN || inv.invOptPAN) && (
                          <div style={{ fontSize: is4 ? '10px' : is2 ? '7px' : '8px', color: '#555', marginTop: '2px' }}>
                            {inv.invOptGSTIN && <span>GSTIN No : <b>{acc.gstin || '29AAACC1206D2ZB'}</b></span>}
                            {inv.invOptGSTIN && inv.invOptPAN && <span> | </span>}
                            {inv.invOptPAN && <span>PAN No : <b>{acc.pan || 'ABCDE1234Z'}</b></span>}
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ fontSize: is4 ? '20px' : is2 ? '13px' : '16px', fontWeight: 'bold', letterSpacing: '1px', color: '#000', paddingTop: '5px' }}>INVOICE</div>
                  </div>

                  {/* Customer Info Box */}
                  <div style={{ borderBottom: `1px solid ${borderCol}`, padding: pSpace, display: 'flex', justifyContent: 'space-between', lineHeight: is2 ? '1.3' : '1.6', fontSize: is4 ? '11px' : is2 ? '6px' : '7px' }}>
                    <div style={{ textAlign: 'left', flex: 1 }}>
                      <div style={{ display: 'flex' }}><span style={{ fontWeight: 'bold', width: is4 ? '100px' : is2 ? '55px' : '85px' }}>Customer Name</span><span style={{ paddingRight: '4px' }}>-</span><span>Ajay Krishnan</span></div>
                      <div style={{ display: 'flex' }}><span style={{ fontWeight: 'bold', width: is4 ? '100px' : is2 ? '55px' : '85px' }}>Mobile No.</span><span style={{ paddingRight: '4px' }}>-</span><span>9587589698</span></div>
                      <div style={{ display: 'flex' }}><span style={{ fontWeight: 'bold', width: is4 ? '100px' : is2 ? '55px' : '85px' }}>Address</span><span style={{ paddingRight: '4px' }}>-</span><span style={{ flex: 1 }}>31/A, 1st Cross Street, Anna Nagar, Thiyagadurgam, Kallakurichi, Tamil Nadu - 606206</span></div>
                    </div>
                    <div style={{ textAlign: 'left', width: is4 ? '180px' : is2 ? '85px' : '140px', flexShrink: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}><span style={{ fontWeight: 'bold', width: is4 ? '60px' : is2 ? '32px' : '50px', textAlign: 'left' }}>INV No.</span><span style={{ paddingRight: '4px' }}>-</span><span style={{ width: is4 ? '80px' : is2 ? '42px' : '65px', textAlign: 'right', fontWeight: 'bold' }}>INV001</span></div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}><span style={{ fontWeight: 'bold', width: is4 ? '60px' : is2 ? '32px' : '50px', textAlign: 'left' }}>Date</span><span style={{ paddingRight: '4px' }}>-</span><span style={{ width: is4 ? '80px' : is2 ? '42px' : '65px', textAlign: 'right' }}>12/06/2026</span></div>
                    </div>
                  </div>

                  {/* Items Table */}
                  <table style={{ width: '100%', borderCollapse: 'collapse', borderBottom: `1px solid ${borderCol}`, fontSize: is4 ? '10px' : is2 ? '6px' : '7px', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f8fafc' }}>
                        <th style={{ borderBottom: `1px solid ${borderCol}`, borderRight: `1px solid ${borderCol}`, padding: tSpace, width: is4 ? '40px' : is2 ? '18px' : '22px', textAlign: 'center', whiteSpace: 'nowrap' }}>S No</th>
                        <th style={{ borderBottom: `1px solid ${borderCol}`, borderRight: `1px solid ${borderCol}`, padding: tSpace, minWidth: is4 ? '120px' : is2 ? '50px' : '80px' }}>Item Name</th>
                        {inv.invOptHSN && <th style={{ borderBottom: `1px solid ${borderCol}`, borderRight: `1px solid ${borderCol}`, padding: tSpace, width: is4 ? '60px' : is2 ? '28px' : '34px', whiteSpace: 'nowrap' }}>HSN</th>}
                        <th style={{ borderBottom: `1px solid ${borderCol}`, borderRight: `1px solid ${borderCol}`, padding: tSpace, width: is4 ? '60px' : is2 ? '30px' : '38px', textAlign: 'center', whiteSpace: 'nowrap' }}>Qty /Unit</th>
                        <th style={{ borderBottom: `1px solid ${borderCol}`, borderRight: `1px solid ${borderCol}`, padding: tSpace, width: is4 ? '60px' : is2 ? '30px' : '38px', textAlign: 'right', whiteSpace: 'nowrap' }}>Rate</th>
                        <th style={{ borderBottom: `1px solid ${borderCol}`, borderRight: `1px solid ${borderCol}`, padding: tSpace, width: is4 ? '70px' : is2 ? '34px' : '42px', textAlign: 'right', whiteSpace: 'nowrap' }}>Amount</th>
                        {inv.invOptTaxPct && <th style={{ borderBottom: `1px solid ${borderCol}`, borderRight: `1px solid ${borderCol}`, padding: tSpace, width: is4 ? '45px' : is2 ? '22px' : '28px', textAlign: 'center', whiteSpace: 'nowrap' }}>Tax %</th>}
                        {inv.invOptTaxAmt && <th style={{ borderBottom: `1px solid ${borderCol}`, borderRight: `1px solid ${borderCol}`, padding: tSpace, width: is4 ? '60px' : is2 ? '30px' : '38px', textAlign: 'right', whiteSpace: 'nowrap' }}>Tax Amt</th>}
                        {inv.invOptTotalAmt && <th style={{ borderBottom: `1px solid ${borderCol}`, padding: tSpace, width: is4 ? '75px' : is2 ? '36px' : '45px', textAlign: 'right', whiteSpace: 'nowrap' }}>Total Amt</th>}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ borderBottom: `1px solid ${borderCol}`, borderRight: `1px solid ${borderCol}`, padding: tSpace, textAlign: 'center', whiteSpace: 'nowrap' }}>1</td>
                        <td style={{ borderBottom: `1px solid ${borderCol}`, borderRight: `1px solid ${borderCol}`, padding: tSpace, wordBreak: 'break-word' }}>1.5" SS Nails</td>
                        {inv.invOptHSN && <td style={{ borderBottom: `1px solid ${borderCol}`, borderRight: `1px solid ${borderCol}`, padding: tSpace, whiteSpace: 'nowrap' }}>S48579</td>}
                        <td style={{ borderBottom: `1px solid ${borderCol}`, borderRight: `1px solid ${borderCol}`, padding: tSpace, textAlign: 'center', whiteSpace: 'nowrap' }}>100 kg</td>
                        <td style={{ borderBottom: `1px solid ${borderCol}`, borderRight: `1px solid ${borderCol}`, padding: tSpace, textAlign: 'right', whiteSpace: 'nowrap' }}>₹180.00</td>
                        <td style={{ borderBottom: `1px solid ${borderCol}`, borderRight: `1px solid ${borderCol}`, padding: tSpace, textAlign: 'right', whiteSpace: 'nowrap' }}>₹180.00</td>
                        {inv.invOptTaxPct && <td style={{ borderBottom: `1px solid ${borderCol}`, borderRight: `1px solid ${borderCol}`, padding: tSpace, textAlign: 'center', whiteSpace: 'nowrap' }}>3%</td>}
                        {inv.invOptTaxAmt && <td style={{ borderBottom: `1px solid ${borderCol}`, borderRight: `1px solid ${borderCol}`, padding: tSpace, textAlign: 'right', whiteSpace: 'nowrap' }}>₹5.40</td>}
                        {inv.invOptTotalAmt && <td style={{ borderBottom: `1px solid ${borderCol}`, padding: tSpace, textAlign: 'right', whiteSpace: 'nowrap' }}>₹185.40</td>}
                      </tr>
                      {/* Totals Row */}
                      <tr style={{ fontWeight: 'bold', backgroundColor: '#f8fafc' }}>
                        <td colSpan={inv.invOptHSN ? 5 : 4} style={{ borderBottom: `1px solid ${borderCol}`, borderRight: `1px solid ${borderCol}`, padding: tSpace, textAlign: 'left' }}>Total</td>
                        <td style={{ borderBottom: `1px solid ${borderCol}`, borderRight: `1px solid ${borderCol}`, padding: tSpace, textAlign: 'right', whiteSpace: 'nowrap' }}>₹180.00</td>
                        {inv.invOptTaxPct && <td style={{ borderBottom: `1px solid ${borderCol}`, borderRight: `1px solid ${borderCol}`, padding: tSpace, textAlign: 'center' }}></td>}
                        {inv.invOptTaxAmt && <td style={{ borderBottom: `1px solid ${borderCol}`, borderRight: `1px solid ${borderCol}`, padding: tSpace, textAlign: 'right', whiteSpace: 'nowrap' }}>₹5.40</td>}
                        {inv.invOptTotalAmt && <td style={{ borderBottom: `1px solid ${borderCol}`, padding: tSpace, textAlign: 'right', whiteSpace: 'nowrap' }}>₹185.40</td>}
                      </tr>
                    </tbody>
                  </table>

                  {/* Price Breakup Box */}
                  <div style={{ display: 'flex', flexDirection: 'column', fontSize: is4 ? '11px' : is2 ? '6px' : '7px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${borderCol}`, padding: rowPadding, height: rowHeight, alignItems: 'center', fontWeight: 'bold' }}>
                      <span>Sub Total</span>
                      <span>₹180.00</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${borderCol}`, padding: rowPadding, height: rowHeight, alignItems: 'center', fontWeight: 'bold' }}>
                      <span>Discount</span>
                      <span>₹0.00</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${borderCol}`, padding: rowPadding, height: rowHeight, alignItems: 'center', fontWeight: 'bold' }}>
                      <span>After Discount</span>
                      <span>₹180.00</span>
                    </div>
                    
                    {inv.invOptTaxBreakup && (
                      <div style={{ display: 'flex', borderBottom: `1px solid ${borderCol}`, alignItems: 'center', justifyContent: 'space-between', fontSize: is4 ? '10px' : is2 ? '5.5px' : '8px', fontWeight: 'bold', padding: 0, height: rowHeight }}>
                        <div style={{ display: 'flex', flex: 1, justifyContent: 'space-between', padding: rowPadding, height: rowHeight, alignItems: 'center', borderRight: `1px solid ${borderCol}` }}>
                          <span>CGST 1.5%</span>
                          <span>₹2.70</span>
                        </div>
                        <div style={{ display: 'flex', flex: 1, justifyContent: 'space-between', padding: rowPadding, height: rowHeight, alignItems: 'center', borderRight: `1px solid ${borderCol}` }}>
                          <span>SGST 1.5%</span>
                          <span>₹2.70</span>
                        </div>
                        <div style={{ display: 'flex', flex: 1, justifyContent: 'space-between', padding: rowPadding, height: rowHeight, alignItems: 'center', borderRight: `1px solid ${borderCol}` }}>
                          <span>IGST 3%</span>
                          <span>-</span>
                        </div>
                        <div style={{ padding: rowPadding, flex: 0.5, textAlign: 'right', height: rowHeight, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                          <span>₹5.40</span>
                        </div>
                      </div>
                    )}

                    {inv.invOptRound && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${borderCol}`, padding: rowPadding, height: rowHeight, alignItems: 'center', fontWeight: 'bold' }}>
                        <span>Round Off</span>
                        <span>₹0.00</span>
                      </div>
                    )}
                    {inv.invOptTotalBreakup && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${borderCol}`, padding: rowPadding, height: rowHeight, alignItems: 'center', fontWeight: 'bold' }}>
                        <span>Total</span>
                        <span>₹185.40</span>
                      </div>
                    )}
                    {inv.invOptCreditBalance && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${borderCol}`, padding: rowPadding, height: rowHeight, alignItems: 'center', fontWeight: 'bold' }}>
                        <span>Credit Balance</span>
                        <span>₹0.00</span>
                      </div>
                    )}
                  </div>

                  {/* Grand Total Bar */}
                  <div style={{ borderBottom: `1px solid ${borderCol}`, padding: is4 ? '12px 16px' : is2 ? '6px 8px' : '8px 12px', color: '#000', fontSize: is4 ? '13px' : is2 ? '9px' : '11px', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', textTransform: 'uppercase' }}>
                    <span>Grand Total</span>
                    <span>₹185.40</span>
                  </div>

                  {/* Amount In Words & Paid/Balance Box */}
                  <div style={{ borderBottom: `1px solid ${borderCol}`, padding: pSpace, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', lineHeight: is2 ? '1.3' : '1.6', fontSize: is4 ? '11px' : is2 ? '6.5px' : '9.5px' }}>
                    <div style={{ textAlign: 'left', flex: 1, paddingRight: is2 ? '6px' : '16px' }}>
                      <div style={{ fontWeight: 'bold' }}>Amount In Words</div>
                      <div style={{ marginTop: '2px' }}>One Hundred Eighty Five Rupees Only</div>
                    </div>
                    <div style={{ width: is4 ? '200px' : is2 ? '95px' : '150px', textAlign: 'left', borderLeft: `1px solid ${borderCol}`, paddingLeft: is2 ? '6px' : '16px', flexShrink: 0 }}>
                      {inv.invOptPaidAmt && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>Paid Amount :</span>
                          <span style={{ fontWeight: 'bold' }}>₹185.40</span>
                        </div>
                      )}
                      {inv.invOptPendingAmt && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                          <span>Current Balance :</span>
                          <span style={{ fontWeight: 'bold' }}>₹0.00</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Note Box */}
                  {inv.note && (
                    <div style={{ borderBottom: `1px solid ${borderCol}`, padding: pSpace, textAlign: 'left', fontSize: is4 ? '10px' : is2 ? '7px' : '8.5px', lineHeight: '1.5', color: '#000' }}>
                      <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>NOTE :</div>
                      <div style={{ whiteSpace: 'pre-wrap' }}>{inv.note}</div>
                    </div>
                  )}

                  {/* Footer Message Box */}
                  <div style={{ padding: is4 ? '12px' : is2 ? '6px' : '8px', textAlign: 'center', fontWeight: 'bold', fontSize: is4 ? '11px' : is2 ? '7.5px' : '9px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    THANK YOU PURCHASE !!!!
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ height: '60px', background: 'white', borderTop: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', flexShrink: 0 }}>
        <button onClick={() => navigate(-1)} style={{ height: '35px', display: 'flex', alignItems: 'center', gap: '8px', padding: '0 16px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'white', cursor: 'pointer', fontSize: '14px', fontWeight: '500' }}>
          <ChevronLeft size={16} /> Back
        </button>
        <button onClick={handleSave} style={{ height: '35px', padding: '0 32px', border: 'none', borderRadius: '8px', background: '#000B58', color: 'white', cursor: 'pointer', fontSize: '14px', fontWeight: '500' }}>
          Save
        </button>
      </div>

      {toast && (
        <div style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 9999, background: toast.type === 'success' ? '#22C55E' : '#EF4444', color: 'white', padding: '12px 20px', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
