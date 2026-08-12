import React from 'react';

const Home = () => {
    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: 'var(--text-muted)'
        }}>
            <img src="/Icons/Home icon.svg" alt="Home" style={{ width: '64px', opacity: 0.5, marginBottom: '16px' }} />
            <h2 style={{ fontSize: '24px', fontWeight: '600', marginBottom: '8px', color: '#1E293B' }}>Dashboard</h2>
            <p>This module is currently under construction.</p>
        </div>
    );
};

export default Home;
