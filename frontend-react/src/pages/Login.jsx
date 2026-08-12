import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Lock, Eye, EyeOff, LogIn, Loader2 } from 'lucide-react';

const Login = () => {
    const navigate = useNavigate();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [toast, setToast] = useState(null);

    // When the login page mounts, remove the app-body class to show the wavy background
    // When it unmounts, add it back for the rest of the application
    useEffect(() => {
        document.body.classList.remove('app-body');
        return () => {
            document.body.classList.add('app-body');
        };
    }, []);

    const showToastMessage = (message, type = 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            setIsLoading(false);
            
            if (res.ok && data.success) {
                localStorage.setItem('sph_auth_token', data.token);
                navigate('/items');
            } else {
                showToastMessage(data.error || 'Invalid username or password', 'error');
            }
        } catch (err) {
            setIsLoading(false);
            showToastMessage('Unable to connect to auth server', 'error');
        }
    };

    return (
        <div className="login-container">
            <div className="login-card">
                <div className="login-header">
                    <div className="logo-container">
                        <img src="/Images/Login_Logo.png" alt="SPH Logo" className="logo" />
                    </div>
                    <h1 className="login-title">Login</h1>
                </div>

                <div className="login-body">
                    <p className="subtitle">Fill the details to continue</p>

                    <form onSubmit={handleLogin}>
                        <div className="input-group">
                            <label htmlFor="username">Username</label>
                            <div className="input-wrapper">
                                <User className="input-icon" size={20} />
                                <input 
                                    type="text" 
                                    id="username" 
                                    placeholder="Enter Username" 
                                    required 
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="input-group">
                            <label htmlFor="password">Password</label>
                            <div className="input-wrapper">
                                <Lock className="input-icon" size={20} />
                                <input 
                                    type={showPassword ? "text" : "password"} 
                                    id="password" 
                                    placeholder="Enter Password" 
                                    required 
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                />
                                <button 
                                    type="button" 
                                    className="toggle-password" 
                                    onClick={() => setShowPassword(!showPassword)}
                                >
                                    {showPassword ? <Eye size={20} className="eye-icon" /> : <EyeOff size={20} className="eye-icon" />}
                                </button>
                            </div>
                        </div>

                        <button type="submit" className="login-btn" disabled={isLoading}>
                            {isLoading ? (
                                <Loader2 className="btn-icon" style={{ animation: 'spin 1s linear infinite' }} size={20} />
                            ) : (
                                <LogIn className="btn-icon" size={20} />
                            )}
                            {isLoading ? 'Logging in...' : 'Login'}
                        </button>
                    </form>
                </div>
            </div>

            {/* Toast Notification */}
            {toast && (
                <div style={{
                    position: 'fixed', top: '20px', right: '20px', zIndex: 9999,
                    display: 'flex', flexDirection: 'column', gap: '10px'
                }}>
                    <div className={`toast toast-${toast.type} show`} style={{
                        background: toast.type === 'success' ? '#22C55E' : (toast.type === 'error' ? '#EF4444' : '#3B82F6'),
                        color: 'white', padding: '12px 20px', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                        display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'Manrope, sans-serif',
                        fontSize: '14px', fontWeight: '500', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                    }}>
                        <span>{toast.message}</span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Login;
