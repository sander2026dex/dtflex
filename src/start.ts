import { createStart, createMiddleware } from "@tanstack/react-start";
import { setResponseHeaders } from "@tanstack/react-start/server";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

// Security headers aplicados em toda resposta SSR / server route / server fn.
// Mantém o layout intacto — apenas endurece o browser contra XSS, clickjacking,
// sniffing de MIME, vazamento de referrer e captura por origens externas.
const securityHeaders = createMiddleware().server(async ({ next }) => {
  const csp = [
    "default-src 'self'",
    // React + Vite runtime + libs shadcn precisam de inline/eval.
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:",
    "style-src 'self' 'unsafe-inline' https: data:",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https:",
    "media-src 'self' data: blob: https:",
    "connect-src 'self' https: wss: data: blob:",
    // Ferramentas embutidas (photoroom, visioncortex, checkout infinitepay, etc.).
    "frame-src 'self' https:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https:",
    // Anti-clickjacking — substitui X-Frame-Options com granularidade moderna.
    "frame-ancestors 'self'",
    "upgrade-insecure-requests",
  ].join("; ");

  setResponseHeaders({
    "Content-Security-Policy": csp,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "SAMEORIGIN",
    "X-DNS-Prefetch-Control": "off",
    "X-Permitted-Cross-Domain-Policies": "none",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-site",
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
    "Permissions-Policy": [
      "camera=()",
      "microphone=()",
      "geolocation=()",
      "payment=(self)",
      "usb=()",
      "magnetometer=()",
      "gyroscope=()",
      "accelerometer=()",
      "interest-cohort=()",
    ].join(", "),
  });

  return next();
});

export const startInstance = createStart(() => ({
  requestMiddleware: [securityHeaders],
  functionMiddleware: [attachSupabaseAuth],
}));
