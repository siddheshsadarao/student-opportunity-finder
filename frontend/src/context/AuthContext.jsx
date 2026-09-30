/**
 * Authentication state for the whole app.
 *
 * React Context lets any component read the logged-in user without passing
 * props down through every level. On first load we call /auth/me with the
 * stored token so a page refresh does not log the student out.
 */
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { authApi, tokenStorage } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [onboardingDone, setOnboardingDone] = useState(false);
  // "loading" is true until we know whether the stored token is still valid.
  // Routes wait for this so they do not redirect a logged-in user to /login.
  const [loading, setLoading] = useState(true);

  const loadSession = useCallback(async () => {
    const token = tokenStorage.get();
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const data = await authApi.me();
      setUser(data.user);
      setProfile(data.profile);
      setOnboardingDone(data.onboardingDone);
    } catch {
      // Token expired or the account was removed.
      tokenStorage.clear();
      setUser(null);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  /** Stores the token and user returned by any of the login endpoints. */
  const applySession = useCallback((data) => {
    tokenStorage.set(data.token);
    setUser(data.user);
    setOnboardingDone(data.onboardingDone);
    return data;
  }, []);

  const login = useCallback(
    async (credentials) => applySession(await authApi.login(credentials)),
    [applySession]
  );

  const adminLogin = useCallback(
    async (credentials) => applySession(await authApi.adminLogin(credentials)),
    [applySession]
  );

  const register = useCallback(
    async (payload) => applySession(await authApi.register(payload)),
    [applySession]
  );

  const logout = useCallback(() => {
    tokenStorage.clear();
    setUser(null);
    setProfile(null);
    setOnboardingDone(false);
  }, []);

  /** Called after the profile is edited so the UI stays in sync. */
  const updateProfile = useCallback((nextProfile) => {
    setProfile(nextProfile);
    if (nextProfile?.onboardingDone) setOnboardingDone(true);
    if (nextProfile?.name) {
      setUser((current) => (current ? { ...current, name: nextProfile.name } : current));
    }
  }, []);

  const value = {
    user,
    profile,
    onboardingDone,
    loading,
    isAuthenticated: !!user,
    isAdmin: user?.role === 'admin',
    isStudent: user?.role === 'student',
    login,
    adminLogin,
    register,
    logout,
    updateProfile,
    refresh: loadSession,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Hook used by components: const { user, logout } = useAuth(); */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an <AuthProvider>.');
  return context;
}

export default AuthContext;
