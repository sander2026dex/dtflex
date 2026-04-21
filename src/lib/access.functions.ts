import { createServerFn } from "@tanstack/react-start";
import {
  getRequestHeader,
  getRequestIP,
  getRequestUrl,
  clearSession,
  useSession,
} from "@tanstack/react-start/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const genericAdminError = "Credenciais inválidas";
const genericAccessError = "Código inválido ou expirado";

const adminPasswordSchema = z.object({
  password: z.string().trim().min(1).max(255),
});

const accessCodeSchema = z.object({
  email: z.string().trim().email().max(255),
  code: z.string().trim().min(6).max(32),
});

const checkoutSchema = z.object({
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  planCode: z.enum(["mensal", "anual"]),
});

const revokeSchema = z.object({
  accessId: z.string().uuid(),
});

const manualAccessSchema = z.object({
  email: z.string().trim().email().max(255),
});

interface AdminSessionData {
  authenticated: boolean;
  loggedAt: string;
}

interface AccessSessionData {
  authenticated: boolean;
  email: string;
  code: string;
  expiresAt: string;
}

function getDb() {
  return supabaseAdmin as any;
}

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("Configuração de sessão indisponível");
  }
  return secret;
}

function getAdminSessionConfig() {
  return {
    password: getSessionSecret(),
    name: "dtflexpro-admin-session",
    maxAge: 60 * 60 * 8,
    cookie: {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
    },
  };
}

function getAccessSessionConfig() {
  return {
    password: getSessionSecret(),
    name: "dtflexpro-access-session",
    maxAge: 60 * 60 * 24,
    cookie: {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
    },
  };
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizeCode(code: string) {
  return code.trim().toUpperCase();
}

function safeEqual(input: string, expected: string) {
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function generateAccessCode() {
  return Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(2, 10);
}

async function sendAccessEmail({
  email,
  accessCode,
  expiresAt,
}: {
  email: string;
  accessCode: string;
  expiresAt: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("missing_resend_key");
  }

  const baseUrl = process.env.APP_URL ?? process.env.URL ?? new URL(getRequestUrl()).origin;
  const accessUrl = `${baseUrl}/login?email=${encodeURIComponent(email)}&code=${encodeURIComponent(accessCode)}`;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "DTFLEXPRO <onboarding@resend.dev>",
      to: [email],
      subject: "🔓 Seu acesso à plataforma está liberado!",
      html: `
        <div style="background:#ffffff;padding:32px;font-family:Arial,sans-serif;color:#111827">
          <div style="max-width:560px;margin:0 auto;border:1px solid #e5e7eb;border-radius:12px;padding:32px">
            <p style="font-size:12px;letter-spacing:.24em;text-transform:uppercase;color:#6b7280;margin:0 0 12px">DTFLEXPRO</p>
            <h1 style="font-size:28px;line-height:1.2;margin:0 0 16px">Seu acesso à plataforma está liberado</h1>
            <p style="font-size:15px;line-height:1.7;color:#4b5563;margin:0 0 16px">Seu código de acesso já está ativo.</p>
            <div style="margin:24px 0;padding:20px;border-radius:10px;background:#111827;color:#f9fafb;text-align:center;font-family:monospace;font-size:30px;letter-spacing:.18em">${accessCode}</div>
            <p style="font-size:14px;line-height:1.7;color:#4b5563;margin:0 0 20px">Use esse código com o e-mail da compra para entrar na plataforma.</p>
            <a href="${accessUrl}" style="display:inline-block;background:#f2c94c;color:#111827;text-decoration:none;padding:14px 20px;border-radius:10px;font-weight:700">Acessar Plataforma</a>
            <p style="font-size:13px;line-height:1.7;color:#6b7280;margin:24px 0 0">Validade até: ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(expiresAt))}</p>
          </div>
        </div>
      `,
    }),
  });
}

