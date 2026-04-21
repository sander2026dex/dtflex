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
  generateManualAccessCode,
  getAdminDashboardData,
  getAdminSession,
  logoutAdminSession,
  revokeAccess,
  verifyAdminPassword,
} from "@/lib/access.functions";

interface DashboardPayload {
  codes: Array<{
    id: string;
    email: string;
    access_code: string;
    status: string;
    expires_at: string;
    created_at: string;
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
}

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
  const generateManualCode = useServerFn(generateManualAccessCode);
  const logout = useServerFn(logoutAdminSession);

  const [password, setPassword] = useState("");
  const [manualEmail, setManualEmail] = useState("");
  const [checking, setChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [manualLoading, setManualLoading] = useState(false);
  const [dashboard, setDashboard] = useState<DashboardPayload>({ codes: [], payments: [], logs: [] });

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

  const activeCodesCount = useMemo(
    () => dashboard.codes.filter((item) => item.status === "active").length,
    [dashboard.codes],
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
                await verifyPassword({ data: { password } });
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

        <section className="grid gap-4 md:grid-cols-3">
          <StatCard title="Códigos ativos" value={String(activeCodesCount)} />
          <StatCard title="Pagamentos registrados" value={String(dashboard.payments.length)} />
          <StatCard title="Eventos de segurança" value={String(dashboard.logs.length)} />
        </section>

        <DataCard title="Gerar código manual">
          <form
            className="flex flex-col gap-3 md:flex-row md:items-end"
            onSubmit={async (event) => {
              event.preventDefault();
              try {
                setManualLoading(true);
                const result = await generateManualCode({ data: { email: manualEmail } });
                toast.success(`Código ${result.accessCode} enviado para ${result.email}.`);
                setManualEmail("");
                await loadDashboard();
              } catch {
                toast.error("Não foi possível gerar o código manual.");
              } finally {
                setManualLoading(false);
              }
            }}
          >
            <div className="w-full space-y-2 md:max-w-sm">
              <Label htmlFor="manual-email">E-mail do cliente</Label>
              <Input
                id="manual-email"
                type="email"
                value={manualEmail}
                onChange={(event) => setManualEmail(event.target.value)}
                required
              />
            </div>
            <Button type="submit" disabled={manualLoading}>
              {manualLoading ? "Gerando..." : "Gerar e enviar código"}
            </Button>
          </form>
        </DataCard>

        <section className="grid gap-6 xl:grid-cols-2">
          <DataCard title="Usuários e códigos ativos">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Expira</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard.codes.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.email}</TableCell>
                    <TableCell className="font-mono">{item.access_code}</TableCell>
                    <TableCell>{item.status}</TableCell>
                    <TableCell>{formatDate(item.expires_at)}</TableCell>
                    <TableCell className="text-right">
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
                            toast.error("Não foi possível revogar o acesso.");
                          }
                        }}
                      >
                        Revogar acesso
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DataCard>

          <DataCard title="Status de pagamentos">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard.payments.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.email}</TableCell>
                    <TableCell>R$ {Number(item.amount ?? 0).toFixed(2)}</TableCell>
                    <TableCell>{item.status}</TableCell>
                    <TableCell>{formatDate(item.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DataCard>
        </section>

        <DataCard title="Últimos 50 registros de segurança">
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
