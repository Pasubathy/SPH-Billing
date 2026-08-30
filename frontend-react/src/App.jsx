import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import './assets/css/style.css';
import './assets/css/items-grid.css';
import './assets/css/sales.css';

// Lazy Loaded Routes for Ultra-Fast Code Splitting
const Login = lazy(() => import('./pages/Login'));
const Home = lazy(() => import('./pages/Home'));
const Items = lazy(() => import('./pages/Items'));
const CreateItem = lazy(() => import('./pages/CreateItem'));
const ViewItem = lazy(() => import('./pages/ViewItem'));
const Categories = lazy(() => import('./pages/Categories'));
const Units = lazy(() => import('./pages/Units'));
const PrintTags = lazy(() => import('./pages/PrintTags'));
const Sales = lazy(() => import('./pages/Sales'));
const CreateSalesInvoice = lazy(() => import('./pages/CreateSalesInvoice'));
const CreateSalesReturn = lazy(() => import('./pages/CreateSalesReturn'));
const Vendors = lazy(() => import('./pages/Vendors'));
const CreateVendor = lazy(() => import('./pages/CreateVendor'));
const ViewVendor = lazy(() => import('./pages/ViewVendor'));
const PurchaseInvoice = lazy(() => import('./pages/PurchaseInvoice'));
const CreatePurchaseInvoice = lazy(() => import('./pages/CreatePurchaseInvoice'));
const ViewPurchaseInvoice = lazy(() => import('./pages/ViewPurchaseInvoice'));
const PurchaseReturn = lazy(() => import('./pages/PurchaseReturn'));
const CreatePurchaseReturn = lazy(() => import('./pages/CreatePurchaseReturn'));
const ViewPurchaseReturn = lazy(() => import('./pages/ViewPurchaseReturn'));
const Payment = lazy(() => import('./pages/Payment'));
const CreatePayment = lazy(() => import('./pages/CreatePayment'));
const ViewPayment = lazy(() => import('./pages/ViewPayment'));
const Vouchers = lazy(() => import('./pages/Vouchers'));
const CreateVoucher = lazy(() => import('./pages/CreateVoucher'));
const ViewVoucher = lazy(() => import('./pages/ViewVoucher'));
const Settings = lazy(() => import('./pages/Settings'));

// Sleek Loading Spinner Fallback
const PageLoader = () => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', flexDirection: 'column', gap: '12px' }}>
        <div style={{
            width: '32px',
            height: '32px',
            border: '3px solid #E2E8F0',
            borderTop: '3px solid #000B58',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite'
        }} />
        <span style={{ fontSize: '13px', color: '#64748B', fontWeight: '500' }}>Loading module...</span>
    </div>
);

// Protected Route Component to prevent unauthenticated access
const ProtectedRoute = ({ children }) => {
    const token = localStorage.getItem('sph_auth_token');
    if (!token) {
        return <Navigate to="/login" replace />;
    }
    return children;
};

function App() {
  return (
    <Router>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/print/tags" element={<PrintTags />} />
          
          {/* Protected Routes */}
          <Route path="/" element={<ProtectedRoute><Layout><Home /></Layout></ProtectedRoute>} />
          <Route path="/items" element={<ProtectedRoute><Layout><Items /></Layout></ProtectedRoute>} />
          <Route path="/items/create" element={<ProtectedRoute><Layout><CreateItem /></Layout></ProtectedRoute>} />
          <Route path="/items/view/:code" element={<ProtectedRoute><Layout><ViewItem /></Layout></ProtectedRoute>} />
          <Route path="/categories" element={<ProtectedRoute><Layout><Categories /></Layout></ProtectedRoute>} />
          <Route path="/units" element={<ProtectedRoute><Layout><Units /></Layout></ProtectedRoute>} />
          <Route path="/sales" element={<ProtectedRoute><Layout><Sales /></Layout></ProtectedRoute>} />
          <Route path="/sales/create" element={<ProtectedRoute><Layout><CreateSalesInvoice /></Layout></ProtectedRoute>} />
          <Route path="/sales/return/create" element={<ProtectedRoute><Layout><CreateSalesReturn /></Layout></ProtectedRoute>} />
          <Route path="/vendors" element={<ProtectedRoute><Layout><Vendors /></Layout></ProtectedRoute>} />
          <Route style={{fontFamily: 'Manrope'}} path="/vendors/create" element={<ProtectedRoute><Layout><CreateVendor /></Layout></ProtectedRoute>} />
          <Route path="/vendors/view/:id" element={<ProtectedRoute><Layout><ViewVendor /></Layout></ProtectedRoute>} />
          <Route path="/purchase-invoice" element={<ProtectedRoute><Layout><PurchaseInvoice /></Layout></ProtectedRoute>} />
          <Route path="/purchase-invoice/view/:id" element={<ProtectedRoute><Layout><ViewPurchaseInvoice /></Layout></ProtectedRoute>} />
          <Route path="/purchase-invoice/create" element={<ProtectedRoute><Layout><CreatePurchaseInvoice /></Layout></ProtectedRoute>} />
          <Route path="/purchase-return" element={<ProtectedRoute><Layout><PurchaseReturn /></Layout></ProtectedRoute>} />
          <Route path="/purchase-return/view/:id" element={<ProtectedRoute><Layout><ViewPurchaseReturn /></Layout></ProtectedRoute>} />
          <Route path="/purchase-return/create" element={<ProtectedRoute><Layout><CreatePurchaseReturn /></Layout></ProtectedRoute>} />
          <Route path="/payment" element={<ProtectedRoute><Layout><Payment /></Layout></ProtectedRoute>} />
          <Route path="/payment/create" element={<ProtectedRoute><Layout><CreatePayment /></Layout></ProtectedRoute>} />
          <Route path="/payment/view/:id" element={<ProtectedRoute><Layout><ViewPayment /></Layout></ProtectedRoute>} />
          
          {/* Voucher Routes */}
          <Route path="/voucher" element={<ProtectedRoute><Layout><Vouchers /></Layout></ProtectedRoute>} />
          <Route path="/voucher/create" element={<ProtectedRoute><Layout><CreateVoucher /></Layout></ProtectedRoute>} />
          <Route path="/voucher/edit/:id" element={<ProtectedRoute><Layout><CreateVoucher /></Layout></ProtectedRoute>} />
          <Route path="/voucher/view/:id" element={<ProtectedRoute><Layout><ViewVoucher /></Layout></ProtectedRoute>} />

          <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
        </Routes>
      </Suspense>
    </Router>
  );
}

export default App;
