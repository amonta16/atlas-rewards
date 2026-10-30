/**
 * CP-218 · boot watchdog — for the moments before React is running
 *
 * The boot splash (CP-211) and the cached Home are plain HTML painted from
 * the server's first bytes. They are lifted by JavaScript once the app has
 * hydrated. If the app's JavaScript never finishes arriving — a phone on a
 * weak connection, a script request stuck on a dead socket, a chunk from a
 * previous deploy that 404s — nothing ever lifts them, and no React-based
 * timeout can help because React isn't running yet. That's a loading screen
 * forever with no way out.
 *
 * This is a few hundred bytes of inline script in the root layout. It runs
 * before any bundle. If the app hasn't marked itself hydrated within
 * BOOT_STUCK_MS, or a /_next/ script fails to load, it draws a small card on
 * top of everything with the reason and a Reload button. Coming back online
 * reloads automatically. Once <HydrationMark/> has run it does nothing.
 */
const BOOT_STUCK_MS = 12000;

const SCRIPT = `(function(){try{
var shown=false;
function hydrated(){return !!window.__atlasHydrated}
function show(kind){
  if(shown||hydrated())return; shown=true;
  var off=navigator.onLine===false;
  var d=document.createElement("div");
  d.id="atlas-boot-stuck"; d.setAttribute("role","alert");
  d.style.cssText="position:fixed;left:0;right:0;bottom:0;z-index:2147483647;display:flex;justify-content:center;padding:16px;padding-bottom:calc(env(safe-area-inset-bottom,0px) + 16px);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;pointer-events:none";
  var t=off?"You're offline":(kind==="chunk"?"The app didn't finish loading":"This is taking too long");
  var s=off?"Connect to Wi-Fi or turn off Airplane Mode, then try again.":"Your connection may be weak. Tap Reload to try again.";
  d.innerHTML='<div style="pointer-events:auto;max-width:22rem;width:100%;background:#fff;color:#18181b;border-radius:16px;box-shadow:0 12px 32px rgba(0,0,0,.25);padding:16px;text-align:center"><div data-t style="font-weight:700;font-size:15px"></div><div data-s style="font-size:13px;color:#52525b;margin-top:4px"></div><button data-b type="button" style="margin-top:12px;border:0;border-radius:999px;background:#18181b;color:#fff;font-weight:600;font-size:14px;padding:10px 22px">Reload</button></div>';
  d.querySelector("[data-t]").textContent=t;
  d.querySelector("[data-s]").textContent=s;
  d.querySelector("[data-b]").onclick=function(){location.reload()};
  (document.body||document.documentElement).appendChild(d);
}
setTimeout(function(){show("slow")},${BOOT_STUCK_MS});
window.addEventListener("online",function(){if(shown&&!hydrated())location.reload()});
window.addEventListener("error",function(e){var t=e&&e.target;if(t&&t.tagName==="SCRIPT"&&/\\/_next\\//.test(t.src||""))show("chunk")},true);
}catch(e){}})();`;

export function BootWatchdogScript() {
  return <script id="atlas-boot-watchdog" dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}

