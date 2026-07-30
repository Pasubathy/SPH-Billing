import React from 'react';
import TopBar from './TopBar';
import Sidebar from './Sidebar';

const Layout = ({ children }) => {
    return (
        <>
            <TopBar />
            <div className="app-container">
                <Sidebar />
                <main className="main-content">
                    {children}
                </main>
            </div>
        </>
    );
};

export default Layout;
