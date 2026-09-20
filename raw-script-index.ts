// Supabase Edge Function: raw-script
// IMPORTANT: Deploy this as an Edge Function named exactly: raw-script
// Turn OFF JWT verification so public Raw links work without login.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

function cleanFilename(value: unknown) {
  const name = String(value || 'script.txt')
    .replace(/[\\/:*?"<>|\r\n]/g, '_')
    .trim();
  return name || 'script.txt';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'GET') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const id = new URL(req.url).searchParams.get('id');
  if (!id) {
    return new Response('Script tidak ditemukan.', {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response('Raw service belum dikonfigurasi.', {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  // Service-role is used ONLY inside this server-side function so the public
  // Raw endpoint can read the script while still enforcing visibility=public.
  const apiUrl = new URL(`${supabaseUrl}/rest/v1/scripts`);
  apiUrl.searchParams.set('select', 'filename,code,visibility');
  apiUrl.searchParams.set('id', `eq.${id}`);
  apiUrl.searchParams.set('visibility', 'eq.public');
  apiUrl.searchParams.set('limit', '1');

  const response = await fetch(apiUrl, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });

  if (!response.ok) {
    return new Response('Gagal mengambil script.', {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const rows = await response.json();
  const script = Array.isArray(rows) ? rows[0] : null;

  if (!script || script.visibility !== 'public') {
    return new Response('Script publik tidak ditemukan.', {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const filename = cleanFilename(script.filename);

  return new Response(String(script.code ?? ''), {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `inline; filename="${filename}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
    },
  });
});
