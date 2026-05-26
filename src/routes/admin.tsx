import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  deleteAccess,
  generateManualAccessCode,
  getAdminDashboardData,
  getAdminSession,
  logoutAdminSession,
  registerProvisionalAccess,
  resetActiveSession,
  revokeAccess,
  updateDeviceLimit,
  verifyAdminPassword,
} from "@/lib/access.functions";

interface MonthlyMetric {
  month: string;
  mensal: number;
  anual: number;
  total: number;
}

interface DashboardPayload {
  codes: Array<{
    id: string;
    email: string;
    access_code: string;
    status: string;
    expires_at: string;
    created_at: string;
    plan_code: string | null;
    device_limit: number | null;
    active_session_token: string | null;
    active_session_started_at: string | null;
    last_activity_at: string | null;
  }>;
  payments: Array<{
    id: string;
    email: string;
    stripe_session_id: string;
    amount: number;
    status: string;
    created_at: string;
  }>;
  logs: Array<{
    id: string;
    event_type: string;
    ip: string | null;
    user_agent: string | null;
    success: boolean;
    created_at: string;
  }>;
  deviceAttempts: Array<{
    id: string;
    email: string;
    ip: string;
    user_agent: string;
    created_at: string;
  }>;
  metrics: {
    totalCodes: number;
    activeCodes: number;
    uniqueClients: number;
    monthly: MonthlyMetric[];
  };
}

