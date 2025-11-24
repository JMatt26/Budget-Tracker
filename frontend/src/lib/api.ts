import axios from "axios";
import { getToken } from "./auth";

const baseURL =
  import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export const api = axios.create({
  baseURL,
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
