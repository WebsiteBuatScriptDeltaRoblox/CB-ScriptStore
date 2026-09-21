const $ = (s) => document.querySelector(s);
let mode = 'login';
let token = null;
let currentUser = null;
let pendingRoute = null;
const sb = window.supabase.createClient(window.CB_SUPABASE_URL, window.CB_SUPABASE_ANON_KEY);


const RAW_ENDPOINT='https://zpomypkasmmiozandzlv.supabase.co/functions/v1/raw-script';
const SITE_URL='https://websitebuatscriptdeltaroblox.github.io/CB-ScriptStore/';
let cachedOwnScripts=[];
let cachedPublicScripts=[];
let favoriteIds=new Set();
function trx(key,fallback){return tr(key)||fallback||key;}
function rawUrl(id){return `${RAW_ENDPOINT}?id=${encodeURIComponent(id)}&lang=${encodeURIComponent(currentLang())}`;}
function rawLoadstring(id){return `loadstring(game:HttpGet(\"${rawUrl(id)}\"))()`;}
async function loadFavorites(){if(!currentUser){favoriteIds=new Set();return;}const {data}=await sb.from('script_favorites').select('script_id').eq('user_id',currentUser.id);favoriteIds=new Set((data||[]).map(x=>String(x.script_id)));}
async function toggleFavorite(id){if(!currentUser){openAuth('login');return;}const sid=String(id);if(favoriteIds.has(sid)){await sb.from('script_favorites').delete().eq('user_id',currentUser.id).eq('script_id',id);favoriteIds.delete(sid);}else{await sb.from('script_favorites').insert({user_id:currentUser.id,script_id:id});favoriteIds.add(sid);}
  await renderPublicScripts(); await renderScriptsIfPossible();}
async function recordScriptView(id){try{await sb.from('script_views').insert({script_id:id,user_id:currentUser?.id||null,visitor_id:ensureVisitorId()});await sb.rpc('increment_script_view',{p_script_id:id});}catch(_){} if(currentUser){try{await sb.from('script_history').upsert({user_id:currentUser.id,script_id:id,last_viewed_at:new Date().toISOString()},{onConflict:'user_id,script_id'});}catch(_){}}}
async function reportScript(id){if(!currentUser){openAuth('login');return;}const reason=prompt(currentLang()==='id'?'Alasan laporan:':'Report reason:');if(!reason)return;const {error}=await sb.from('script_reports').insert({script_id:id,reporter_id:currentUser.id,reason:reason.slice(0,500)});if(!error)alert(currentLang()==='id'?'Laporan terkirim.':'Report sent.');}
async function loadFollowData(ownerIds){
  const ids=[...new Set((ownerIds||[]).filter(Boolean).map(String))];
  const counts=new Map(); const followed=new Set();
  if(!ids.length)return {counts,followed};
  try{
    const q=await sb.from('follows').select('follower_id,following_id').in('following_id',ids);
    (q.data||[]).forEach(r=>{const k=String(r.following_id);counts.set(k,(counts.get(k)||0)+1);if(currentUser&&String(r.follower_id)===String(currentUser.id))followed.add(k);});
  }catch(_){}
  return {counts,followed};
}
async function fetchPublicProfile(userId){
  try{
    const rpc=await sb.rpc('get_public_profile',{p_user_id:userId});
    if(!rpc.error){const x=Array.isArray(rpc.data)?rpc.data[0]:rpc.data;if(x?.id)return x;}
  }catch(_){}
  try{
    const pr=await sb.from('profiles').select('id,username,avatar_url').eq('id',userId).maybeSingle();
    if(pr.data?.id)return pr.data;
  }catch(_){}
  return null;
}
async function searchUsers(query,targetId){
  const box=$(targetId); if(!box)return;
  const q=(query||'').trim();
  if(q.length<1){box.innerHTML='';return;}
  try{
    const r=await sb.rpc('search_public_users',{p_query:q,p_limit:30});
    if(r.error)throw r.error;
    const rows=r.data||[];
    if(!rows.length){box.innerHTML=`<div class="empty">${escapeHtml(tr('noUsersFound'))}</div>`;return;}
    box.innerHTML=rows.map(u=>`<button type="button" class="user-result" data-user-result="${escapeHtml(u.id)}"><img src="${escapeHtml(u.avatar_url||'profil1.png')}" alt="${escapeHtml(u.username||'User')}"><span><strong>@${escapeHtml(u.username||'User')}</strong><small>${escapeHtml(tr('viewProfile'))}</small></span></button>`).join('');
    box.querySelectorAll('[data-user-result]').forEach(b=>b.addEventListener('click',()=>openPublicProfile(b.dataset.userResult)));
  }catch(e){box.innerHTML=`<div class="empty">${escapeHtml(e.message||tr('userSearchError'))}</div>`;}
}
async function openPublicProfile(userId){
  await syncAuth();
  if(!currentUser){pendingRoute='explore';openAuth('login');return;}
  const modal=$('#publicProfileModal');if(!modal)return;
  modal.classList.remove('hidden');
  const avatar=$('#publicProfileAvatar'),name=$('#publicProfileName'),uname=$('#publicProfileUsername'),fc=$('#publicFollowersCount'),fg=$('#publicFollowingCount'),btn=$('#publicFollowBtn'),scripts=$('#publicProfileScripts');
  scripts.innerHTML=`<div class="empty">${escapeHtml(tr('loadingScripts')||'Loading...')}</div>`;
  const profile=await fetchPublicProfile(userId);
  if(!profile){scripts.innerHTML=`<div class="empty">${escapeHtml(tr('profileNotFound'))}</div>`;return;}
  const owner=profile.username||'User';
  avatar.src=profile.avatar_url||'profil1.png';name.textContent='@'+owner;uname.textContent=owner;
  const [followers,following,rows]=await Promise.all([
    sb.from('follows').select('follower_id',{count:'exact',head:true}).eq('following_id',userId),
    sb.from('follows').select('following_id',{count:'exact',head:true}).eq('follower_id',userId),
    sb.from('scripts').select('id,filename').eq('user_id',userId).eq('visibility','public').order('updated_at',{ascending:false}).limit(50)
  ]);
  fc.textContent=String(followers.count||0);fg.textContent=String(following.count||0);
  const isSelf=String(userId)===String(currentUser.id);
  btn.style.display=isSelf?'none':'';
  let isFollowing=false;
  if(!isSelf){const f=await sb.from('follows').select('follower_id').eq('follower_id',currentUser.id).eq('following_id',userId).maybeSingle();isFollowing=!!f.data;}
  btn.dataset.userId=userId;btn.dataset.following=isFollowing?'1':'0';btn.textContent=tr(isFollowing?'unfollow':'follow');
  const list=rows.data||[];
  scripts.innerHTML=list.length?list.map(s=>`<article class="profile-script-card"><h4>${escapeHtml(s.filename)}</h4><button class="mini-btn copy-script-btn" data-profile-copy="${s.id}">${escapeHtml(tr('copyScript'))}</button></article>`).join(''):`<div class="empty">${escapeHtml(tr('emptyPublicScripts'))}</div>`;
  scripts.querySelectorAll('[data-profile-copy]').forEach(b=>b.onclick=async()=>{try{await navigator.clipboard.writeText(rawLoadstring(b.dataset.profileCopy));const old=b.textContent;b.textContent=tr('copiedScript');setTimeout(()=>b.textContent=old,1200);}catch(_){}});
}
async function toggleFollow(userId){
  await syncAuth();if(!currentUser||String(currentUser.id)===String(userId))return;
  const btn=$('#publicFollowBtn');const following=btn?.dataset.following==='1';
  try{
    if(following){const {error}=await sb.from('follows').delete().eq('follower_id',currentUser.id).eq('following_id',userId);if(error)throw error;}
    else{const {error}=await sb.from('follows').insert({follower_id:currentUser.id,following_id:userId});if(error)throw error;}
    await openPublicProfile(userId);
  }catch(e){alert(e.message||'Follow error');}
}
async function renderPublicScripts(){
  const box=$('#publicCards'); if(!box)return;
  try{
    await syncAuth();
    if(!currentUser){box.innerHTML=`<div class="empty">${escapeHtml(tr('needLoginPublic')||'Login untuk melihat Public Script.')}</div>`;return;}
    await loadFavorites();
    const q=$('#publicSearch')?.value.trim().toLowerCase()||'';
    let result=await sb.from('scripts').select('id,filename,code,visibility,created_at,user_id,view_count').eq('visibility','public').order('created_at',{ascending:false}).limit(100);
    if(result.error && /view_count/i.test(result.error.message||'')) result=await sb.from('scripts').select('id,filename,code,visibility,created_at,user_id').eq('visibility','public').order('created_at',{ascending:false}).limit(100);
    if(result.error)throw result.error;
    cachedPublicScripts=result.data||[];
    const ids=[...new Set(cachedPublicScripts.map(x=>x.user_id).filter(Boolean))];
    let profiles=[];
    if(ids.length){const pr=await sb.from('profiles').select('id,username,avatar_url').in('id',ids);profiles=pr.data||[];}
    const pm=new Map(profiles.map(x=>[x.id,x]));
    await Promise.all(ids.map(async id=>{const p=pm.get(id);if(!p?.username){const fp=await fetchPublicProfile(id);if(fp)pm.set(id,fp);}}));
    cachedPublicScripts.forEach(x=>{const p=pm.get(x.user_id)||{};x.profiles={username:p.username||'User',avatar_url:p.avatar_url||'profil1.png'};});
    const fd=await loadFollowData(ids);
    const rows=cachedPublicScripts.filter(s=>(!q||(s.filename+' '+(s.profiles?.username||'')).toLowerCase().includes(q)));
    if(!rows.length){box.innerHTML=`<div class="empty">${escapeHtml(tr('emptyPublicScripts')||'Belum ada script publik.')}</div>`;return;}
    box.innerHTML=rows.map(s=>{
      const owner=s.profiles?.username||'User',avatar=s.profiles?.avatar_url||'profil1.png',fav=favoriteIds.has(String(s.id)),ownerId=s.user_id;
      return `<article class="public-card"><div class="public-profile" data-public-profile="${escapeHtml(ownerId)}"><img class="public-profile-avatar" src="${escapeHtml(avatar)}" alt="${escapeHtml(owner)}"><div><div class="public-profile-label">${escapeHtml(tr('publicBy'))}</div><div class="public-profile-name">@${escapeHtml(owner)}</div></div></div><h3>${escapeHtml(s.filename)}</h3><div class="script-actions"><button class="mini-btn copy-script-btn" data-copy-public="${s.id}">${escapeHtml(tr('copyScript'))}</button><button class="mini-btn ${fav?'active':''}" data-fav="${s.id}">${fav?'★':'☆'}</button><button class="mini-btn" data-report="${s.id}">⚑</button></div></article>`;
    }).join('');
    box.querySelectorAll('[data-public-profile]').forEach(b=>{b.setAttribute('role','button');b.setAttribute('tabindex','0');b.onclick=()=>openPublicProfile(b.dataset.publicProfile);b.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openPublicProfile(b.dataset.publicProfile);}};});
    box.querySelectorAll('[data-fav]').forEach(b=>b.onclick=()=>toggleFavorite(b.dataset.fav));
    box.querySelectorAll('[data-report]').forEach(b=>b.onclick=()=>reportScript(b.dataset.report));
    box.querySelectorAll('[data-copy-public]').forEach(b=>b.onclick=async()=>{try{await navigator.clipboard.writeText(rawLoadstring(b.dataset.copyPublic));const old=b.textContent;b.textContent=tr('copiedScript');setTimeout(()=>b.textContent=old,1200);}catch(_){}});
  }catch(e){box.innerHTML=`<div class="empty">${escapeHtml(e.message||'Gagal memuat script publik.')}</div>`;}
}

async function openPublishModal(){
  await syncAuth();
  if(!currentUser){pendingRoute='explore';openAuth('login');return;}
  const modal=$('#publishModal'); const box=$('#publishScriptList'); if(!modal||!box)return;
  modal.classList.remove('hidden'); box.innerHTML=`<div class="empty">${escapeHtml(tr('loadingScripts')||'Memuat script...')}</div>`;
  let result=await sb.from('scripts').select('id,filename,visibility,updated_at').eq('user_id',currentUser.id).order('updated_at',{ascending:false}).order('id',{ascending:false});
  if(result.error){box.innerHTML=`<div class="empty">${escapeHtml(result.error.message)}</div>`;return;}
  const rows=result.data||[];
  if(!rows.length){box.innerHTML=`<div class="empty">${escapeHtml(tr('noScriptsToPublish')||'Belum ada script. Buat script terlebih dahulu.')}</div>`;return;}
  box.innerHTML=rows.map(s=>`<div class="card" style="margin-bottom:12px"><div class="card-head"><div class="icon">&lt;/&gt;</div><div><h3>${escapeHtml(s.filename)}</h3><small>${escapeHtml(visibilityLabel(s.visibility))}</small></div></div><div class="card-foot"><span class="tag">${escapeHtml(visibilityLabel(s.visibility))}</span><button class="mini-btn ${s.visibility==='public'?'active':''}" data-publish-id="${s.id}">${escapeHtml(s.visibility==='public'?tr('alreadyPublic'):'publishNow')}</button></div></div>`).join('');
  box.querySelectorAll('[data-publish-id]').forEach(b=>b.onclick=()=>publishExistingScript(b.dataset.publishId));
}
async function publishExistingScript(id){
  await syncAuth(); if(!currentUser)return;
  const err=$('#publishError'); if(err){err.textContent='';err.style.color='';}
  try{
    const {error}=await sb.from('scripts').update({visibility:'public',updated_at:new Date().toISOString()}).eq('id',id).eq('user_id',currentUser.id);
    if(error)throw error;
    if(err){err.style.color='#28d9a4';err.textContent=tr('published')||'Script berhasil dibuat Public.';}
    await renderPublicScripts();
    setTimeout(()=>$('#publishModal')?.classList.add('hidden'),350);
  }catch(e){if(err){err.style.color='#ff7690';err.textContent=e.message||'Gagal membuat script Public.';}}
}

async function loadHistory(){const box=$('#historyCards');if(!box||!currentUser)return;const {data}=await sb.from('script_history').select('last_viewed_at, scripts(id,filename,visibility)').eq('user_id',currentUser.id).order('last_viewed_at',{ascending:false}).limit(20);box.innerHTML=(data||[]).map(x=>`<div class="history-item"><b>${escapeHtml(x.scripts?.filename||'Script')}</b><div class="history-meta">${escapeHtml(new Date(x.last_viewed_at).toLocaleString())}</div></div>`).join('')||`<div class="empty">Belum ada riwayat.</div>`;}
async function loadNotifications(){const box=$('#notificationsList');if(!box||!currentUser)return;const {data}=await sb.from('notifications').select('*').eq('user_id',currentUser.id).order('created_at',{ascending:false}).limit(15);box.innerHTML=(data||[]).map(n=>`<div class="notification-item ${n.read_at?'':'unread'}"><b>${escapeHtml(n.title||'Notifikasi')}</b><div>${escapeHtml(n.message||'')}</div><small>${escapeHtml(new Date(n.created_at).toLocaleString())}</small></div>`).join('')||'<div class="empty">Belum ada notifikasi.</div>';}

function friendlyAuthError(error){
  const m = String(error?.message || error || '');
  if (/already registered|already exists/i.test(m)) return 'Username sudah dipakai. Silakan gunakan username lain.';
  if (/invalid login credentials/i.test(m)) return 'Username atau password salah.';
  return m || 'Terjadi kesalahan.';
}
async function syncAuth(){
  const {data:{session}} = await sb.auth.getSession();
  token = session?.access_token || null;
  currentUser = session?.user || null;
  return session;
}

const levels = [
  { icon:'🌱', code:`local playerName = "Fahrizal"\nprint("Halo, " .. playerName)`, key:'l1', focus:'variables' },
  { icon:'🧩', code:`local score = 10\nif score >= 10 then\n  print("Hebat!")\nend`, key:'l2', focus:'logic' },
  { icon:'🎮', code:`local part = workspace.Part\npart.Touched:Connect(function()\n  print("Part disentuh!")\nend)`, key:'l3', focus:'roblox' },
  { icon:'📡', code:`local ReplicatedStorage = game:GetService("ReplicatedStorage")\nlocal event = ReplicatedStorage:WaitForChild("MyEvent")\nevent:FireServer()`, key:'l4', focus:'network' },
  { icon:'💾', code:`local DataStoreService = game:GetService("DataStoreService")\nlocal store = DataStoreService:GetDataStore("PlayerData")`, key:'l5', focus:'data' }
];

