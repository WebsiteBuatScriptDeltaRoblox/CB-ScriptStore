import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return new Response('Script tidak ditemukan.', {status:404, headers:{...cors,'Content-Type':'text/plain; charset=utf-8'}});

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!);
  const { data, error } = await supabase.from('scripts').select('filename, code, visibility').eq('id', id).eq('visibility','public').maybeSingle();
  if (error || !data) return new Response('Script publik tidak ditemukan.', {status:404, headers:{...cors,'Content-Type':'text/plain; charset=utf-8'}});

  const filename = String(data.filename || 'script.txt').replace(/[^a-zA-Z0-9._-]/g, '_');
  return new Response(data.code ?? '', {status:200, headers:{...cors,'Content-Type':'text/plain; charset=utf-8','Content-Disposition':`inline; filename="${filename}"`,'Cache-Control':'no-store'}});
});