async function logSecurity(eventType: string, success: boolean) {
  const db = getDb();
  const ip = getRequestIP({ xForwardedFor: true }) ?? "unknown";
  const userAgent = getRequestHeader("user-agent") ?? "unknown";

  await db.from("security_logs").insert({
    event_type: eventType,
    ip,
    user_agent: userAgent,
    success,
  });
}

async function requireAdminSession() {
  const session = await useSession<AdminSessionData>(getAdminSessionConfig());
  if (!session.data?.authenticated) {
    throw new Error(genericAdminError);
  }
  return session.data;
}

export const getAdminSession = createServerFn({ method: "GET" }).handler(async () => {
  const session = await useSession<AdminSessionData>(getAdminSessionConfig());
  return {
    authenticated: Boolean(session.data?.authenticated),
    loggedAt: session.data?.loggedAt ?? null,
  };
});

export const verifyAdminPassword = createServerFn({ method: "POST" })
  .inputValidator(adminPasswordSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const ip = getRequestIP({ xForwardedFor: true }) ?? "unknown";
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { count } = await db
      .from("security_logs")
      .select("id", { count: "exact", head: true })
      .eq("event_type", "admin_login_attempt")
      .eq("ip", ip)
      .eq("success", false)
      .gte("created_at", oneHourAgo);

    if ((count ?? 0) >= 5) {
      await logSecurity("admin_login_rate_limited", false);
      throw new Error(genericAdminError);
    }

    const expectedPassword = process.env.ADMIN_MASTER_PASSWORD;
    if (!expectedPassword || !safeEqual(data.password, expectedPassword)) {
      await logSecurity("admin_login_attempt", false);
      throw new Error(genericAdminError);
    }

    // Segurança crítica: a autenticação administrativa vive apenas em cookie httpOnly no backend.
    const session = await useSession<AdminSessionData>(getAdminSessionConfig());
    await session.update({
      authenticated: true,
      loggedAt: new Date().toISOString(),
    });

    await logSecurity("admin_login_attempt", true);
    return { ok: true };
  });

export const logoutAdminSession = createServerFn({ method: "POST" }).handler(async () => {
  await clearSession(getAdminSessionConfig());
  return { ok: true };
});

export const createCheckoutSession = createServerFn({ method: "POST" })
  .inputValidator(checkoutSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

    if (!stripeSecretKey) {
      throw new Error("Pagamento indisponível no momento");
    }

    if (!stripeSecretKey.startsWith("sk_")) {
      await logSecurity("checkout_invalid_secret", false);
      throw new Error("Configuração de pagamento inválida");
    }

    const email = data.email ? normalizeEmail(data.email) : "";
    const { data: plan } = await db
      .from("plans")
      .select("code, name, billing_period, price_cents, currency")
      .eq("code", data.planCode)
      .eq("active", true)
      .single();

    if (!plan) {
      throw new Error("Plano indisponível no momento");
    }

    const origin = new URL(getRequestUrl()).origin;
    const mode = plan.billing_period === "monthly" || plan.billing_period === "annual" ? "subscription" : "payment";
    const params = new URLSearchParams();

    params.set("mode", mode);
    if (email) {
      params.set("customer_email", email);
      params.set("metadata[email]", email);
    }
    params.set("success_url", `${origin}/login?checkout=success`);
    params.set("cancel_url", `${origin}/?checkout=cancelled`);
    params.set("metadata[plan_code]", plan.code);
    params.set("line_items[0][quantity]", "1");
    params.set("line_items[0][price_data][currency]", String(plan.currency).toLowerCase());
    params.set("line_items[0][price_data][unit_amount]", String(plan.price_cents));
    params.set("line_items[0][price_data][product_data][name]", plan.name);

    if (mode === "subscription") {
      params.set(
        "line_items[0][price_data][recurring][interval]",
        plan.billing_period === "annual" ? "year" : "month",
      );
    }

    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    });

    if (!response.ok) {
      await logSecurity("checkout_session_error", false);
      const errorPayload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      const message = errorPayload?.error?.message ?? "Pagamento indisponível no momento";
      throw new Error(message.includes("Invalid API Key") ? "Configuração de pagamento inválida" : "Pagamento indisponível no momento");
    }

    const payload = await response.json();
    return { url: payload.url as string };
  });