const ui = {
  id:{navHome:'Beranda',navScripts:'Tutorial',navSearch:'⌕ Cari',navAbout:'♙ Tentang',start:'Mulai Sekarang',tutorial:'Tutorial',heroDesc:'Belajar membuat script dari dasar dengan tutorial, contoh kode, dan latihan.',easyTitle:'Mudah Digunakan',easyDesc:'Tampilan simpel dan modern, cocok untuk semua device.',safeTitle:'Aman & Terpercaya',safeDesc:'Data akun dan script kamu kami jaga dengan baik.',accessTitle:'Akses Dimana Saja',accessDesc:'Login sekali, gunakan kapan pun kamu mau.',learnTitle:'Belajar Membuat Script',learnDesc:'Pelajari script dari dasar dengan contoh, penjelasan, dan latihan.',howTitle:'How to Create a Script',howDesc:'Belajar membuat script dari nol dengan tutorial yang mudah dipahami, lengkap dengan contoh, kegunaan, dan latihan.',viewAll:'Lihat Semua →',rights:'All rights reserved.',login:'Login',register:'Register',loginSub:'Masuk ke CB ScriptStore',registerSub:'Buat akun CB ScriptStore',username:'Username (minimal 5 karakter)',password:'Password (minimal 9 karakter)',confirm:'Konfirmasi Password',noAccount:'Belum punya akun?',hasAccount:'Sudah punya akun?',learn:'Pelajari →',tutorialAlert:'Tutorial ini berisi materi, contoh kode, penjelasan bagian per bagian, dan latihan.',close:'Tutup',back:'Kembali ke Tutorial',why:'Kegunaan',what:'Yang dipelajari',example:'Contoh kode',explain:'Penjelasan',practice:'Latihan',practiceText:'Coba ubah contoh di atas, jalankan di Roblox Studio, lalu buat variasimu sendiri.',auto:'Otomatis',langLabel:'Bahasa',empty:'Belum ada script tersimpan.',needLogin:'Login untuk melihat script kamu.',created:'Akun berhasil dibuat. Silakan login.',loginError:'Login gagal.'},
  en:{navHome:'Home',navScripts:'Tutorials',navSearch:'⌕ Search',navAbout:'♙ About',start:'Get Started',tutorial:'Tutorials',heroDesc:'Learn to create scripts from the basics with tutorials, code examples, and practice.',easyTitle:'Easy to Use',easyDesc:'A simple, modern interface that works on every device.',safeTitle:'Safe & Trusted',safeDesc:'Your account and script data are protected.',accessTitle:'Access Anywhere',accessDesc:'Log in once and use your workspace whenever you want.',learnTitle:'Learn to Create Scripts',learnDesc:'Learn scripting from the basics with examples, explanations, and exercises.',howTitle:'How to Create a Script',howDesc:'Learn to create scripts from scratch with easy tutorials, examples, use cases, and exercises.',viewAll:'View All →',rights:'All rights reserved.',login:'Login',register:'Register',loginSub:'Sign in to CB ScriptStore',registerSub:'Create a CB ScriptStore account',username:'Username (minimum 5 characters)',password:'Password (minimum 9 characters)',confirm:'Confirm Password',noAccount:'Don’t have an account?',hasAccount:'Already have an account?',learn:'Learn →',tutorialAlert:'This tutorial includes lessons, code examples, step-by-step explanations, and exercises.',close:'Close',back:'Back to Tutorials',why:'Use case',what:'What you learn',example:'Code example',explain:'Explanation',practice:'Practice',practiceText:'Change the example above, run it in Roblox Studio, and make your own variation.',auto:'Automatic',langLabel:'Language',empty:'No scripts saved yet.',needLogin:'Log in to see your scripts.',created:'Account created. Please log in.',loginError:'Login failed.'},
  es:{navHome:'Inicio',navScripts:'Tutoriales',navSearch:'⌕ Buscar',navAbout:'♙ Acerca de',start:'Comenzar',tutorial:'Tutoriales',heroDesc:'Aprende a crear scripts desde cero con tutoriales, ejemplos de código y ejercicios.',easyTitle:'Fácil de Usar',easyDesc:'Interfaz sencilla y moderna para cualquier dispositivo.',safeTitle:'Seguro y Confiable',safeDesc:'Protegemos tus datos de cuenta y scripts.',accessTitle:'Acceso en Cualquier Lugar',accessDesc:'Inicia sesión una vez y usa tu espacio cuando quieras.',learnTitle:'Aprende a Crear Scripts',learnDesc:'Aprende scripting desde lo básico con ejemplos, explicaciones y ejercicios.',howTitle:'Cómo Crear un Script',howDesc:'Aprende a crear scripts desde cero con tutoriales fáciles, ejemplos, usos y ejercicios.',viewAll:'Ver Todo →',rights:'Todos los derechos reservados.',login:'Iniciar sesión',register:'Registrarse',loginSub:'Entra en CB ScriptStore',registerSub:'Crea una cuenta en CB ScriptStore',username:'Usuario (mínimo 5 caracteres)',password:'Contraseña (mínimo 9 caracteres)',confirm:'Confirmar contraseña',noAccount:'¿No tienes cuenta?',hasAccount:'¿Ya tienes cuenta?',learn:'Aprender →',tutorialAlert:'Este tutorial incluye lecciones, ejemplos de código, explicaciones paso a paso y ejercicios.',close:'Cerrar',back:'Volver a Tutoriales',why:'Uso',what:'Qué aprenderás',example:'Ejemplo de código',explain:'Explicación',practice:'Práctica',practiceText:'Cambia el ejemplo, ejecútalo en Roblox Studio y crea tu propia variante.',auto:'Automático',langLabel:'Idioma',empty:'No hay scripts guardados.',needLogin:'Inicia sesión para ver tus scripts.',created:'Cuenta creada. Inicia sesión.',loginError:'Error al iniciar sesión.'},
  pt:{navHome:'Início',navScripts:'Tutoriais',navSearch:'⌕ Buscar',navAbout:'♙ Sobre',start:'Começar',tutorial:'Tutoriais',heroDesc:'Aprenda a criar scripts desde o básico com tutoriais, exemplos de código e exercícios.',easyTitle:'Fácil de Usar',easyDesc:'Interface simples e moderna para qualquer dispositivo.',safeTitle:'Seguro e Confiável',safeDesc:'Seus dados de conta e scripts são protegidos.',accessTitle:'Acesso em Qualquer Lugar',accessDesc:'Faça login uma vez e use seu espaço quando quiser.',learnTitle:'Aprenda a Criar Scripts',learnDesc:'Aprenda scripting desde o básico com exemplos, explicações e exercícios.',howTitle:'Como Criar um Script',howDesc:'Aprenda a criar scripts do zero com tutoriais fáceis, exemplos, usos e exercícios.',viewAll:'Ver Tudo →',rights:'Todos os direitos reservados.',login:'Entrar',register:'Cadastrar',loginSub:'Entre no CB ScriptStore',registerSub:'Crie uma conta no CB ScriptStore',username:'Usuário (mínimo 5 caracteres)',password:'Senha (mínimo 9 caracteres)',confirm:'Confirmar senha',noAccount:'Não tem uma conta?',hasAccount:'Já tem uma conta?',learn:'Aprender →',tutorialAlert:'Este tutorial tem aulas, exemplos de código, explicações passo a passo e exercícios.',close:'Fechar',back:'Voltar aos Tutoriais',why:'Uso',what:'O que você aprende',example:'Exemplo de código',explain:'Explicação',practice:'Prática',practiceText:'Altere o exemplo, execute no Roblox Studio e crie sua própria variação.',auto:'Automático',langLabel:'Idioma',empty:'Nenhum script salvo.',needLogin:'Faça login para ver seus scripts.',created:'Conta criada. Faça login.',loginError:'Falha ao entrar.'},
  fil:{navHome:'Home',navScripts:'Tutorial',navSearch:'⌕ Hanapin',navAbout:'♙ Tungkol',start:'Magsimula',tutorial:'Tutorial',heroDesc:'Matutong gumawa ng script mula sa basics gamit ang tutorials, code examples, at exercises.',easyTitle:'Madaling Gamitin',easyDesc:'Simple at modernong interface para sa lahat ng device.',safeTitle:'Ligtas at Maaasahan',safeDesc:'Pinoprotektahan ang iyong account at script data.',accessTitle:'Matutong Gumawa ng Script',learnTitle:'Matutong Gumawa ng Script',learnDesc:'Matuto ng scripting mula sa basics gamit ang examples, explanations, at exercises.',howTitle:'Paano Gumawa ng Script',howDesc:'Matutong gumawa ng script mula zero gamit ang madaling tutorials, examples, gamit, at exercises.',viewAll:'Tingnan Lahat →',rights:'Lahat ng karapatan ay nakalaan.',login:'Login',register:'Register',loginSub:'Mag-login sa CB ScriptStore',registerSub:'Gumawa ng CB ScriptStore account',username:'Username (minimum 5 character)',password:'Password (minimum 9 character)',confirm:'Kumpirmahin ang Password',noAccount:'Wala pang account?',hasAccount:'May account na?',learn:'Matuto →',tutorialAlert:'Kasama sa tutorial ang lessons, code examples, step-by-step explanations, at exercises.',close:'Isara',back:'Bumalik sa Tutorial',why:'Gamit',what:'Matututunan',example:'Halimbawa ng code',explain:'Paliwanag',practice:'Pagsasanay',practiceText:'Baguhin ang halimbawa, patakbuhin sa Roblox Studio, at gumawa ng sarili mong bersyon.',auto:'Awtomatiko',langLabel:'Wika',empty:'Wala pang naka-save na script.',needLogin:'Mag-login para makita ang iyong scripts.',created:'Nagawa ang account. Mag-login.',loginError:'Hindi makapag-login.',accessTitle:'Gamit Kahit Saan',accessDesc:'Mag-login isang beses at gamitin ang workspace anumang oras.'},
  tr:{navHome:'Ana Sayfa',navScripts:'Eğitimler',navSearch:'⌕ Ara',navAbout:'♙ Hakkında',start:'Başla',tutorial:'Eğitimler',heroDesc:'Eğitimler, kod örnekleri ve alıştırmalarla sıfırdan script oluşturmayı öğren.',easyTitle:'Kullanımı Kolay',easyDesc:'Her cihaz için sade ve modern arayüz.',safeTitle:'Güvenli ve Güvenilir',safeDesc:'Hesap ve script verilerin korunur.',accessTitle:'Her Yerden Erişim',accessDesc:'Bir kez giriş yap ve çalışma alanını istediğin zaman kullan.',learnTitle:'Script Yazmayı Öğren',learnDesc:'Örnekler, açıklamalar ve alıştırmalarla temelden öğren.',howTitle:'Script Nasıl Oluşturulur',howDesc:'Kolay eğitimler, örnekler, kullanım alanları ve alıştırmalarla sıfırdan script oluştur.',viewAll:'Tümünü Gör →',rights:'Tüm hakları saklıdır.',login:'Giriş',register:'Kayıt Ol',loginSub:'CB ScriptStore’a giriş yap',registerSub:'CB ScriptStore hesabı oluştur',username:'Kullanıcı adı (en az 5 karakter)',password:'Şifre (en az 9 karakter)',confirm:'Şifreyi Onayla',noAccount:'Hesabın yok mu?',hasAccount:'Zaten hesabın var mı?',learn:'Öğren →',tutorialAlert:'Bu eğitim dersler, kod örnekleri, adım adım açıklamalar ve alıştırmalar içerir.',close:'Kapat',back:'Eğitimlere Dön',why:'Kullanım',what:'Öğreneceklerin',example:'Kod örneği',explain:'Açıklama',practice:'Alıştırma',practiceText:'Örneği değiştir, Roblox Studio’da çalıştır ve kendi sürümünü oluştur.',auto:'Otomatik',langLabel:'Dil',empty:'Henüz script yok.',needLogin:'Scriptlerini görmek için giriş yap.',created:'Hesap oluşturuldu. Giriş yap.',loginError:'Giriş başarısız.'},
  fr:{navHome:'Accueil',navScripts:'Tutoriels',navSearch:'⌕ Rechercher',navAbout:'♙ À propos',start:'Commencer',tutorial:'Tutoriels',heroDesc:'Apprenez à créer des scripts avec des tutoriels, exemples de code et exercices.',easyTitle:'Facile à Utiliser',easyDesc:'Une interface simple et moderne sur tous les appareils.',safeTitle:'Sûr et Fiable',safeDesc:'Vos données de compte et scripts sont protégées.',accessTitle:'Accès Partout',accessDesc:'Connectez-vous une fois et utilisez votre espace quand vous voulez.',learnTitle:'Apprendre à Créer des Scripts',learnDesc:'Apprenez le scripting avec exemples, explications et exercices.',howTitle:'Comment Créer un Script',howDesc:'Apprenez à créer des scripts avec des tutoriels simples, exemples, usages et exercices.',viewAll:'Tout Voir →',rights:'Tous droits réservés.',login:'Connexion',register:'Inscription',loginSub:'Connectez-vous à CB ScriptStore',registerSub:'Créez un compte CB ScriptStore',username:"Nom d’utilisateur (5 caractères minimum)",password:'Mot de passe (9 caractères minimum)',confirm:'Confirmer le mot de passe',noAccount:'Pas encore de compte ?',hasAccount:'Vous avez déjà un compte ?',learn:'Apprendre →',tutorialAlert:'Ce tutoriel comprend des leçons, exemples de code, explications étape par étape et exercices.',close:'Fermer',back:'Retour aux Tutoriels',why:'Utilisation',what:'Ce que vous apprendrez',example:'Exemple de code',explain:'Explication',practice:'Exercice',practiceText:'Modifiez l’exemple, exécutez-le dans Roblox Studio et créez votre propre variante.',auto:'Automatique',langLabel:'Langue',empty:'Aucun script enregistré.',needLogin:'Connectez-vous pour voir vos scripts.',created:'Compte créé. Connectez-vous.',loginError:'Échec de connexion.'},
  de:{navHome:'Startseite',navScripts:'Tutorials',navSearch:'⌕ Suchen',navAbout:'♙ Über uns',start:'Loslegen',tutorial:'Tutorials',heroDesc:'Lerne, Skripte von Grund auf mit Tutorials, Codebeispielen und Übungen zu erstellen.',easyTitle:'Einfach zu benutzen',easyDesc:'Eine einfache, moderne Oberfläche für jedes Gerät.',safeTitle:'Sicher & zuverlässig',safeDesc:'Deine Konto- und Skriptdaten werden geschützt.',accessTitle:'Überall verfügbar',accessDesc:'Einmal anmelden und deinen Bereich jederzeit nutzen.',learnTitle:'Skripte erstellen lernen',learnDesc:'Lerne Scripting mit Beispielen, Erklärungen und Übungen.',howTitle:'So erstellst du ein Script',howDesc:'Lerne von Grund auf mit einfachen Tutorials, Beispielen, Anwendungen und Übungen.',viewAll:'Alle ansehen →',rights:'Alle Rechte vorbehalten.',login:'Anmelden',register:'Registrieren',loginSub:'Bei CB ScriptStore anmelden',registerSub:'CB ScriptStore-Konto erstellen',username:'Benutzername (mindestens 5 Zeichen)',password:'Passwort (mindestens 9 Zeichen)',confirm:'Passwort bestätigen',noAccount:'Noch kein Konto?',hasAccount:'Schon ein Konto?',learn:'Lernen →',tutorialAlert:'Dieses Tutorial enthält Lektionen, Codebeispiele, Schritt-für-Schritt-Erklärungen und Übungen.',close:'Schließen',back:'Zurück zu Tutorials',why:'Verwendung',what:'Das lernst du',example:'Codebeispiel',explain:'Erklärung',practice:'Übung',practiceText:'Ändere das Beispiel, führe es in Roblox Studio aus und erstelle deine eigene Variante.',auto:'Automatisch',langLabel:'Sprache',empty:'Noch keine Scripts gespeichert.',needLogin:'Melde dich an, um deine Scripts zu sehen.',created:'Konto erstellt. Bitte anmelden.',loginError:'Anmeldung fehlgeschlagen.'},
  ja:{navHome:'ホーム',navScripts:'チュートリアル',navSearch:'⌕ 検索',navAbout:'♙ 概要',start:'始める',tutorial:'チュートリアル',heroDesc:'チュートリアル、コード例、練習問題でスクリプト作成を基礎から学べます。',easyTitle:'使いやすい',easyDesc:'すべての端末で使えるシンプルでモダンな画面。',safeTitle:'安全・信頼',safeDesc:'アカウントとスクリプトのデータを保護します。',accessTitle:'どこでもアクセス',accessDesc:'一度ログインすればいつでも利用できます。',learnTitle:'スクリプト作成を学ぶ',learnDesc:'例、説明、練習問題で基礎から学びます。',howTitle:'スクリプトの作り方',howDesc:'わかりやすいチュートリアル、例、用途、練習問題でゼロから学びます。',viewAll:'すべて見る →',rights:'All rights reserved.',login:'ログイン',register:'登録',loginSub:'CB ScriptStoreにログイン',registerSub:'CB ScriptStoreアカウントを作成',username:'ユーザー名（5文字以上）',password:'パスワード（9文字以上）',confirm:'パスワードを確認',noAccount:'アカウントがありませんか？',hasAccount:'すでにアカウントがありますか？',learn:'学ぶ →',tutorialAlert:'レッスン、コード例、手順ごとの説明、練習問題を含みます。',close:'閉じる',back:'チュートリアルに戻る',why:'用途',what:'学ぶこと',example:'コード例',explain:'説明',practice:'練習',practiceText:'例を変更してRoblox Studioで実行し、自分のバージョンを作ってみましょう。',auto:'自動',langLabel:'言語',empty:'保存されたスクリプトはありません。',needLogin:'スクリプトを見るにはログインしてください。',created:'アカウントを作成しました。ログインしてください。',loginError:'ログインに失敗しました。'},
  ko:{navHome:'홈',navScripts:'튜토리얼',navSearch:'⌕ 검색',navAbout:'♙ 소개',start:'시작하기',tutorial:'튜토리얼',heroDesc:'튜토리얼, 코드 예제와 연습으로 스크립트 제작을 기초부터 배워보세요.',easyTitle:'사용하기 쉬움',easyDesc:'모든 기기에서 사용할 수 있는 간단하고 현대적인 화면.',safeTitle:'안전하고 신뢰할 수 있음',safeDesc:'계정과 스크립트 데이터를 보호합니다.',accessTitle:'어디서나 이용',accessDesc:'한 번 로그인하면 언제든 작업 공간을 사용할 수 있습니다.',learnTitle:'스크립트 만들기 배우기',learnDesc:'예제, 설명, 연습으로 기초부터 배웁니다.',howTitle:'스크립트 만드는 방법',howDesc:'쉬운 튜토리얼, 예제, 활용법과 연습으로 처음부터 배웁니다.',viewAll:'모두 보기 →',rights:'모든 권리 보유.',login:'로그인',register:'가입',loginSub:'CB ScriptStore에 로그인',registerSub:'CB ScriptStore 계정 만들기',username:'사용자 이름(최소 5자)',password:'비밀번호(최소 9자)',confirm:'비밀번호 확인',noAccount:'계정이 없나요?',hasAccount:'이미 계정이 있나요?',learn:'배우기 →',tutorialAlert:'수업, 코드 예제, 단계별 설명과 연습 문제가 포함됩니다.',close:'닫기',back:'튜토리얼로 돌아가기',why:'용도',what:'배우는 내용',example:'코드 예제',explain:'설명',practice:'연습',practiceText:'예제를 바꾸고 Roblox Studio에서 실행한 뒤 자신만의 버전을 만들어 보세요.',auto:'자동',langLabel:'언어',empty:'저장된 스크립트가 없습니다.',needLogin:'스크립트를 보려면 로그인하세요.',created:'계정이 생성되었습니다. 로그인하세요.',loginError:'로그인 실패.'},
  zh:{navHome:'首页',navScripts:'教程',navSearch:'⌕ 搜索',navAbout:'♙ 关于',start:'开始学习',tutorial:'教程',heroDesc:'通过教程、代码示例和练习，从基础开始学习制作脚本。',easyTitle:'简单易用',easyDesc:'简洁现代，适合各种设备。',safeTitle:'安全可靠',safeDesc:'保护你的账号和脚本数据。',accessTitle:'随时访问',accessDesc:'登录一次即可随时使用你的空间。',learnTitle:'学习制作脚本',learnDesc:'通过示例、讲解和练习学习脚本基础。',howTitle:'如何创建脚本',howDesc:'通过简单教程、示例、用途和练习，从零开始学习。',viewAll:'查看全部 →',rights:'保留所有权利。',login:'登录',register:'注册',loginSub:'登录 CB ScriptStore',registerSub:'创建 CB ScriptStore 账号',username:'用户名（至少5个字符）',password:'密码（至少9个字符）',confirm:'确认密码',noAccount:'还没有账号？',hasAccount:'已经有账号？',learn:'学习 →',tutorialAlert:'教程包含课程、代码示例、逐步讲解和练习。',close:'关闭',back:'返回教程',why:'用途',what:'学习内容',example:'代码示例',explain:'讲解',practice:'练习',practiceText:'修改上面的示例，在 Roblox Studio 中运行，并制作自己的版本。',auto:'自动',langLabel:'语言',empty:'还没有保存的脚本。',needLogin:'登录后查看你的脚本。',created:'账号创建成功，请登录。',loginError:'登录失败。'},
  'zh-TW':{navHome:'首頁',navScripts:'教學',navSearch:'⌕ 搜尋',navAbout:'♙ 關於',start:'開始學習',tutorial:'教學',heroDesc:'透過教學、程式碼範例與練習，從基礎開始學習製作腳本。',easyTitle:'簡單易用',easyDesc:'簡潔現代，適合各種裝置。',safeTitle:'安全可靠',safeDesc:'保護你的帳號與腳本資料。',accessTitle:'隨時存取',accessDesc:'登入一次即可隨時使用你的空間。',learnTitle:'學習製作腳本',learnDesc:'透過範例、說明與練習學習腳本基礎。',howTitle:'如何建立腳本',howDesc:'透過簡單教學、範例、用途與練習，從零開始學習。',viewAll:'查看全部 →',rights:'保留所有權利。',login:'登入',register:'註冊',loginSub:'登入 CB ScriptStore',registerSub:'建立 CB ScriptStore 帳號',username:'使用者名稱（至少5個字元）',password:'密碼（至少9個字元）',confirm:'確認密碼',noAccount:'還沒有帳號？',hasAccount:'已經有帳號？',learn:'學習 →',tutorialAlert:'教學包含課程、程式碼範例、逐步說明與練習。',close:'關閉',back:'返回教學',why:'用途',what:'學習內容',example:'程式碼範例',explain:'說明',practice:'練習',practiceText:'修改上面的範例，在 Roblox Studio 中執行，並製作自己的版本。',auto:'自動',langLabel:'語言',empty:'還沒有儲存的腳本。',needLogin:'登入後查看你的腳本。',created:'帳號建立成功，請登入。',loginError:'登入失敗。'},
  ru:{navHome:'Главная',navScripts:'Уроки',navSearch:'⌕ Поиск',navAbout:'♙ О нас',start:'Начать',tutorial:'Уроки',heroDesc:'Учись создавать скрипты с нуля по урокам, примерам кода и упражнениям.',easyTitle:'Просто использовать',easyDesc:'Простой современный интерфейс для любого устройства.',safeTitle:'Безопасно и надёжно',safeDesc:'Мы защищаем данные аккаунта и скриптов.',accessTitle:'Доступ везде',accessDesc:'Войди один раз и пользуйся рабочим пространством в любое время.',learnTitle:'Учись создавать скрипты',learnDesc:'Изучай скриптинг с основ через примеры, объяснения и упражнения.',howTitle:'Как создать скрипт',howDesc:'Изучай с нуля простые уроки, примеры, применение и упражнения.',viewAll:'Смотреть всё →',rights:'Все права защищены.',login:'Войти',register:'Регистрация',loginSub:'Войти в CB ScriptStore',registerSub:'Создать аккаунт CB ScriptStore',username:'Имя пользователя (минимум 5 символов)',password:'Пароль (минимум 9 символов)',confirm:'Подтвердить пароль',noAccount:'Нет аккаунта?',hasAccount:'Уже есть аккаунт?',learn:'Учиться →',tutorialAlert:'Урок содержит материал, примеры кода, пошаговые объяснения и упражнения.',close:'Закрыть',back:'Назад к урокам',why:'Применение',what:'Что изучишь',example:'Пример кода',explain:'Объяснение',practice:'Практика',practiceText:'Измени пример, запусти его в Roblox Studio и создай свою версию.',auto:'Автоматически',langLabel:'Язык',empty:'Скриптов пока нет.',needLogin:'Войди, чтобы увидеть свои скрипты.',created:'Аккаунт создан. Войди.',loginError:'Не удалось войти.'},
  hi:{navHome:'होम',navScripts:'ट्यूटोरियल',navSearch:'⌕ खोजें',navAbout:'♙ हमारे बारे में',start:'शुरू करें',tutorial:'ट्यूटोरियल',heroDesc:'ट्यूटोरियल, कोड उदाहरण और अभ्यास से शुरुआत से स्क्रिप्ट बनाना सीखें।',easyTitle:'आसान उपयोग',easyDesc:'हर डिवाइस के लिए सरल और आधुनिक इंटरफ़ेस।',safeTitle:'सुरक्षित और भरोसेमंद',safeDesc:'आपके अकाउंट और स्क्रिप्ट डेटा की सुरक्षा की जाती है।',accessTitle:'कहीं भी पहुँच',accessDesc:'एक बार लॉगिन करें और जब चाहें अपने वर्कस्पेस का उपयोग करें।',learnTitle:'स्क्रिप्ट बनाना सीखें',learnDesc:'उदाहरण, समझाइश और अभ्यास से बेसिक्स सीखें।',howTitle:'स्क्रिप्ट कैसे बनाएँ',howDesc:'आसान ट्यूटोरियल, उदाहरण, उपयोग और अभ्यास से शून्य से सीखें।',viewAll:'सभी देखें →',rights:'सर्वाधिकार सुरक्षित।',login:'लॉगिन',register:'रजिस्टर',loginSub:'CB ScriptStore में लॉगिन करें',registerSub:'CB ScriptStore अकाउंट बनाएँ',username:'यूज़रनेम (कम से कम 5 अक्षर)',password:'पासवर्ड (कम से कम 9 अक्षर)',confirm:'पासवर्ड की पुष्टि करें',noAccount:'अकाउंट नहीं है?',hasAccount:'पहले से अकाउंट है?',learn:'सीखें →',tutorialAlert:'इस ट्यूटोरियल में पाठ, कोड उदाहरण, चरण-दर-चरण समझाइश और अभ्यास शामिल हैं।',close:'बंद करें',back:'ट्यूटोरियल पर लौटें',why:'उपयोग',what:'आप क्या सीखेंगे',example:'कोड उदाहरण',explain:'समझाइश',practice:'अभ्यास',practiceText:'उदाहरण बदलें, Roblox Studio में चलाएँ और अपना संस्करण बनाएँ।',auto:'स्वचालित',langLabel:'भाषा',empty:'अभी कोई स्क्रिप्ट सेव नहीं है।',needLogin:'अपनी स्क्रिप्ट देखने के लिए लॉगिन करें।',created:'अकाउंट बन गया। लॉगिन करें।',loginError:'लॉगिन विफल।'},
  ar:{navHome:'الرئيسية',navScripts:'الدروس',navSearch:'⌕ بحث',navAbout:'♙ حول',start:'ابدأ الآن',tutorial:'الدروس',heroDesc:'تعلّم إنشاء السكربتات من الأساسيات عبر الدروس وأمثلة الكود والتمارين.',easyTitle:'سهل الاستخدام',easyDesc:'واجهة بسيطة وحديثة تعمل على كل الأجهزة.',safeTitle:'آمن وموثوق',safeDesc:'نحمي بيانات حسابك والسكربتات.',accessTitle:'الوصول من أي مكان',accessDesc:'سجّل الدخول مرة واستخدم مساحتك متى شئت.',learnTitle:'تعلّم إنشاء السكربتات',learnDesc:'تعلّم البرمجة النصية من الأساسيات مع أمثلة وشرح وتمارين.',howTitle:'كيفية إنشاء سكربت',howDesc:'تعلّم من الصفر عبر دروس سهلة وأمثلة واستخدامات وتمارين.',viewAll:'عرض الكل →',rights:'جميع الحقوق محفوظة.',login:'تسجيل الدخول',register:'إنشاء حساب',loginSub:'سجّل الدخول إلى CB ScriptStore',registerSub:'أنشئ حساب CB ScriptStore',username:'اسم المستخدم (5 أحرف على الأقل)',password:'كلمة المرور (9 أحرف على الأقل)',confirm:'تأكيد كلمة المرور',noAccount:'ليس لديك حساب؟',hasAccount:'لديك حساب بالفعل؟',learn:'تعلّم →',tutorialAlert:'يتضمن هذا الدرس مواد وأمثلة كود وشرحاً خطوة بخطوة وتمارين.',close:'إغلاق',back:'العودة إلى الدروس',why:'الاستخدام',what:'ما ستتعلمه',example:'مثال كود',explain:'الشرح',practice:'تدريب',practiceText:'غيّر المثال وشغّله في Roblox Studio وأنشئ نسختك الخاصة.',auto:'تلقائي',langLabel:'اللغة',empty:'لا توجد سكربتات محفوظة بعد.',needLogin:'سجّل الدخول لرؤية سكربتاتك.',created:'تم إنشاء الحساب. سجّل الدخول.',loginError:'فشل تسجيل الدخول.'},
  vi:{navHome:'Trang chủ',navScripts:'Hướng dẫn',navSearch:'⌕ Tìm kiếm',navAbout:'♙ Giới thiệu',start:'Bắt đầu',tutorial:'Hướng dẫn',heroDesc:'Học tạo script từ cơ bản với hướng dẫn, ví dụ mã và bài tập.',easyTitle:'Dễ sử dụng',easyDesc:'Giao diện đơn giản, hiện đại cho mọi thiết bị.',safeTitle:'An toàn & tin cậy',safeDesc:'Bảo vệ dữ liệu tài khoản và script của bạn.',accessTitle:'Truy cập mọi nơi',accessDesc:'Đăng nhập một lần và dùng không gian của bạn bất cứ lúc nào.',learnTitle:'Học tạo script',learnDesc:'Học scripting từ cơ bản qua ví dụ, giải thích và bài tập.',howTitle:'Cách tạo Script',howDesc:'Học từ đầu với hướng dẫn dễ hiểu, ví dụ, cách dùng và bài tập.',viewAll:'Xem tất cả →',rights:'Đã đăng ký bản quyền.',login:'Đăng nhập',register:'Đăng ký',loginSub:'Đăng nhập CB ScriptStore',registerSub:'Tạo tài khoản CB ScriptStore',username:'Tên người dùng (ít nhất 5 ký tự)',password:'Mật khẩu (ít nhất 9 ký tự)',confirm:'Xác nhận mật khẩu',noAccount:'Chưa có tài khoản?',hasAccount:'Đã có tài khoản?',learn:'Học →',tutorialAlert:'Hướng dẫn gồm bài học, ví dụ mã, giải thích từng bước và bài tập.',close:'Đóng',back:'Quay lại Hướng dẫn',why:'Công dụng',what:'Bạn sẽ học',example:'Ví dụ mã',explain:'Giải thích',practice:'Luyện tập',practiceText:'Thay đổi ví dụ, chạy trong Roblox Studio và tạo phiên bản của riêng bạn.',auto:'Tự động',langLabel:'Ngôn ngữ',empty:'Chưa có script được lưu.',needLogin:'Đăng nhập để xem script của bạn.',created:'Đã tạo tài khoản. Hãy đăng nhập.',loginError:'Đăng nhập thất bại.'},
  th:{navHome:'หน้าแรก',navScripts:'บทเรียน',navSearch:'⌕ ค้นหา',navAbout:'♙ เกี่ยวกับ',start:'เริ่มต้น',tutorial:'บทเรียน',heroDesc:'เรียนรู้การสร้างสคริปต์ตั้งแต่พื้นฐานด้วยบทเรียน ตัวอย่างโค้ด และแบบฝึกหัด',easyTitle:'ใช้งานง่าย',easyDesc:'อินเทอร์เฟซเรียบง่ายและทันสมัยสำหรับทุกอุปกรณ์',safeTitle:'ปลอดภัยและเชื่อถือได้',safeDesc:'ปกป้องข้อมูลบัญชีและสคริปต์ของคุณ',accessTitle:'เข้าถึงได้ทุกที่',accessDesc:'เข้าสู่ระบบครั้งเดียวและใช้พื้นที่ของคุณได้ทุกเมื่อ',learnTitle:'เรียนรู้การสร้างสคริปต์',learnDesc:'เรียนรู้พื้นฐานด้วยตัวอย่าง คำอธิบาย และแบบฝึกหัด',howTitle:'วิธีสร้างสคริปต์',howDesc:'เรียนรู้ตั้งแต่ศูนย์ด้วยบทเรียนง่าย ๆ ตัวอย่าง การใช้งาน และแบบฝึกหัด',viewAll:'ดูทั้งหมด →',rights:'สงวนลิขสิทธิ์',login:'เข้าสู่ระบบ',register:'สมัครสมาชิก',loginSub:'เข้าสู่ CB ScriptStore',registerSub:'สร้างบัญชี CB ScriptStore',username:'ชื่อผู้ใช้ (อย่างน้อย 5 ตัวอักษร)',password:'รหัสผ่าน (อย่างน้อย 9 ตัวอักษร)',confirm:'ยืนยันรหัสผ่าน',noAccount:'ยังไม่มีบัญชี?',hasAccount:'มีบัญชีแล้ว?',learn:'เรียนรู้ →',tutorialAlert:'บทเรียนมีเนื้อหา ตัวอย่างโค้ด คำอธิบายทีละขั้น และแบบฝึกหัด',close:'ปิด',back:'กลับไปบทเรียน',why:'การใช้งาน',what:'สิ่งที่จะเรียนรู้',example:'ตัวอย่างโค้ด',explain:'คำอธิบาย',practice:'แบบฝึกหัด',practiceText:'เปลี่ยนตัวอย่าง รันใน Roblox Studio และสร้างเวอร์ชันของคุณเอง',auto:'อัตโนมัติ',langLabel:'ภาษา',empty:'ยังไม่มีสคริปต์ที่บันทึก',needLogin:'เข้าสู่ระบบเพื่อดูสคริปต์ของคุณ',created:'สร้างบัญชีแล้ว กรุณาเข้าสู่ระบบ',loginError:'เข้าสู่ระบบไม่สำเร็จ'},
  pl:{navHome:'Strona główna',navScripts:'Samouczki',navSearch:'⌕ Szukaj',navAbout:'♙ O nas',start:'Zacznij',tutorial:'Samouczki',heroDesc:'Naucz się tworzyć skrypty od podstaw dzięki poradnikom, przykładom kodu i ćwiczeniom.',easyTitle:'Łatwe w użyciu',easyDesc:'Prosty i nowoczesny interfejs na każde urządzenie.',safeTitle:'Bezpieczne i godne zaufania',safeDesc:'Chronimy dane konta i skryptów.',accessTitle:'Dostęp wszędzie',accessDesc:'Zaloguj się raz i korzystaj z przestrzeni kiedy chcesz.',learnTitle:'Nauka tworzenia skryptów',learnDesc:'Ucz się skryptowania od podstaw z przykładami, wyjaśnieniami i ćwiczeniami.',howTitle:'Jak stworzyć skrypt',howDesc:'Ucz się od zera dzięki prostym poradnikom, przykładom, zastosowaniom i ćwiczeniom.',viewAll:'Zobacz wszystko →',rights:'Wszelkie prawa zastrzeżone.',login:'Zaloguj',register:'Rejestracja',loginSub:'Zaloguj się do CB ScriptStore',registerSub:'Utwórz konto CB ScriptStore',username:'Nazwa użytkownika (minimum 5 znaków)',password:'Hasło (minimum 9 znaków)',confirm:'Potwierdź hasło',noAccount:'Nie masz konta?',hasAccount:'Masz już konto?',learn:'Ucz się →',tutorialAlert:'Samouczek zawiera lekcje, przykłady kodu, wyjaśnienia krok po kroku i ćwiczenia.',close:'Zamknij',back:'Wróć do samouczków',why:'Zastosowanie',what:'Czego się nauczysz',example:'Przykład kodu',explain:'Wyjaśnienie',practice:'Ćwiczenie',practiceText:'Zmień przykład, uruchom go w Roblox Studio i stwórz własną wersję.',auto:'Automatycznie',langLabel:'Język',empty:'Brak zapisanych skryptów.',needLogin:'Zaloguj się, aby zobaczyć swoje skrypty.',created:'Konto utworzone. Zaloguj się.',loginError:'Logowanie nie powiodło się.'},
  it:{navHome:'Home',navScripts:'Tutorial',navSearch:'⌕ Cerca',navAbout:'♙ Informazioni',start:'Inizia',tutorial:'Tutorial',heroDesc:'Impara a creare script dalle basi con tutorial, esempi di codice ed esercizi.',easyTitle:'Facile da usare',easyDesc:'Interfaccia semplice e moderna per ogni dispositivo.',safeTitle:'Sicuro e affidabile',safeDesc:'Proteggiamo i dati del tuo account e degli script.',accessTitle:'Accesso ovunque',accessDesc:'Accedi una volta e usa il tuo spazio quando vuoi.',learnTitle:'Impara a creare script',learnDesc:'Impara lo scripting dalle basi con esempi, spiegazioni ed esercizi.',howTitle:'Come creare uno script',howDesc:'Impara da zero con tutorial semplici, esempi, utilizzi ed esercizi.',viewAll:'Vedi tutto →',rights:'Tutti i diritti riservati.',login:'Accedi',register:'Registrati',loginSub:'Accedi a CB ScriptStore',registerSub:'Crea un account CB ScriptStore',username:'Nome utente (almeno 5 caratteri)',password:'Password (almeno 9 caratteri)',confirm:'Conferma password',noAccount:'Non hai un account?',hasAccount:'Hai già un account?',learn:'Impara →',tutorialAlert:'Questo tutorial include lezioni, esempi di codice, spiegazioni passo passo ed esercizi.',close:'Chiudi',back:'Torna ai Tutorial',why:'Utilizzo',what:'Cosa imparerai',example:'Esempio di codice',explain:'Spiegazione',practice:'Esercizio',practiceText:'Modifica l’esempio, eseguilo in Roblox Studio e crea la tua variante.',auto:'Automatico',langLabel:'Lingua',empty:'Nessuno script salvato.',needLogin:'Accedi per vedere i tuoi script.',created:'Account creato. Accedi.',loginError:'Accesso non riuscito.'},
  'pt-PT':{navHome:'Início',navScripts:'Tutoriais',navSearch:'⌕ Pesquisar',navAbout:'♙ Sobre',start:'Começar',tutorial:'Tutoriais',heroDesc:'Aprende a criar scripts desde o básico com tutoriais, exemplos de código e exercícios.',easyTitle:'Fácil de Usar',easyDesc:'Interface simples e moderna para qualquer dispositivo.',safeTitle:'Seguro e Fiável',safeDesc:'Os dados da tua conta e dos teus scripts são protegidos.',accessTitle:'Acesso em Todo o Lado',accessDesc:'Inicia sessão uma vez e usa o teu espaço quando quiseres.',learnTitle:'Aprender a Criar Scripts',learnDesc:'Aprende scripting desde o básico com exemplos, explicações e exercícios.',howTitle:'Como Criar um Script',howDesc:'Aprende desde o zero com tutoriais simples, exemplos, utilizações e exercícios.',viewAll:'Ver Tudo →',rights:'Todos os direitos reservados.',login:'Iniciar sessão',register:'Registar',loginSub:'Entra no CB ScriptStore',registerSub:'Cria uma conta CB ScriptStore',username:'Nome de utilizador (mínimo 5 caracteres)',password:'Palavra-passe (mínimo 9 caracteres)',confirm:'Confirmar palavra-passe',noAccount:'Ainda não tens conta?',hasAccount:'Já tens conta?',learn:'Aprender →',tutorialAlert:'Este tutorial inclui lições, exemplos de código, explicações passo a passo e exercícios.',close:'Fechar',back:'Voltar aos Tutoriais',why:'Utilização',what:'O que vais aprender',example:'Exemplo de código',explain:'Explicação',practice:'Exercício',practiceText:'Altera o exemplo, executa-o no Roblox Studio e cria a tua própria versão.',auto:'Automático',langLabel:'Idioma',empty:'Ainda não existem scripts guardados.',needLogin:'Inicia sessão para veres os teus scripts.',created:'Conta criada. Inicia sessão.',loginError:'Falha ao iniciar sessão.'}
};

