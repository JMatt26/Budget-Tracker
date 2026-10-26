import { describe, expect, it } from "vitest";
import { resolveApiBaseUrl } from "./api";

describe("resolveApiBaseUrl", () => {
  it("uses VITE_API_URL when it is set", () => {
    expect(resolveApiBaseUrl({ PROD: true, VITE_API_URL: "https://api.example.com" })).toBe(
      "https://api.example.com"
    );
    expect(resolveApiBaseUrl({ PROD: false, VITE_API_URL: "http://localhost:9000" })).toBe(
      "http://localhost:9000"
    );
  });

  it("strips trailing slashes and whitespace", () => {
    expect(resolveApiBaseUrl({ VITE_API_URL: " https://api.example.com/ " })).toBe(
      "https://api.example.com"
    );
    expect(resolveApiBaseUrl({ VITE_API_URL: "https://api.example.com///" })).toBe(
      "https://api.example.com"
    );
  });

  it("falls back to localhost in development", () => {
    expect(resolveApiBaseUrl({ PROD: false })).toBe("http://localhost:8000");
    expect(resolveApiBaseUrl({})).toBe("http://localhost:8000");
  });

  it("refuses to build for production without VITE_API_URL", () => {
    expect(() => resolveApiBaseUrl({ PROD: true })).toThrow(/VITE_API_URL/);
    expect(() => resolveApiBaseUrl({ PROD: true, VITE_API_URL: "" })).toThrow(/VITE_API_URL/);
    expect(() => resolveApiBaseUrl({ PROD: true, VITE_API_URL: "   " })).toThrow(/VITE_API_URL/);
  });
});
