import { createServerFn } from "@tanstack/react-start";
import {
  deleteCookie,
  getCookie,
  getRequestHeader,
  getRequestIP,
  getRequestUrl,
  setCookie,
  clearSession,
  useSession,
} from "@tanstack/react-start/server";
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const genericAdminError = "Credenciais inválidas";
const genericAccessError = "Código inválido ou expirado";
const deviceConflictError =
  "Este acesso já está em uso em outro dispositivo. Apenas 1 dispositivo é permitido por conta. Entre em contato com a plataforma pelo WhatsApp.";

const adminPasswordSchema = z.object({
  password: z.string().trim().min(1).max(255),
});

const accessCodeSchema = z.object({
  email: z.string().trim().email().max(255),
  code: z.string().trim().min(6).max(32),
});

const revokeSchema = z.object({
  accessId: z.string().uuid(),
});

const deleteSchema = z.object({
  accessId: z.string().uuid(),
});

const deviceLimitSchema = z.object({
  accessId: z.string().uuid(),
  deviceLimit: z.number().int().min(1).max(20),
});

const manualAccessSchema = z.object({
  email: z.string().trim().email().max(255),
  planCode: z.enum(["mensal", "anual"]),
  durationDays: z.number().int().min(1).max(3650).optional(),
});

interface AdminSessionData {
  authenticated: boolean;
  loggedAt: string;
}

interface AccessSessionData {
  authenticated: boolean;
  email: string;
  code: string;
  accessId: string;
  sessionToken: string;
  expiresAt: string;
}

const adminCookieName = "dtflexpro-admin-session";
const adminSessionMaxAge = 60 * 60 * 8;

interface SignedAdminSessionData extends AdminSessionData {
  expiresAt: number;
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
    maxAge: 60 * 60 * 24 * 30,
    cookie: {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
    },
  };
}

function signAdminPayload(payload: string) {
  return createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
}

function readSignedAdminSession(): AdminSessionData | null {
  const cookie = getCookie(adminCookieName);
  if (!cookie) return null;

  const [payload, signature] = cookie.split(".");
  if (!payload || !signature || !safeEqual(signature, signAdminPayload(payload))) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SignedAdminSessionData;
    if (!data.authenticated || !data.loggedAt || Date.now() > data.expiresAt) return null;
    return { authenticated: true, loggedAt: data.loggedAt };
  } catch {
    return null;
  }
}

