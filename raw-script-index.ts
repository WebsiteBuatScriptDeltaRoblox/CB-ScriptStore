const corsHeaders={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};
function safeFilename(name:string){return(name||"script.lua").replace(/[\/:*?"<>|]/g,"_").slice(0,120);}
const labels:Record<string,{creator:string;website:string;notFound:string}>={
  id:{creator:"Pembuat script",website:"Link website",notFound:"Script publik tidak ditemukan."},
  en:{creator:"Script creator",website:"Website link",notFound:"Public script not found."},
  es:{creator:"Creador del script",website:"Enlace del sitio web",notFound:"No se encontró el script público."},
  pt:{creator:"Criador do script",website:"Link do site",notFound:"Script público não encontrado."},
  fil:{creator:"Gumawa ng script",website:"Link ng website",notFound:"Hindi makita ang public script."},
  tr:{creator:"Script sahibi",website:"Web sitesi bağlantısı",notFound:"Herkese açık script bulunamadı."},
  fr:{creator:"Créateur du script",website:"Lien du site",notFound:"Script public introuvable."},
  de:{creator:"Script-Ersteller",website:"Website-Link",notFound:"Öffentliches Script nicht gefunden."},
  ja:{creator:"スクリプト作成者",website:"ウェブサイトリンク",notFound:"公開スクリプトが見つかりません。"},
  ko:{creator:"스크립트 제작자",website:"웹사이트 링크",notFound:"공개 스크립트를 찾을 수 없습니다."},
  zh:{creator:"脚本作者",website:"网站链接",notFound:"未找到公开脚本。"},
  "zh-TW":{creator:"腳本作者",website:"網站連結",notFound:"找不到公開腳本。"},
  ru:{creator:"Автор скрипта",website:"Ссылка на сайт",notFound:"Публичный скрипт не найден."},
  hi:{creator:"स्क्रिप्ट निर्माता",website:"वेबसाइट लिंक",notFound:"पब्लिक स्क्रिप्ट नहीं मिली।"},
  ar:{creator:"منشئ البرنامج النصي",website:"رابط الموقع",notFound:"لم يتم العثور على البرنامج النصي العام."},
  vi:{creator:"Người tạo script",website:"Liên kết trang web",notFound:"Không tìm thấy script công khai."},
  th:{creator:"ผู้สร้างสคริปต์",website:"ลิงก์เว็บไซต์",notFound:"ไม่พบสคริปต์สาธารณะ"},
  pl:{creator:"Twórca skryptu",website:"Link do strony",notFound:"Nie znaleziono publicznego skryptu."},
  it:{creator:"Creatore dello script",website:"Link del sito",notFound:"Script pubblico non trovato."},
  "pt-PT":{creator:"Criador do script",website:"Ligação do site",notFound:"Script público não encontrado."}
};
Deno.serve(async(req)=>{if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});try{const url=new URL(req.url),id=url.searchParams.get("id"),lang=url.searchParams.get("lang")||"id",t=labels[lang]||labels.id;if(!id)return new Response("Missing script id",{status:400,headers:{...corsHeaders,"Content-Type":"text/plain; charset=utf-8"}});const supabaseUrl=Deno.env.get("SUPABASE_URL"),serviceKey=Deno.env.get("SUPABASE_SECRET_KEYS");if(!supabaseUrl||!serviceKey)return new Response("Server configuration error",{status:500,headers:{...corsHeaders,"Content-Type":"text/plain; charset=utf-8"}});const keys=JSON.parse(serviceKey),secretKey=keys.default;const r=await fetch(`${supabaseUrl}/rest/v1/scripts?id=eq.${encodeURIComponent(id)}&visibility=eq.public&select=filename,code,user_id&limit=1`,{headers:{apikey:secretKey,Authorization:`Bearer ${secretKey}`}});if(!r.ok)return new Response("Failed to load script",{status:500,headers:{...corsHeaders,"Content-Type":"text/plain; charset=utf-8"}});const rows=await r.json();if(!rows.length)return new Response(t.notFound,{status:404,headers:{...corsHeaders,"Content-Type":"text/plain; charset=utf-8"}});const script=rows[0];let username="Unknown";const pr=await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(script.user_id)}&select=username&limit=1`,{headers:{apikey:secretKey,Authorization:`Bearer ${secretKey}`}});if(pr.ok){const p=await pr.json();if(p[0]?.username)username=p[0].username;}const filename=safeFilename(script.filename||"script.lua");const body=`-- ${t.creator}: @${username}
-- ${t.website}: https://websitebuatscriptdeltaroblox.github.io/CB-ScriptStore/

${script.code??""}`;return new Response(body,{status:200,headers:{...corsHeaders,"Content-Type":"text/plain; charset=utf-8","Content-Disposition":`inline; filename="${filename}"`}});}catch(_){return new Response("Raw script error",{status:500,headers:{...corsHeaders,"Content-Type":"text/plain; charset=utf-8"}});}});
