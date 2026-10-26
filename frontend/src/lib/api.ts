import axios, { AxiosError } from "axios";
import { getToken } from "./auth";

const LOCAL_API_URL = "http://localhost:8000";

// VITE_API_URL is baked in at build time. A production build without it would
// silently ship a site that calls http://localhost:8000 from every visitor's
// browser, so fail the build/startup loudly instead.
export const resolveApiBaseUrl = (env: {
  PROD?: boolean;
  VITE_API_URL?: string;
}): string => {
  const url = env.VITE_API_URL?.trim();
  if (url) return url.replace(/\/+$/, "");
  if (env.PROD) {
    throw new Error(
      "VITE_API_URL is not set. Set it to the API's URL before building for production."
    );
  }
  return LOCAL_API_URL;
};

const baseURL = resolveApiBaseUrl(import.meta.env);

export const api = axios.create({
  baseURL,
});

api.interceptors.request.use(
  (config) => {
    const token = getToken();
    
    // Ensure headers object exists
    if (!config.headers) {
      config.headers = {} as any;
    }
    
    // Set Content-Type for requests with data
    if (config.data && !config.headers["Content-Type"]) {
      config.headers["Content-Type"] = "application/json";
    }
    
    // Set Authorization header if token exists
    if (token) {
      config.headers["Authorization"] = `Bearer ${token}`;
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Handle 401 errors - token might be expired or invalid
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      // Token is invalid or expired - could redirect to login here
      console.error("Authentication failed - token may be expired");
    }
    return Promise.reject(error);
  }
);
