"use strict";
async function api(url,opt={}){
  const r=await fetch(url,{credentials:"same-origin",headers:{"Content-Type":"application/json",...(opt.headers||{})},...opt});
  const text=await r.text(); let data={}; try{data=JSON.parse(text)}catch{}
  if(!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  if(!text || !text.trim()) return {};
  if(typeof data !== "object" || data===null) throw new Error("پاسخ نامعتبر از سرور");
  return data;
}
function esc(s){return String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function msg(id,text){const e=document.getElementById(id);if(e)e.textContent=text}
async function saveDomain(){try{await api("/api/domain",{method:"POST",body:JSON.stringify({domain:document.querySelector("#domain").value})});msg("domainmsg","ذخیره شد.");await load()}catch(e){msg("domainmsg","خطا: "+e.message)}}
async function createInbound(){const name=document.querySelector("#name").value.trim();if(!name){msg("createmsg","ابتدا نام کانفیگ را وارد کنید.");return}try{await api("/api/inbounds",{method:"POST",body:JSON.stringify({name,type:document.querySelector("#type").value})});msg("createmsg","رکورد ساخته شد؛ توجه: اجرای واقعی هسته‌ها هنوز فعال نیست.");document.querySelector("#name").value="";await load()}catch(e){msg("createmsg","خطا: "+e.message)}}
async function del(id){if(!confirm("این کانفیگ حذف شود؟"))return;try{await api("/api/inbounds/"+encodeURIComponent(id),{method:"DELETE"});await load()}catch(e){alert("خطا: "+e.message)}}
async function copyLink(link){if(!link)return alert("ابتدا دامنه عمومی را تنظیم کنید");try{await navigator.clipboard.writeText(link);alert("کپی شد")}catch{prompt("لینک را کپی کنید:",link)}}
async function qr(id){const im=document.querySelector("#qr-"+CSS.escape(id));if(!im)return;im.src="/api/qr/"+encodeURIComponent(id);im.hidden=false;im.onerror=()=>alert("QR ساخته نشد؛ دامنه را بررسی کنید.")}
async function changePass(){try{await api("/api/password",{method:"POST",body:JSON.stringify({oldPassword:document.querySelector("#oldpass").value,newPassword:document.querySelector("#newpass").value})});msg("passmsg","رمز تغییر کرد.")}catch(e){msg("passmsg","خطا: "+e.message)}}
async function status(){try{document.querySelector("#status").textContent=JSON.stringify(await api("/api/core-status"),null,2);msg("statusmsg","")}catch(e){msg("statusmsg","خطا: "+e.message)}}
async function load(){try{const d=await api("/api/state");const root=document.querySelector("#items");root.innerHTML=d.inbounds.length?d.inbounds.map(x=>`<article><b>${esc(x.name)}</b><p>${esc(x.type)} · پورت داخلی ${x.port}</p><textarea readonly>${esc(x.link||"ابتدا دامنه عمومی را وارد کنید")}</textarea><div class="actions"><button type="button" data-action="copy" data-link="${esc(x.link||"")}">کپی لینک</button><button type="button" class="secondary" data-action="qr" data-id="${esc(x.id)}">نمایش QR</button><button type="button" class="danger" data-action="delete" data-id="${esc(x.id)}">حذف</button></div><img id="qr-${esc(x.id)}" class="qr" hidden></article>`).join(""):"<p>هنوز کانفیگی نساخته‌اید.</p>"}catch(e){msg("createmsg","بارگذاری اطلاعات ناموفق بود: "+e.message);if(e.message.includes("login_required")||e.message.includes("401"))location.href="/login"}}
document.addEventListener("click",e=>{const b=e.target.closest("[data-action]");if(!b)return;const a=b.dataset.action;if(a==="save-domain")saveDomain();else if(a==="create")createInbound();else if(a==="change-password")changePass();else if(a==="status")status();else if(a==="copy")copyLink(b.dataset.link);else if(a==="qr")qr(b.dataset.id);else if(a==="delete")del(b.dataset.id)});
window.addEventListener("error",e=>{const text="خطای JavaScript: "+(e.message||"نامشخص");msg("createmsg",text)});
load();