// Localized tutorial summaries and explanations. Every supported language has all five levels.
const tutorialText = {
  id:[
    ['Level 1 — Dasar','Kenali script, Roblox Studio, Luau, print(), komentar, variabel, dan tipe data.','Menyimpan informasi dan menampilkan hasil saat belajar dasar Luau.','Kamu belajar membuat nilai, menyimpannya di variabel, lalu menampilkannya dengan print().'],
    ['Level 2 — Logika','Pelajari if/else, operator, loop, function, dan table untuk membuat keputusan program.','Membuat script bisa mengambil keputusan dan mengulang pekerjaan secara teratur.','Kondisi memeriksa nilai. Jika kondisi benar, blok kode dijalankan.'],
    ['Level 3 — Roblox','Buat Part bergerak, tombol, teleport, damage, leaderstats, dan GUI sederhana.','Menghubungkan kode Luau dengan objek dan event di Roblox Studio.','Event seperti Touched menjalankan fungsi saat sesuatu terjadi di game.'],
    ['Level 4 — Client & Server','Kenali Script, LocalScript, ServerScriptService, ReplicatedStorage, dan RemoteEvent.','Memahami komunikasi client-server agar fitur Roblox bekerja di tempat yang tepat.','RemoteEvent dapat mengirim permintaan dari client ke server tanpa memindahkan logika server ke client.'],
    ['Level 5 — Data','Pelajari DataStore, menyimpan data pemain, inventory sederhana, dan validasi data.','Menyimpan progres pemain dengan aman sehingga dapat digunakan kembali saat mereka bermain lagi.','DataStore bekerja di server dan perlu penanganan error serta validasi data.']
  ],
  en:[['Level 1 — Basics','Learn scripts, Roblox Studio, Luau, print(), comments, variables, and data types.','Store information and show results while learning Luau basics.','Create values, save them in variables, then display them with print().'],['Level 2 — Logic','Learn if/else, operators, loops, functions, and tables to build program decisions.','Make scripts choose actions and repeat work in an organized way.','A condition checks a value. When it is true, its code block runs.'],['Level 3 — Roblox','Build moving Parts, buttons, teleport, damage, leaderstats, and simple GUI.','Connect Luau code to Roblox objects and events.','Events such as Touched run a function when something happens in the game.'],['Level 4 — Client & Server','Understand Script, LocalScript, ServerScriptService, ReplicatedStorage, and RemoteEvent.','Learn where Roblox code runs and how client-server communication works.','A RemoteEvent can send a request from the client to the server without moving server logic to the client.'],['Level 5 — Data','Learn DataStore, player data, a simple inventory, and data validation.','Save player progress so it can be used again in later sessions.','DataStore runs on the server and needs error handling and data validation.']],
  es:[['Nivel 1 — Básicos','Conoce scripts, Roblox Studio, Luau, print(), comentarios, variables y tipos de datos.','Guardar información y mostrar resultados mientras aprendes Luau.','Crea valores, guárdalos en variables y muéstralos con print().'],['Nivel 2 — Lógica','Aprende if/else, operadores, bucles, funciones y tablas para crear decisiones.','Hacer que los scripts decidan acciones y repitan tareas.','Una condición comprueba un valor y ejecuta su bloque cuando es verdadera.'],['Nivel 3 — Roblox','Crea Parts móviles, botones, teletransporte, daño, leaderstats y una GUI sencilla.','Conectar el código Luau con objetos y eventos de Roblox.','Eventos como Touched ejecutan una función cuando ocurre algo en el juego.'],['Nivel 4 — Cliente y servidor','Conoce Script, LocalScript, ServerScriptService, ReplicatedStorage y RemoteEvent.','Entender dónde se ejecuta el código y la comunicación cliente-servidor.','RemoteEvent permite enviar una petición del cliente al servidor sin mover la lógica del servidor al cliente.'],['Nivel 5 — Datos','Aprende DataStore, datos del jugador, inventario sencillo y validación.','Guardar el progreso del jugador para usarlo en futuras sesiones.','DataStore funciona en el servidor y necesita control de errores y validación.']],
  pt:[['Nível 1 — Básico','Conheça scripts, Roblox Studio, Luau, print(), comentários, variáveis e tipos de dados.','Guardar informações e mostrar resultados enquanto aprende Luau.','Crie valores, guarde-os em variáveis e mostre-os com print().'],['Nível 2 — Lógica','Aprenda if/else, operadores, loops, funções e tabelas para criar decisões.','Fazer scripts escolherem ações e repetirem tarefas.','Uma condição verifica um valor e executa o bloco quando é verdadeira.'],['Nível 3 — Roblox','Crie Parts móveis, botões, teleporte, dano, leaderstats e GUI simples.','Ligar código Luau a objetos e eventos do Roblox.','Eventos como Touched executam uma função quando algo acontece no jogo.'],['Nível 4 — Cliente e Servidor','Conheça Script, LocalScript, ServerScriptService, ReplicatedStorage e RemoteEvent.','Entender onde o código roda e como funciona a comunicação cliente-servidor.','RemoteEvent envia uma solicitação do cliente para o servidor sem mover a lógica do servidor para o cliente.'],['Nível 5 — Dados','Aprenda DataStore, dados do jogador, inventário simples e validação.','Guardar o progresso do jogador para usar em sessões futuras.','DataStore roda no servidor e precisa de tratamento de erros e validação.']],
  fil:[['Level 1 — Basics','Alamin ang scripts, Roblox Studio, Luau, print(), comments, variables, at data types.','Mag-save ng impormasyon at magpakita ng resulta habang natututo ng Luau.','Gumawa ng values, ilagay sa variables, at ipakita gamit ang print().'],['Level 2 — Logic','Alamin ang if/else, operators, loops, functions, at tables para sa decisions.','Gawing marunong magdesisyon at umulit ng tasks ang script.','Sinusuri ng condition ang value at tumatakbo ang block kapag true.'],['Level 3 — Roblox','Gumawa ng moving Parts, buttons, teleport, damage, leaderstats, at simpleng GUI.','Ikonekta ang Luau code sa Roblox objects at events.','Ang events tulad ng Touched ay nagpapatakbo ng function kapag may nangyari.'],['Level 4 — Client at Server','Kilalanin ang Script, LocalScript, ServerScriptService, ReplicatedStorage, at RemoteEvent.','Alamin kung saan tumatakbo ang code at paano nag-uusap ang client at server.','Ang RemoteEvent ay nagpapadala ng request mula client papunta server.'],['Level 5 — Data','Alamin ang DataStore, player data, simpleng inventory, at data validation.','I-save ang progress ng player para magamit sa susunod na session.','Gumagana ang DataStore sa server at kailangan ng error handling at validation.']],
  tr:[['Seviye 1 — Temeller','Script, Roblox Studio, Luau, print(), yorumlar, değişkenler ve veri türlerini öğren.','Luau öğrenirken bilgileri saklamayı ve sonuçları göstermeyi öğren.','Değer oluştur, değişkende sakla ve print() ile göster.'],['Seviye 2 — Mantık','Karar oluşturmak için if/else, operatörler, döngüler, fonksiyonlar ve tabloları öğren.','Scriptlerin karar vermesini ve işleri tekrarlamasını sağla.','Koşul bir değeri kontrol eder; doğruysa kod bloğu çalışır.'],['Seviye 3 — Roblox','Hareketli Part, buton, teleport, hasar, leaderstats ve basit GUI yap.','Luau kodunu Roblox nesneleri ve olaylarıyla bağla.','Touched gibi olaylar oyunda bir şey olduğunda fonksiyon çalıştırır.'],['Seviye 4 — İstemci ve Sunucu','Script, LocalScript, ServerScriptService, ReplicatedStorage ve RemoteEvent öğren.','Kodun nerede çalıştığını ve istemci-sunucu iletişimini anla.','RemoteEvent istemciden sunucuya istek gönderebilir.'],['Seviye 5 — Veri','DataStore, oyuncu verisi, basit envanter ve veri doğrulamayı öğren.','Oyuncu ilerlemesini sonraki oturumlar için kaydet.','DataStore sunucuda çalışır ve hata yönetimi ile doğrulama ister.']],
  fr:[['Niveau 1 — Bases','Découvrez les scripts, Roblox Studio, Luau, print(), commentaires, variables et types.','Stocker des informations et afficher des résultats en apprenant Luau.','Créez des valeurs, stockez-les dans des variables et affichez-les avec print().'],['Niveau 2 — Logique','Apprenez if/else, opérateurs, boucles, fonctions et tables pour créer des décisions.','Faire choisir des actions et répéter des tâches aux scripts.','Une condition vérifie une valeur et exécute son bloc si elle est vraie.'],['Niveau 3 — Roblox','Créez des Parts mobiles, boutons, téléportation, dégâts, leaderstats et GUI simple.','Relier le code Luau aux objets et événements Roblox.','Des événements comme Touched exécutent une fonction lorsqu’un événement arrive.'],['Niveau 4 — Client et serveur','Découvrez Script, LocalScript, ServerScriptService, ReplicatedStorage et RemoteEvent.','Comprendre où s’exécute le code et la communication client-serveur.','RemoteEvent envoie une demande du client vers le serveur.'],['Niveau 5 — Données','Apprenez DataStore, données joueur, inventaire simple et validation.','Sauvegarder la progression pour les prochaines sessions.','DataStore fonctionne côté serveur avec gestion des erreurs et validation.']],
  de:[['Level 1 — Grundlagen','Lerne Scripts, Roblox Studio, Luau, print(), Kommentare, Variablen und Datentypen kennen.','Informationen speichern und Ergebnisse anzeigen, während du Luau lernst.','Erstelle Werte, speichere sie in Variablen und zeige sie mit print().'],['Level 2 — Logik','Lerne if/else, Operatoren, Schleifen, Funktionen und Tabellen für Entscheidungen.','Scripts sollen Aktionen wählen und Aufgaben wiederholen können.','Eine Bedingung prüft einen Wert und führt den Block aus, wenn sie wahr ist.'],['Level 3 — Roblox','Erstelle bewegliche Parts, Buttons, Teleport, Schaden, leaderstats und einfache GUI.','Verbinde Luau-Code mit Roblox-Objekten und Ereignissen.','Events wie Touched führen eine Funktion aus, wenn etwas im Spiel passiert.'],['Level 4 — Client & Server','Verstehe Script, LocalScript, ServerScriptService, ReplicatedStorage und RemoteEvent.','Verstehe, wo Code läuft und wie Client und Server kommunizieren.','RemoteEvent kann eine Anfrage vom Client an den Server senden.'],['Level 5 — Daten','Lerne DataStore, Spielerdaten, ein einfaches Inventar und Datenvalidierung.','Spielerfortschritt für spätere Sitzungen speichern.','DataStore läuft auf dem Server und braucht Fehlerbehandlung und Validierung.']],
  ja:[['レベル1 — 基礎','Script、Roblox Studio、Luau、print()、コメント、変数、データ型を学びます。','Luauの基礎を学びながら情報を保存し、結果を表示します。','値を作り、変数に保存し、print()で表示します。'],['レベル2 — ロジック','if/else、演算子、ループ、関数、テーブルでプログラムの判断を学びます。','スクリプトに判断や繰り返しをさせます。','条件を確認し、trueならコードブロックを実行します。'],['レベル3 — Roblox','動くPart、ボタン、テレポート、ダメージ、leaderstats、簡単なGUIを作ります。','LuauコードをRobloxのオブジェクトやイベントにつなげます。','Touchedなどのイベントで、ゲーム内の出来事に反応できます。'],['レベル4 — クライアントとサーバー','Script、LocalScript、ServerScriptService、ReplicatedStorage、RemoteEventを学びます。','コードが動く場所と通信の基本を理解します。','RemoteEventでクライアントからサーバーへリクエストを送れます。'],['レベル5 — データ','DataStore、プレイヤーデータ、簡単なインベントリ、データ検証を学びます。','プレイヤーの進行を次回のセッションでも使えるよう保存します。','DataStoreはサーバーで動き、エラー処理とデータ検証が必要です。']],
  ko:[['레벨 1 — 기초','Script, Roblox Studio, Luau, print(), 주석, 변수와 데이터 형식을 배웁니다.','Luau를 배우며 정보를 저장하고 결과를 표시합니다.','값을 만들고 변수에 저장한 뒤 print()로 표시합니다.'],['레벨 2 — 로직','if/else, 연산자, 반복문, 함수와 테이블로 프로그램의 판단을 배웁니다.','스크립트가 판단하고 작업을 반복하게 만듭니다.','조건을 확인하고 참이면 코드 블록을 실행합니다.'],['레벨 3 — Roblox','움직이는 Part, 버튼, 순간이동, 데미지, leaderstats와 간단한 GUI를 만듭니다.','Luau 코드를 Roblox 객체와 이벤트에 연결합니다.','Touched 같은 이벤트로 게임에서 일어난 일을 감지합니다.'],['레벨 4 — 클라이언트와 서버','Script, LocalScript, ServerScriptService, ReplicatedStorage와 RemoteEvent를 배웁니다.','코드가 실행되는 위치와 통신 방법을 이해합니다.','RemoteEvent로 클라이언트에서 서버로 요청을 보낼 수 있습니다.'],['레벨 5 — 데이터','DataStore, 플레이어 데이터, 간단한 인벤토리와 데이터 검증을 배웁니다.','플레이어 진행 상황을 다음 세션에서도 사용할 수 있게 저장합니다.','DataStore는 서버에서 실행되며 오류 처리와 검증이 필요합니다.']],
  zh:[['第1级 — 基础','学习脚本、Roblox Studio、Luau、print()、注释、变量和数据类型。','学习 Luau 基础时保存信息并显示结果。','创建值，保存到变量，再用 print() 显示。'],['第2级 — 逻辑','学习 if/else、运算符、循环、函数和表格来制作程序逻辑。','让脚本能够做判断并重复任务。','条件会检查数值，条件为真时执行代码块。'],['第3级 — Roblox','制作移动 Part、按钮、传送、伤害、leaderstats 和简单 GUI。','把 Luau 代码连接到 Roblox 对象和事件。','Touched 等事件可以在游戏发生事情时运行函数。'],['第4级 — 客户端与服务器','了解 Script、LocalScript、ServerScriptService、ReplicatedStorage 和 RemoteEvent。','理解代码运行位置以及客户端与服务器的通信。','RemoteEvent 可以从客户端向服务器发送请求。'],['第5级 — 数据','学习 DataStore、玩家数据、简单背包和数据验证。','保存玩家进度，让下次游戏还能使用。','DataStore 在服务器运行，需要错误处理和数据验证。']],
  'zh-TW':[['第1級 — 基礎','學習腳本、Roblox Studio、Luau、print()、註解、變數與資料型別。','學習 Luau 基礎時儲存資訊並顯示結果。','建立值，存入變數，再用 print() 顯示。'],['第2級 — 邏輯','學習 if/else、運算子、迴圈、函式與表格來製作程式邏輯。','讓腳本能做判斷並重複工作。','條件會檢查數值，為真時執行程式區塊。'],['第3級 — Roblox','製作移動 Part、按鈕、傳送、傷害、leaderstats 與簡單 GUI。','把 Luau 程式碼連接到 Roblox 物件與事件。','Touched 等事件可在遊戲發生事情時執行函式。'],['第4級 — 用戶端與伺服器','了解 Script、LocalScript、ServerScriptService、ReplicatedStorage 與 RemoteEvent。','理解程式碼執行位置及用戶端與伺服器的通訊。','RemoteEvent 可以從用戶端向伺服器傳送請求。'],['第5級 — 資料','學習 DataStore、玩家資料、簡單背包與資料驗證。','儲存玩家進度，讓下次遊戲也能使用。','DataStore 在伺服器運作，需要錯誤處理與資料驗證。']],
  ru:[['Уровень 1 — Основы','Изучи скрипты, Roblox Studio, Luau, print(), комментарии, переменные и типы данных.','Сохраняй информацию и показывай результаты при изучении Luau.','Создай значение, сохрани его в переменной и выведи через print().'],['Уровень 2 — Логика','Изучи if/else, операторы, циклы, функции и таблицы для принятия решений.','Позволь скриптам выбирать действия и повторять задачи.','Условие проверяет значение и запускает блок, если оно истинно.'],['Уровень 3 — Roblox','Создавай движущиеся Part, кнопки, телепорт, урон, leaderstats и простую GUI.','Соединяй код Luau с объектами и событиями Roblox.','События вроде Touched запускают функцию при событии в игре.'],['Уровень 4 — Клиент и сервер','Изучи Script, LocalScript, ServerScriptService, ReplicatedStorage и RemoteEvent.','Пойми, где выполняется код и как общаются клиент и сервер.','RemoteEvent отправляет запрос от клиента к серверу.'],['Уровень 5 — Данные','Изучи DataStore, данные игрока, простой инвентарь и проверку данных.','Сохраняй прогресс игрока для следующих сессий.','DataStore работает на сервере и требует обработки ошибок и проверки данных.']],
  hi:[['स्तर 1 — मूल बातें','Script, Roblox Studio, Luau, print(), comments, variables और data types सीखें।','Luau सीखते हुए जानकारी सहेजें और परिणाम दिखाएँ।','Value बनाएँ, variable में रखें और print() से दिखाएँ।'],['स्तर 2 — लॉजिक','if/else, operators, loops, functions और tables से program decisions सीखें।','Script को निर्णय लेने और काम दोहराने योग्य बनाएँ।','Condition value जाँचती है और true होने पर code block चलता है।'],['स्तर 3 — Roblox','Moving Parts, buttons, teleport, damage, leaderstats और simple GUI बनाएँ।','Luau code को Roblox objects और events से जोड़ें।','Touched जैसे events game में कुछ होने पर function चलाते हैं।'],['स्तर 4 — Client और Server','Script, LocalScript, ServerScriptService, ReplicatedStorage और RemoteEvent समझें।','समझें कि code कहाँ चलता है और client-server communication कैसे होता है।','RemoteEvent client से server को request भेज सकता है।'],['स्तर 5 — Data','DataStore, player data, simple inventory और data validation सीखें।','Player progress को अगली sessions के लिए save करें।','DataStore server पर चलता है और error handling व validation चाहिए।']],
  ar:[['المستوى 1 — الأساسيات','تعلّم السكربتات وRoblox Studio وLuau وprint() والتعليقات والمتغيرات وأنواع البيانات.','حفظ المعلومات وعرض النتائج أثناء تعلم أساسيات Luau.','أنشئ قيمة واحفظها في متغير ثم اعرضها باستخدام print().'],['المستوى 2 — المنطق','تعلّم if/else والعوامل والحلقات والدوال والجداول لبناء منطق البرنامج.','اجعل السكربت يقرر الإجراءات ويكرر المهام.','يفحص الشرط قيمة ويشغّل كتلة الكود عندما يكون صحيحاً.'],['المستوى 3 — Roblox','أنشئ Parts متحركة وأزراراً وانتقالاً وضرراً وleaderstats وواجهة بسيطة.','اربط كود Luau بعناصر وأحداث Roblox.','أحداث مثل Touched تشغّل دالة عند حدوث شيء في اللعبة.'],['المستوى 4 — العميل والخادم','تعرّف على Script وLocalScript وServerScriptService وReplicatedStorage وRemoteEvent.','افهم مكان تشغيل الكود وكيف يتواصل العميل والخادم.','يسمح RemoteEvent بإرسال طلب من العميل إلى الخادم.'],['المستوى 5 — البيانات','تعلّم DataStore وبيانات اللاعب ومخزوناً بسيطاً والتحقق من البيانات.','احفظ تقدم اللاعب لاستخدامه في الجلسات القادمة.','يعمل DataStore على الخادم ويحتاج معالجة أخطاء والتحقق من البيانات.']],
  vi:[['Cấp 1 — Cơ bản','Tìm hiểu script, Roblox Studio, Luau, print(), chú thích, biến và kiểu dữ liệu.','Lưu thông tin và hiển thị kết quả khi học Luau.','Tạo giá trị, lưu vào biến và hiển thị bằng print().'],['Cấp 2 — Logic','Học if/else, toán tử, vòng lặp, hàm và bảng để tạo logic chương trình.','Giúp script đưa ra quyết định và lặp lại công việc.','Điều kiện kiểm tra giá trị và chạy khối mã khi đúng.'],['Cấp 3 — Roblox','Tạo Part chuyển động, nút, dịch chuyển, sát thương, leaderstats và GUI đơn giản.','Kết nối mã Luau với đối tượng và sự kiện Roblox.','Sự kiện như Touched chạy hàm khi có việc xảy ra trong game.'],['Cấp 4 — Client và Server','Tìm hiểu Script, LocalScript, ServerScriptService, ReplicatedStorage và RemoteEvent.','Hiểu nơi mã chạy và cách client-server giao tiếp.','RemoteEvent có thể gửi yêu cầu từ client đến server.'],['Cấp 5 — Dữ liệu','Học DataStore, dữ liệu người chơi, kho đồ đơn giản và xác thực dữ liệu.','Lưu tiến trình người chơi để dùng ở các phiên sau.','DataStore chạy trên server và cần xử lý lỗi cùng xác thực dữ liệu.']],
  th:[['ระดับ 1 — พื้นฐาน','เรียนรู้ Script, Roblox Studio, Luau, print(), คอมเมนต์ ตัวแปร และชนิดข้อมูล','เก็บข้อมูลและแสดงผลขณะเรียนรู้พื้นฐาน Luau','สร้างค่า เก็บในตัวแปร และแสดงด้วย print()'],['ระดับ 2 — ตรรกะ','เรียนรู้ if/else ตัวดำเนินการ ลูป ฟังก์ชัน และตาราง','ทำให้สคริปต์ตัดสินใจและทำงานซ้ำได้','เงื่อนไขตรวจค่าและทำงานเมื่อเป็นจริง'],['ระดับ 3 — Roblox','สร้าง Part เคลื่อนที่ ปุ่ม เทเลพอร์ต ดาเมจ leaderstats และ GUI ง่าย ๆ','เชื่อมโค้ด Luau กับวัตถุและอีเวนต์ Roblox','อีเวนต์อย่าง Touched เรียกฟังก์ชันเมื่อเกิดเหตุการณ์ในเกม'],['ระดับ 4 — Client และ Server','เรียนรู้ Script, LocalScript, ServerScriptService, ReplicatedStorage และ RemoteEvent','เข้าใจตำแหน่งที่โค้ดทำงานและการสื่อสารระหว่าง client กับ server','RemoteEvent ส่งคำขอจาก client ไป server ได้'],['ระดับ 5 — ข้อมูล','เรียนรู้ DataStore ข้อมูลผู้เล่น inventory ง่าย ๆ และการตรวจสอบข้อมูล','บันทึกความคืบหน้าของผู้เล่นเพื่อใช้ครั้งต่อไป','DataStore ทำงานบน server และต้องมีการจัดการข้อผิดพลาดและตรวจสอบข้อมูล']],
  pl:[['Poziom 1 — Podstawy','Poznaj skrypty, Roblox Studio, Luau, print(), komentarze, zmienne i typy danych.','Zapisuj informacje i pokazuj wyniki podczas nauki Luau.','Utwórz wartość, zapisz ją w zmiennej i pokaż przez print().'],['Poziom 2 — Logika','Poznaj if/else, operatory, pętle, funkcje i tabele do budowania logiki.','Spraw, aby skrypty podejmowały decyzje i powtarzały zadania.','Warunek sprawdza wartość i uruchamia blok, gdy jest prawdziwy.'],['Poziom 3 — Roblox','Twórz ruchome Parts, przyciski, teleport, obrażenia, leaderstats i proste GUI.','Łącz kod Luau z obiektami i zdarzeniami Roblox.','Zdarzenia takie jak Touched uruchamiają funkcję po zdarzeniu w grze.'],['Poziom 4 — Klient i serwer','Poznaj Script, LocalScript, ServerScriptService, ReplicatedStorage i RemoteEvent.','Zrozum, gdzie działa kod i jak klient komunikuje się z serwerem.','RemoteEvent może wysłać żądanie z klienta do serwera.'],['Poziom 5 — Dane','Poznaj DataStore, dane gracza, prosty ekwipunek i walidację danych.','Zapisuj postęp gracza na kolejne sesje.','DataStore działa na serwerze i wymaga obsługi błędów oraz walidacji.']],
  it:[['Livello 1 — Basi','Scopri script, Roblox Studio, Luau, print(), commenti, variabili e tipi di dati.','Salva informazioni e mostra risultati mentre impari Luau.','Crea valori, salvali in variabili e mostrali con print().'],['Livello 2 — Logica','Impara if/else, operatori, cicli, funzioni e tabelle per creare decisioni.','Permetti agli script di scegliere azioni e ripetere attività.','Una condizione controlla un valore ed esegue il blocco quando è vera.'],['Livello 3 — Roblox','Crea Part mobili, pulsanti, teletrasporto, danno, leaderstats e GUI semplice.','Collega il codice Luau a oggetti ed eventi Roblox.','Eventi come Touched eseguono una funzione quando succede qualcosa.'],['Livello 4 — Client e Server','Scopri Script, LocalScript, ServerScriptService, ReplicatedStorage e RemoteEvent.','Capisci dove gira il codice e come comunicano client e server.','RemoteEvent può inviare una richiesta dal client al server.'],['Livello 5 — Dati','Impara DataStore, dati giocatore, inventario semplice e validazione.','Salva i progressi del giocatore per le sessioni future.','DataStore gira sul server e richiede gestione errori e validazione.']],
  'pt-PT':[['Nível 1 — Básico','Conhece scripts, Roblox Studio, Luau, print(), comentários, variáveis e tipos de dados.','Guardar informação e mostrar resultados enquanto aprendes Luau.','Cria valores, guarda-os em variáveis e mostra-os com print().'],['Nível 2 — Lógica','Aprende if/else, operadores, ciclos, funções e tabelas para criar decisões.','Permitir que os scripts escolham ações e repitam tarefas.','Uma condição verifica um valor e executa o bloco quando é verdadeira.'],['Nível 3 — Roblox','Cria Parts móveis, botões, teletransporte, dano, leaderstats e GUI simples.','Ligar código Luau a objetos e eventos Roblox.','Eventos como Touched executam uma função quando algo acontece.'],['Nível 4 — Cliente e Servidor','Conhece Script, LocalScript, ServerScriptService, ReplicatedStorage e RemoteEvent.','Perceber onde o código corre e como cliente e servidor comunicam.','RemoteEvent envia um pedido do cliente para o servidor.'],['Nível 5 — Dados','Aprende DataStore, dados do jogador, inventário simples e validação.','Guardar o progresso do jogador para sessões futuras.','DataStore funciona no servidor e precisa de tratamento de erros e validação.']]
};