function writeSignedAdminSession() {
  const loggedAt = new Date().toISOString();
  const payload = Buffer.from(
    JSON.stringify({
      authenticated: true,
      loggedAt,
      expiresAt: Date.now() + adminSessionMaxAge * 1000,
    } satisfies SignedAdminSessionData),
  ).toString("base64url");

  setCookie(adminCookieName, `${payload}.${signAdminPayload(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: adminSessionMaxAge,
  });

  return { authenticated: true, loggedAt };
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
  return randomBytes(6)
    .toString("base64")
    .replace(/[^A-Z0-9]/gi, "")
    .toUpperCase()
    .slice(0, 8);
}

async function sendAccessEmail({
  email,
  accessCode,
  expiresAt,
  planLabel,
}: {
  email: string;
  accessCode: string;
  expiresAt: string;
  planLabel: string;
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
            <p style="font-size:12px;letter-spacing:.24em;text-transform:uppercase;color:#6b7280;margin:0 0 12px">DTFLEXPRO · ${planLabel}</p>
            <h1 style="font-size:28px;line-height:1.2;margin:0 0 16px">Seu acesso à plataforma está liberado</h1>
            <p style="font-size:15px;line-height:1.7;color:#4b5563;margin:0 0 16px">Seu código de acesso já está ativo.</p>
            <div style="margin:24px 0;padding:20px;border-radius:10px;background:#111827;color:#f9fafb;text-align:center;font-family:monospace;font-size:30px;letter-spacing:.18em">${accessCode}</div>
            <p style="font-size:14px;line-height:1.7;color:#4b5563;margin:0 0 20px">Use esse código com o e-mail da compra para entrar na plataforma. Importante: o acesso é vinculado a 1 dispositivo por vez.</p>
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
  const session = readSignedAdminSession();
  if (!session?.authenticated) {
    throw new Error(genericAdminError);
  }
  return session;
}

function planDurationDays(planCode: string) {
  if (planCode === "anual") return 365;
  return 30;
}

function planLabel(planCode: string) {
  if (planCode === "anual") return "Plano Anual";
  return "Plano Mensal";
}

export const getAdminSession = createServerFn({ method: "GET" }).handler(async () => {
  const session = readSignedAdminSession();
  return {
    authenticated: Boolean(session?.authenticated),
    loggedAt: session?.loggedAt ?? null,
  };
});

export const verifyAdminPassword = createServerFn({ method: "POST" })
  .inputValidator(adminPasswordSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const ip = getRequestIP({ xForwardedFor: true }) ?? "unknown";
    const expectedPassword = process.env.ADMIN_MASTER_PASSWORD;

    if (expectedPassword && safeEqual(data.password, expectedPassword)) {
      writeSignedAdminSession();
      await logSecurity("admin_login_attempt", true);
      return { ok: true };
    }

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

    await logSecurity("admin_login_attempt", false);
    throw new Error(genericAdminError);
  });

export const logoutAdminSession = createServerFn({ method: "POST" }).handler(async () => {
  deleteCookie(adminCookieName, { path: "/" });
  return { ok: true };
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
      .select("id, email, access_code, expires_at, status, device_limit, active_session_token, active_session_started_at")
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

    // Controle de sessão única por dispositivo
    const deviceLimit = accessRow.device_limit ?? 1;
    if (deviceLimit <= 1 && accessRow.active_session_token) {
      // Se a sessão ativa tem menos de 30 dias, bloqueia
      const startedAt = accessRow.active_session_started_at
        ? new Date(accessRow.active_session_started_at).getTime()
        : 0;
      const sessionMaxAgeMs = 30 * 24 * 60 * 60 * 1000;
      if (Date.now() - startedAt < sessionMaxAgeMs) {
        await logSecurity("access_device_conflict", false);
        throw new Error(deviceConflictError);
      }
    }

    const sessionToken = randomUUID();
    const { error: updateError } = await db
      .from("user_access")
      .update({
        active_session_token: sessionToken,
        active_session_started_at: new Date().toISOString(),
      })
      .eq("id", accessRow.id);

    if (updateError) {
      await logSecurity("access_code_validation", false);
      throw new Error(genericAccessError);
    }

    const session = await useSession<AccessSessionData>(getAccessSessionConfig());
    await session.update({
      authenticated: true,
      email,
      code,
      accessId: accessRow.id,
      sessionToken,
      expiresAt: accessRow.expires_at,
    });

    await logSecurity("access_code_validation", true);
    return { redirectTo: "/app" };
  });

export const getAccessSession = createServerFn({ method: "GET" }).handler(async () => {
  const session = await useSession<AccessSessionData>(getAccessSessionConfig());
  const expiresAt = session.data?.expiresAt;
  const accessId = session.data?.accessId;
  const sessionToken = session.data?.sessionToken;

  const baseValid = Boolean(
    session.data?.authenticated && expiresAt && new Date(expiresAt).getTime() > Date.now(),
  );

  if (!baseValid || !accessId || !sessionToken) {
    return { authenticated: false, email: null, expiresAt: null };
  }

  // Revalida que esta sessão ainda é a "ativa" no banco
  const db = getDb();
  const { data: row } = await db
    .from("user_access")
    .select("active_session_token, status, expires_at")
    .eq("id", accessId)
    .maybeSingle();

  const stillActive =
    row &&
    row.status === "active" &&
    new Date(row.expires_at).getTime() > Date.now() &&
    row.active_session_token === sessionToken;

  if (!stillActive) {
    await clearSession(getAccessSessionConfig());
    return { authenticated: false, email: null, expiresAt: null };
  }

  return {
    authenticated: true,
    email: session.data?.email ?? null,
    expiresAt: expiresAt ?? null,
  };
});

export const logoutAccessSession = createServerFn({ method: "POST" }).handler(async () => {
  const session = await useSession<AccessSessionData>(getAccessSessionConfig());
  const accessId = session.data?.accessId;
  const sessionToken = session.data?.sessionToken;

  if (accessId && sessionToken) {
    const db = getDb();
    // Só limpa se ainda for esta sessão a dona do token
    await db
      .from("user_access")
      .update({ active_session_token: null, active_session_started_at: null })
      .eq("id", accessId)
      .eq("active_session_token", sessionToken);
  }

  await clearSession(getAccessSessionConfig());
  return { ok: true };
});

export const getAdminDashboardData = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdminSession();
  const db = getDb();

  const [{ data: codes }, { data: payments }, { data: logs }] = await Promise.all([
    db
      .from("user_access")
      .select(
        "id, email, access_code, status, expires_at, created_at, plan_code, device_limit, active_session_token, active_session_started_at",
      )
      .order("created_at", { ascending: false })
      .limit(200),
    db
      .from("payments")
      .select("id, email, stripe_session_id, amount, status, created_at")
      .order("created_at", { ascending: false })
      .limit(100),
    db
      .from("security_logs")
      .select("id, event_type, ip, user_agent, success, created_at")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  // Métricas: total de clientes únicos e vendas por mês (últimos 12 meses)
  const allCodes = codes ?? [];
  const uniqueEmails = new Set(allCodes.map((c: any) => c.email));
  const monthly: Record<string, { mensal: number; anual: number; total: number }> = {};
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthly[key] = { mensal: 0, anual: 0, total: 0 };
  }
  for (const c of allCodes) {
    const d = new Date(c.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (monthly[key]) {
      monthly[key].total += 1;
      if (c.plan_code === "anual") monthly[key].anual += 1;
      else if (c.plan_code === "mensal") monthly[key].mensal += 1;
    }
  }

  return {
    codes: allCodes,
    payments: payments ?? [],
    logs: logs ?? [],
    metrics: {
      totalCodes: allCodes.length,
      activeCodes: allCodes.filter((c: any) => c.status === "active").length,
      uniqueClients: uniqueEmails.size,
      monthly: Object.entries(monthly).map(([month, v]) => ({ month, ...v })),
    },
  };
});

export const revokeAccess = createServerFn({ method: "POST" })
  .inputValidator(revokeSchema)
  .handler(async ({ data }) => {
    await requireAdminSession();
    const db = getDb();

    const { error } = await db
      .from("user_access")
      .update({
        status: "revoked",
        active_session_token: null,
        active_session_started_at: null,
      })
      .eq("id", data.accessId);

    if (error) {
      throw new Error("Não foi possível revogar o acesso");
    }

    await logSecurity("admin_revoke_access", true);
    return { ok: true };
  });

export const deleteAccess = createServerFn({ method: "POST" })
  .inputValidator(deleteSchema)
  .handler(async ({ data }) => {
    await requireAdminSession();
    const db = getDb();

    const { error } = await db.from("user_access").delete().eq("id", data.accessId);
    if (error) throw new Error("Não foi possível excluir a conta");

    await logSecurity("admin_delete_access", true);
    return { ok: true };
  });

export const updateDeviceLimit = createServerFn({ method: "POST" })
  .inputValidator(deviceLimitSchema)
  .handler(async ({ data }) => {
    await requireAdminSession();
    const db = getDb();

    const update: Record<string, any> = { device_limit: data.deviceLimit };
    // Ao aumentar o limite, libera a sessão presa para o cliente entrar de novo
    if (data.deviceLimit > 1) {
      update.active_session_token = null;
      update.active_session_started_at = null;
    }

    const { error } = await db.from("user_access").update(update).eq("id", data.accessId);
    if (error) throw new Error("Não foi possível atualizar o limite de dispositivos");

    await logSecurity("admin_update_device_limit", true);
    return { ok: true };
  });

export const resetActiveSession = createServerFn({ method: "POST" })
  .inputValidator(revokeSchema)
  .handler(async ({ data }) => {
    await requireAdminSession();
    const db = getDb();
    const { error } = await db
      .from("user_access")
      .update({ active_session_token: null, active_session_started_at: null })
      .eq("id", data.accessId);
    if (error) throw new Error("Não foi possível liberar a sessão");
    await logSecurity("admin_reset_session", true);
    return { ok: true };
  });

export const generateManualAccessCode = createServerFn({ method: "POST" })
  .inputValidator(manualAccessSchema)
  .handler(async ({ data }) => {
    await requireAdminSession();
    const db = getDb();
    const email = normalizeEmail(data.email);
    const accessCode = generateAccessCode();
    const days = data.durationDays ?? planDurationDays(data.planCode);
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

    const { error } = await db.from("user_access").insert({
      email,
      access_code: accessCode,
      status: "active",
      expires_at: expiresAt,
      plan_code: data.planCode,
      device_limit: 1,
    });

    if (error) {
      throw new Error("Não foi possível gerar o código manual");
    }

    try {
      await sendAccessEmail({
        email,
        accessCode,
        expiresAt,
        planLabel: planLabel(data.planCode),
      });
    } catch {
      await logSecurity("manual_access_email_error", false);
    }

    await logSecurity("manual_access_generated", true);
    return { email, accessCode, expiresAt, planCode: data.planCode };
  });
