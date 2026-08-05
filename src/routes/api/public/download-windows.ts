import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const FILE = "DTFLEXPRO-Studio-win64.zip";

// Download público do software desktop (Windows x64)
export const Route = createFileRoute("/api/public/download-windows")({
  server: {
    handlers: {
      GET: async () => {
        const { data, error } = await supabaseAdmin.storage
          .from("downloads")
          .createSignedUrl(FILE, 60 * 10, { download: FILE });
        if (error || !data?.signedUrl) {
          return new Response("Download indisponível no momento.", { status: 503 });
        }
        return new Response(null, { status: 302, headers: { Location: data.signedUrl } });
      },
    },
  },
});