export const validateAccessCode = createServerFn({ method: "POST" })
  .inputValidator(accessCodeSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const email = normalizeEmail(data.email);
    const code = normalizeCode(data.code);
    const nowIso = new Date().toISOString();

    const { data: accessRow } = await db
      .from("user_access")
      .select("id, email, access_code, expires_at, status")
      .eq("email", email)
      .eq("access_code", code)
      .eq("status", "active")
      .gt("expires_at", nowIso)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!accessRow) {
      await logSecurity("access_code_validation", false);
      throw new Error(genericAccessError);
    }

    // Segurança crítica: o código é invalidado no backend antes de liberar acesso.
    const { error: updateError } = await db
      .from("user_access")
      .update({ status: "used" })
      .eq("id", accessRow.id)
      .eq("status", "active");

    if (updateError) {
      await logSecurity("access_code_validation", false);
      throw new Error(genericAccessError);
    }

    const session = await useSession<AccessSessionData>(getAccessSessionConfig());
    await session.update({
      authenticated: true,
      email,
      code,
      expiresAt: accessRow.expires_at,
    });

    await logSecurity("access_code_validation", true);
    return { redirectTo: "/app" };
  });

export const getAccessSession = createServerFn({ method: "GET" }).handler(async () => {
  const session = await useSession<AccessSessionData>(getAccessSessionConfig());
  const expiresAt = session.data?.expiresAt;
  const authenticated = Boolean(
    session.data?.authenticated && expiresAt && new Date(expiresAt).getTime() > Date.now(),
  );

  return {
    authenticated,
    email: authenticated ? session.data?.email ?? null : null,
    expiresAt: authenticated ? expiresAt ?? null : null,
  };
});

export const logoutAccessSession = createServerFn({ method: "POST" }).handler(async () => {
  await clearSession(getAccessSessionConfig());
  return { ok: true };
});

export const getAdminDashboardData = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdminSession();
  const db = getDb();

  const [{ data: codes }, { data: payments }, { data: logs }] = await Promise.all([
    db.from("user_access").select("id, email, access_code, status, expires_at, created_at").order("created_at", { ascending: false }).limit(100),
    db.from("payments").select("id, email, stripe_session_id, amount, status, created_at").order("created_at", { ascending: false }).limit(100),
    db.from("security_logs").select("id, event_type, ip, user_agent, success, created_at").order("created_at", { ascending: false }).limit(50),
  ]);

  return {
    codes: codes ?? [],
    payments: payments ?? [],
    logs: logs ?? [],
  };
});

export const revokeAccess = createServerFn({ method: "POST" })
  .inputValidator(revokeSchema)
  .handler(async ({ data }) => {
    await requireAdminSession();
    const db = getDb();

    const { error } = await db
      .from("user_access")
      .update({ status: "revoked" })
      .eq("id", data.accessId);

    if (error) {
      throw new Error("Não foi possível revogar o acesso");
    }

    await logSecurity("admin_revoke_access", true);
    return { ok: true };
  });

export const generateManualAccessCode = createServerFn({ method: "POST" })
  .inputValidator(manualAccessSchema)
  .handler(async ({ data }) => {
    await requireAdminSession();
    const db = getDb();
    const email = normalizeEmail(data.email);
    const accessCode = generateAccessCode();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // Segurança crítica: somente sessão admin válida pode emitir código manual.
    const { error } = await db.from("user_access").insert({
      email,
      access_code: accessCode,
      status: "active",
      expires_at: expiresAt,
    });

    if (error) {
      throw new Error("Não foi possível gerar o código manual");
    }

    try {
      await sendAccessEmail({ email, accessCode, expiresAt });
    } catch {
      await logSecurity("manual_access_email_error", false);
    }

    await logSecurity("manual_access_generated", true);
    return { email, accessCode, expiresAt };
  });
