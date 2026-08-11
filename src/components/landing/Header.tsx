import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Users, MessageCircle, Shirt } from "lucide-react";

import { Button } from "@/components/ui/button";
import logo from "@/assets/dtflexpro-logo.png.asset.json";

export function Header({ affiliateMode = false }: { affiliateMode?: boolean } = {}) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3">
        <Link
          to="/"
          className="inline-flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <img
            src={logo.url}
            alt="DTFlexPRO"
            style={{ width: 250, height: 100 }}
            className="object-contain"
          />
        </Link>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              document.getElementById("estudio")?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
          >
            <Shirt className="h-4 w-4" />
            <span className="hidden sm:inline">Crie seu mockup</span>
            <span className="sm:hidden">Mockup</span>
          </Button>

          <Button
            asChild
            size="sm"
            className="bg-[#25D366] text-white hover:bg-[#1ebe57] shadow-[0_0_18px_#25D36680]"
          >
            <a
              href="https://chat.whatsapp.com/D8RHqGnmh0bBkMoPCcAkBY"
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle className="h-4 w-4" />
              <span className="hidden sm:inline">Entre no nosso grupo</span>
              <span className="sm:hidden">Grupo</span>
            </a>
          </Button>
          {!affiliateMode && (
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link to="/afiliado">
                <Users className="h-4 w-4" />
                Afiliados
              </Link>
            </Button>
          )}
          <Button asChild variant="outline" size="sm">
            <Link to="/login" search={{ code: "", email: "" }}>
              Acessar
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
