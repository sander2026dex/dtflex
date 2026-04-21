import type { FaqItem, FeatureItem, PricingOption, StepItem, TestimonialItem } from "./types";

export const proofBadge = "⭐ 4.9/5 · Usado por +1.200 criativos e estúdios";

export const featureItems: FeatureItem[] = [
  {
    icon: "zap",
    title: "Processamento Instantâneo",
    description: "Renderização otimizada para gerar a prévia e fechar o arquivo final em cerca de 10 segundos.",
  },
  {
    icon: "sliders",
    title: "Estilos Personalizáveis",
    description: "Controle pontos, densidade, ângulos e comportamento visual para cada tipo de arte e impressão.",
  },
  {
    icon: "package",
    title: "Exportação Profissional",
    description: "Saída em PNG de alta resolução, pronta para produção gráfica com nitidez e consistência.",
  },
  {
    icon: "shield",
    title: "100% Local",
    description: "O processamento acontece no navegador para preservar privacidade e reduzir etapas operacionais.",
  },
  {
    icon: "save",
    title: "Presets Salvos",
    description: "Reaproveite configurações testadas para acelerar lotes recorrentes e padronizar resultados.",
  },
  {
    icon: "printer",
    title: "Pronto para Print",
    description: "Calibração pensada para dtf print halftone, com leitura visual forte e produção previsível.",
  },
];

export const testimonialItems: TestimonialItem[] = [
  {
    name: "Mariana Costa",
    role: "Designer Têxtil",
    avatar: "MC",
    quote: "Consegui reduzir o tempo entre aprovação e produção porque o preview mostra exatamente o impacto do halftone.",
  },
  {
    name: "Rafael Nunes",
    role: "Estúdio de Serigrafia",
    avatar: "RN",
    quote: "A consistência dos presets ajudou a manter padrão em pedidos recorrentes sem retrabalho no fechamento dos arquivos.",
  },
  {
    name: "Camila Freitas",
    role: "Direção de Arte",
    avatar: "CF",
    quote: "A ferramenta entrega velocidade real para testar variações e exportar rápido quando o cliente aprova a arte.",
  },
];

export const steps: StepItem[] = [
  {
    icon: "upload",
    title: "Arraste sua imagem",
    description: "A ferramenta lê sua arte, prepara a base e organiza automaticamente o ponto inicial para o efeito halftone.",
  },
  {
    icon: "adjustments",
    title: "Ajuste densidade, ângulo e cor",
    description: "O motor automático gera o reticulado e você só refina contraste, densidade e leitura final para produção.",
  },
  {
    icon: "download",
    title: "Exporte em alta resolução",
    description: "O arquivo final sai pronto para download com acabamento consistente e velocidade de processamento em cerca de 10 segundos.",
  },
];

export const pricingOptions: PricingOption[] = [
  {
    billing: "mensal",
    label: "Plano Pro",
    price: "R$ 49,90",
    cadence: "/mês",
    summary: "Ideal para produção recorrente com processamento rápido, acesso à plataforma e envio do acesso por e-mail após a confirmação do pagamento.",
    checkoutHref: "/checkout/mensal",
    benefits: [
      "Acesso completo à geração halftone profissional",
      "Processamento online com entrega do arquivo em cerca de 10 segundos",
      "Presets salvos e suporte rápido via WhatsApp",
      "Liberação de acesso por e-mail após confirmação do pagamento",
    ],
  },
  {
    billing: "anual",
    label: "Plano Pro",
    price: "R$ 168,09",
    cadence: "/ano",
    badge: "Melhor custo anual",
    summary: "Melhor escolha para estúdios e operações contínuas que precisam de economia, prioridade e previsibilidade ao longo do ano.",
    checkoutHref: "/checkout/anual",
    benefits: [
      "Tudo do plano mensal com menor custo por período",
      "Acesso contínuo para equipes e volume recorrente",
      "Mais economia para produção comercial durante o ano todo",
      "Suporte prioritário e melhor custo anual para operação contínua",
    ],
  },
];

export const faqItems: FaqItem[] = [
  {
    question: "Posso usar os halftones em projetos comerciais?",
    answer: "Sim. Enquanto o plano estiver ativo, você pode usar os arquivos exportados em projetos comerciais normalmente.",
  },
  {
    question: "Funciona offline?",
    answer: "Não. O uso da plataforma depende de conexão online para acessar a ferramenta e o fluxo de liberação.",
  },
  {
    question: "Quais formatos são aceitos?",
    answer: "PNG e JPEG.",
  },
  {
    question: "Como funciona o suporte?",
    answer: "O atendimento acontece pelo botão flutuante de WhatsApp para agilizar dúvidas operacionais e comerciais.",
  },
];