const fallbackTutorial = tutorialText.en;
const commonExtra = {myScriptsButton:'My Scripts',scriptCreator:'Script creator',websiteLink:'Website link',viewScript:'Script',copyRaw:'Copy Raw Link',copyScript:'Copy Script',copiedScript:'Copied',navWorkspace:'Script',workspaceTitle:'Script',workspaceDesc:'View and manage your saved scripts.',createScript:'Create Script',createDesc:'Write your Luau script, then save it to your account.',profile:'Profile',profileGuest:'Log in to view your profile.',notLoggedIn:'Not logged in',loggedIn:'Logged in',logout:'Logout',scriptFilename:'Script filename',private:'Private',public:'Public',saveScript:'Save Script',newScript:'New Script',savedScripts:'Saved Scripts',newScriptName:'New script',saved:'Script saved.',updated:'Script updated.',deleted:'Script deleted.',confirmDelete:'Delete this script?',needLoginWorkspace:'Log in to use your script workspace.',raw:'Raw →',edit:'Edit',delete:'Delete',navChat:'Global Chat',chatTitle:'Global Chat',chatDesc:'Talk with other CB ScriptStore users in real time.',onlineNow:'Online Now',chatLogin:'Register or login to join the global chat.',chatPlaceholder:'Write a message...',send:'Send',noMessages:'No messages yet. Start the conversation!',chatError:'Chat could not be loaded.'};
for (const lang of Object.keys(ui)) Object.assign(ui[lang], commonExtra);
const chatByLang={
  id:['Chat Global','Ngobrol dengan pengguna CB ScriptStore lainnya secara langsung.','Sedang Online','Daftar atau login untuk ikut chat global.','Tulis pesan...','Kirim','Belum ada pesan. Mulai percakapan!','Chat gagal dimuat.'],
  en:['Global Chat','Talk with other CB ScriptStore users in real time.','Online Now','Register or log in to join the global chat.','Write a message...','Send','No messages yet. Start the conversation!','Chat could not be loaded.'],
  es:['Chat Global','Habla con otros usuarios de CB ScriptStore en tiempo real.','En línea ahora','Regístrate o inicia sesión para entrar al chat global.','Escribe un mensaje...','Enviar','Aún no hay mensajes. ¡Inicia la conversación!','No se pudo cargar el chat.'],
  pt:['Chat Global','Converse com outros usuários do CB ScriptStore em tempo real.','Online agora','Cadastre-se ou entre para participar do chat global.','Escreva uma mensagem...','Enviar','Ainda não há mensagens. Comece a conversa!','Não foi possível carregar o chat.'],
  fil:['Global Chat','Makipag-usap sa ibang CB ScriptStore users nang real time.','Online Ngayon','Mag-register o mag-login para sumali sa global chat.','Sumulat ng mensahe...','Ipadala','Wala pang mensahe. Simulan ang usapan!','Hindi ma-load ang chat.'],
  tr:['Global Sohbet','Diğer CB ScriptStore kullanıcılarıyla gerçek zamanlı konuş.','Şimdi Çevrimiçi','Global sohbete katılmak için kayıt ol veya giriş yap.','Mesaj yaz...','Gönder','Henüz mesaj yok. Sohbeti başlat!','Sohbet yüklenemedi.'],
  fr:['Chat Global','Discutez avec les autres utilisateurs de CB ScriptStore en temps réel.','En ligne','Inscrivez-vous ou connectez-vous pour rejoindre le chat global.','Écrivez un message...','Envoyer','Aucun message. Commencez la conversation !','Impossible de charger le chat.'],
  de:['Globaler Chat','Sprich in Echtzeit mit anderen CB ScriptStore-Nutzern.','Jetzt online','Registriere dich oder melde dich an, um am globalen Chat teilzunehmen.','Nachricht schreiben...','Senden','Noch keine Nachrichten. Starte das Gespräch!','Chat konnte nicht geladen werden.'],
  ja:['グローバルチャット','他のCB ScriptStoreユーザーとリアルタイムで話せます。','オンライン中','グローバルチャットには登録またはログインが必要です。','メッセージを書く...','送信','まだメッセージはありません。会話を始めましょう！','チャットを読み込めませんでした。'],
  ko:['글로벌 채팅','다른 CB ScriptStore 사용자와 실시간으로 대화하세요.','현재 온라인','글로벌 채팅에 참여하려면 가입하거나 로그인하세요.','메시지를 입력하세요...','보내기','아직 메시지가 없습니다. 대화를 시작하세요!','채팅을 불러오지 못했습니다.'],
  zh:['全球聊天','与其他 CB ScriptStore 用户实时聊天。','当前在线','注册或登录后即可加入全球聊天。','输入消息...','发送','还没有消息。开始聊天吧！','无法加载聊天。'],
  'zh-TW':['全球聊天','與其他 CB ScriptStore 使用者即時聊天。','目前在線','註冊或登入即可加入全球聊天。','輸入訊息...','發送','還沒有訊息。開始聊天吧！','無法載入聊天。'],
  ru:['Глобальный чат','Общайтесь с другими пользователями CB ScriptStore в реальном времени.','Сейчас онлайн','Зарегистрируйтесь или войдите, чтобы участвовать в глобальном чате.','Введите сообщение...','Отправить','Сообщений пока нет. Начните разговор!','Не удалось загрузить чат.'],
  hi:['ग्लोबल चैट','अन्य CB ScriptStore उपयोगकर्ताओं से रीयल-टाइम में बात करें।','अभी ऑनलाइन','ग्लोबल चैट में शामिल होने के लिए रजिस्टर या लॉगिन करें।','संदेश लिखें...','भेजें','अभी कोई संदेश नहीं है। बातचीत शुरू करें!','चैट लोड नहीं हो सकी।'],
  ar:['الدردشة العامة','تحدث مع مستخدمي CB ScriptStore الآخرين في الوقت الفعلي.','متصلون الآن','سجّل أو ادخل للمشاركة في الدردشة العامة.','اكتب رسالة...','إرسال','لا توجد رسائل بعد. ابدأ المحادثة!','تعذر تحميل الدردشة.'],
  vi:['Chat toàn cầu','Trò chuyện với người dùng CB ScriptStore khác theo thời gian thực.','Đang online','Đăng ký hoặc đăng nhập để tham gia chat toàn cầu.','Viết tin nhắn...','Gửi','Chưa có tin nhắn. Hãy bắt đầu cuộc trò chuyện!','Không thể tải chat.'],
  th:['แชตทั่วโลก','พูดคุยกับผู้ใช้ CB ScriptStore คนอื่นแบบเรียลไทม์','ออนไลน์ตอนนี้','สมัครสมาชิกหรือเข้าสู่ระบบเพื่อเข้าร่วมแชตทั่วโลก','พิมพ์ข้อความ...','ส่ง','ยังไม่มีข้อความ เริ่มการสนทนาได้เลย!','โหลดแชตไม่สำเร็จ'],
  pl:['Czat globalny','Rozmawiaj w czasie rzeczywistym z innymi użytkownikami CB ScriptStore.','Online teraz','Zarejestruj się lub zaloguj, aby dołączyć do czatu globalnego.','Napisz wiadomość...','Wyślij','Brak wiadomości. Rozpocznij rozmowę!','Nie udało się załadować czatu.'],
  it:['Chat globale','Parla in tempo reale con altri utenti di CB ScriptStore.','Online ora','Registrati o accedi per partecipare alla chat globale.','Scrivi un messaggio...','Invia','Nessun messaggio. Inizia la conversazione!','Impossibile caricare la chat.'],
  'pt-PT':['Chat Global','Conversa com outros utilizadores do CB ScriptStore em tempo real.','Online agora','Regista-te ou inicia sessão para participar no chat global.','Escreve uma mensagem...','Enviar','Ainda não há mensagens. Começa a conversa!','Não foi possível carregar o chat.']
};
const chatKeys=['chatTitle','chatDesc','onlineNow','chatLogin','chatPlaceholder','send','noMessages','chatError'];
for(const [lang,vals] of Object.entries(chatByLang)) vals.forEach((v,i)=>ui[lang][chatKeys[i]]=v);

