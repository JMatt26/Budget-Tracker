import {
    createContext,
    useContext,
    useEffect,
    useState,
    ReactNode,
  } from "react";
  import { useNavigate } from "react-router-dom";
  import { api } from "./api";
  import type { Token } from "./types";
  
  const TOKEN_KEY = "budget_app_token";
  
  export const getToken = (): string | null => {
    return localStorage.getItem(TOKEN_KEY);
  };
  
  const setToken = (token: string | null) => {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  };
  
  interface AuthContextValue {
    token: string | null;
    login: (email: string, password: string) => Promise<void>;
    register: (email: string, password: string) => Promise<void>;
    logout: () => void;
  }
  
  const AuthContext = createContext<AuthContextValue | undefined>(
    undefined
  );
  
  export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [token, setTokenState] = useState<string | null>(
      getToken()
    );
    const navigate = useNavigate();
  
    useEffect(() => {
      setTokenState(getToken());
    }, []);
  
    const login = async (email: string, password: string) => {
      // FastAPI OAuth2PasswordRequestForm expects form-encoded username/password
      const form = new URLSearchParams();
      form.append("username", email);
      form.append("password", password);
  
      const { data } = await api.post<Token>("/auth/login", form, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
  
      setToken(data.access_token);
      setTokenState(data.access_token);
      navigate("/", { replace: true });
    };
  
    const register = async (email: string, password: string) => {
      // Adjust to your actual register schema if needed
      await api.post("/auth/register", { email, password });
      await login(email, password);
    };
  
    const logout = () => {
      setToken(null);
      setTokenState(null);
      navigate("/login", { replace: true });
    };
  
    return (
      <AuthContext.Provider
        value={{ token, login, register, logout }}
      >
        {children}
      </AuthContext.Provider>
    );
  };
  
  export const useAuth = () => {
    const ctx = useContext(AuthContext);
    if (!ctx) {
      throw new Error("useAuth must be used within AuthProvider");
    }
    return ctx;
  };
  