import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  ChevronRight,
  Download,
  FileArchive,
  FileImage,
  FileText,
  Folder,
  Grid2X2,
  ImageOff,
  LoaderCircle,
  Search,
  Sparkles,
} from "lucide-react";
import { listArtLibrary } from "@/lib/drive-library.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type LibraryItem = Awaited<ReturnType<typeof listArtLibrary>>["files"][number];
type Crumb = { id: string; name: string };

const ROOT_ID = "1pCNF8QE93GYqLy7RYRJZADvJPxDBRyMv";

function fileIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return FileImage;
  if (mimeType === "application/pdf") return FileText;
  return FileArchive;
}

function formatDate(value?: string) {
  if (!value) return "Arquivo DTFLEXPRO";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

export default function ArtLibrary({ onOpenHalftone }: { onOpenHalftone: () => void }) {
  const listLibrary = useServerFn(listArtLibrary);
  const [crumbs, setCrumbs] = useState<Crumb[]>([{ id: ROOT_ID, name: "Todas as artes" }]);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const path = crumbs.map((crumb) => crumb.id);
  const pathKey = path.join(",");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    listLibrary({ data: { path } })
      .then((result) => {
        if (active) setItems(result.files);
      })
      .catch(() => {
        if (active) setError("Não foi possível carregar esta pasta agora.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [listLibrary, pathKey]);

  const visibleItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    if (!normalized) return items;
    return items.filter((item) => item.name.toLocaleLowerCase("pt-BR").includes(normalized));
  }, [items, query]);

  function openFolder(item: LibraryItem) {
    setQuery("");
    setCrumbs((current) => [...current, { id: item.id, name: item.name }]);
  }

  function goToCrumb(index: number) {
    setQuery("");
    setCrumbs((current) => current.slice(0, index + 1));
  }

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/95 backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 max-w-[1500px] items-center gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground shadow-sm">
              <Sparkles className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-base font-black tracking-normal">DTFLEXPRO</p>
              <p className="truncate text-xs text-muted-foreground">Biblioteca de artes</p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button onClick={onOpenHalftone} className="font-bold">
              <Grid2X2 className="size-4" />
              <span className="hidden sm:inline">Abrir Halftone</span>
              <span className="sm:hidden">Halftone</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 sm:py-8">
        <section className="mb-7 border-b border-border pb-7">
          <p className="mb-2 text-xs font-bold uppercase text-primary">Coleções DTFLEXPRO</p>
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div>
              <h1 className="max-w-3xl text-3xl font-black leading-tight sm:text-4xl">Encontre a arte certa para sua próxima estampa</h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">Pastas e arquivos atualizados diretamente pelo acervo DTFLEXPRO.</p>
            </div>
            <div className="relative w-full lg:max-w-md">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar nesta pasta" className="h-11 bg-card pl-10" />
            </div>
          </div>
        </section>

        <nav aria-label="Caminho da biblioteca" className="mb-5 flex min-h-9 items-center gap-1 overflow-x-auto whitespace-nowrap pb-1 text-sm">
          {crumbs.map((crumb, index) => (
            <div key={`${crumb.id}-${index}`} className="flex items-center gap-1">
              {index > 0 && <ChevronRight className="size-4 text-muted-foreground" />}
              <Button variant="ghost" size="sm" onClick={() => goToCrumb(index)} className={index === crumbs.length - 1 ? "font-bold text-foreground" : "text-muted-foreground"}>
                {crumb.name}
              </Button>
            </div>
          ))}
        </nav>

        {crumbs.length > 1 && (
          <Button variant="outline" size="sm" className="mb-5" onClick={() => goToCrumb(crumbs.length - 2)}>
            <ArrowLeft className="size-4" /> Voltar
          </Button>
        )}

        {loading ? (
          <div className="grid min-h-64 place-items-center text-muted-foreground"><LoaderCircle className="size-8 animate-spin" /></div>
        ) : error ? (
          <div className="grid min-h-64 place-items-center border border-dashed border-border bg-card p-8 text-center">
            <div><ImageOff className="mx-auto mb-3 size-8 text-muted-foreground" /><p className="font-bold">{error}</p></div>
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="grid min-h-64 place-items-center border border-dashed border-border bg-card p-8 text-center text-muted-foreground">Nenhum arquivo encontrado nesta pasta.</div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {visibleItems.map((item) => {
              const Icon = item.isFolder ? Folder : fileIcon(item.mimeType);
              const imageId = item.targetId ?? item.id;
              const imageSrc = item.isFolder
                ? `/api/drive-file?coverFolder=${encodeURIComponent(item.id)}&path=${encodeURIComponent(pathKey)}`
                : item.mimeType.startsWith("image/")
                  ? `/api/drive-file?id=${encodeURIComponent(item.id)}&path=${encodeURIComponent(pathKey)}`
                  : null;
              return (
                <article key={item.id} className="group min-w-0 overflow-hidden rounded-md border border-border bg-card shadow-sm transition hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-md">
                  <button type="button" onClick={() => item.isFolder && openFolder(item)} disabled={!item.isFolder} className="relative block aspect-[4/3] w-full overflow-hidden bg-secondary text-left disabled:cursor-default">
                    {imageSrc ? (
                      <img src={imageSrc} alt="" loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" onError={(event) => { event.currentTarget.style.display = "none"; }} />
                    ) : null}
                    <div className="absolute inset-0 grid place-items-center bg-secondary/40">
                      <Icon className="size-12 text-muted-foreground/70" strokeWidth={1.5} />
                    </div>
                    {imageSrc && <div className="absolute inset-0 bg-gradient-to-t from-background/30 to-transparent" />}
                    <span className="absolute left-2 top-2 rounded-sm bg-background/90 px-2 py-1 text-[10px] font-bold uppercase text-foreground backdrop-blur">
                      {item.isFolder ? "Coleção" : item.mimeType.split("/").pop()?.toUpperCase() ?? "Arquivo"}
                    </span>
                  </button>
                  <div className="p-3">
                    <h2 className="line-clamp-2 min-h-10 text-sm font-bold leading-5" title={item.name}>{item.name}</h2>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="truncate text-[11px] text-muted-foreground">{item.isFolder ? "Abrir pasta" : formatDate(item.modifiedTime)}</span>
                      {item.isFolder ? (
                        <Button size="icon" variant="ghost" className="size-8" onClick={() => openFolder(item)} aria-label={`Abrir ${item.name}`}><ChevronRight className="size-4" /></Button>
                      ) : (
                        <Button size="icon" variant="ghost" className="size-8" asChild>
                          <a href={`/api/drive-file?id=${encodeURIComponent(item.id)}&path=${encodeURIComponent(pathKey)}&download=1`} aria-label={`Baixar ${item.name}`}><Download className="size-4" /></a>
                        </Button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}