ui.id.myScriptsButton='Lihat Script Saya'; ui.id.scriptCreator='Pembuat script'; ui.id.websiteLink='Link website'; ui.id.viewScript='Script'; ui.id.copyScript='Salin Script'; ui.id.copiedScript='Tersalin!'; ui.id.navWorkspace='Script'; ui.id.workspaceTitle='Script'; ui.id.workspaceDesc='Lihat dan kelola script yang sudah kamu simpan.'; ui.id.createScript='Buat Script'; ui.id.createDesc='Tulis script Luau kamu, lalu simpan ke akunmu.'; ui.id.profile='Profil'; ui.id.profileGuest='Login untuk melihat profil.'; ui.id.notLoggedIn='Belum login'; ui.id.loggedIn='Sudah login';
ui.id.myScriptsButton='Lihat Script Saya'; ui.id.scriptCreator='Pembuat script'; ui.id.websiteLink='Link website'; ui.id.viewScript='Script'; ui.id.copyScript='Salin Script'; ui.id.copiedScript='Tersalin!'; ui.id.navWorkspace='Script'; ui.id.workspaceTitle='Script'; ui.id.workspaceDesc='Lihat dan kelola script yang sudah kamu simpan.'; ui.id.logout='Logout'; ui.id.scriptFilename='Nama file script'; ui.id.private='Private'; ui.id.public='Public'; ui.id.saveScript='Simpan Script'; ui.id.newScript='Script Baru'; ui.id.savedScripts='Script Tersimpan'; ui.id.newScriptName='script-baru.lua'; ui.id.saved='Script berhasil disimpan.'; ui.id.updated='Script berhasil diperbarui.'; ui.id.deleted='Script berhasil dihapus.'; ui.id.confirmDelete='Hapus script ini?'; ui.id.needLoginWorkspace='Login untuk menggunakan workspace script kamu.'; ui.id.raw='Raw →'; ui.id.edit='Edit'; ui.id.delete='Hapus';

