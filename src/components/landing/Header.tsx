import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";

import { Button } from "@/components/ui/button";

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link to="/" className="inline-flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
          <span className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-card text-sm font-semibold text-brand">
            DP
          </span>
          <div>
            <p className="text-sm font-semibold tracking-[0.18em] text-foreground">DTFLEXPRO</p>
            <p className="text-xs text-muted-foreground">Halftone para impressão profissional</p>
          </div>
        </Link>

        <Button asChild>
          <Link to="/login" search={{ code: "", email: "" }}>
            Acessar Plataforma
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </header>
  );
}
