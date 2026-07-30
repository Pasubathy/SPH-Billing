import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Items from './pages/Items';
import CreateItem from './pages/CreateItem';
import ViewItem from './pages/ViewItem';
import Login from './pages/Login';
import Settings from './pages/Settings';
import Vendors from './pages/Vendors';
import PurchaseInvoice from './pages/PurchaseInvoice';
import Categories from './pages/Categories';
import Units from './pages/Units';
import './assets/css/style.css';
import './assets/css/items-grid.css';

import Sales from './pages/Sales';
import CreateSalesInvoice from './pages/CreateSalesInvoice';
import CreateVendor from './pages/CreateVendor';
import CreatePurchaseInvoice from './pages/CreatePurchaseInvoice';
import ViewPurchaseInvoice from './pages/ViewPurchaseInvoice';
import CreatePayment from './pages/CreatePayment';
import Payment from './pages/Payment';
import ViewPayment from './pages/ViewPayment';
import ViewVendor from './pages/ViewVendor';
import CreateSalesReturn from './pages/CreateSalesReturn';
import PurchaseReturn from './pages/PurchaseReturn';
import CreatePurchaseReturn from './pages/CreatePurchaseReturn';
import ViewPurchaseReturn from './pages/ViewPurchaseReturn';

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
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Navigate to="/login" replace />} />
        
        {/* Protected Routes */}
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
        <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
      </Routes>
    </Router>
  )
}

export default App;

