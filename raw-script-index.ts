const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function safeFilename(name: string) {
  return (name || "script.lua")
    .replace(/[\/\\:*?"<>|]/g, "_")
    .slice(0, 120);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return new Response("Missing script id", { status: 400, headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" } });

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SECRET_KEYS");
    if (!supabaseUrl || !serviceKey) return new Response("Server configuration error", { status: 500, headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" } });

    const keys = JSON.parse(serviceKey);
    const secretKey = keys.default;

    // Raw link is available for both Private and Public scripts.
    // Private means the script is hidden from the Public Script listing.
    // Anyone who receives a Raw URL can access that script.
    const response = await fetch(
      `${supabaseUrl}/rest/v1/scripts?id=eq.${encodeURIComponent(id)}&select=filename,code,user_id&limit=1`,
      { headers: { apikey: secretKey, Authorization: `Bearer ${secretKey}` } }
    );
    if (!response.ok) return new Response("Failed to load script", { status: 500, headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" } });

    const rows = await response.json();
    if (!rows.length) return new Response("Script tidak ditemukan.", { status: 404, headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" } });

    const script = rows[0];
    let username = "User";
    try {
      const profileResponse = await fetch(
        `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(script.user_id)}&select=username&limit=1`,
        { headers: { apikey: secretKey, Authorization: `Bearer ${secretKey}` } }
      );
      if (profileResponse.ok) {
        const profiles = await profileResponse.json();
        if (profiles[0]?.username) username = profiles[0].username;
      }
    } catch (_) {}

    const filename = safeFilename(script.filename || "script.lua");
    const body = `-- Pembuat script: @${username}\n-- Link website: https://websitebuatscriptdeltaroblox.github.io/CB-ScriptStore/\n\n${script.code ?? ""}`;
    return new Response(body, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `inline; filename="${filename}"`,
      },
    });
  } catch (_) {
    return new Response("Raw script error", { status: 500, headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" } });
  }
});
