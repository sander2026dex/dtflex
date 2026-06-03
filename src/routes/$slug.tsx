import { createFileRoute, redirect } from "@tanstack/react-router";
import { lookupAffiliateBySlug } from "@/lib/affiliate.functions";
import { LandingPage } from "@/components/LandingPage";

// Reserved paths handled by other routes — anything else is treated as an affiliate slug
const RESERVED = new Set([
  "admin", "app", "login", "afiliado", "afiliados", "api", "auth",
  "logout", "register", "signup", "checkout", "dashboard", "painel",
  "lovable", "validate-access-code", "verify-admin", "r",
  "favicon.ico", "robots.txt", "sitemap.xml",
]);

export const Route = createFileRoute("/$slug")({
  beforeLoad: async ({ params }) => {
    const s = params.slug.toLowerCase();
    if (RESERVED.has(s) || s.includes(".")) {
      throw redirect({ to: "/" });
    }
  },
  loader: async ({ params }) => {
    const res = await lookupAffiliateBySlug({ data: { slug: params.slug } });
    if (!res.found) {
      throw redirect({ to: "/" });
    }
    return res;
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `DTFLEXPRO | Indicado por ${loaderData?.fullName ?? ""}` },
      { name: "description", content: "Halftone profissional para DTF — indicação de afiliado." },
    ],
  }),
  component: AffiliateLanding,
  errorComponent: () => <LandingPage />,
  notFoundComponent: () => <LandingPage />,
});

function AffiliateLanding() {
  const data = Route.useLoaderData();
  return (
    <div className="relative">
      <div className="sticky top-0 z-50 w-full bg-primary/95 backdrop-blur px-4 py-2 text-center text-sm font-medium text-primary-foreground">
        🎉 Você foi indicado por <strong>{data.fullName}</strong> — Plano Anual R$ 147 / ano
      </div>
      <LandingPage />
    </div>
  );
}
