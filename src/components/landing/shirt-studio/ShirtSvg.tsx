export type ShirtModel = "careca" | "v" | "regata" | "polo";
export type ShirtSide = "frente" | "costas" | "manga-esq" | "manga-dir";

function Collar({ model }: { model: ShirtModel }) {
  if (model === "regata") {
    return <path d="M200 40 C 230 90, 270 90, 300 40" fill="none" stroke="currentColor" strokeWidth="6" opacity="0.35" />;
  }
  if (model === "v") {
    return <path d="M205 42 L250 120 L295 42" fill="none" stroke="currentColor" strokeWidth="7" opacity="0.35" />;
  }
  if (model === "polo") {
    return (
      <g fill="none" stroke="currentColor" strokeWidth="6" opacity="0.35">
        <path d="M210 40 L250 105 L290 40" />
        <path d="M248 60 L248 130" />
      </g>
    );
  }
  return <path d="M200 44 C 225 82, 275 82, 300 44" fill="none" stroke="currentColor" strokeWidth="7" opacity="0.35" />;
}

export function ShirtSvg({
  model,
  side,
  color,
}: {
  model: ShirtModel;
  side: ShirtSide;
  color: string;
}) {
  const sleeveless = model === "regata";
  const isSleeveView = side === "manga-esq" || side === "manga-dir";

  if (isSleeveView) {
    return (
      <svg viewBox="0 0 500 600" className="h-full w-full drop-shadow-xl" role="img" aria-label="Mockup da manga">
        <path
          d="M120 120 L380 120 C 400 220, 400 380, 380 480 L120 480 C 100 380, 100 220, 120 120 Z"
          fill={color}
          stroke="rgba(0,0,0,0.25)"
          strokeWidth="3"
        />
        <path d="M120 120 L380 120" stroke="rgba(0,0,0,0.18)" strokeWidth="8" fill="none" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 500 600" className="h-full w-full drop-shadow-xl" role="img" aria-label="Mockup da camisa">
      <path
        d={
          sleeveless
            ? "M180 40 L200 30 C 230 80, 270 80, 300 30 L320 40 L345 90 L340 570 L160 570 L155 90 Z"
            : "M180 40 L200 30 C 230 80, 270 80, 300 30 L320 40 L430 95 L390 210 L345 190 L340 570 L160 570 L155 190 L110 210 L70 95 Z"
        }
        fill={color}
        stroke="rgba(0,0,0,0.25)"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <g style={{ color: "#000" }}>{side === "frente" ? <Collar model={model} /> : <Collar model="careca" />}</g>
      <path d="M160 570 L340 570" stroke="rgba(0,0,0,0.15)" strokeWidth="6" fill="none" />
    </svg>
  );
}
