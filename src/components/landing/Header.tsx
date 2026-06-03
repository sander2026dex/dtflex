import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import logo from "@/assets/dtflexpro-logo.png.asset.json";

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3">
        <Link
          to="/"
          className="inline-flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <img src={logo.url} alt="DTFlexPRO" className="h-10 w-auto md:h-12" />
        </Link>

        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link to="/afiliado">
              <Users className="h-4 w-4" />
              Afiliados
            </Link>
          </Button>
          <Button asChild>
            <Link to="/login" search={{ code: "", email: "" }}>
              Acessar Plataforma
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