const extraByLang={
 es:['Mis Scripts','Crea, edita, guarda y abre enlaces Raw para tus scripts.','Cerrar sesión','Nombre del script','Privado','Público','Guardar script','Nuevo script','Scripts guardados','script-nuevo.lua','Script guardado.','Script actualizado.','Script eliminado.','¿Eliminar este script?','Inicia sesión para usar tu espacio de scripts.','Raw →','Editar','Eliminar'],
 pt:['Meus Scripts','Crie, edite, guarde e abra links Raw dos seus scripts.','Sair','Nome do script','Privado','Público','Guardar Script','Novo Script','Scripts guardados','script-novo.lua','Script guardado.','Script atualizado.','Script eliminado.','Eliminar este script?','Entre para usar o seu espaço de scripts.','Raw →','Editar','Eliminar'],
 fil:['Aking Scripts','Gumawa, mag-edit, mag-save, at magbukas ng Raw links para sa scripts mo.','Logout','Pangalan ng script','Pribado','Publiko','I-save ang Script','Bagong Script','Mga Naka-save na Script','bagong-script.lua','Naka-save ang script.','Na-update ang script.','Na-delete ang script.','I-delete ang script?','Mag-login para gamitin ang script workspace.','Raw →','I-edit','I-delete'],
 tr:['Scriptlerim','Scriptlerini oluştur, düzenle, kaydet ve Raw bağlantılarını aç.','Çıkış','Script adı','Özel','Herkese açık','Scripti Kaydet','Yeni Script','Kayıtlı Scriptler','yeni-script.lua','Script kaydedildi.','Script güncellendi.','Script silindi.','Bu script silinsin mi?','Script çalışma alanını kullanmak için giriş yap.','Raw →','Düzenle','Sil'],
 fr:['Mes Scripts','Créez, modifiez, enregistrez et ouvrez les liens Raw de vos scripts.','Déconnexion','Nom du script','Privé','Public','Enregistrer le script','Nouveau script','Scripts enregistrés','nouveau-script.lua','Script enregistré.','Script mis à jour.','Script supprimé.','Supprimer ce script ?','Connectez-vous pour utiliser votre espace de scripts.','Raw →','Modifier','Supprimer'],
 de:['Meine Scripts','Erstelle, bearbeite, speichere Scripts und öffne ihre Raw-Links.','Abmelden','Scriptname','Privat','Öffentlich','Script speichern','Neues Script','Gespeicherte Scripts','neues-script.lua','Script gespeichert.','Script aktualisiert.','Script gelöscht.','Dieses Script löschen?','Melde dich an, um deinen Script-Bereich zu nutzen.','Raw →','Bearbeiten','Löschen'],
 ja:['マイスクリプト','スクリプトを作成・編集・保存し、Rawリンクを開けます。','ログアウト','スクリプト名','非公開','公開','保存','新しいスクリプト','保存済みスクリプト','new-script.lua','保存しました。','更新しました。','削除しました。','このスクリプトを削除しますか？','スクリプトワークスペースを使うにはログインしてください。','Raw →','編集','削除'],
 ko:['내 스크립트','스크립트를 만들고 편집하고 저장하고 Raw 링크를 열 수 있습니다.','로그아웃','스크립트 이름','비공개','공개','스크립트 저장','새 스크립트','저장된 스크립트','새-스크립트.lua','스크립트가 저장되었습니다.','스크립트가 업데이트되었습니다.','스크립트가 삭제되었습니다.','이 스크립트를 삭제할까요?','스크립트 작업 공간을 사용하려면 로그인하세요.','Raw →','편집','삭제'],
 zh:['我的脚本','创建、编辑、保存脚本并打开 Raw 链接。','退出登录','脚本文件名','私有','公开','保存脚本','新建脚本','已保存脚本','新脚本.lua','脚本已保存。','脚本已更新。','脚本已删除。','确定删除这个脚本吗？','登录后即可使用脚本工作区。','Raw →','编辑','删除'],
 'zh-TW':['我的腳本','建立、編輯、儲存腳本並開啟 Raw 連結。','登出','腳本檔名','私人','公開','儲存腳本','新增腳本','已儲存腳本','新腳本.lua','腳本已儲存。','腳本已更新。','腳本已刪除。','確定刪除這個腳本嗎？','登入後即可使用腳本工作區。','Raw →','編輯','刪除'],
 ru:['Мои скрипты','Создавай, редактируй, сохраняй скрипты и открывай Raw-ссылки.','Выйти','Имя скрипта','Приватный','Публичный','Сохранить скрипт','Новый скрипт','Сохранённые скрипты','новый-скрипт.lua','Скрипт сохранён.','Скрипт обновлён.','Скрипт удалён.','Удалить этот скрипт?','Войди, чтобы использовать рабочее пространство скриптов.','Raw →','Изменить','Удалить'],
 hi:['मेरे Scripts','अपने scripts बनाएँ, संपादित करें, सेव करें और Raw links खोलें।','लॉगआउट','Script नाम','निजी','सार्वजनिक','Script सेव करें','नया Script','सेव किए गए Scripts','नया-script.lua','Script सेव हो गया।','Script अपडेट हो गया।','Script डिलीट हो गया।','यह script डिलीट करें?','Script workspace के लिए लॉगिन करें।','Raw →','संपादित करें','डिलीट'],
 ar:['سكريبتاتي','أنشئ سكربتاتك وعدّلها واحفظها وافتح روابط Raw.','تسجيل الخروج','اسم السكربت','خاص','عام','حفظ السكربت','سكربت جديد','السكربتات المحفوظة','سكربت-جديد.lua','تم حفظ السكربت.','تم تحديث السكربت.','تم حذف السكربت.','هل تريد حذف هذا السكربت؟','سجّل الدخول لاستخدام مساحة السكربتات.','Raw →','تعديل','حذف'],
 vi:['Script của tôi','Tạo, chỉnh sửa, lưu và mở liên kết Raw cho script.','Đăng xuất','Tên script','Riêng tư','Công khai','Lưu Script','Script mới','Script đã lưu','script-moi.lua','Đã lưu script.','Đã cập nhật script.','Đã xóa script.','Xóa script này?','Đăng nhập để dùng khu vực script.','Raw →','Sửa','Xóa'],
 th:['สคริปต์ของฉัน','สร้าง แก้ไข บันทึก และเปิดลิงก์ Raw ของสคริปต์','ออกจากระบบ','ชื่อสคริปต์','ส่วนตัว','สาธารณะ','บันทึกสคริปต์','สคริปต์ใหม่','สคริปต์ที่บันทึก','สคริปต์ใหม่.lua','บันทึกสคริปต์แล้ว','อัปเดตสคริปต์แล้ว','ลบสคริปต์แล้ว','ต้องการลบสคริปต์นี้หรือไม่','เข้าสู่ระบบเพื่อใช้พื้นที่สคริปต์','Raw →','แก้ไข','ลบ'],
 pl:['Moje skrypty','Twórz, edytuj, zapisuj skrypty i otwieraj ich linki Raw.','Wyloguj','Nazwa skryptu','Prywatny','Publiczny','Zapisz skrypt','Nowy skrypt','Zapisane skrypty','nowy-skrypt.lua','Skrypt zapisany.','Skrypt zaktualizowany.','Skrypt usunięty.','Usunąć ten skrypt?','Zaloguj się, aby używać przestrzeni skryptów.','Raw →','Edytuj','Usuń'],
 it:['I miei script','Crea, modifica, salva script e apri i relativi link Raw.','Esci','Nome script','Privato','Pubblico','Salva script','Nuovo script','Script salvati','nuovo-script.lua','Script salvato.','Script aggiornato.','Script eliminato.','Eliminare questo script?','Accedi per usare lo spazio script.','Raw →','Modifica','Elimina'],
 'pt-PT':['Os meus Scripts','Cria, edita, guarda e abre links Raw dos teus scripts.','Terminar sessão','Nome do script','Privado','Público','Guardar Script','Novo Script','Scripts guardados','novo-script.lua','Script guardado.','Script atualizado.','Script eliminado.','Eliminar este script?','Inicia sessão para usar o teu espaço de scripts.','Raw →','Editar','Eliminar']
};
const featureI18n={
  'id':{navScript:'Script',exploreTitle:'Public Script',exploreDesc:'Cari script publik dari pengguna yang terdaftar.',publicSearchPlaceholder:'Cari script publik...',publishScript:'Upload',publishTitle:'Pilih Script untuk Dipublic',publishDesc:'Pilih salah satu script milikmu untuk dijadikan Public.',needLoginPublic:'Login untuk melihat Public Script.',noScriptsToPublish:'Belum ada script. Buat script terlebih dahulu.',publishNow:'Jadikan Public',alreadyPublic:'Sudah Public',published:'Script berhasil dibuat Public.',loadingScripts:'Memuat script...',publicBy:'Dibuat oleh',emptyPublicScripts:'Belum ada script publik.',viewScript:'Script',copyRaw:'Salin Link Raw'},
  'en':{navScript:'Scripts',exploreTitle:'Public Scripts',exploreDesc:'Search public scripts from registered users.',publicSearchPlaceholder:'Search public scripts...',publishScript:'Upload',publishTitle:'Choose a Script to Publish',publishDesc:'Choose one of your scripts to make it public.',needLoginPublic:'Log in to view Public Scripts.',noScriptsToPublish:'No scripts yet. Create a script first.',publishNow:'Make Public',alreadyPublic:'Already Public',published:'Script is now public.',loadingScripts:'Loading scripts...',publicBy:'Created by',emptyPublicScripts:'No public scripts yet.',viewScript:'Script',copyRaw:'Copy Raw Link'},
  'es':{navScript:'Scripts',exploreTitle:'Scripts públicos',exploreDesc:'Busca scripts públicos de usuarios registrados.',publicSearchPlaceholder:'Buscar scripts públicos...',publishScript:'Subir',publishTitle:'Elegir un script para publicar',publishDesc:'Elige uno de tus scripts para hacerlo público.',needLoginPublic:'Inicia sesión para ver los scripts públicos.',noScriptsToPublish:'Aún no tienes scripts. Crea uno primero.',publishNow:'Hacer público',alreadyPublic:'Ya es público',published:'El script ahora es público.',loadingScripts:'Cargando scripts...',publicBy:'Creado por',emptyPublicScripts:'Aún no hay scripts públicos.',viewScript:'Script',copyRaw:'Copiar enlace Raw'},
  'pt':{navScript:'Scripts',exploreTitle:'Scripts públicos',exploreDesc:'Pesquise scripts públicos de usuários cadastrados.',publicSearchPlaceholder:'Pesquisar scripts públicos...',publishScript:'Enviar',publishTitle:'Escolha um script para publicar',publishDesc:'Escolha um dos seus scripts para torná-lo público.',needLoginPublic:'Entre para ver os scripts públicos.',noScriptsToPublish:'Você ainda não tem scripts. Crie um primeiro.',publishNow:'Tornar público',alreadyPublic:'Já é público',published:'O script agora é público.',loadingScripts:'Carregando scripts...',publicBy:'Criado por',emptyPublicScripts:'Ainda não há scripts públicos.',viewScript:'Script',copyRaw:'Copiar link Raw'},
  'fil':{navScript:'Mga Script',exploreTitle:'Public Scripts',exploreDesc:'Maghanap ng public scripts mula sa mga rehistradong user.',publicSearchPlaceholder:'Maghanap ng public scripts...',publishScript:'I-upload',publishTitle:'Pumili ng Script na Ipu-publish',publishDesc:'Pumili ng script mo para gawing public.',needLoginPublic:'Mag-login para makita ang Public Scripts.',noScriptsToPublish:'Wala ka pang script. Gumawa muna.',publishNow:'Gawing Public',alreadyPublic:'Public na',published:'Public na ang script.',loadingScripts:'Nilo-load ang scripts...',publicBy:'Ginawa ni',emptyPublicScripts:'Wala pang public scripts.',viewScript:'Script',copyRaw:'Kopyahin ang Raw link'},
  'tr':{navScript:'Scriptler',exploreTitle:'Herkese Açık Scriptler',exploreDesc:'Kayıtlı kullanıcıların herkese açık scriptlerini ara.',publicSearchPlaceholder:'Herkese açık script ara...',publishScript:'Yükle',publishTitle:'Yayınlanacak Scripti Seç',publishDesc:'Scriptlerinden birini herkese açık yapmak için seç.',needLoginPublic:'Public Scriptleri görmek için giriş yap.',noScriptsToPublish:'Henüz script yok. Önce bir script oluştur.',publishNow:'Herkese Aç',alreadyPublic:'Zaten Herkese Açık',published:'Script artık herkese açık.',loadingScripts:'Scriptler yükleniyor...',publicBy:'Oluşturan',emptyPublicScripts:'Henüz herkese açık script yok.',viewScript:'Script',copyRaw:'Raw bağlantısını kopyala'},
  'fr':{navScript:'Scripts',exploreTitle:'Scripts publics',exploreDesc:'Recherchez les scripts publics des utilisateurs inscrits.',publicSearchPlaceholder:'Rechercher des scripts publics...',publishScript:'Importer',publishTitle:'Choisir un script à publier',publishDesc:'Choisissez un de vos scripts pour le rendre public.',needLoginPublic:'Connectez-vous pour voir les scripts publics.',noScriptsToPublish:'Aucun script. Créez-en un d’abord.',publishNow:'Rendre public',alreadyPublic:'Déjà public',published:'Le script est maintenant public.',loadingScripts:'Chargement des scripts...',publicBy:'Créé par',emptyPublicScripts:'Aucun script public pour le moment.',viewScript:'Script',copyRaw:'Copier le lien Raw'},
  'de':{navScript:'Skripte',exploreTitle:'Öffentliche Skripte',exploreDesc:'Suche öffentliche Skripte registrierter Nutzer.',publicSearchPlaceholder:'Öffentliche Skripte suchen...',publishScript:'Hochladen',publishTitle:'Skript zum Veröffentlichen auswählen',publishDesc:'Wähle eines deiner Skripte aus, um es öffentlich zu machen.',needLoginPublic:'Melde dich an, um öffentliche Skripte zu sehen.',noScriptsToPublish:'Noch keine Skripte. Erstelle zuerst eines.',publishNow:'Öffentlich machen',alreadyPublic:'Bereits öffentlich',published:'Das Skript ist jetzt öffentlich.',loadingScripts:'Skripte werden geladen...',publicBy:'Erstellt von',emptyPublicScripts:'Noch keine öffentlichen Skripte.',viewScript:'Skript',copyRaw:'Raw-Link kopieren'},
  'ja':{navScript:'スクリプト',exploreTitle:'公開スクリプト',exploreDesc:'登録ユーザーの公開スクリプトを検索します。',publicSearchPlaceholder:'公開スクリプトを検索…',publishScript:'アップロード',publishTitle:'公開するスクリプトを選択',publishDesc:'自分のスクリプトから公開するものを選択してください。',needLoginPublic:'公開スクリプトを見るにはログインしてください。',noScriptsToPublish:'スクリプトがありません。まず作成してください。',publishNow:'公開する',alreadyPublic:'公開済み',published:'スクリプトを公開しました。',loadingScripts:'スクリプトを読み込み中…',publicBy:'作成者',emptyPublicScripts:'公開スクリプトはありません。',viewScript:'スクリプト',copyRaw:'Rawリンクをコピー'},
  'ko':{navScript:'스크립트',exploreTitle:'공개 스크립트',exploreDesc:'등록된 사용자의 공개 스크립트를 검색하세요.',publicSearchPlaceholder:'공개 스크립트 검색…',publishScript:'업로드',publishTitle:'공개할 스크립트 선택',publishDesc:'내 스크립트 중 공개할 것을 선택하세요.',needLoginPublic:'공개 스크립트를 보려면 로그인하세요.',noScriptsToPublish:'스크립트가 없습니다. 먼저 만들어 주세요.',publishNow:'공개하기',alreadyPublic:'이미 공개됨',published:'스크립트가 공개되었습니다.',loadingScripts:'스크립트 로드 중…',publicBy:'작성자',emptyPublicScripts:'공개 스크립트가 없습니다.',viewScript:'스크립트',copyRaw:'Raw 링크 복사'},
  'zh':{navScript:'脚本',exploreTitle:'公开脚本',exploreDesc:'搜索已注册用户的公开脚本。',publicSearchPlaceholder:'搜索公开脚本…',publishScript:'上传',publishTitle:'选择要公开的脚本',publishDesc:'选择一个你的脚本并将其设为公开。',needLoginPublic:'登录后查看公开脚本。',noScriptsToPublish:'还没有脚本，请先创建一个。',publishNow:'设为公开',alreadyPublic:'已公开',published:'脚本已设为公开。',loadingScripts:'正在加载脚本…',publicBy:'作者',emptyPublicScripts:'暂无公开脚本。',viewScript:'脚本',copyRaw:'复制 Raw 链接'},
  'zh-TW':{navScript:'腳本',exploreTitle:'公開腳本',exploreDesc:'搜尋已註冊使用者的公開腳本。',publicSearchPlaceholder:'搜尋公開腳本…',publishScript:'上傳',publishTitle:'選擇要公開的腳本',publishDesc:'選擇一個你的腳本並將它設為公開。',needLoginPublic:'登入後查看公開腳本。',noScriptsToPublish:'還沒有腳本，請先建立一個。',publishNow:'設為公開',alreadyPublic:'已公開',published:'腳本已設為公開。',loadingScripts:'正在載入腳本…',publicBy:'作者',emptyPublicScripts:'目前沒有公開腳本。',viewScript:'腳本',copyRaw:'複製 Raw 連結'},
  'ru':{navScript:'Скрипты',exploreTitle:'Публичные скрипты',exploreDesc:'Ищите публичные скрипты зарегистрированных пользователей.',publicSearchPlaceholder:'Поиск публичных скриптов…',publishScript:'Загрузить',publishTitle:'Выберите скрипт для публикации',publishDesc:'Выберите один из своих скриптов, чтобы сделать его публичным.',needLoginPublic:'Войдите, чтобы просматривать публичные скрипты.',noScriptsToPublish:'Скриптов пока нет. Сначала создайте скрипт.',publishNow:'Сделать публичным',alreadyPublic:'Уже публичный',published:'Скрипт теперь публичный.',loadingScripts:'Загрузка скриптов…',publicBy:'Автор',emptyPublicScripts:'Публичных скриптов пока нет.',viewScript:'Скрипт',copyRaw:'Копировать Raw-ссылку'},
  'hi':{navScript:'स्क्रिप्ट',exploreTitle:'सार्वजनिक स्क्रिप्ट',exploreDesc:'पंजीकृत उपयोगकर्ताओं की सार्वजनिक स्क्रिप्ट खोजें।',publicSearchPlaceholder:'सार्वजनिक स्क्रिप्ट खोजें…',publishScript:'अपलोड',publishTitle:'सार्वजनिक करने के लिए स्क्रिप्ट चुनें',publishDesc:'अपनी किसी स्क्रिप्ट को सार्वजनिक करने के लिए चुनें।',needLoginPublic:'सार्वजनिक स्क्रिप्ट देखने के लिए लॉगिन करें।',noScriptsToPublish:'अभी कोई स्क्रिप्ट नहीं है। पहले एक बनाएँ।',publishNow:'सार्वजनिक करें',alreadyPublic:'पहले से सार्वजनिक',published:'स्क्रिप्ट सार्वजनिक हो गई।',loadingScripts:'स्क्रिप्ट लोड हो रही हैं…',publicBy:'बनाने वाला',emptyPublicScripts:'अभी कोई सार्वजनिक स्क्रिप्ट नहीं है।',viewScript:'स्क्रिप्ट',copyRaw:'Raw लिंक कॉपी करें'},
  'ar':{navScript:'السكريبتات',exploreTitle:'السكريبتات العامة',exploreDesc:'ابحث عن السكربتات العامة من المستخدمين المسجلين.',publicSearchPlaceholder:'ابحث عن السكربتات العامة…',publishScript:'رفع',publishTitle:'اختر سكربتًا للنشر',publishDesc:'اختر أحد سكربتاتك لجعله عامًا.',needLoginPublic:'سجّل الدخول لعرض السكربتات العامة.',noScriptsToPublish:'لا توجد سكربتات بعد. أنشئ سكربتًا أولًا.',publishNow:'جعله عامًا',alreadyPublic:'عام بالفعل',published:'أصبح السكربت عامًا.',loadingScripts:'جارٍ تحميل السكربتات…',publicBy:'أنشأه',emptyPublicScripts:'لا توجد سكربتات عامة بعد.',viewScript:'السكريبت',copyRaw:'نسخ رابط Raw'},
  'vi':{navScript:'Script',exploreTitle:'Script công khai',exploreDesc:'Tìm script công khai từ người dùng đã đăng ký.',publicSearchPlaceholder:'Tìm script công khai…',publishScript:'Tải lên',publishTitle:'Chọn script để công khai',publishDesc:'Chọn một script của bạn để đặt thành công khai.',needLoginPublic:'Đăng nhập để xem script công khai.',noScriptsToPublish:'Chưa có script. Hãy tạo script trước.',publishNow:'Công khai',alreadyPublic:'Đã công khai',published:'Script đã được công khai.',loadingScripts:'Đang tải script…',publicBy:'Tạo bởi',emptyPublicScripts:'Chưa có script công khai.',viewScript:'Script',copyRaw:'Sao chép liên kết Raw'},
  'th':{navScript:'สคริปต์',exploreTitle:'สคริปต์สาธารณะ',exploreDesc:'ค้นหาสคริปต์สาธารณะจากผู้ใช้ที่ลงทะเบียน',publicSearchPlaceholder:'ค้นหาสคริปต์สาธารณะ…',publishScript:'อัปโหลด',publishTitle:'เลือกสคริปต์เพื่อเผยแพร่',publishDesc:'เลือกสคริปต์ของคุณเพื่อทำให้เป็นสาธารณะ',needLoginPublic:'เข้าสู่ระบบเพื่อดูสคริปต์สาธารณะ',noScriptsToPublish:'ยังไม่มีสคริปต์ โปรดสร้างก่อน',publishNow:'ทำให้เป็นสาธารณะ',alreadyPublic:'เป็นสาธารณะแล้ว',published:'เผยแพร่สคริปต์แล้ว',loadingScripts:'กำลังโหลดสคริปต์…',publicBy:'สร้างโดย',emptyPublicScripts:'ยังไม่มีสคริปต์สาธารณะ',viewScript:'สคริปต์',copyRaw:'คัดลอกลิงก์ Raw'},
  'pl':{navScript:'Skrypty',exploreTitle:'Publiczne skrypty',exploreDesc:'Szukaj publicznych skryptów zarejestrowanych użytkowników.',publicSearchPlaceholder:'Szukaj publicznych skryptów…',publishScript:'Prześlij',publishTitle:'Wybierz skrypt do publikacji',publishDesc:'Wybierz jeden ze swoich skryptów, aby go upublicznić.',needLoginPublic:'Zaloguj się, aby zobaczyć publiczne skrypty.',noScriptsToPublish:'Brak skryptów. Najpierw utwórz skrypt.',publishNow:'Upublicznij',alreadyPublic:'Już publiczny',published:'Skrypt jest teraz publiczny.',loadingScripts:'Ładowanie skryptów…',publicBy:'Utworzył',emptyPublicScripts:'Brak publicznych skryptów.',viewScript:'Skrypt',copyRaw:'Kopiuj link Raw'},
  'it':{navScript:'Script',exploreTitle:'Script pubblici',exploreDesc:'Cerca script pubblici degli utenti registrati.',publicSearchPlaceholder:'Cerca script pubblici…',publishScript:'Carica',publishTitle:'Scegli uno script da pubblicare',publishDesc:'Scegli uno dei tuoi script per renderlo pubblico.',needLoginPublic:'Accedi per vedere gli script pubblici.',noScriptsToPublish:'Nessuno script. Creane prima uno.',publishNow:'Rendi pubblico',alreadyPublic:'Già pubblico',published:'Lo script è ora pubblico.',loadingScripts:'Caricamento script…',publicBy:'Creato da',emptyPublicScripts:'Nessuno script pubblico.',viewScript:'Script',copyRaw:'Copia link Raw'},
  'pt-PT':{navScript:'Scripts',exploreTitle:'Scripts públicos',exploreDesc:'Pesquisa scripts públicos de utilizadores registados.',publicSearchPlaceholder:'Pesquisar scripts públicos…',publishScript:'Carregar',publishTitle:'Escolher um script para publicar',publishDesc:'Escolhe um dos teus scripts para o tornar público.',needLoginPublic:'Inicia sessão para veres scripts públicos.',noScriptsToPublish:'Ainda não tens scripts. Cria um primeiro.',publishNow:'Tornar público',alreadyPublic:'Já é público',published:'O script é agora público.',loadingScripts:'A carregar scripts…',publicBy:'Criado por',emptyPublicScripts:'Ainda não existem scripts públicos.',viewScript:'Script',copyRaw:'Copiar link Raw'}
};
function applyFeatureTranslations(){const d=featureI18n[currentLang()]||featureI18n.en; Object.assign(ui[currentLang()]||{},d);}
const extraKeys=['workspaceTitle','workspaceDesc','logout','scriptFilename','private','public','saveScript','newScript','savedScripts','newScriptName','saved','updated','deleted','confirmDelete','needLoginWorkspace','raw','edit','delete'];
for(const [lang,vals] of Object.entries(extraByLang)) vals.forEach((v,i)=>ui[lang][extraKeys[i]]=v);
const copyRawByLang={id:'Salin Link Raw',en:'Copy Raw Link',es:'Copiar enlace Raw',pt:'Copiar link Raw',fil:'Kopyahin ang Raw Link',tr:'Raw Bağlantısını Kopyala',fr:'Copier le lien Raw',de:'Raw-Link kopieren',ja:'Rawリンクをコピー',ko:'Raw 링크 복사',zh:'复制 Raw 链接','zh-TW':'複製 Raw 連結',ru:'Копировать Raw-ссылку',hi:'Raw लिंक कॉपी करें',ar:'نسخ رابط Raw',vi:'Sao chép liên kết Raw',th:'คัดลอกลิงก์ Raw',pl:'Kopiuj link Raw',it:'Copia link Raw','pt-PT':'Copiar link Raw'};
for(const [lang,text] of Object.entries(copyRawByLang)){if(ui[lang])ui[lang].copyRaw=text;}
const statsText={
 id:{statsTitle:'Statistik Website',statsDesc:'Lihat jumlah akun terdaftar dan pengguna online.',registeredUsers:'Total Terdaftar',onlineUsers:'Online Sekarang',profileSelect:'Pilih Foto Profil',saved:'Tersimpan.'},
 en:{statsTitle:'Website Statistics',statsDesc:'View registered accounts and online users.',registeredUsers:'Registered Users',onlineUsers:'Online Now',profileSelect:'Choose Profile Photo',saved:'Saved.'},
 es:{statsTitle:'Estadísticas del sitio',statsDesc:'Cuentas registradas y usuarios en línea.',registeredUsers:'Usuarios registrados',onlineUsers:'En línea ahora',profileSelect:'Elegir foto de perfil',saved:'Guardado.'},
 pt:{statsTitle:'Estatísticas do site',statsDesc:'Veja contas registradas e usuários online.',registeredUsers:'Usuários registrados',onlineUsers:'Online agora',profileSelect:'Escolher foto de perfil',saved:'Salvo.'},
 ja:{statsTitle:'サイト統計',statsDesc:'登録アカウントとオンラインユーザーを表示します。',registeredUsers:'登録ユーザー',onlineUsers:'オンライン',profileSelect:'プロフィール写真を選択',saved:'保存しました。'},
 ko:{statsTitle:'사이트 통계',statsDesc:'가입 계정과 온라인 사용자를 확인하세요.',registeredUsers:'가입 사용자',onlineUsers:'현재 온라인',profileSelect:'프로필 사진 선택',saved:'저장되었습니다.'},
 zh:{statsTitle:'网站统计',statsDesc:'查看注册账户和在线用户。',registeredUsers:'注册用户',onlineUsers:'当前在线',profileSelect:'选择头像',saved:'已保存。'},
 'zh-TW':{statsTitle:'網站統計',statsDesc:'查看註冊帳戶和線上使用者。',registeredUsers:'註冊使用者',onlineUsers:'目前線上',profileSelect:'選擇頭像',saved:'已儲存。'},
 fr:{statsTitle:'Statistiques du site',statsDesc:'Comptes inscrits et utilisateurs en ligne.',registeredUsers:'Utilisateurs inscrits',onlineUsers:'En ligne',profileSelect:'Choisir une photo',saved:'Enregistré.'},
 de:{statsTitle:'Website-Statistik',statsDesc:'Registrierte Konten und Online-Nutzer.',registeredUsers:'Registrierte Nutzer',onlineUsers:'Jetzt online',profileSelect:'Profilfoto wählen',saved:'Gespeichert.'},
 tr:{statsTitle:'Site İstatistikleri',statsDesc:'Kayıtlı hesapları ve çevrimiçi kullanıcıları görün.',registeredUsers:'Kayıtlı Kullanıcılar',onlineUsers:'Şimdi Çevrimiçi',profileSelect:'Profil fotoğrafı seç',saved:'Kaydedildi.'},
 ru:{statsTitle:'Статистика сайта',statsDesc:'Зарегистрированные аккаунты и пользователи онлайн.',registeredUsers:'Зарегистрированные',onlineUsers:'Сейчас онлайн',profileSelect:'Выбрать фото профиля',saved:'Сохранено.'},
 hi:{statsTitle:'वेबसाइट आँकड़े',statsDesc:'पंजीकृत खाते और ऑनलाइन उपयोगकर्ता देखें।',registeredUsers:'पंजीकृत उपयोगकर्ता',onlineUsers:'अभी ऑनलाइन',profileSelect:'प्रोफ़ाइल फोटो चुनें',saved:'सहेजा गया।'},
 ar:{statsTitle:'إحصاءات الموقع',statsDesc:'عرض الحسابات المسجلة والمستخدمين المتصلين.',registeredUsers:'المستخدمون المسجلون',onlineUsers:'متصل الآن',profileSelect:'اختر صورة الملف الشخصي',saved:'تم الحفظ.'},
 vi:{statsTitle:'Thống kê website',statsDesc:'Xem tài khoản đăng ký và người dùng online.',registeredUsers:'Người dùng đã đăng ký',onlineUsers:'Đang online',profileSelect:'Chọn ảnh hồ sơ',saved:'Đã lưu.'},
 th:{statsTitle:'สถิติเข้าเว็บไซต์',statsDesc:'ดูบัญชีที่ลงทะเบียนและผู้ใช้ออนไลน์',registeredUsers:'ผู้ใช้ที่ลงทะเบียน',onlineUsers:'ออนไลน์ตอนนี้',profileSelect:'เลือกรูปโปรไฟล์',saved:'บันทึกแล้ว'},
 pl:{statsTitle:'Statystyki strony',statsDesc:'Wyświetl zarejestrowane konta i użytkowników online.',registeredUsers:'Zarejestrowani użytkownicy',onlineUsers:'Teraz online',profileSelect:'Wybierz zdjęcie profilu',saved:'Zapisano.'},
 it:{statsTitle:'Statistiche del sito',statsDesc:'Account registrati e utenti online.',registeredUsers:'Utenti registrati',onlineUsers:'Online ora',profileSelect:'Scegli foto profilo',saved:'Salvato.'},
 'pt-PT':{statsTitle:'Estatísticas do site',statsDesc:'Contas registadas e utilizadores online.',registeredUsers:'Utilizadores registados',onlineUsers:'Online agora',profileSelect:'Escolher foto de perfil',saved:'Guardado.'}
};
for(const [lang,vals] of Object.entries(statsText)) Object.assign(ui[lang]||{},vals);
Object.assign(ui.id,{navWorkspace:'Script',profile:'Profil',logout:'Logout'}); Object.assign(ui.en,{navWorkspace:'Scripts',profile:'Profile',logout:'Logout'});

