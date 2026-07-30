import React from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';

const TopBar = () => {
    const navigate = useNavigate();

    const handleLogout = async () => {
        try {
            const token = localStorage.getItem('sph_auth_token');
            await fetch('http://localhost:3000/api/auth/logout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                }
            });
        } catch (e) {
            console.error('Logout request failed:', e);
        }
        localStorage.removeItem('sph_auth_token');
        navigate('/login', { replace: true });
    };

    return (
        <header className="top-bar">
            <div className="top-bar-left">
                <img src="/Images/Logo.png" alt="SPH Logo" className="app-logo" />
            </div>
            <div className="top-bar-right" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div 
                    className="user-profile" 
                    onClick={() => navigate('/settings')}
                    style={{ cursor: 'pointer' }}
                >
                    <div className="user-avatar" style={{ overflow: 'hidden', backgroundColor: '#FFD54F', color: '#000B58', fontWeight: '700', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        SPH
                    </div>
                    <span className="user-name">SPH Admin</span>
                </div>
                <button 
                    onClick={handleLogout} 
                    style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '6px', 
                        border: '1px solid var(--border-color)', 
                        background: 'white', 
                        borderRadius: '6px', 
                        padding: '6px 12px', 
                        cursor: 'pointer', 
                        fontSize: '12px', 
                        fontWeight: '600',
                        color: '#EF4444' 
                    }}
                >
                    <LogOut size={14} />
                    Logout
                </button>
            </div>
        </header>
    );
};

export default TopBar;
