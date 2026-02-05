import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

type SessionUser = {
  id: string;
  authenticated: true;
};

type AuthContextType = {
  user: SessionUser | null;
  loading: boolean;
  authenticate: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const CORRECT_PASSWORD = '123mindrep';
const SESSION_KEY = 'crm_session_token';

function generateSessionToken(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sessionToken = localStorage.getItem(SESSION_KEY);
    if (sessionToken) {
      setUser({ id: sessionToken, authenticated: true });
    }
    setLoading(false);
  }, []);

  const authenticate = async (password: string) => {
    if (password !== CORRECT_PASSWORD) {
      throw new Error('Invalid password');
    }
    const token = generateSessionToken();
    localStorage.setItem(SESSION_KEY, token);
    setUser({ id: token, authenticated: true });
  };

  const signOut = async () => {
    localStorage.removeItem(SESSION_KEY);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, authenticate, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
