import React, { useState, useEffect } from 'react';
import { Lock, User, Eye, EyeOff, LogIn, AlertTriangle, X } from 'lucide-react';
import { registerSessionModal } from '../utils/sessionCoordinator';

export default function SessionExpiredModal() {
    const [modalState, setModalState] = useState({ isOpen: false, onSuccess: null, onCancel: null });
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    useEffect(() => {
        const unregister = registerSessionModal((state) => {
            setModalState(state);
            if (state.isOpen) {
                setErrorMessage('');
                setPassword('');
            }
        });
        return unregister;
    }, []);

    if (!modalState.isOpen) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setErrorMessage('');

        try {
            // Bypass global fetch interceptor by requesting directly
            const res = await window.fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
                _isReauthLogin: true
            });

            const data = await res.json();
            setIsLoading(false);

            if (res.ok && data.success && data.token) {
                localStorage.setItem('sph_auth_token', data.token);
                if (modalState.onSuccess) {
                    modalState.onSuccess(data.token);
                }
            } else {
                setErrorMessage(data.error || 'Invalid credentials. Please try again.');
            }
        } catch (err) {
            setIsLoading(false);
            setErrorMessage('Unable to connect to authentication server');
        }
    };

    const handleDismiss = () => {
        if (modalState.onCancel) {
            modalState.onCancel();
        }
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: '16px'
        }}>
            <div style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '16px',
                width: '100%',
                maxWidth: '440px',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)',
                border: '1px solid #E2E8F0',
                overflow: 'hidden',
                animation: 'fadeIn 0.2s ease-out'
            }}>
                {/* Header */}
                <div style={{
                    padding: '20px 24px',
                    borderBottom: '1px solid #F1F5F9',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: '#FAFCFF'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '10px',
                            backgroundColor: '#FEF3C7',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#D97706'
                        }}>
                            <AlertTriangle size={20} />
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#0F172A' }}>
                                Session Expired
                            </h3>
                            <p style={{ margin: 0, fontSize: '12px', color: '#64748B' }}>
                                Re-authenticate to save your work without losing data
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={handleDismiss}
                        style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#94A3B8',
                            padding: '4px',
                            borderRadius: '6px'
                        }}
                        title="Dismiss without saving"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} style={{ padding: '24px' }}>
                    {errorMessage && (
                        <div style={{
                            padding: '10px 14px',
                            backgroundColor: '#FEF2F2',
                            border: '1px solid #FCA5A5',
                            borderRadius: '8px',
                            color: '#991B1B',
                            fontSize: '13px',
                            marginBottom: '16px'
                        }}>
                            {errorMessage}
                        </div>
                    )}

                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>
                            Username
                        </label>
                        <div style={{ position: 'relative' }}>
                            <User size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                            <input
                                type="text"
                                required
                                autoFocus
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="Enter username"
                                style={{
                                    width: '100%',
                                    padding: '10px 12px 10px 38px',
                                    borderRadius: '8px',
                                    border: '1px solid #CBD5E1',
                                    fontSize: '14px',
                                    outline: 'none',
                                    boxSizing: 'border-box'
                                }}
                            />
                        </div>
                    </div>

                    <div style={{ marginBottom: '20px' }}>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>
                            Password
                        </label>
                        <div style={{ position: 'relative' }}>
                            <Lock size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                            <input
                                type={showPassword ? 'text' : 'password'}
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Enter password"
                                style={{
                                    width: '100%',
                                    padding: '10px 38px 10px 38px',
                                    borderRadius: '8px',
                                    border: '1px solid #CBD5E1',
                                    fontSize: '14px',
                                    outline: 'none',
                                    boxSizing: 'border-box'
                                }}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                style={{
                                    position: 'absolute',
                                    right: '10px',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: '#94A3B8'
                                }}
                            >
                                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '12px' }}>
                        <button
                            type="button"
                            onClick={handleDismiss}
                            style={{
                                flex: 1,
                                padding: '10px 16px',
                                border: '1px solid #E2E8F0',
                                borderRadius: '8px',
                                backgroundColor: '#F8FAFC',
                                color: '#475569',
                                fontSize: '13px',
                                fontWeight: '600',
                                cursor: 'pointer'
                            }}
                        >
                            Cancel (Keep Data)
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading}
                            style={{
                                flex: 1,
                                padding: '10px 16px',
                                border: 'none',
                                borderRadius: '8px',
                                backgroundColor: '#000B58',
                                color: '#FFFFFF',
                                fontSize: '13px',
                                fontWeight: '600',
                                cursor: isLoading ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px'
                            }}
                        >
                            {isLoading ? 'Verifying...' : (
                                <>
                                    <LogIn size={15} />
                                    <span>Re-authenticate</span>
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