ui.id.scriptCode='Tulis kode Luau di sini...'; ui.en.scriptCode='Write your Luau code here...';
for(const lang of Object.keys(ui)) if(!ui[lang].scriptCode) ui[lang].scriptCode=ui.en.scriptCode;

ui.en.navWorkspace='My Scripts'; ui.en.workspaceTitle='My Scripts'; ui.en.workspaceDesc='Create, edit, save, and open Raw links for your scripts.'; ui.en.scriptFilename='Script filename'; ui.en.newScriptName='new-script.lua'; ui.en.saved='Script saved.'; ui.en.updated='Script updated.'; ui.en.deleted='Script deleted.'; ui.en.confirmDelete='Delete this script?'; ui.en.needLoginWorkspace='Log in to use your script workspace.'; ui.en.raw='Raw →'; ui.en.edit='Edit'; ui.en.delete='Delete';
function currentLang(){ return localStorage.getItem('cb_lang') || detectLanguage(); }
function detectLanguage(){
  const supported=Object.keys(ui);
  const langs=[...(navigator.languages||[]),navigator.language||''];
  for(const raw of langs){
    const l=raw.toLowerCase();
    if(l.startsWith('pt-pt')) return 'pt-PT';
    if(l.startsWith('pt')) return 'pt';
    if(l.startsWith('zh-tw')||l.startsWith('zh-hant')) return 'zh-TW';
    if(l.startsWith('zh')) return 'zh';
    const exact=supported.find(x=>x.toLowerCase()===l);
    if(exact) return exact;
    const base=l.split('-')[0];
    const baseMatch=supported.find(x=>x.toLowerCase()===base);
    if(baseMatch) return baseMatch;
  }
  return 'en';
}
const myScriptsHomeByLang={id:'Script Saya',en:'My Scripts',es:'Mis Scripts',pt:'Meus Scripts',fil:'Aking Scripts',tr:'Scriptlerim',fr:'Mes scripts',de:'Meine Skripte',ja:'自分のスクリプト',ko:'내 스크립트',zh:'我的脚本','zh-TW':'我的腳本',ru:'Мои скрипты',hi:'मेरे स्क्रिप्ट',ar:'برامجي النصية',vi:'Script của tôi',th:'สคริปต์ของฉัน',pl:'Moje skrypty',it:'I miei script','pt-PT':'Os meus scripts'};
for(const [lang,label] of Object.entries(myScriptsHomeByLang)){if(ui[lang])ui[lang].myScriptsButton=label;}
function tr(k){
  const d=ui[currentLang()]||ui.en||{};
  const social={
    id:{searchUsersTitle:'Cari Pengguna',searchUsersPlaceholder:'Cari username...',noUsersFound:'Pengguna tidak ditemukan.',userSearchError:'Gagal mencari pengguna.',viewProfile:'Lihat profil',followers:'Pengikut',following:'Mengikuti',follow:'Ikuti',unfollow:'Batal Ikuti'},
    en:{searchUsersTitle:'Find Users',searchUsersPlaceholder:'Search username...',noUsersFound:'No users found.',userSearchError:'User search failed.',viewProfile:'View profile',followers:'Followers',following:'Following',follow:'Follow',unfollow:'Unfollow'},
    es:{searchUsersTitle:'Buscar usuarios',searchUsersPlaceholder:'Buscar usuario...',noUsersFound:'No se encontraron usuarios.',userSearchError:'No se pudo buscar usuarios.',viewProfile:'Ver perfil',followers:'Seguidores',following:'Siguiendo',follow:'Seguir',unfollow:'Dejar de seguir'},
    pt:{searchUsersTitle:'Buscar usuários',searchUsersPlaceholder:'Buscar usuário...',noUsersFound:'Nenhum usuário encontrado.',userSearchError:'Falha ao buscar usuários.',viewProfile:'Ver perfil',followers:'Seguidores',following:'Seguindo',follow:'Seguir',unfollow:'Deixar de seguir'},
    fr:{searchUsersTitle:'Rechercher des utilisateurs',searchUsersPlaceholder:'Rechercher un utilisateur...',noUsersFound:'Aucun utilisateur trouvé.',userSearchError:'Recherche impossible.',viewProfile:'Voir le profil',followers:'Abonnés',following:'Abonnements',follow:'Suivre',unfollow:'Ne plus suivre'},
    de:{searchUsersTitle:'Nutzer suchen',searchUsersPlaceholder:'Nutzername suchen...',noUsersFound:'Keine Nutzer gefunden.',userSearchError:'Nutzersuche fehlgeschlagen.',viewProfile:'Profil ansehen',followers:'Follower',following:'Folge ich',follow:'Folgen',unfollow:'Nicht mehr folgen'},
    ja:{searchUsersTitle:'ユーザーを検索',searchUsersPlaceholder:'ユーザー名を検索…',noUsersFound:'ユーザーが見つかりません。',userSearchError:'ユーザー検索に失敗しました。',viewProfile:'プロフィールを見る',followers:'フォロワー',following:'フォロー中',follow:'フォロー',unfollow:'フォロー解除'},
    ko:{searchUsersTitle:'사용자 검색',searchUsersPlaceholder:'사용자 이름 검색…',noUsersFound:'사용자를 찾을 수 없습니다.',userSearchError:'사용자 검색에 실패했습니다.',viewProfile:'프로필 보기',followers:'팔로워',following:'팔로잉',follow:'팔로우',unfollow:'팔로우 취소'},
    zh:{searchUsersTitle:'搜索用户',searchUsersPlaceholder:'搜索用户名…',noUsersFound:'未找到用户。',userSearchError:'搜索用户失败。',viewProfile:'查看个人资料',followers:'粉丝',following:'关注',follow:'关注',unfollow:'取消关注'},
    'zh-TW':{searchUsersTitle:'搜尋使用者',searchUsersPlaceholder:'搜尋使用者名稱…',noUsersFound:'找不到使用者。',userSearchError:'搜尋使用者失敗。',viewProfile:'查看個人資料',followers:'粉絲',following:'追蹤中',follow:'追蹤',unfollow:'取消追蹤'},
    ru:{searchUsersTitle:'Поиск пользователей',searchUsersPlaceholder:'Поиск имени пользователя…',noUsersFound:'Пользователи не найдены.',userSearchError:'Не удалось найти пользователей.',viewProfile:'Открыть профиль',followers:'Подписчики',following:'Подписки',follow:'Подписаться',unfollow:'Отписаться'},
    hi:{searchUsersTitle:'उपयोगकर्ता खोजें',searchUsersPlaceholder:'उपयोगकर्ता नाम खोजें…',noUsersFound:'उपयोगकर्ता नहीं मिले।',userSearchError:'उपयोगकर्ता खोज विफल हुई।',viewProfile:'प्रोफ़ाइल देखें',followers:'फ़ॉलोअर',following:'फ़ॉलो कर रहे हैं',follow:'फ़ॉलो करें',unfollow:'अनफ़ॉलो करें'},
    ar:{searchUsersTitle:'البحث عن المستخدمين',searchUsersPlaceholder:'ابحث عن اسم المستخدم…',noUsersFound:'لم يتم العثور على مستخدمين.',userSearchError:'فشل البحث عن المستخدمين.',viewProfile:'عرض الملف الشخصي',followers:'المتابعون',following:'يتابع',follow:'متابعة',unfollow:'إلغاء المتابعة'},
    vi:{searchUsersTitle:'Tìm người dùng',searchUsersPlaceholder:'Tìm tên người dùng…',noUsersFound:'Không tìm thấy người dùng.',userSearchError:'Không thể tìm người dùng.',viewProfile:'Xem hồ sơ',followers:'Người theo dõi',following:'Đang theo dõi',follow:'Theo dõi',unfollow:'Bỏ theo dõi'},
    th:{searchUsersTitle:'ค้นหาผู้ใช้',searchUsersPlaceholder:'ค้นหาชื่อผู้ใช้…',noUsersFound:'ไม่พบผู้ใช้',userSearchError:'ค้นหาผู้ใช้ไม่สำเร็จ',viewProfile:'ดูโปรไฟล์',followers:'ผู้ติดตาม',following:'กำลังติดตาม',follow:'ติดตาม',unfollow:'เลิกติดตาม'},
    pl:{searchUsersTitle:'Szukaj użytkowników',searchUsersPlaceholder:'Szukaj nazwy użytkownika…',noUsersFound:'Nie znaleziono użytkowników.',userSearchError:'Nie udało się wyszukać użytkowników.',viewProfile:'Zobacz profil',followers:'Obserwujący',following:'Obserwowani',follow:'Obserwuj',unfollow:'Przestań obserwować'},
    it:{searchUsersTitle:'Cerca utenti',searchUsersPlaceholder:'Cerca nome utente…',noUsersFound:'Nessun utente trovato.',userSearchError:'Ricerca utenti non riuscita.',viewProfile:'Vedi profilo',followers:'Follower',following:'Seguiti',follow:'Segui',unfollow:'Non seguire più'},
    fil:{searchUsersTitle:'Maghanap ng User',searchUsersPlaceholder:'Maghanap ng username...',noUsersFound:'Walang nahanap na user.',userSearchError:'Hindi mahanap ang user.',viewProfile:'Tingnan ang profile',followers:'Mga follower',following:'Sinusundan',follow:'Sundan',unfollow:'I-unfollow'},
    tr:{searchUsersTitle:'Kullanıcı ara',searchUsersPlaceholder:'Kullanıcı adı ara...',noUsersFound:'Kullanıcı bulunamadı.',userSearchError:'Kullanıcı araması başarısız.',viewProfile:'Profili görüntüle',followers:'Takipçi',following:'Takip',follow:'Takip et',unfollow:'Takibi bırak'},
    'pt-PT':{searchUsersTitle:'Pesquisar utilizadores',searchUsersPlaceholder:'Pesquisar nome de utilizador...',noUsersFound:'Nenhum utilizador encontrado.',userSearchError:'Falha ao pesquisar utilizadores.',viewProfile:'Ver perfil',followers:'Seguidores',following:'A seguir',follow:'Seguir',unfollow:'Deixar de seguir'}
  };
  const f={navScript:'Script',navWorkspace:'Script',myScripts:'My Scripts',myScriptsButton:'Lihat Script Saya',scriptCreator:'Pembuat script',websiteLink:'Link website',viewScript:'Script',exploreTitle:'Jelajahi Script',exploreDesc:'Cari script publik dan simpan favoritmu.',searchPlaceholder:'Cari script...',publicSearchPlaceholder:'Cari script publik...',publishScript:'Upload',publishTitle:'Pilih Script untuk Dipublic',publishDesc:'Pilih salah satu script milikmu untuk dijadikan Public.',needLoginPublic:'Login untuk melihat Public Script.',noScriptsToPublish:'Belum ada script. Buat script terlebih dahulu.',publishNow:'Jadikan Public',alreadyPublic:'Sudah Public',published:'Script berhasil dibuat Public.',loadingScripts:'Memuat script...',historyTitle:'Riwayat',notificationsTitle:'Notifikasi',emptyPublicScripts:'Belum ada script publik.',copyRaw:'Salin Link Raw',followers:'Pengikut',following:'Mengikuti',follow:'Ikuti',unfollow:'Batal Ikuti',publicProfileScripts:'Script Public',profileNotFound:'Profil tidak ditemukan.',copyScript:'Salin Script',copiedScript:'Tersalin',myPublicScriptsTitle:'Public Script Saya',myPublicScriptsDesc:'Pilih script buatanmu yang sudah diatur menjadi Public.',selectScript:'Pilih Script',publicBy:'Dibuat oleh'};
  return d[k] ?? social[currentLang()]?.[k] ?? ui.id?.[k] ?? f[k] ?? k;
}
const socialI18n={
  id:{followers:'Pengikut',following:'Mengikuti',follow:'Ikuti',unfollow:'Batal Ikuti',publicProfileScripts:'Script Public',profileNotFound:'Profil tidak ditemukan.',copyScript:'Salin Script',copiedScript:'Tersalin'},
  en:{followers:'Followers',following:'Following',follow:'Follow',unfollow:'Unfollow',publicProfileScripts:'Public Scripts',profileNotFound:'Profile not found.',copyScript:'Copy Script',copiedScript:'Copied'},
  es:{followers:'Seguidores',following:'Siguiendo',follow:'Seguir',unfollow:'Dejar de seguir',publicProfileScripts:'Scripts públicos',profileNotFound:'Perfil no encontrado.',copyScript:'Copiar script',copiedScript:'Copiado'},
  pt:{followers:'Seguidores',following:'Seguindo',follow:'Seguir',unfollow:'Deixar de seguir',publicProfileScripts:'Scripts públicos',profileNotFound:'Perfil não encontrado.',copyScript:'Copiar script',copiedScript:'Copiado'},
  fr:{followers:'Abonnés',following:'Abonnements',follow:'Suivre',unfollow:'Ne plus suivre',publicProfileScripts:'Scripts publics',profileNotFound:'Profil introuvable.',copyScript:'Copier le script',copiedScript:'Copié'},
  de:{followers:'Follower',following:'Folge ich',follow:'Folgen',unfollow:'Nicht mehr folgen',publicProfileScripts:'Öffentliche Skripte',profileNotFound:'Profil nicht gefunden.',copyScript:'Skript kopieren',copiedScript:'Kopiert'},
  ja:{followers:'フォロワー',following:'フォロー中',follow:'フォロー',unfollow:'フォロー解除',publicProfileScripts:'公開スクリプト',profileNotFound:'プロフィールが見つかりません。',copyScript:'スクリプトをコピー',copiedScript:'コピーしました'},
  ko:{followers:'팔로워',following:'팔로잉',follow:'팔로우',unfollow:'팔로우 취소',publicProfileScripts:'공개 스크립트',profileNotFound:'프로필을 찾을 수 없습니다.',copyScript:'스크립트 복사',copiedScript:'복사됨'},
  zh:{followers:'粉丝',following:'关注',follow:'关注',unfollow:'取消关注',publicProfileScripts:'公开脚本',profileNotFound:'找不到个人资料。',copyScript:'复制脚本',copiedScript:'已复制'},
  'zh-TW':{followers:'粉絲',following:'追蹤中',follow:'追蹤',unfollow:'取消追蹤',publicProfileScripts:'公開腳本',profileNotFound:'找不到個人資料。',copyScript:'複製腳本',copiedScript:'已複製'}
};
for(const [lang,vals] of Object.entries(socialI18n)){if(ui[lang])Object.assign(ui[lang],vals);}

function visibilityLabel(v){return v==='public'?tr('public'):v==='private'?tr('private'):v||'';}
function tutorialData(){ return tutorialText[currentLang()] || fallbackTutorial; }
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}

function renderTutorials(){
  const box=$('#tutorialMenu'); if(!box) return;
  const data=tutorialData();
  box.innerHTML=levels.map((t,i)=>{
    const x=data[i];
    return `<article class="tutorial-card"><div class="tutorial-icon">${t.icon}</div><div><span class="tutorial-level">${escapeHtml(x[0])}</span><h3>${escapeHtml(x[0].replace(/^(Level \d+ — |Nivel \d+ — |Nível \d+ — |Poziom \d+ — |Livello \d+ — |Seviye \d+ — |Cấp \d+ — |ระดับ \d+ — |レベル\d+ — |레벨 \d+ — |第\d+级 — |第\d+級 — |Уровень \d+ — |स्तर \d+ — |المستوى \d+ — )/,'').trim())}</h3><p>${escapeHtml(x[1])}</p><button class="tutorial-btn" data-tutorial="${i}">${escapeHtml(tr('learn'))}</button></div></article>`;
  }).join('');
}

async function loadExtras(){await renderPublicScripts();if(currentUser){await loadFavorites();await loadHistory();await loadNotifications();}}

function updateMenuAuth(){
  const logged=!!currentUser;
  $('#loginBtn')?.classList.toggle('hidden',logged);
  $('#registerBtn')?.classList.toggle('hidden',logged);
  $('#menuLogoutBtn')?.classList.toggle('hidden',!logged);
  loadProfile();
}

function applyLanguage(){
  applyFeatureTranslations();
  const l=currentLang(),dict=ui[l]||ui.en;
  document.documentElement.lang=l;
  document.documentElement.dir=l==='ar'?'rtl':'ltr';
  document.querySelectorAll('[data-i18n]').forEach(el=>{ if(dict[el.dataset.i18n]!==undefined) el.textContent=dict[el.dataset.i18n]; });
  $('#languageSelect').value=l;
  $('#loginBtn').textContent=dict.login; $('#registerBtn').textContent=dict.register;
  $('#modalTitle').textContent=dict[mode==='login'?'login':'register'];
  $('#modalSub').textContent=dict[mode==='login'?'loginSub':'registerSub'];
  $('#submitAuth').textContent=dict[mode==='login'?'login':'register'];
  $('#switchMode').innerHTML=mode==='login'?`${escapeHtml(dict.noAccount)} <b>${escapeHtml(dict.register)}</b>`:`${escapeHtml(dict.hasAccount)} <b>${escapeHtml(dict.login)}</b>`;
  $('#username').placeholder=dict.username; $('#password').placeholder=dict.password; $('#confirm').placeholder=dict.confirm;
  $('#languageSelect').setAttribute('aria-label',dict.langLabel);
  loadProfile();
  $('#scriptFilename').placeholder=dict.scriptFilename;
  $('#scriptCode').placeholder=dict.scriptCode;
  $('#viewAll').title=dict.back;
  renderTutorials();
  renderScriptsIfPossible();
}

function openAuth(m, silent=false){
  mode=m; const dict=ui[currentLang()]||ui.en;
  $('#modalTitle').textContent=dict[m==='login'?'login':'register'];
  $('#modalSub').textContent=dict[m==='login'?'loginSub':'registerSub'];
  $('#submitAuth').textContent=dict[m==='login'?'login':'register'];
  $('#confirm').style.display=m==='login'?'none':'block';
  $('#confirm').required=m==='register';
  $('#username').placeholder=dict.username; $('#password').placeholder=dict.password; $('#confirm').placeholder=dict.confirm;
  $('#switchMode').innerHTML=m==='login'?`${escapeHtml(dict.noAccount)} <b>${escapeHtml(dict.register)}</b>`:`${escapeHtml(dict.hasAccount)} <b>${escapeHtml(dict.login)}</b>`;
  if(!silent) { $('#error').textContent=''; $('#error').style.color=''; $('#modal').classList.remove('hidden'); }
}

function openTutorial(index){
  const x=tutorialData()[index]; const base=levels[index];
  if(!x || !base) return;
  $('#tutorialDetailTitle').textContent=x[0];
  $('#tutorialDetailDesc').textContent=x[1];
  $('#tutorialWhy').textContent=x[2];
  $('#tutorialWhat').textContent=x[1];
  $('#tutorialExplain').textContent=x[3];
  $('#tutorialPractice').textContent=tr('practiceText');
  $('#tutorialCode').textContent=base.code;
  $('#tutorialDetail').classList.remove('hidden');
  document.body.classList.add('modal-open');
}
function closeTutorial(){ $('#tutorialDetail').classList.add('hidden'); document.body.classList.remove('modal-open'); }

