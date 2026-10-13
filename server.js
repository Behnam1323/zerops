'use strict';
const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const QRCode = require('qrcode');
const app = express();
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const CONFIG_DIR = path.join(DATA_DIR, 'configs');
fs.mkdirSync(DATA_DIR, {recursive:true}); fs.mkdirSync(CONFIG_DIR,{recursive:true});
const SESSION_SECRET_FILE = path.join(DATA_DIR, 'session.secret');
function getSessionSecret(){
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32) return process.env.SESSION_SECRET;
  try { const existing = fs.readFileSync(SESSION_SECRET_FILE, 'utf8').trim(); if (existing.length >= 32) return existing; } catch {}
  const generated = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(SESSION_SECRET_FILE, generated, {mode:0o600});
  console.warn('[security] SESSION_SECRET was not set; generated a persistent secret in DATA_DIR. Set SESSION_SECRET explicitly for production.');
  return generated;
}
const SESSION_SECRET = getSessionSecret();
const DB = path.join(DATA_DIR,'panel.json');
const DEFAULTS = {users:[], inbounds:[], domain:process.env.PUBLIC_DOMAIN||'', bootstrapped:false};
function readDB(){try{return {...DEFAULTS,...JSON.parse(fs.readFileSync(DB,'utf8'))}}catch{return {...DEFAULTS}}}
function writeDB(d){fs.writeFileSync(DB,JSON.stringify(d,null,2),{mode:0o600})}
function hash(s){return crypto.createHash('sha256').update(s).digest('hex')}
const db0=readDB();
if(!db0.bootstrapped){db0.users=[{username:process.env.ADMIN_USER||'admin',passwordHash:hash(process.env.ADMIN_PASSWORD||'ChangeMe-Immediately-42!')}];db0.bootstrapped=true;writeDB(db0)}
app.use(express.urlencoded({extended:false,limit:'1mb'})); app.use(express.json({limit:'1mb'}));
app.use(session({secret:SESSION_SECRET,resave:false,saveUninitialized:false,cookie:{httpOnly:true,sameSite:'strict',secure:process.env.COOKIE_SECURE==='true',maxAge:8*60*60*1000}}));
const safeEq=(a,b)=>{const aa=Buffer.from(String(a)),bb=Buffer.from(String(b));return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb)};
function auth(req,res,next){if(req.session&&req.session.user)return next(); if(req.path.startsWith('/api/'))return res.status(401).json({error:'login_required'});return res.redirect('/login')}
app.get('/health',(_q,r)=>r.json({ok:true,service:'zerops-xray-singbox-panel'}));
app.get('/static/app.js', (_q, r) => r.sendFile(path.join(__dirname, 'public', 'app.js')));
app.get('/static/:file', (q, r, next) => { if (!/^[a-zA-Z0-9._-]+$/.test(q.params.file)) return r.status(400).end(); next(); });
app.get('/login',(_q,r)=>r.send(loginPage('')));
app.post('/login',(q,r)=>{const d=readDB(),u=d.users.find(x=>x.username===q.body.username);if(!u||!safeEq(u.passwordHash,hash(q.body.password||'')))return r.status(401).send(loginPage('نام کاربری یا رمز عبور نادرست است.'));q.session.user=u.username;r.redirect('/')});
app.post('/logout',(q,r)=>q.session.destroy(()=>r.redirect('/login')));
app.get('/',auth,(q,r)=>r.send(dashboard(readDB(),q.session.user)));
app.get('/api/state',auth,(q,r)=>{const d=readDB();r.json({domain:d.domain,inbounds:d.inbounds.map(publicInbound)})});
app.post('/api/domain',auth,(q,r)=>{const domain=String(q.body.domain||'').trim().toLowerCase();if(domain&&!/^(?=.{1,253}$)[a-z0-9]+([-.][a-z0-9]+)*\.[a-z]{2,}$/i.test(domain))return r.status(400).json({error:'دامنه معتبر نیست'});const d=readDB();d.domain=domain;writeDB(d);r.json({ok:true})});
app.post('/api/password',auth,(q,r)=>{const old=String(q.body.oldPassword||''),next=String(q.body.newPassword||'');if(next.length<14)return r.status(400).json({error:'رمز جدید باید حداقل ۱۴ نویسه باشد'});const d=readDB(),u=d.users.find(x=>x.username===q.session.user);if(!u||!safeEq(u.passwordHash,hash(old)))return r.status(403).json({error:'رمز فعلی نادرست است'});u.passwordHash=hash(next);writeDB(d);r.json({ok:true})});
const TYPES={vless_ws:{label:'VLESS WebSocket',protocol:'vless',transport:'ws',port:3001,path:'/vws'},trojan_ws:{label:'Trojan WebSocket',protocol:'trojan',transport:'ws',port:3002,path:'/tws'},vless_xhttp:{label:'VLESS XHTTP',protocol:'vless',transport:'xhttp',port:3003,path:'/vxhttp'},trojan_xhttp:{label:'Trojan XHTTP',protocol:'trojan',transport:'xhttp',port:3004,path:'/txhttp'}};
function publicInbound(x){return {id:x.id,name:x.name,type:x.type,uuid:x.uuid,createdAt:x.createdAt,link:makeLink(x,readDB().domain),port:TYPES[x.type]?.port}}
function makeLink(x,domain){if(!domain||!TYPES[x.type])return '';const t=TYPES[x.type];const cred=t.protocol==='vless'?x.uuid:encodeURIComponent(x.password);const params=new URLSearchParams({encryption:'none',security:'tls',type:t.transport,host:domain,path:t.path,sni:domain});return `${t.protocol}://${cred}@${domain}:${443}?${params.toString()}#${encodeURIComponent(x.name)}`}
app.post('/api/inbounds',auth,(q,r)=>{const type=String(q.body.type||''),name=String(q.body.name||'').trim().slice(0,64);if(!TYPES[type])return r.status(400).json({error:'نوع کانفیگ نامعتبر است'});if(!name)return r.status(400).json({error:'نام کانفیگ را وارد کنید'});const d=readDB();const x={id:crypto.randomUUID(),name,type,uuid:crypto.randomUUID(),password:crypto.randomBytes(24).toString('base64url'),createdAt:new Date().toISOString()};d.inbounds.unshift(x);writeDB(d);writeCoreConfigs(d);r.json({ok:true,inbound:publicInbound(x)})});
app.delete('/api/inbounds/:id',auth,(q,r)=>{const d=readDB(),before=d.inbounds.length;d.inbounds=d.inbounds.filter(x=>x.id!==q.params.id);if(before===d.inbounds.length)return r.status(404).json({error:'یافت نشد'});writeDB(d);writeCoreConfigs(d);r.json({ok:true})});
app.get('/api/qr/:id',auth,async(q,r)=>{const x=readDB().inbounds.find(i=>i.id===q.params.id);if(!x)return r.status(404).end();const link=makeLink(x,readDB().domain);if(!link)return r.status(400).json({error:'ابتدا دامنه عمومی Zerops را در پنل وارد کنید'});r.type('png').send(await QRCode.toBuffer(link,{width:320,margin:2}))});
function writeCoreConfigs(d){
  const xray={log:{loglevel:'warning'},inbounds:[],outbounds:[{protocol:'freedom',tag:'direct'}]};
  const sing={log:{level:'warn'},inbounds:[],outbounds:[{type:'direct',tag:'direct'}]};
  for(const x of d.inbounds){const t=TYPES[x.type];if(!t)continue;
    if(t.protocol==='vless')xray.inbounds.push({tag:x.id,listen:'0.0.0.0',port:t.port,protocol:'vless',settings:{clients:[{id:x.uuid}],decryption:'none'},streamSettings:{network:t.transport==='ws'?'ws':'xhttp',security:'none',wsSettings:t.transport==='ws'?{path:t.path}:undefined,xhttpSettings:t.transport==='xhttp'?{path:t.path,mode:'auto'}:undefined}});
    else xray.inbounds.push({tag:x.id,listen:'0.0.0.0',port:t.port,protocol:'trojan',settings:{clients:[{password:x.password}]},streamSettings:{network:t.transport==='ws'?'ws':'xhttp',security:'none',wsSettings:t.transport==='ws'?{path:t.path}:undefined,xhttpSettings:t.transport==='xhttp'?{path:t.path,mode:'auto'}:undefined}});
    const inb={type:t.protocol,tag:x.id,listen:'0.0.0.0',listen_port:t.port};if(t.protocol==='vless'){inb.users=[{uuid:x.uuid}]}else inb.users=[{password:x.password}];inb.transport=t.transport==='ws'?{type:'ws',path:t.path}:{type:'http',path:t.path};sing.inbounds.push(inb);
  }
  fs.writeFileSync(path.join(CONFIG_DIR,'xray.generated.json'),JSON.stringify(xray,null,2));fs.writeFileSync(path.join(CONFIG_DIR,'sing-box.generated.json'),JSON.stringify(sing,null,2));
}
app.get('/api/core-status',auth,(_q,r)=>{r.json({note:'هسته‌ها فقط وقتی اجرا و به پورت‌های Zerops متصل شده باشند فعال‌اند؛ این وضعیت‌سنجی نسخه فعلی صرفاً وجود باینری‌ها و فایل‌های تولیدشده را گزارش می‌دهد.',xrayBinary:fs.existsSync('/usr/local/bin/xray'),singBoxBinary:fs.existsSync('/usr/local/bin/sing-box'),xrayConfig:fs.existsSync(path.join(CONFIG_DIR,'xray.generated.json')),singBoxConfig:fs.existsSync(path.join(CONFIG_DIR,'sing-box.generated.json')),runtimeImplemented:false,dataDirWritable:(()=>{try{fs.accessSync(DATA_DIR,fs.constants.W_OK);return true}catch{return false}})()})});
app.use('/static', express.static(path.join(__dirname, 'public'), {fallthrough:false, etag:true, maxAge:0}));
function loginPage(error){return `<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ورود مدیر</title><style>${css}</style><main class="login"><h1>Zerops Proxy Panel</h1><p>ورود مدیر</p><div class="err">${error}</div><form method="post" action="/login"><label>نام کاربری<input name="username" autocomplete="username" required></label><label>رمز عبور<input type="password" name="password" autocomplete="current-password" required></label><button>ورود</button></form><small>رمز اولیه از متغیر ADMIN_PASSWORD تعیین می‌شود؛ پس از اولین ورود آن را تغییر دهید.</small></main></html>`}
function dashboard(d,user){return `<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>مدیریت Xray / sing-box</title><style>${css}</style><header><div><b>Zerops Proxy Panel</b><small>مدیر: ${esc(user)}</small></div><form method="post" action="/logout"><button class="secondary">خروج</button></form></header><main><section class="card"><h2>۱. دامنه عمومی</h2><p>در Zerops برای هر پورت، دسترسی عمومی جداگانه فعال کنید. نام دامنه را برای تولید لینک وارد کنید. از دامنه‌های نمونه استفاده نکنید.</p><div class="inline"><input id="domain" placeholder="example.zerops.app" value="${esc(d.domain)}"><button type="button" data-action="save-domain">ذخیره دامنه</button></div><small id="domainmsg"></small></section><section class="card"><h2>۲. ساخت کانفیگ</h2><div class="formgrid"><label>نام کانفیگ<input id="name" placeholder="مثلاً VLESS WS 01"></label><label>نوع<select id="type"><option value="vless_ws">VLESS WebSocket TLS</option><option value="trojan_ws">Trojan WebSocket TLS</option><option value="vless_xhttp">VLESS XHTTP TLS</option><option value="trojan_xhttp">Trojan XHTTP TLS</option></select></label></div><button type="button" data-action="create">ساخت کانفیگ</button><small id="createmsg"></small></section><section class="card"><h2>۳. کانفیگ‌های ساخته‌شده</h2><div id="items">در حال بارگذاری…</div></section><section class="card"><h2>۴. تغییر رمز مدیر</h2><div class="formgrid"><label>رمز فعلی<input id="oldpass" type="password"></label><label>رمز جدید (حداقل ۱۴ نویسه)<input id="newpass" type="password"></label></div><button type="button" data-action="change-password">تغییر رمز</button><small id="passmsg"></small></section><section class="card"><h2>وضعیت هسته‌ها</h2><p>این نسخه رکورد و فایل‌های تنظیمات را تولید می‌کند، اما اجرای واقعی هسته‌ها هنوز در آن پیاده‌سازی نشده است؛ لینک‌ها را کانفیگ عملیاتی فرض نکنید.</p><button type="button" class="secondary" data-action="status">بررسی وضعیت</button><pre id="status"></pre><small id="statusmsg"></small></section></main><script src="/static/app.js" defer></script></html>`}
const css=`*{box-sizing:border-box}body{margin:0;background:#0b1020;color:#e8edf7;font:15px system-ui,sans-serif}header{display:flex;justify-content:space-between;align-items:center;padding:18px max(18px,calc((100% - 950px)/2));background:#121a2d;border-bottom:1px solid #29344b}header small,small{display:block;color:#aab6ce;margin-top:6px}main{max-width:950px;margin:24px auto;padding:0 16px}.card,.login{background:#121a2d;border:1px solid #29344b;border-radius:16px;padding:20px;margin-bottom:16px}.login{max-width:420px;margin:8vh auto}.login form{display:grid;gap:12px}h1{font-size:24px}h2{font-size:18px;margin-top:0}p{color:#bac5da;line-height:1.7}label{display:grid;gap:7px;color:#c8d2e6}input,select,textarea{width:100%;background:#0b1020;border:1px solid #35415c;color:#f5f7fb;padding:11px;border-radius:9px;font:inherit}textarea{min-height:70px;direction:ltr;text-align:left}button{border:0;border-radius:9px;padding:10px 15px;background:#7c9cff;color:#081126;font-weight:700;cursor:pointer;margin:8px 0}button.secondary{background:#303c55;color:#fff}button.danger{background:#6c2d3a;color:#fff}.inline,.formgrid,.actions{display:flex;gap:10px;align-items:end;flex-wrap:wrap}.inline input{flex:1}.formgrid>*{flex:1;min-width:220px}article{padding:14px 0;border-bottom:1px solid #29344b}.qr{display:block;width:180px;background:white;padding:8px;margin-top:10px}.err{color:#ff9b9b}`;
function esc(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
app.use((err, req, res, next) => {
  console.error('[http-error]', req.method, req.originalUrl, err && (err.stack || err.message || err));
  if (res.headersSent) return next(err);
  res.status(err.status || 500);
  if (req.path.startsWith('/api/')) return res.json({error: err.status === 404 ? 'مسیر API پیدا نشد' : 'خطای داخلی سرور'});
  return res.type('text').send(err.status === 404 ? 'Not found' : 'Internal server error');
});
app.listen(PORT,'0.0.0.0',()=>{
  try { writeCoreConfigs(readDB()); } catch (e) { console.error('[startup-config-write-error]', e.stack || e); }
  console.log(`[panel] listening on 0.0.0.0:${PORT}`);
  console.log(`[panel] static app.js: ${path.join(__dirname, 'public', 'app.js')} (${fs.existsSync(path.join(__dirname, 'public', 'app.js')) ? 'present' : 'MISSING'})`);
  console.log(`[panel] data directory: ${DATA_DIR}`);
});
