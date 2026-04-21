import { MessageCircleMore } from "lucide-react";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const whatsappHref = "https://wa.me/5511943152441?text=Ol%C3%A1%2C%20gostaria%20de%20saber%20sobre%20a%20plataforma";

export function WhatsAppFloat() {
  return (
    <TooltipProvider delayDuration={120}>
      <Tooltip>
        <TooltipTrigger asChild>
          <a
            href={whatsappHref}
            target="_blank"
            rel="noreferrer"
            aria-label="Fale com o suporte pelo WhatsApp"
            className="fixed bottom-5 right-5 z-50 inline-flex h-14 w-14 items-center justify-center rounded-full border border-brand/30 bg-brand text-brand-foreground shadow-[var(--shadow-glow)] transition-transform duration-200 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <MessageCircleMore className="h-6 w-6" />
          </a>
        </TooltipTrigger>
        <TooltipContent side="left">Fale com o Suporte</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
