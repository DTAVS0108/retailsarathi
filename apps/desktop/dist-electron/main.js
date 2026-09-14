"use strict";const i=require("electron"),u=require("path"),T=require("fs"),k=require("better-sqlite3"),y=require("crypto");let o;function m(t,e,n){o.prepare(`PRAGMA table_info(${t})`).all().some(a=>a.name===e)||o.exec(`ALTER TABLE ${t} ADD COLUMN ${n}`)}function I(){const t=u.join(i.app.getPath("userData"),"retail-sarathi.db");o=new k(t),o.pragma("journal_mode = WAL"),o.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      sku TEXT NOT NULL,
      barcode TEXT,
      name TEXT NOT NULL,
      hsn_code TEXT NOT NULL,
      sale_price REAL NOT NULL,
      gst_rate REAL NOT NULL,
      stock_qty REAL NOT NULL DEFAULT 0,
      category TEXT,
      brand TEXT,
      synced_at TEXT
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      invoice_number TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      synced INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sync_outbox (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cashier_pins (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      pin_hash TEXT NOT NULL,
      token TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `),m("products","category","category TEXT"),m("products","brand","brand TEXT"),m("products","purchase_price","purchase_price REAL NOT NULL DEFAULT 0"),m("products","mrp","mrp REAL"),o.prepare("SELECT COUNT(*) as c FROM products").get().c===0&&A()}function A(){const t=[["8901234567890","SAM-A54-128","Samsung Galaxy A54 128GB","8517",28999,18,15,"Mobile","Samsung"],["8901234567891","IPH-13-128","iPhone 13 128GB","8517",54999,18,8,"Mobile","Apple"],["8901234567892","SCR-IP13","iPhone 13 Screen Assembly","8517",4500,18,25,"Accessories","Apple"],["8901234567893","EAR-BT01","Bluetooth Earbuds TWS","8518",1499,18,50,"Accessories","Generic"],["8901234567894","CHG-C20","Type-C Fast Charger 20W","8504",999,18,100,"Accessories","Generic"]],e=o.prepare(`
    INSERT INTO products (id, barcode, sku, name, hsn_code, sale_price, gst_rate, stock_qty, category, brand)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);for(const[n,r,a,s,l,p,f,h,b]of t)e.run(y.randomUUID(),n,r,a,s,l,p,f,h,b)}function D(){return o.prepare("SELECT * FROM products ORDER BY name").all()}function x(t){const e=y.randomUUID();return o.transaction(()=>{o.prepare(`
      INSERT INTO invoices (id, invoice_number, payload, created_at, synced)
      VALUES (?, ?, ?, ?, 0)
    `).run(e,t.invoiceNumber,JSON.stringify(t),new Date().toISOString()),o.prepare(`
      INSERT INTO sync_outbox (id, entity_type, entity_id, operation, payload, status, created_at)
      VALUES (?, 'invoice', ?, 'CREATE', ?, 'PENDING', ?)
    `).run(y.randomUUID(),e,JSON.stringify(t),new Date().toISOString());const r=t.lines;for(const a of r)a.productId&&o.prepare("UPDATE products SET stock_qty = stock_qty - ? WHERE id = ?").run(a.quantity,a.productId)})(),{id:e}}function v(){return o.prepare("SELECT * FROM sync_outbox WHERE status = 'PENDING'").all()}function U(t){o.prepare("UPDATE sync_outbox SET status = 'SYNCED' WHERE id = ?").run(t)}function S(t){const e=o.prepare("SELECT value FROM settings WHERE key = ?").get(t);return(e==null?void 0:e.value)??null}function _(t,e){o.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(t,e)}function C(t){const e=S(t);if(!e)return null;try{return JSON.parse(e)}catch{return null}}function M(t,e){_(t,JSON.stringify(e))}function O(t){const e=o.prepare(`
    INSERT INTO products (id, sku, barcode, name, hsn_code, sale_price, gst_rate, stock_qty, category, brand, purchase_price, mrp, synced_at)
    VALUES (@id, @sku, @barcode, @name, @hsnCode, @salePrice, @gstRate, @stockQty, @category, @brand, @purchasePrice, @mrp, @syncedAt)
    ON CONFLICT(id) DO UPDATE SET
      stock_qty = @stockQty,
      sale_price = @salePrice,
      gst_rate = @gstRate,
      category = @category,
      brand = @brand,
      purchase_price = @purchasePrice,
      mrp = @mrp,
      synced_at = @syncedAt
  `);o.transaction(()=>{for(const r of t)e.run({id:r.id,sku:r.sku,barcode:r.barcode??null,name:r.name,hsnCode:r.hsnCode??r.hsn_code,salePrice:Number(r.salePrice??r.sale_price),gstRate:Number(r.gstRate??r.gst_rate),stockQty:Number(r.stockQty??r.stock_qty),category:r.category??null,brand:r.brand??null,purchasePrice:Number(r.purchasePrice??r.purchase_price??0),mrp:r.mrp!=null?Number(r.mrp):null,syncedAt:new Date().toISOString()})})()}function F(){const t=o.prepare("SELECT COUNT(*) as c FROM sync_outbox WHERE status = 'PENDING'").get();return(t==null?void 0:t.c)??0}function R(t){const e=S("pin-salt")||(()=>{const n=y.randomUUID();return _("pin-salt",n),n})();return y.createHash("sha256").update(`${e}:${t}`).digest("hex")}function X(){const t=o.prepare("SELECT COUNT(*) as c FROM cashier_pins").get();return((t==null?void 0:t.c)??0)>0}function B(t,e,n){const r=y.randomUUID();return o.prepare("INSERT INTO cashier_pins (id, label, pin_hash, token, created_at) VALUES (?, ?, ?, ?, ?)").run(r,t,R(e),n,new Date().toISOString()),!0}function $(t){const e=R(t),n=o.prepare("SELECT label, token FROM cashier_pins WHERE pin_hash = ?").get(e);return n?{ok:!0,token:n.token,label:n.label}:{ok:!1}}function W(){return o.prepare("DELETE FROM cashier_pins").run(),!0}const L="device-id";async function j(t,e){const n=[];let r=1;const a=200;for(;;){const s=await fetch(`${e}/products?page=${r}&pageSize=${a}`,{headers:{Authorization:`Bearer ${t}`}});if(!s.ok)break;const l=await s.json(),p=l.items??l;if(!Array.isArray(p)||p.length===0||(n.push(...p),p.length<a)||(r+=1,r>50))break}return n.length&&O(n),n.length}async function H(t,e){var b,w;const n=V(),r=e.replace(/\/$/,""),a=v(),s=a.map(c=>({entityType:c.entity_type,entityId:c.entity_id,operation:c.operation,payload:JSON.parse(c.payload)}));let l=0;if(s.length>0){const c=await fetch(`${r}/sync/push?deviceId=${n}`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${t}`},body:JSON.stringify({entries:s})});if(!c.ok){const g=await c.text().catch(()=>"");throw new Error(`Sync push failed (${c.status}): ${g.slice(0,200)}`)}const{results:N}=await c.json();for(let g=0;g<N.length;g++)N[g].status==="SYNCED"&&(U(a[g].id),l+=1)}const p=await fetch(`${r}/sync/pull?deviceId=${n}`,{headers:{Authorization:`Bearer ${t}`}});let f=!1;if(p.ok){const c=await p.json();(w=(b=c.changes)==null?void 0:b.products)!=null&&w.length&&O(c.changes.products),f=!0}let h=0;try{h=await j(t,r)}catch{}return{pushed:l,pulled:f,catalogCount:h}}function V(){const t=S(L);if(t)return t;const e=y.randomUUID();return _(L,e),e}let E=null;function q(){const t=[u.join(process.resourcesPath,"app-icon.png"),u.join(__dirname,"../build/icon.png"),u.join(i.app.getAppPath(),"build/icon.png")];for(const e of t)if(T.existsSync(e))return e}(process.env.VITE_DEV_SERVER_URL||process.env.RS_CDP_PORT)&&i.app.commandLine.appendSwitch("remote-debugging-port",process.env.RS_CDP_PORT||"9222");function Y(){const t=q();E=new i.BrowserWindow({width:1280,height:800,title:"RetailSarathi POS",...t?{icon:t}:{},webPreferences:{preload:u.join(__dirname,"preload.js"),contextIsolation:!0,nodeIntegration:!1,sandbox:!1}}),E.webContents.setWindowOpenHandler(({url:e})=>e.startsWith("blob:")||e.startsWith("data:")?{action:"allow",overrideBrowserWindowOptions:{width:1024,height:900,autoHideMenuBar:!0,webPreferences:{contextIsolation:!0,nodeIntegration:!1}}}:e.startsWith("http:")||e.startsWith("https:")?(i.shell.openExternal(e),{action:"deny"}):{action:"allow"}),process.env.VITE_DEV_SERVER_URL?(E.loadURL(process.env.VITE_DEV_SERVER_URL),E.webContents.openDevTools()):E.loadFile(u.join(__dirname,"../dist/index.html"))}i.app.whenReady().then(()=>{I(),Y()});i.app.on("window-all-closed",()=>{process.platform!=="darwin"&&i.app.quit()});i.ipcMain.handle("db:products",()=>D());i.ipcMain.handle("db:save-invoice",(t,e)=>x(e));i.ipcMain.handle("db:outbox",()=>v());i.ipcMain.handle("db:outbox-count",()=>F());i.ipcMain.handle("sync:run",(t,e,n)=>H(e,n));i.ipcMain.handle("settings:get",(t,e)=>S(e));i.ipcMain.handle("settings:set",(t,e,n)=>(_(e,n),!0));i.ipcMain.handle("settings:get-json",(t,e)=>C(e));i.ipcMain.handle("settings:set-json",(t,e,n)=>(M(e,n),!0));i.ipcMain.handle("app:set-title",(t,e)=>{const n=String(e||"").trim();return E&&n&&E.setTitle(n),!0});i.ipcMain.handle("auth:has-pins",()=>X());i.ipcMain.handle("auth:set-pin",(t,e)=>B(e.label||"Cashier",e.pin,e.token));i.ipcMain.handle("auth:verify-pin",(t,e)=>$(e));i.ipcMain.handle("auth:clear-pins",()=>W());i.ipcMain.handle("update:check",async()=>({available:!1,version:null}));i.ipcMain.handle("update:install",()=>!1);const G=Buffer.from([27,112,0,25,250]);i.ipcMain.handle("print:thermal",async(t,e)=>{const n=i.app.getPath("temp"),r=Date.now(),a=typeof e=="string"?{text:e}:e||{};let s;a.escposBase64?s=Buffer.from(a.escposBase64,"base64"):s=Buffer.from(a.text||"","utf8"),a.kickDrawer&&(s=Buffer.concat([s,G]));const l=u.join(n,`retailsarathi-thermal-${r}.bin`),p=u.join(n,`retailsarathi-thermal-${r}.txt`);T.writeFileSync(l,s),a.text?T.writeFileSync(p,a.text,"utf8"):T.writeFileSync(p,s);const f=(a.comPort||process.env.THERMAL_COM_PORT||"").trim().toUpperCase();let h=!1,b;if(f&&process.platform==="win32"){const w=f.startsWith("COM")?`\\\\.\\${f}`:f;try{T.writeFileSync(w,s),h=!0}catch(c){b=c instanceof Error?c.message:String(c),console.warn("COM thermal write failed:",b)}}if(console.log("--- THERMAL PRINT ---"),a.text&&console.log(a.text),console.log("Thermal .bin saved:",l,"bytes=",s.length,"com=",f||"none",h),!h)try{await i.shell.openPath(l)}catch{}return{ok:!0,path:l,textPath:p,bytes:s.length,comPort:f||null,comWritten:h,comError:b||null,bluetoothAddress:a.bluetoothAddress||null,kickDrawer:!!a.kickDrawer}});i.ipcMain.handle("shell:open-external",(t,e)=>i.shell.openExternal(e));let d=null,P=null;function z(t){const e=t.includes("<html")?t:`<!DOCTYPE html><html><head><meta charset="utf-8" /></head><body>${t}</body></html>`,n=`
<style id="rs-print-preview-css">
  #rs-print-bar {
    position: fixed; top: 0; left: 0; right: 0; z-index: 2147483647;
    display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
    padding: 10px 14px;
    background: #0f172a; color: #f8fafc;
    font: 600 13px/1.2 system-ui, Segoe UI, sans-serif;
    box-shadow: 0 4px 16px rgba(15, 23, 42, 0.35);
  }
  #rs-print-bar .rs-grow { flex: 1; min-width: 8px; }
  #rs-print-bar .rs-hint { font-weight: 500; color: #94a3b8; font-size: 12px; }
  #rs-print-bar button {
    appearance: none; border: 0; border-radius: 8px;
    padding: 8px 14px; font: 700 13px/1 system-ui, Segoe UI, sans-serif;
    cursor: pointer;
  }
  #rs-print-bar button.rs-primary { background: #0d9488; color: #fff; }
  #rs-print-bar button.rs-primary:hover { background: #0f766e; }
  #rs-print-bar button.rs-secondary { background: #334155; color: #f8fafc; }
  #rs-print-bar button.rs-secondary:hover { background: #475569; }
  #rs-print-bar button.rs-ghost { background: transparent; color: #cbd5e1; }
  #rs-print-bar button.rs-ghost:hover { background: #1e293b; }
  #rs-print-bar button:disabled { opacity: 0.55; cursor: wait; }
  body.rs-has-print-bar { padding-top: 56px !important; }
  @media print {
    #rs-print-bar { display: none !important; }
    body.rs-has-print-bar { padding-top: 0 !important; }
  }
</style>
<div id="rs-print-bar" role="toolbar" aria-label="Print preview">
  <span>Print preview</span>
  <span class="rs-hint">This window is the preview — Windows print dialog cannot show one</span>
  <span class="rs-grow"></span>
  <button type="button" class="rs-primary" data-rs="print">Open PDF</button>
  <button type="button" class="rs-secondary" data-rs="pdf">Save PDF</button>
  <button type="button" class="rs-secondary" data-rs="direct">Print now</button>
  <button type="button" class="rs-ghost" data-rs="close">Close</button>
</div>
<script>
(function () {
  document.body.classList.add('rs-has-print-bar');
  var bar = document.getElementById('rs-print-bar');
  if (!bar || !window.rsPrintPreview) return;
  function busy(on) {
    bar.querySelectorAll('button').forEach(function (b) { b.disabled = !!on; });
  }
  bar.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.getAttribute) return;
    var action = t.getAttribute('data-rs');
    if (!action) return;
    if (action === 'close') { window.rsPrintPreview.close(); return; }
    busy(true);
    var p =
      action === 'print' ? window.rsPrintPreview.print() :
      action === 'direct' ? window.rsPrintPreview.printDirect() :
      window.rsPrintPreview.savePdf();
    Promise.resolve(p).finally(function () { busy(false); });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') window.rsPrintPreview.close();
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      window.rsPrintPreview.print();
    }
  });
})();
<\/script>`;return/<\/body>/i.test(e)?e.replace(/<\/body>/i,`${n}</body>`):`${e}${n}`}async function K(){const t=d;if(!t||t.isDestroyed())return{ok:!1,error:"Preview window is closed"};try{const e=await t.webContents.printToPDF({printBackground:!0,pageSize:"A4",margins:{marginType:"default"}}),n=u.join(i.app.getPath("temp"),`retailsarathi-print-${Date.now()}.pdf`);T.writeFileSync(n,e);const r=await i.shell.openPath(n);return r?{ok:!1,error:r}:{ok:!0}}catch(e){return{ok:!1,error:e instanceof Error?e.message:String(e)}}}async function J(){const t=d;return!t||t.isDestroyed()?{ok:!1,error:"Preview window is closed"}:new Promise(e=>{t.webContents.print({silent:!0,printBackground:!0,deviceName:""},(n,r)=>{e(n?{ok:!0}:{ok:!1,error:r||"Print failed — set a default printer in Windows"})})})}async function Q(){const t=d;if(!t||t.isDestroyed())return{ok:!1,error:"Preview window is closed"};const{canceled:e,filePath:n}=await i.dialog.showSaveDialog(t,{title:"Save invoice PDF",defaultPath:u.join(i.app.getPath("documents"),`invoice-${Date.now()}.pdf`),filters:[{name:"PDF",extensions:["pdf"]}]});if(e||!n)return{ok:!1,error:"Save cancelled"};try{const r=await t.webContents.printToPDF({printBackground:!0,pageSize:"A4",margins:{marginType:"default"}});return T.writeFileSync(n,r),await i.shell.openPath(n),{ok:!0}}catch(r){return{ok:!1,error:r instanceof Error?r.message:String(r)}}}function Z(){return d&&!d.isDestroyed()&&d.close(),!0}i.ipcMain.handle("print:html",async(t,e)=>{if(!e||typeof e!="string")return{ok:!1,error:"Empty print document"};d&&!d.isDestroyed()&&d.close();const n=Date.now(),r=u.join(i.app.getPath("temp"),`retailsarathi-a4-${n}.html`);P=r,T.writeFileSync(r,z(e),"utf8");const a=new i.BrowserWindow({width:920,height:1100,minWidth:640,minHeight:720,show:!1,autoHideMenuBar:!0,title:"RetailSarathi — Print preview",backgroundColor:"#ffffff",webPreferences:{preload:u.join(__dirname,"print-preview-preload.js"),contextIsolation:!0,nodeIntegration:!1,sandbox:!0}});d=a,a.on("closed",()=>{if(d===a&&(d=null),P){try{T.unlinkSync(P)}catch{}P=null}});try{return await a.loadFile(r),a.isMinimized()&&a.restore(),a.show(),a.focus(),a.moveTop(),{ok:!0}}catch(s){return a.isDestroyed()||a.destroy(),{ok:!1,error:s instanceof Error?s.message:String(s)}}});i.ipcMain.handle("print:preview-do-print",()=>K());i.ipcMain.handle("print:preview-print-direct",()=>J());i.ipcMain.handle("print:preview-save-pdf",()=>Q());i.ipcMain.handle("print:preview-close",()=>Z());
