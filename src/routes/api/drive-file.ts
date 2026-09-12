import { createFileRoute } from "@tanstack/react-router";
import { assertAccessAuthenticated } from "@/lib/access-guard.server";
import { assertInsideLibrary, driveFetch, listDriveChildren, readDriveFile } from "@/lib/drive-library.server";

function safeName(name: string) {
  return name.replace(/[\\/\r\n";]/g, "_").slice(0, 180) || "arte-dtflexpro";
}

export const Route = createFileRoute("/api/drive-file")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        await assertAccessAuthenticated();
        const url = new URL(request.url);
        const requestedId = url.searchParams.get("id");
        const coverFolderId = url.searchParams.get("coverFolder");
        const download = url.searchParams.get("download") === "1";
        let fileId = requestedId;

        if (coverFolderId) {
          await assertInsideLibrary(coverFolderId);
          const children = await listDriveChildren(coverFolderId);
          const image = children.find((item) => item.mimeType.startsWith("image/"));
          fileId = image?.targetId ?? image?.id ?? null;
          if (!fileId) return new Response(null, { status: 404 });
        }
        if (!fileId) return new Response("Arquivo não informado.", { status: 400 });

        await assertInsideLibrary(fileId);
        const metadata = await readDriveFile(fileId);
        const actualId = metadata.shortcutDetails?.targetId ?? fileId;
        const actualMime = metadata.shortcutDetails?.targetMimeType ?? metadata.mimeType;
        if (actualId !== fileId) await assertInsideLibrary(fileId);
        if (actualMime === "application/vnd.google-apps.folder") {
          return new Response("Pastas não podem ser baixadas.", { status: 400 });
        }

        const response = await driveFetch(`/files/${encodeURIComponent(actualId)}?alt=media&supportsAllDrives=true`);
        if (!response.ok || !response.body) {
          const message = await response.text();
          return new Response(`Arquivo indisponível (${response.status}): ${message}`, { status: response.status });
        }
        const headers = new Headers();
        headers.set("Content-Type", response.headers.get("content-type") ?? actualMime ?? "application/octet-stream");
        headers.set("Cache-Control", download ? "private, no-store" : "private, max-age=300");
        if (download) headers.set("Content-Disposition", `attachment; filename="${safeName(metadata.name)}"`);
        return new Response(response.body, { status: 200, headers });
      },
    },
  },
});
