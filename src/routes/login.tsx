import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { validateAccessCode } from "@/lib/access.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    code: typeof search.code === "string" ? search.code : "",
    email: typeof search.email === "string" ? search.email : "",
  }),
  head: () => ({
    meta: [
      { title: "DTFLEXPRO | Validar código" },
      { name: "description", content: "Valide seu código de acesso para entrar na plataforma." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const search = Route.useSearch();
  const validateCode = useServerFn(validateAccessCode);
  const [email, setEmail] = useState(search.email);
  const [code, setCode] = useState(search.code);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setLoading(true);
      const result = await validateCode({
        data: {
          email,
          code,
        },
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      window.location.href = result.redirectTo;
    } catch (error) {
      console.error(error);
      toast.error("Código inválido ou expirado");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <Card className="w-full max-w-md rounded-lg bg-card/70 p-6 backdrop-blur">
        <div className="mb-6 space-y-2 text-center">
          <p className="text-xs uppercase tracking-[0.28em] text-muted-foreground">DTFLEXPRO</p>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Entrar com código</h1>
          <p className="text-sm text-muted-foreground">
            Use o e-mail da compra e o código enviado após a confirmação do pagamento.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="code">Código de Acesso</Label>
            <Input
              id="code"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              required
              autoComplete="one-time-code"
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Validando..." : "Entrar na plataforma"}
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
