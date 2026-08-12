import React from 'react';
import { useNavigate } from 'react-router-dom';

const TopBar = () => {
    const navigate = useNavigate();

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
            </div>
        </header>
    );
};

export default TopBar;