async function loadProfile(){
  const nameEl=$('#profileUsername'), emailEl=$('#profileEmail'), menuName=$('#menuUsername'), menuStatus=$('#menuStatus');
  if(!currentUser){
    if(nameEl)nameEl.textContent='Guest';
    if(emailEl)emailEl.textContent=tr('profileGuest');
    if(menuName)menuName.textContent='Guest';
    if(menuStatus)menuStatus.textContent=tr('notLoggedIn');
    if($('#myFollowersCount'))$('#myFollowersCount').textContent='0';
    if($('#myFollowingCount'))$('#myFollowingCount').textContent='0';
    return;
  }
  let username=currentUser.user_metadata?.username || '';
  let avatar='profil1.png';
  try{
    const profile=await fetchPublicProfile(currentUser.id);
    if(profile?.username) username=profile.username;
    if(profile?.avatar_url) avatar=profile.avatar_url;
  }catch(_){}
  username=username || currentUser.email?.split('@')[0] || 'User';
  if(nameEl)nameEl.textContent=username;
  if(emailEl)emailEl.textContent=tr('loggedIn');
  if(menuName)menuName.textContent=username;
  if(menuStatus)menuStatus.textContent=tr('loggedIn');
  if($('#profileAvatar'))$('#profileAvatar').src=avatar;
  try{
    const [followers,following]=await Promise.all([
      sb.from('follows').select('follower_id',{count:'exact',head:true}).eq('following_id',currentUser.id),
      sb.from('follows').select('following_id',{count:'exact',head:true}).eq('follower_id',currentUser.id)
    ]);
    if($('#myFollowersCount'))$('#myFollowersCount').textContent=String(followers.count||0);
    if($('#myFollowingCount'))$('#myFollowingCount').textContent=String(following.count||0);
  }catch(_){}
  await searchUsers($('#profileUserSearch')?.value||'', '#profileUserResults');
}
function closeMenu(){const menu=$('#sideMenu'),back=$('#menuBackdrop'),toggle=$('#menuToggle');if(menu)menu.classList.remove('open');if(back)back.classList.add('hidden');if(toggle){toggle.setAttribute('aria-expanded','false');toggle.classList.remove('active');}if(menu)menu.setAttribute('aria-hidden','true');}
function openMenu(){const menu=$('#sideMenu'),back=$('#menuBackdrop'),toggle=$('#menuToggle');if(menu)menu.classList.add('open');if(back)back.classList.remove('hidden');if(toggle){toggle.setAttribute('aria-expanded','true');toggle.classList.add('active');}if(menu)menu.setAttribute('aria-hidden','false');loadProfile();}
async function goTo(route){
  closeMenu();
  if(route==='stats'){ window.location.hash='#stats'; return; }
  if(route==='create'||route==='workspace'||route==='profile'||route==='explore'){
    await syncAuth();
    if(!currentUser){ pendingRoute=route; openAuth('login'); return; }
  }
  window.location.hash=route==='home'?'#home':'#'+route;
  routePage();
}

async function submitAuth(e){
  e.preventDefault();
  const dict=ui[currentLang()]||ui.en; const error=$('#error'); error.textContent=''; error.style.color='';
  const username=$('#username').value.trim(), password=$('#password').value, confirm=$('#confirm').value;
  if(!/^[A-Za-z0-9_]{5,24}$/.test(username)){error.textContent=currentLang()==='id'?'Username 5–24 karakter, hanya huruf, angka, dan underscore.':'Username must be 5–24 characters using only letters, numbers, and underscore.';return;}
  if(password.length<9){error.textContent=currentLang()==='id'?'Password minimal 9 karakter.':'Password must be at least 9 characters.';return;}
  if(mode==='register' && password!==confirm){error.textContent=currentLang()==='id'?'Konfirmasi password tidak cocok.':'Passwords do not match.';return;}
  const email=username.toLowerCase()+'@cb-scriptstore.local';
  try{
    if(mode==='register'){
      const {data,error:err}=await sb.auth.signUp({email,password,options:{data:{username}}});
      if(err) throw err;
      if(!data.session){
        throw new Error('Akun dibuat, tetapi Supabase masih meminta konfirmasi email. Matikan “Confirm email” di Authentication → Providers → Email, lalu coba register lagi.');
      }
      await syncAuth();
      $('#modal').classList.add('hidden');
      startRealtime(); await loadScripts(); await loadProfile();
      if(pendingRoute){ const r=pendingRoute; pendingRoute=null; window.location.hash='#'+r; }
    }else{
      const {data,error:err}=await sb.auth.signInWithPassword({email,password});
      if(err) throw err;
      await syncAuth(); $('#modal').classList.add('hidden'); startRealtime(); await loadScripts(); await loadProfile();
      if(pendingRoute){ const r=pendingRoute; pendingRoute=null; window.location.hash='#'+r; }
    }
  }catch(err){ error.textContent=friendlyAuthError(err); error.style.color='#ff7690'; }
}

async function renderMyPublicScripts(){
  const box=$('#myPublicCards'); if(!box)return;
  try{
    await syncAuth();
    if(!currentUser){
      box.innerHTML=`<div class="empty">${escapeHtml(tr('needLoginWorkspace')||'Login untuk melihat public script kamu.')}</div>`;
      return;
    }
    let result=await sb.from('scripts').select('id,filename,code,visibility,created_at,updated_at,view_count').eq('user_id',currentUser.id).eq('visibility','public').order('updated_at',{ascending:false}).order('id',{ascending:false});
    if(result.error && /view_count/i.test(result.error.message||'')){
      result=await sb.from('scripts').select('id,filename,code,visibility,created_at,updated_at').eq('user_id',currentUser.id).eq('visibility','public').order('updated_at',{ascending:false}).order('id',{ascending:false});
    }
    if(result.error)throw result.error;
    const rows=result.data||[];
    if(!rows.length){
      box.innerHTML=`<div class="empty">${escapeHtml(tr('emptyMyPublicScripts')||'Belum ada public script. Buat script lalu pilih Public.')}</div>`;
      return;
    }
    const myAvatar=(await sb.from('profiles').select('avatar_url,username').eq('id',currentUser.id).maybeSingle()).data||{}; const myOwner=myAvatar.username||currentUser.user_metadata?.username||'User'; const myPhoto=myAvatar.avatar_url||'profil1.png'; box.innerHTML=rows.map(s=>`<article class="public-card" data-select-public="${s.id}"><div class="public-profile"><img class="public-profile-avatar" src="${escapeHtml(myPhoto)}" alt="${escapeHtml(myOwner)}"><div><div class="public-profile-label">${escapeHtml(tr('publicBy'))}</div><div class="public-profile-name">@${escapeHtml(myOwner)}</div></div></div><h3>${escapeHtml(s.filename)}</h3><div class="script-actions"><button class="mini-btn copy-script-btn" data-copy-my-public="${s.id}">${escapeHtml(tr('copyScript'))}</button></div></article>`).join('');
    box.querySelectorAll('[data-copy-my-public]').forEach(b=>b.onclick=async e=>{e.stopPropagation();try{await navigator.clipboard.writeText(rawLoadstring(b.dataset.copyMyPublic));const old=b.textContent;b.textContent=tr('copiedScript')||'Copied';setTimeout(()=>b.textContent=old,1200);}catch(_){}});
  }catch(e){box.innerHTML=`<div class="empty">${escapeHtml(e.message||'Gagal memuat public script kamu.')}</div>`;}
}

async function renderScriptsIfPossible(){
  const box=$('#cards'); if(!box) return; await syncAuth();
  if(!token){box.innerHTML=`<div class="empty">${escapeHtml(tr('needLoginWorkspace'))}</div>`;$('#scriptCount').textContent='0';return;}
  try{await loadFavorites();let result=await sb.from('scripts').select('id,filename,visibility,created_at,updated_at,code,view_count').eq('user_id',currentUser.id).order('updated_at',{ascending:false}).order('id',{ascending:false});if(result.error && /view_count/i.test(result.error.message||'')){result=await sb.from('scripts').select('id,filename,visibility,created_at,updated_at,code').eq('user_id',currentUser.id).order('updated_at',{ascending:false}).order('id',{ascending:false});}if(result.error)throw result.error;cachedOwnScripts=result.data||[];const q=($('#scriptSearch')?.value||'').trim().toLowerCase();let list=cachedOwnScripts.filter(s=>!q||s.filename.toLowerCase().includes(q));$('#scriptCount').textContent=String(list.length);if(!list.length){box.innerHTML=`<div class="empty">${escapeHtml(tr('empty'))}</div>`;return;}box.innerHTML=list.map(s=>`<article class="card"><div class="card-head"><div class="icon">&lt;/&gt;</div><div><h3>${escapeHtml(s.filename)}</h3><small>${escapeHtml(tr('scriptCreator'))}: @${escapeHtml(currentUser?.user_metadata?.username||'User')}</small><small>${escapeHtml(tr('websiteLink'))}: ${escapeHtml(SITE_URL)}</small><small>${escapeHtml(visibilityLabel(s.visibility))} · 👁 ${Number(s.view_count||0)}</small></div></div><div class="card-foot"><span class="tag">${escapeHtml(visibilityLabel(s.visibility))}</span><div class="script-actions"><button class="mini-btn" data-edit="${s.id}">${escapeHtml(tr('edit'))}</button><button class="mini-btn danger" data-delete="${s.id}">${escapeHtml(tr('delete'))}</button>${s.visibility==='public'?`<a class="raw mini-btn" href="${rawUrl(s.id)}" target="_blank" rel="noreferrer">${escapeHtml(tr('raw'))}</a><button class="mini-btn" data-copy="${s.id}">${escapeHtml(tr('copyRaw'))}</button>`:''}<button class="mini-btn ${favoriteIds.has(String(s.id))?'active':''}" data-fav="${s.id}">${favoriteIds.has(String(s.id))?'★':'☆'}</button></div></div></article>`).join('');box.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>editScript(list.find(x=>String(x.id)===b.dataset.edit)));box.querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>deleteScript(b.dataset.delete));box.querySelectorAll('[data-fav]').forEach(b=>b.onclick=()=>toggleFavorite(b.dataset.fav));box.querySelectorAll('[data-copy]').forEach(b=>b.onclick=()=>navigator.clipboard.writeText(rawUrl(b.dataset.copy)));await loadHistory();}catch(e){box.innerHTML=`<div class="empty">${escapeHtml(e.message||tr('needLoginWorkspace'))}</div>`;}
}
async function loadScripts(){ await renderScriptsIfPossible(); }

async function saveScript(e){
  e.preventDefault(); const err=$('#scriptError');err.textContent=''; await syncAuth();
  if(!token){err.textContent=tr('needLoginWorkspace');return;}
  const id=$('#scriptId').value, filename=$('#scriptFilename').value.trim(), code=$('#scriptCode').value, visibility=$('#scriptVisibility').value;
  if(filename.length<1 || filename.length>120){err.textContent='Invalid filename.';return;}
  if(code.length>500000){err.textContent='Script terlalu panjang.';return;}
  try{
    if(!id){ const {count,error:e1}=await sb.from('scripts').select('id',{count:'exact',head:true}).eq('user_id',currentUser.id); if(e1)throw e1; if((count||0)>=50){err.textContent=currentLang()==='id'?'Maksimal 50 script per akun.':'Maximum 50 scripts per account.';return;} }
    let result;
    if(id){ result=await sb.from('scripts').update({filename,code,visibility,updated_at:new Date().toISOString()}).eq('id',id).eq('user_id',currentUser.id).select('id').single(); }
    else { result=await sb.from('scripts').insert({user_id:currentUser.id,filename,code,visibility}).select('id').single(); }
    if(result.error)throw result.error;
    err.style.color='#28d9a4';err.textContent=tr(id?'updated':'saved');resetScriptForm(false);await loadScripts();window.location.hash='#workspace';
  }catch(e){err.style.color='#ff7690';err.textContent=e.message||'Gagal menyimpan script.';}
}
function resetScriptForm(clearMessage=true){$('#scriptId').value='';$('#scriptFilename').value='';$('#scriptCode').value='';$('#scriptVisibility').value='private';if(clearMessage){$('#scriptError').textContent='';$('#scriptError').style.color='';}}
function editScript(s){if(!s)return;$('#scriptId').value=s.id;$('#scriptFilename').value=s.filename;$('#scriptCode').value=s.code;$('#scriptVisibility').value=s.visibility;window.location.hash='#create';}
async function deleteScript(id){if(!confirm(tr('confirmDelete')))return;try{const {error}=await sb.from('scripts').delete().eq('id',id).eq('user_id',currentUser.id);if(error)throw error;$('#scriptError').style.color='#28d9a4';$('#scriptError').textContent=tr('deleted');resetScriptForm(false);await loadScripts();}catch(e){$('#scriptError').style.color='#ff7690';$('#scriptError').textContent=e.message||'Delete failed.';}}
async function logout(){await sb.auth.signOut();stopRealtime();token=null;currentUser=null;resetScriptForm();await loadScripts();routePage();}

let presenceTimer=null, onlineTimer=null;
function stopRealtime(){if(presenceTimer){clearInterval(presenceTimer);presenceTimer=null;}if(onlineTimer){clearInterval(onlineTimer);onlineTimer=null;}}
async function heartbeat(){await syncAuth();if(!currentUser)return;try{await sb.from('presence').upsert({user_id:currentUser.id,last_seen:new Date().toISOString()});}catch(_){}}
async function refreshOnlineCount(){const el=$('#onlineCountStat');if(!el)return;try{const cutoff=new Date(Date.now()-60000).toISOString();const {count,error}=await sb.from('presence').select('user_id',{count:'exact',head:true}).gt('last_seen',cutoff);if(error)throw error;el.textContent=String(count||0);}catch(_){el.textContent='0';}}
function startRealtime(){stopRealtime();if(!currentUser)return;heartbeat();presenceTimer=setInterval(heartbeat,20000);refreshOnlineCount();onlineTimer=setInterval(refreshOnlineCount,15000);}

function ensureVisitorId(){let v=localStorage.getItem('cb_visitor_id');if(!v){v=(crypto.randomUUID?crypto.randomUUID():String(Date.now())+'-'+Math.random());localStorage.setItem('cb_visitor_id',v);}return v;}
async function loadStats(){
  const rc=$('#registeredCount'), oc=$('#onlineCountStat'); if(!rc||!oc)return;
  try{
    const [r,p]=await Promise.all([
      sb.from('profiles').select('id',{count:'exact',head:true}),
      sb.from('presence').select('user_id',{count:'exact',head:true}).gt('last_seen',new Date(Date.now()-60000).toISOString())
    ]);
    if(!r.error)rc.textContent=String(r.count||0);
    if(!p.error)oc.textContent=String(p.count||0);
  }catch(_){rc.textContent='0';oc.textContent='0';}
}

$('#languageSelect').addEventListener('change',e=>{localStorage.setItem('cb_lang',e.target.value);applyLanguage();loadStats();});
$('#scriptForm').onsubmit=saveScript;
$('#newScriptBtn').onclick=()=>{resetScriptForm();goTo('create');};
$('#backToScripts').onclick=()=>goTo('workspace');
$('#logoutBtn')?.addEventListener('click',logout);
$('#profileLogoutBtn')?.addEventListener('click',logout);
$('#profileCreateBtn')?.addEventListener('click',()=>goTo('create'));
document.querySelectorAll('.avatar-choice').forEach(b=>b.addEventListener('click',async()=>{await syncAuth();if(!currentUser)return;const avatar=b.dataset.avatar;try{const {error}=await sb.from('profiles').update({avatar_url:avatar}).eq('id',currentUser.id);if(error)throw error;$('#profileAvatar').src=avatar;}catch(e){console.error(e);}}));
$('#loginBtn').onclick=()=>{closeMenu();openAuth('login');};
$('#registerBtn').onclick=()=>{closeMenu();openAuth('register');};
$('#menuLogoutBtn').onclick=()=>{closeMenu();logout();};
$('#menuToggle').onclick=()=>$('#sideMenu').classList.contains('open')?closeMenu():openMenu();
$('#menuClose').onclick=closeMenu;
$('#menuBackdrop').onclick=closeMenu;
$('#sideMenu').querySelectorAll('[data-menu-route]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();goTo(a.dataset.menuRoute);}));
$('#startBtn').onclick=()=>goTo('create');
$('#myScriptsHomeBtn').onclick=async()=>{ await goTo('workspace'); };
$('#closeModal').onclick=()=>{$('#modal').classList.add('hidden');pendingRoute=null;};
$('#switchMode').onclick=()=>openAuth(mode==='login'?'register':'login');
$('#authForm').onsubmit=submitAuth;
$('#browseBtn').onclick=()=>goTo('scripts');
$('#scriptSearch')?.addEventListener('input',renderScriptsIfPossible);$('#publicSearch')?.addEventListener('input',renderPublicScripts);$('#profileUserSearch')?.addEventListener('input',e=>searchUsers(e.target.value,'#profileUserResults'));$('#publicUserSearch')?.addEventListener('input',e=>searchUsers(e.target.value,'#publicUserResults'));$('#publishScriptBtn')?.addEventListener('click',openPublishModal);$('#publishClose')?.addEventListener('click',()=>$('#publishModal')?.classList.add('hidden'));$('#publicProfileClose')?.addEventListener('click',()=>$('#publicProfileModal')?.classList.add('hidden'));$('#publicFollowBtn')?.addEventListener('click',()=>toggleFollow($('#publicFollowBtn').dataset.userId));
$('#viewAll').onclick=()=>goTo('scripts');
$('#tutorialMenu').addEventListener('click',e=>{const b=e.target.closest('.tutorial-btn');if(b)openTutorial(Number(b.dataset.tutorial));});
document.querySelectorAll('[data-feature-route]').forEach(b=>b.addEventListener('click',()=>goTo(b.dataset.featureRoute)));
$('#tutorialClose').onclick=closeTutorial;
$('#tutorialBack').onclick=closeTutorial;
$('#tutorialDetail').addEventListener('click',e=>{if(e.target.id==='tutorialDetail')closeTutorial();});
window.addEventListener('keydown',e=>{if(e.key==='Escape'){closeTutorial();closeMenu();}});

function routePage(){
  const hash=window.location.hash || '#home';
  const workspace=hash==='#workspace' || hash==='#my-scripts';
  const explore=hash==='#explore';
  const create=hash==='#create' || hash==='#create-script';
  const profile=hash==='#profile';
  const tutorial=hash==='#scripts';
  const stats=hash==='#stats';
  const home=document.querySelector('#home');
  const exploreView=document.querySelector('#explorePage');
  const workspaceView=document.querySelector('#workspace');
  const createView=document.querySelector('#createPage');
  const profileView=document.querySelector('#profilePage');
  if(home) home.classList.toggle('page-hidden',workspace||create||profile||explore);
  if(stats) setTimeout(()=>document.querySelector('#stats')?.scrollIntoView({behavior:'smooth',block:'start'}),0);
  if(exploreView) exploreView.classList.toggle('page-hidden',!explore);
  if(workspaceView) workspaceView.classList.toggle('page-hidden',!workspace);
  if(createView) createView.classList.toggle('page-hidden',!create);
  if(profileView) profileView.classList.toggle('page-hidden',!profile);
  if(explore){ window.scrollTo({top:0,behavior:'smooth'}); syncAuth().then(()=>{if(!currentUser){pendingRoute='explore';openAuth('login');}else renderPublicScripts();}); }
  else if(workspace){ window.scrollTo({top:0,behavior:'smooth'}); renderScriptsIfPossible(); }
  else if(create){ window.scrollTo({top:0,behavior:'smooth'}); renderScriptsIfPossible(); }
  else if(profile){ window.scrollTo({top:0,behavior:'smooth'}); loadProfile(); }
  else { if(tutorial) setTimeout(()=>document.querySelector('#scripts')?.scrollIntoView({behavior:'smooth'}),0); else window.scrollTo({top:0,behavior:'smooth'}); }
}
window.addEventListener('hashchange',routePage);

// Automatic language detection runs only when the user has not chosen a language before.
const initialLang=localStorage.getItem('cb_lang') || detectLanguage();
if(!localStorage.getItem('cb_lang')) localStorage.setItem('cb_lang',initialLang);
applyLanguage();
loadStats();
routePage();
(async()=>{
  try { await syncAuth(); } catch(e) { console.error(e); }
  updateMenuAuth();
  applyLanguage();
  routePage();
  await loadScripts();
  await loadStats();
  if(currentUser) startRealtime();
  sb.auth.onAuthStateChange(async (_event, session)=>{
    token=session?.access_token||null; currentUser=session?.user||null;
    if(currentUser) startRealtime(); else stopRealtime();
    await loadScripts(); await loadProfile(); updateMenuAuth();
    routePage();
  });
})();
