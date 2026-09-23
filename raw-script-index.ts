const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function safeFilename(name: string) {
  return (name || "script.lua")
    .replace(/[\\/:*?"<>|]/g, "_")
    .slice(0, 120);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return new Response("Missing script id", {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKeyJson = Deno.env.get("SUPABASE_SECRET_KEYS");

    if (!supabaseUrl || !serviceKeyJson) {
      return new Response("Server configuration error", {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    const keys = JSON.parse(serviceKeyJson);
    const secretKey = keys.default;

    // Intentionally do not filter by visibility here.
    // Script Saya needs Raw/Salin Script to work for both Private and Public scripts.
    const response = await fetch(
      `${supabaseUrl}/rest/v1/scripts?id=eq.${encodeURIComponent(id)}&select=filename,code&limit=1`,
      {
        headers: {
          apikey: secretKey,
          Authorization: `Bearer ${secretKey}`,
        },
      }
    );

    if (!response.ok) {
      return new Response("Failed to load script", {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    const rows = await response.json();

    if (!rows.length) {
      return new Response("Script tidak ditemukan.", {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    const script = rows[0];
    const filename = safeFilename(script.filename || "script.lua");

    return new Response(script.code ?? "", {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (_) {
    return new Response("Raw script error", {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
    });
  }
});
