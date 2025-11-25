import axios, { AxiosError } from "axios";
import { getToken } from "./auth";

const baseURL =
  import.meta.env.VITE_API_URL ?? "http://localhost:8000";

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
    } else {
      console.warn("No authentication token found for request:", config.method, config.url);
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
