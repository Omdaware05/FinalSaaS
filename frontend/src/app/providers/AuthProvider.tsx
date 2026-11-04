import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import apiClient from '../../services/api/client';

interface AuthContextType {
  token: string | null;
  isAuthenticated: boolean;
  isAuthModalOpen: boolean;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  setAuthToken: (token: string) => void;
  logout: () => void;
  verifyToken: (token: string) => Promise<boolean>;
  login: (email: string, password: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setTokenState] = useState<string | null>(() => localStorage.getItem('api_auth_token'));
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  const setAuthToken = useCallback((newToken: string) => {
    localStorage.setItem('api_auth_token', newToken);
    setTokenState(newToken);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('api_auth_token');
    setTokenState(null);
  }, []);

  // JWT auth: a token is valid only when the backend confirms it via
  // GET /auth/me with a 200. Any error (401, network failure, ...) means
  // the token is NOT accepted — no permit-on-error fallback.
  const verifyToken = async (testToken: string): Promise<boolean> => {
    try {
      const res = await apiClient.get('/auth/me', {
        headers: {
          Authorization: `Bearer ${testToken}`,
          'X-API-Token': testToken,
        },
      });
      return res.status === 200;
    } catch {
      return false;
    }
  };

  // Email + password sign-in against POST /auth/login; on success the
  // returned JWT access_token is stored under the usual storage key.
  const login = useCallback(
    async (email: string, password: string): Promise<boolean> => {
      const res = await apiClient.post('/auth/login', { email, password });
      const accessToken: string | undefined = res.data?.access_token;
      if (!accessToken) return false;
      setAuthToken(accessToken);
      return true;
    },
    [setAuthToken]
  );

  useEffect(() => {
    const handleAuthRequired = () => {
      setIsAuthModalOpen(true);
    };

    window.addEventListener('voxora:auth_required', handleAuthRequired);
    return () => window.removeEventListener('voxora:auth_required', handleAuthRequired);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        token,
        isAuthenticated: !!token,
        isAuthModalOpen,
        openAuthModal: () => setIsAuthModalOpen(true),
        closeAuthModal: () => setIsAuthModalOpen(false),
        setAuthToken,
        logout,
        verifyToken,
        login,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
