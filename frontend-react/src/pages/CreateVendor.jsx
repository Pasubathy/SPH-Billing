import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft, PlusSquare } from 'lucide-react';
import CustomSelect from '../components/CustomSelect';

const inputStyle = { height: '38px', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0 12px', fontFamily: 'inherit', fontSize: '13px', outline: 'none', width: '100%', boxSizing: 'border-box' };
const textAreaStyle = { ...inputStyle, height: '80px', paddingTop: '10px', resize: 'none' };

export default function CreateVendor() {
  const navigate = useNavigate();
  const location = useLocation();
  const editVendor = location.state?.editVendor;

  // Basic Details
  const [vendorName, setVendorName] = useState(editVendor?.vendorName || '');
  const [displayName, setDisplayName] = useState(editVendor?.displayName || editVendor?.vendorName || '');
  const [contactPerson, setContactPerson] = useState(editVendor?.contactPerson || '');
  const [contactNumber, setContactNumber] = useState(editVendor?.phoneNumber || editVendor?.contactNumber || '');
  const [emailId, setEmailId] = useState(editVendor?.email || editVendor?.emailId || '');
  const [gstin, setGstin] = useState(editVendor?.gstin || '');
  const [panNumber, setPanNumber] = useState(editVendor?.panNumber || '');
  const [isCompanyName, setIsCompanyName] = useState(editVendor ? (editVendor.displayName === editVendor.vendorName) : false);

  // Address Details
  const [billingAddress, setBillingAddress] = useState(editVendor?.billAddress || '');
  const [billCountry, setBillCountry] = useState(editVendor?.billCountry || 'India');
  const [billState, setBillState] = useState(editVendor?.billState || '');
  const [billCity, setBillCity] = useState(editVendor?.billCity || '');
  const [billPinCode, setBillPinCode] = useState(editVendor?.billPinCode || editVendor?.billPincode || '');

  const [shipAddress, setShipAddress] = useState(editVendor?.shipAddress || '');
  const [shipCountry, setShipCountry] = useState(editVendor?.shipCountry || 'India');
  const [shipState, setShipState] = useState(editVendor?.shipState || '');
  const [shipCity, setShipCity] = useState(editVendor?.shipCity || '');
  const [shipPinCode, setShipPinCode] = useState(editVendor?.shipPinCode || editVendor?.shipPincode || '');
  const [copyBilling, setCopyBilling] = useState(false);

  // Account Details
  const [accounts, setAccounts] = useState([{
    accHolderName: editVendor?.accHolderName || editVendor?.vendorName || '',
    accNumber: editVendor?.accNumber || '',
    ifscCode: editVendor?.ifscCode || '',
    bankName: editVendor?.bankName || '',
    branchName: editVendor?.branchName || ''
  }]);

  // Additional Details
  const [openingBalance, setOpeningBalance] = useState(editVendor?.openingBalance || '');
  const [balanceType, setBalanceType] = useState(editVendor?.balanceType || 'To Pay');
  const [paymentTerms, setPaymentTerms] = useState(editVendor?.paymentTerms || 'None');

  const saveVendor = async (stayOnPage = false) => {
    if (!vendorName) {
      alert("Vendor Name is required");
      return;
    }
    if (!displayName) {
      alert("Display Name is required");
      return;
    }

    try {
      // 1. Fetch existing vendors
      const res = await fetch('/api/vendors');
      const vendors = await res.json();

      let pendingToPay = 0;
      let creditBalance = 0;
      
      const parsedBal = parseFloat(openingBalance) || 0;
      if (balanceType === 'To Pay') {
          pendingToPay = parsedBal;
      } else if (balanceType === 'To Collect') {
          creditBalance = parsedBal;
      }

      // 2. Create new vendor object
      const newVendor = {
        id: editVendor?.id || Date.now().toString() + Math.random().toString(36).substr(2, 5),
        vendorName,
        displayName,
        contactPerson,
        contactNumber,
        emailId,
        gstin,
        panNumber,
        billAddress: billingAddress,
        billCountry,
        billState,
        billCity,
        billPinCode,
        shipAddress,
        shipCountry,
        shipState,
        shipCity,
        shipPinCode,
        accHolderName: accounts[0]?.accHolderName || '',
        accNumber: accounts[0]?.accNumber || '',
        ifscCode: accounts[0]?.ifscCode || '',
        bankName: accounts[0]?.bankName || '',
        branchName: accounts[0]?.branchName || '',
        openingBalance: parsedBal,
        balanceType,
        paymentTerms,
        pendingToPay: editVendor ? editVendor.pendingToPay : pendingToPay,
        creditBalance: editVendor ? editVendor.creditBalance : creditBalance,
        asOfDate: editVendor?.asOfDate || new Date().toISOString().split('T')[0] // current date
      };

      // 3. Append to existing vendors array
      if (editVendor?.id) {
          const index = vendors.findIndex(v => String(v.id) === String(editVendor.id));
          if (index !== -1) vendors[index] = newVendor;
          else vendors.push(newVendor);
      } else {
          vendors.push(newVendor);
      }

      // 4. POST the entire array back to the bulk-replace endpoint
      const saveRes = await fetch('/api/vendors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vendors)
      });

      if (!saveRes.ok) throw new Error("Failed to save vendor");

      alert("Vendor saved successfully!");

      if (stayOnPage) {
        window.location.reload();
      } else {
        navigate('/vendors');
      }

    } catch (err) {
      console.error(err);
      alert("Error saving vendor: " + err.message);
    }
  };

  const handleVendorNameChange = (e) => {
    const val = e.target.value;
    setVendorName(val);
    if (isCompanyName) setDisplayName(val);
  };

  const handleCompanyNameToggle = (e) => {
    const checked = e.target.checked;
    setIsCompanyName(checked);
    if (checked) setDisplayName(vendorName);
  };

  const handleCopyBillingToggle = (e) => {
    const checked = e.target.checked;
    setCopyBilling(checked);
    if (checked) {
      setShipAddress(billingAddress);
      setShipCountry(billCountry);
      setShipState(billState);
      setShipCity(billCity);
      setShipPinCode(billPinCode);
    }
  };

  const handleAddAccountRow = () => {
    setAccounts([...accounts, { accHolderName: '', accNumber: '', ifscCode: '', bankName: '', branchName: '' }]);
  };

  const handleAccountChange = (index, field, value) => {
    const updated = [...accounts];
    updated[index][field] = value;
    setAccounts(updated);
  };

  const stateOptions = [
    { value: 'Tamil Nadu', label: 'Tamil Nadu' },
    { value: 'Kerala', label: 'Kerala' },
    { value: 'Karnataka', label: 'Karnataka' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <style>
        {`
          .responsive-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 16px; }
          .responsive-grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; }
          @media (max-width: 768px) {
            .responsive-grid-3 { display: flex; flex-direction: column; }
            .responsive-grid-2 { display: flex; flex-direction: column; }
          }
        `}
      </style>
      <div className="page-header" style={{ height: '45px', padding: '0 16px', display: 'flex', alignItems: 'center', backgroundColor: 'white', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
        <h1 className="page-title" style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: 'var(--text-main)' }}>Create Vendor</h1>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', background: '#F8FAFC' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Basic Details */}
          <div className="create-card">
            <div className="create-card-title">Basic Details</div>
            <div className="create-card-body" style={{ padding: '16px' }}>
              <div className="responsive-grid-3">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '500' }}>Vendor Name <span style={{ color: '#EF4444' }}>*</span></label>
                  <input type="text" style={inputStyle} value={vendorName} onChange={handleVendorNameChange} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ fontSize: '13px', fontWeight: '500', margin: 0 }}>Display Name <span style={{ color: '#EF4444' }}>*</span></label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: '500', color: 'var(--text-muted)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={isCompanyName} onChange={handleCompanyNameToggle} /> Company Name
                    </label>
                  </div>
                  <input type="text" style={inputStyle} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '500' }}>Contact Person</label>
                  <input type="text" style={inputStyle} value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} />
                </div>
              </div>
              <div className="responsive-grid-3">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '500' }}>Contact Number</label>
                  <input type="text" style={inputStyle} maxLength="10" value={contactNumber} onChange={(e) => setContactNumber(e.target.value.replace(/[^0-9]/g, ''))} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '500' }}>Email ID</label>
                  <input type="email" style={inputStyle} value={emailId} onChange={(e) => setEmailId(e.target.value)} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '500' }}>GSTIN</label>
                  <input type="text" style={{ ...inputStyle, textTransform: 'uppercase' }} value={gstin} onChange={(e) => setGstin(e.target.value)} />
                </div>
              </div>
              <div className="responsive-grid-3" style={{ marginBottom: 0 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '500' }}>PAN Number</label>
                  <input type="text" style={{ ...inputStyle, textTransform: 'uppercase' }} maxLength="10" value={panNumber} onChange={(e) => setPanNumber(e.target.value)} />
                </div>
              </div>
            </div>
          </div>

          {/* Address Details */}
          <div className="create-card">
            <div className="create-card-title">Address Details</div>
            <div className="create-card-body" style={{ padding: '16px' }}>
              <div className="responsive-grid-2">
                {/* Billing Column */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '13px', fontWeight: '500' }}>Billing Address</label>
                    <textarea style={textAreaStyle} value={billingAddress} onChange={(e) => setBillingAddress(e.target.value)}></textarea>
                  </div>
                  <div style={{ display: 'flex', gap: '16px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                      <label style={{ fontSize: '13px', fontWeight: '500' }}>Country</label>
                      <CustomSelect value={billCountry} onChange={setBillCountry} options={[{ value: 'India', label: 'India' }]} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                      <label style={{ fontSize: '13px', fontWeight: '500' }}>State</label>
                      <CustomSelect value={billState} onChange={setBillState} placeholder="Select State" options={stateOptions} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '16px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                      <label style={{ fontSize: '13px', fontWeight: '500' }}>City</label>
                      <input type="text" style={inputStyle} value={billCity} onChange={(e) => setBillCity(e.target.value)} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                      <label style={{ fontSize: '13px', fontWeight: '500' }}>Pin Code</label>
                      <input type="text" style={inputStyle} maxLength="6" value={billPinCode} onChange={(e) => setBillPinCode(e.target.value.replace(/[^0-9]/g, ''))} />
                    </div>
                  </div>
                </div>
                {/* Shipping Column */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label style={{ fontSize: '13px', fontWeight: '500', margin: 0 }}>Shipping Address</label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: '500', color: 'var(--text-muted)', cursor: 'pointer' }}>
                        <input type="checkbox" checked={copyBilling} onChange={handleCopyBillingToggle} /> Billing Address
                      </label>
                    </div>
                    <textarea style={textAreaStyle} value={shipAddress} onChange={(e) => setShipAddress(e.target.value)}></textarea>
                  </div>
                  <div style={{ display: 'flex', gap: '16px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                      <label style={{ fontSize: '13px', fontWeight: '500' }}>Country</label>
                      <CustomSelect value={shipCountry} onChange={setShipCountry} options={[{ value: 'India', label: 'India' }]} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                      <label style={{ fontSize: '13px', fontWeight: '500' }}>State</label>
                      <CustomSelect value={shipState} onChange={setShipState} placeholder="Select State" options={stateOptions} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '16px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                      <label style={{ fontSize: '13px', fontWeight: '500' }}>City</label>
                      <input type="text" style={inputStyle} value={shipCity} onChange={(e) => setShipCity(e.target.value)} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                      <label style={{ fontSize: '13px', fontWeight: '500' }}>Pin Code</label>
                      <input type="text" style={inputStyle} maxLength="6" value={shipPinCode} onChange={(e) => setShipPinCode(e.target.value.replace(/[^0-9]/g, ''))} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Account Details */}
          <div className="create-card">
            <div className="create-card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Account Details</span>
              <button type="button" onClick={handleAddAccountRow} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: 'none', color: '#000B58', fontWeight: '600', fontSize: '13px', cursor: 'pointer', padding: 0 }}>
                <PlusSquare size={14} /> Add Row
              </button>
            </div>
            <div className="create-card-body" style={{ padding: '16px' }}>
              {accounts.map((acc, index) => (
                <div key={index} style={{ marginBottom: index !== accounts.length - 1 ? '24px' : '0', paddingBottom: index !== accounts.length - 1 ? '16px' : '0', borderBottom: index !== accounts.length - 1 ? '1px dashed var(--border-color)' : 'none' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '13px', fontWeight: '500' }}>Account Holder Name</label>
                      <input type="text" style={inputStyle} value={acc.accHolderName} onChange={(e) => handleAccountChange(index, 'accHolderName', e.target.value)} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '13px', fontWeight: '500' }}>Account Number</label>
                      <input type="text" style={inputStyle} value={acc.accNumber} onChange={(e) => handleAccountChange(index, 'accNumber', e.target.value)} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '13px', fontWeight: '500' }}>IFSC Code</label>
                      <input type="text" style={{ ...inputStyle, textTransform: 'uppercase' }} value={acc.ifscCode} onChange={(e) => handleAccountChange(index, 'ifscCode', e.target.value)} />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '13px', fontWeight: '500' }}>Bank Name</label>
                      <input type="text" style={inputStyle} value={acc.bankName} onChange={(e) => handleAccountChange(index, 'bankName', e.target.value)} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '13px', fontWeight: '500' }}>Branch Name</label>
                      <input type="text" style={inputStyle} value={acc.branchName} onChange={(e) => handleAccountChange(index, 'branchName', e.target.value)} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Additional Details */}
          <div className="create-card">
            <div className="create-card-title">Additional Details</div>
            <div className="create-card-body" style={{ padding: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '500' }}>Opening Balance</label>
                  <input type="number" style={inputStyle} placeholder="0.00" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '500' }}>Balance Type</label>
                  <CustomSelect value={balanceType} onChange={setBalanceType} placeholder="Select Balance Type" options={[
                    { value: 'To Collect', label: 'To Collect' },
                    { value: 'To Pay', label: 'To Pay' }
                  ]} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '500' }}>Payment Terms</label>
                  <CustomSelect value={paymentTerms} onChange={setPaymentTerms} options={[
                    { value: 'None', label: 'None' },
                    { value: '10 days', label: '10 days' },
                    { value: '30 days', label: '30 days' }
                  ]} />
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      <div className="sticky-action-bar-new" style={{ height: '60px', background: 'white', borderTop: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', flexShrink: 0 }}>
        <button onClick={() => navigate('/vendors')} style={{ height: '35px', display: 'flex', alignItems: 'center', gap: '6px', padding: '0 16px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'white', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}>
          <ChevronLeft size={16} /> Back
        </button>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={() => saveVendor(true)} style={{ height: '35px', padding: '0 16px', border: '1px solid #000B58', color: '#000B58', borderRadius: '8px', background: 'white', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>Save & Add</button>
          <button onClick={() => saveVendor(false)} style={{ height: '35px', padding: '0 16px', border: 'none', color: 'white', borderRadius: '8px', background: '#000B58', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>Save</button>
        </div>
      </div>
    </div>
  );
}