const EMPTY: DashboardPayload = {
  codes: [],
  payments: [],
  logs: [],
  deviceAttempts: [],
  metrics: { totalCodes: 0, activeCodes: 0, uniqueClients: 0, monthly: [] },
};

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "DTFLEXPRO | Painel admin" },
      { name: "description", content: "Painel administrativo protegido da DTFLEXPRO." },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const verifyPassword = useServerFn(verifyAdminPassword);
  const readSession = useServerFn(getAdminSession);
  const readDashboard = useServerFn(getAdminDashboardData);
  const revoke = useServerFn(revokeAccess);
  const removeAccount = useServerFn(deleteAccess);
  const setDevices = useServerFn(updateDeviceLimit);
  const resetSession = useServerFn(resetActiveSession);
  const generateManualCode = useServerFn(generateManualAccessCode);
  const registerProvisional = useServerFn(registerProvisionalAccess);
  const logout = useServerFn(logoutAdminSession);

  const [password, setPassword] = useState("");
  const [manualEmail, setManualEmail] = useState("");
  const [manualPlan, setManualPlan] = useState<"mensal" | "anual" | "vitalicia">("mensal");
  const [manualDays, setManualDays] = useState<string>("");
  const [manualDevices, setManualDevices] = useState<string>("1");
  const [provEmail, setProvEmail] = useState("");
  const [provPlan, setProvPlan] = useState<"mensal" | "anual" | "vitalicia">("mensal");
  const [provDevices, setProvDevices] = useState<string>("1");

  const [provLoading, setProvLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [manualLoading, setManualLoading] = useState(false);
  const [dashboard, setDashboard] = useState<DashboardPayload>(EMPTY);

  async function loadDashboard() {
    try {
      const data = await readDashboard();
      setDashboard(data as DashboardPayload);
      return true;
    } catch {
      toast.error("Não foi possível carregar os dados do painel agora.");
      return false;
    }
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const session = await readSession();
        if (!active) return;
        setAuthenticated(Boolean(session.authenticated));
        if (session.authenticated) await loadDashboard();
      } finally {
        if (active) setChecking(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const maxMonthly = useMemo(
    () => Math.max(1, ...dashboard.metrics.monthly.map((m) => m.total)),
    [dashboard.metrics.monthly],
  );

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6">
        <p className="text-sm text-muted-foreground">Carregando painel...</p>
      </main>
    );
  }

  if (!authenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
        <Card className="w-full max-w-md rounded-lg bg-card/70 p-6 backdrop-blur">
          <div className="mb-6 space-y-2 text-center">
            <p className="text-xs uppercase tracking-[0.28em] text-muted-foreground">Admin DTFLEXPRO</p>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">Entrar no painel</h1>
            <p className="text-sm text-muted-foreground">Acesso restrito ao dono da ferramenta.</p>
          </div>
          <form
            className="space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              try {
                setLoading(true);
                const result = await verifyPassword({ data: { password } });
                if (!result.ok) {
                  toast.error("Credenciais inválidas");
                  return;
                }
                setAuthenticated(true);
                setPassword("");
                await loadDashboard();
              } catch {
                toast.error("Credenciais inválidas");
              } finally {
                setLoading(false);
              }
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="admin-password">Senha master</Label>
              <Input
                id="admin-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Validando..." : "Entrar"}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm text-muted-foreground">
            <Link to="/" className="text-foreground hover:text-primary">
              Voltar para a landing page
            </Link>
          </div>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background px-6 py-8 text-foreground">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-muted-foreground">Painel do proprietário</p>
            <h1 className="text-3xl font-semibold tracking-tight">Administração DTFLEXPRO</h1>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => loadDashboard()}>
              Atualizar dados
            </Button>
            <Button
              variant="ghost"
              onClick={async () => {
                await logout();
                setAuthenticated(false);
              }}
            >
              Sair
            </Button>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          <StatCard title="Clientes únicos" value={String(dashboard.metrics.uniqueClients)} />
          <StatCard title="Códigos ativos" value={String(dashboard.metrics.activeCodes)} />
          <StatCard title="Códigos emitidos" value={String(dashboard.metrics.totalCodes)} />
          <StatCard title="Eventos de segurança" value={String(dashboard.logs.length)} />
        </section>

        <DataCard title="Vendas por mês (últimos 12 meses)">
          <div className="flex items-end gap-2 overflow-x-auto pb-2">
            {dashboard.metrics.monthly.map((m) => {
              const heightPct = (m.total / maxMonthly) * 100;
              return (
                <div key={m.month} className="flex min-w-[44px] flex-col items-center gap-1">
                  <div className="flex h-32 w-full items-end justify-center">
                    <div
                      className="w-6 rounded-t bg-primary/80"
                      style={{ height: `${Math.max(4, heightPct)}%` }}
                      title={`${m.total} (${m.mensal} mensal · ${m.anual} anual)`}
                    />
                  </div>
                  <span className="font-mono text-[10px] text-muted-foreground">{m.month.slice(5)}</span>
                  <span className="font-mono text-[10px] text-foreground">{m.total}</span>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Total de códigos liberados (vendas) por mês — passe o mouse para ver mensal vs anual.
          </p>
        </DataCard>

        <DataCard title="Registrar compra (envia senha provisória ao cliente)">
          <p className="mb-3 text-xs text-muted-foreground">
            Use ao receber o comprovante do InfinitePay no WhatsApp. O cliente recebe um e-mail de boas-vindas com uma senha provisória (válida por 7 dias e ligada a 1 dispositivo). Depois que ele acessar, libere a senha definitiva no formulário abaixo.
          </p>
          <form
            className="grid gap-3 md:grid-cols-[1.4fr_1fr_0.8fr_auto] md:items-end"
            onSubmit={async (event) => {
              event.preventDefault();
              try {
                setProvLoading(true);
                const result = await registerProvisional({
                  data: {
                    email: provEmail,
                    planCode: provPlan,
                    deviceLimit: Number(provDevices) || 1,
                  },
                });
                toast.success(`Senha provisória ${result.provisionalPassword} enviada para ${result.email}.`);
                setProvEmail("");
                await loadDashboard();
              } catch {
                toast.error("Não foi possível registrar a compra.");
              } finally {
                setProvLoading(false);
              }
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="prov-email">E-mail do cliente</Label>
              <Input
                id="prov-email"
                type="email"
                value={provEmail}
                onChange={(e) => setProvEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prov-plan">Plano comprado</Label>
              <select
                id="prov-plan"
                value={provPlan}
                onChange={(e) => setProvPlan(e.target.value as "mensal" | "anual" | "vitalicia")}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="mensal">Mensal (R$ 47)</option>
                <option value="anual">Anual (R$ 147)</option>
                <option value="vitalicia">Vitalícia (master, nunca expira)</option>
              </select>

            </div>
            <div className="space-y-2">
              <Label htmlFor="prov-devices">Dispositivos</Label>
              <Input
                id="prov-devices"
                type="number"
                min={1}
                max={20}
                value={provDevices}
                onChange={(e) => setProvDevices(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={provLoading}>
              {provLoading ? "Enviando..." : "Enviar senha provisória"}
            </Button>
          </form>
        </DataCard>

        <DataCard title="Liberar senha definitiva (conforme o plano)">
          <form
            className="grid gap-3 md:grid-cols-[1.4fr_1fr_0.8fr_0.8fr_auto] md:items-end"
            onSubmit={async (event) => {
              event.preventDefault();
              try {
                setManualLoading(true);
                const result = await generateManualCode({
                  data: {
                    email: manualEmail,
                    planCode: manualPlan,
                    durationDays: manualDays ? Number(manualDays) : undefined,
                    deviceLimit: Number(manualDevices) || 1,
                  },
                });
                toast.success(`Código ${result.accessCode} enviado para ${result.email}.`);
                setManualEmail("");
                setManualDays("");
                await loadDashboard();
              } catch {
                toast.error("Não foi possível gerar o código manual.");
              } finally {
                setManualLoading(false);
              }
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="manual-email">E-mail do cliente</Label>
              <Input
                id="manual-email"
                type="email"
                value={manualEmail}
                onChange={(event) => setManualEmail(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="manual-plan">Plano</Label>
              <select
                id="manual-plan"
                value={manualPlan}
                onChange={(e) => setManualPlan(e.target.value as "mensal" | "anual" | "vitalicia")}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="mensal">Mensal (R$ 47 · 30 dias)</option>
                <option value="anual">Anual (R$ 147 · 365 dias)</option>
                <option value="vitalicia">Vitalícia (master · nunca expira)</option>
              </select>

            </div>
            <div className="space-y-2">
              <Label htmlFor="manual-days">Dias (opcional)</Label>
              <Input
                id="manual-days"
                type="number"
                min={1}
                placeholder="Auto"
                value={manualDays}
                onChange={(event) => setManualDays(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="manual-devices">Dispositivos</Label>
              <Input
                id="manual-devices"
                type="number"
                min={1}
                max={20}
                value={manualDevices}
                onChange={(event) => setManualDevices(event.target.value)}
              />
            </div>
            <Button type="submit" disabled={manualLoading}>
              {manualLoading ? "Gerando..." : "Gerar e enviar"}
            </Button>
          </form>
        </DataCard>

        <DataCard title="Contas e códigos">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Expira</TableHead>
                  <TableHead>Disp.</TableHead>
                  <TableHead>Online</TableHead>
                  <TableHead>Sessão</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard.codes.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="max-w-[180px] truncate">{item.email}</TableCell>
                    <TableCell className="font-mono">{item.access_code}</TableCell>
                    <TableCell>{item.plan_code ?? "-"}</TableCell>
                    <TableCell>{item.status}</TableCell>
                    <TableCell>{formatDate(item.expires_at)}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={1}
                        max={20}
                        defaultValue={item.device_limit ?? 1}
                        className="h-8 w-16"
                        onBlur={async (e) => {
                          const v = Number(e.target.value);
                          if (!v || v === (item.device_limit ?? 1)) return;
                          try {
                            await setDevices({ data: { accessId: item.id, deviceLimit: v } });
                            toast.success("Limite de dispositivos atualizado.");
                            await loadDashboard();
                          } catch {
                            toast.error("Falha ao atualizar limite.");
                          }
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      {item.active_session_token ? (
                        <span className="text-xs text-amber-500">em uso</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">livre</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={async () => {
                            const msg = buildClientMessage(item);
                            try {
                              await navigator.clipboard.writeText(msg);
                              toast.success("Mensagem copiada! Cole no WhatsApp do cliente.");
                            } catch {
                              window.prompt("Copie a mensagem abaixo:", msg);
                            }
                          }}
                        >
                          Copiar msg
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!item.active_session_token}
                          onClick={async () => {
                            try {
                              await resetSession({ data: { accessId: item.id } });
                              toast.success("Sessão liberada.");
                              await loadDashboard();
                            } catch {
                              toast.error("Falha ao liberar sessão.");
                            }
                          }}
                        >
                          Liberar sessão
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          disabled={item.status === "revoked"}
                          onClick={async () => {
                            try {
                              await revoke({ data: { accessId: item.id } });
                              toast.success("Acesso revogado.");
                              await loadDashboard();
                            } catch {
                              toast.error("Falha ao revogar.");
                            }
                          }}
                        >
                          Revogar
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={async () => {
                            if (!confirm(`Excluir conta ${item.email}? Essa ação é permanente.`)) return;
                            try {
                              await removeAccount({ data: { accessId: item.id } });
                              toast.success("Conta excluída.");
                              await loadDashboard();
                            } catch {
                              toast.error("Falha ao excluir.");
                            }
                          }}
                        >
                          Excluir
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DataCard>

        <DataCard title="Tentativas de acesso em outro dispositivo (bloqueadas)">
          {dashboard.deviceAttempts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma tentativa registrada.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>E-mail da conta</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead>Dispositivo</TableHead>
                    <TableHead>Quando</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dashboard.deviceAttempts.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="max-w-[200px] truncate">{a.email}</TableCell>
                      <TableCell className="font-mono text-xs">{a.ip}</TableCell>
                      <TableCell className="max-w-[280px] truncate text-xs">{a.user_agent}</TableCell>
                      <TableCell>{formatDate(a.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DataCard>

        <DataCard title="Últimos 50 registros de segurança">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Evento</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>Dispositivo</TableHead>
                  <TableHead>Resultado</TableHead>
                  <TableHead>Quando</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard.logs.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.event_type}</TableCell>
                    <TableCell>{item.ip ?? "-"}</TableCell>
                    <TableCell className="max-w-[280px] truncate">{item.user_agent ?? "-"}</TableCell>
                    <TableCell>{item.success ? "Sucesso" : "Falha"}</TableCell>
                    <TableCell>{formatDate(item.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DataCard>
      </div>
    </main>
  );
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <Card className="rounded-lg bg-card/50 p-5">
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="mt-2 text-3xl font-semibold text-foreground">{value}</p>
    </Card>
  );
}

function DataCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="rounded-lg bg-card/50 p-5">
      <h2 className="mb-4 text-lg font-medium text-foreground">{title}</h2>
      {children}
    </Card>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function buildClientMessage(item: {
  email: string;
  access_code: string;
  expires_at: string;
  plan_code: string | null;
}) {
  const plano =
    item.plan_code === "anual"
      ? "Plano Anual"
      : item.plan_code === "vitalicia"
        ? "Plano Vitalício (nunca expira)"
        : "Plano Mensal";
  const isLifetime = item.plan_code === "vitalicia";
  const validade = isLifetime
    ? "Vitalício — acesso permanente"
    : `Válido até: ${formatDate(item.expires_at)}`;
  const loginUrl = `https://dtflexpro.com/login?email=${encodeURIComponent(
    item.email,
  )}&code=${encodeURIComponent(item.access_code)}`;

  return [
    "🚀 *Seu acesso ao DTFlexPRO está liberado!*",
    "",
    `📦 ${plano}`,
    `📧 E-mail: ${item.email}`,
    `🔑 Código de acesso: *${item.access_code}*`,
    `⏰ ${validade}`,
    "",
    "👉 Entre direto pelo link (já vem com seu código preenchido):",
    loginUrl,
    "",
    "⚠️ Importante: o acesso é vinculado a *1 dispositivo*. Se precisar trocar, fale com a gente por aqui.",
    "",
    "Equipe DTFlexPRO 💛",
  ].join("\n");
}

