import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
// Import the HTML as a raw string so the bundler embeds it in the Worker bundle.
// eslint-disable-next-line import/no-unresolved
import toolHtml from "../server-assets/dtflexpro-halftone-engine.html?raw";

interface AccessSessionData {
  authenticated: boolean;
  email: string;
  code: string;
  accessId: string;
  sessionToken: string;
  expiresAt: string;
}

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("Configuração de sessão indisponível");
  return secret;
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

async function isAuthenticated(): Promise<boolean> {
  try {
    const session = await useSession<AccessSessionData>(getAccessSessionConfig());
    const data = session.data;
    if (!data?.authenticated || !data.accessId || !data.sessionToken || !data.expiresAt) {
      return false;
    }
    if (new Date(data.expiresAt).getTime() <= Date.now()) return false;

    const db = supabaseAdmin as any;
    const { data: row } = await db
      .from("user_access")
      .select("active_session_token, status, expires_at")
      .eq("id", data.accessId)
      .maybeSingle();

    return Boolean(
      row &&
        row.status === "active" &&
        new Date(row.expires_at).getTime() > Date.now() &&
        row.active_session_token === data.sessionToken,
    );
  } catch {
    return false;
  }
}

export const Route = createFileRoute("/api/app-tool")({
  server: {
    handlers: {
      GET: async () => {
        const ok = await isAuthenticated();
        if (!ok) {
          return new Response("Unauthorized", { status: 401 });
        }
        return new Response(toolHtml, {
          status: 200,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
          },
        });
      },
    },
  },
});
