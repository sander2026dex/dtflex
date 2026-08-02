import carecaFrente from "@/assets/shirt-careca-frente.png";
import carecaCostas from "@/assets/shirt-careca-costas.png";
import vFrente from "@/assets/shirt-v-frente.png";
import regataFrente from "@/assets/shirt-regata-frente.png";
import regataCostas from "@/assets/shirt-regata-costas.png";
import poloFrente from "@/assets/shirt-polo-frente.png";

export type ShirtModel = "careca" | "v" | "regata" | "polo";
export type ShirtSide = "frente" | "costas" | "manga-esq" | "manga-dir";

const SOURCES: Record<ShirtModel, Record<"frente" | "costas", string>> = {
  careca: { frente: carecaFrente, costas: carecaCostas },
  v: { frente: vFrente, costas: carecaCostas },
  regata: { frente: regataFrente, costas: regataCostas },
  polo: { frente: poloFrente, costas: carecaCostas },
};

export function getShirtSrc(model: ShirtModel, side: ShirtSide) {
  const face = side === "costas" ? "costas" : "frente";
  return SOURCES[model][face];
}

interface Props {
  model: ShirtModel;
  side: ShirtSide;
  color: string;
}

/**
 * Realistic photo mockup: a solid color layer masked by the shirt silhouette,
 * with the original photo multiplied on top so folds/shadows stay realistic.
 */
export function ShirtMockup({ model, side, color }: Props) {
  const src = getShirtSrc(model, side);
  const flipped = side === "manga-dir";

  const maskStyle: React.CSSProperties = {
    WebkitMaskImage: `url(${src})`,
    maskImage: `url(${src})`,
    WebkitMaskSize: "contain",
    maskSize: "contain",
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
    WebkitMaskPosition: "center",
    maskPosition: "center",
    backgroundColor: color,
  };

  return (
    <div
      className="relative h-full w-full select-none"
      style={{ transform: flipped ? "scaleX(-1)" : undefined }}
    >
      <div className="absolute inset-0" style={maskStyle} />
      <img
        src={src}
        alt={`Mockup camisa ${model} ${side}`}
        loading="lazy"
        width={1024}
        height={1216}
        draggable={false}
        className="absolute inset-0 h-full w-full object-contain"
        style={{ mixBlendMode: "multiply" }}
      />
    </div>
  );
}
