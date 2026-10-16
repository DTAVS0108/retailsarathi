"use strict";const a=require("electron"),u=require("path"),c=require("fs"),x=require("better-sqlite3-multiple-ciphers"),T=require("crypto"),q=5,D=3e4;function G(t){return a.safeStorage.isEncryptionAvailable()?a.safeStorage.encryptString(t).toString("base64"):t}function V(t){if(!a.safeStorage.isEncryptionAvailable())return t;try{return a.safeStorage.decryptString(Buffer.from(t,"base64"))}catch{return""}}let o;function A(){return u.join(a.app.getPath("userData"),"retail-sarathi.db")}function Y(){return u.join(a.app.getPath("userData"),"db-key.enc")}function K(){if(!a.safeStorage.isEncryptionAvailable())throw new Error("Secure storage (OS keychain) is not available on this device — cannot open or create the encrypted local database.");const t=Y();if(c.existsSync(t))return a.safeStorage.decryptString(c.readFileSync(t));const e=T.randomBytes(32).toString("hex");return c.writeFileSync(t,a.safeStorage.encryptString(e)),e}function z(t){const e=c.openSync(t,"r");try{const r=Buffer.alloc(16);return c.readSync(e,r,0,16,0),r.toString("utf8",0,15)==="SQLite format 3"}finally{c.closeSync(e)}}let b=null;function S(t,e){const r=e.map(()=>"?").join(","),n=t.prepare(`SELECT COUNT(*) as c FROM sync_outbox WHERE status IN (${r})`).get(...e);return(n==null?void 0:n.c)??0}function U(){const t=A();c.renameSync(t,`${t}.pre-encryption.bak`)}function M(){const t=A();if(!c.existsSync(t))return{state:"not_needed"};if(!z(t))return{state:"migrated",justSwapped:!1};const e=new x(t);return S(e,["PENDING","FAILED","CONFLICT"])===0?(e.close(),U(),{state:"migrated",justSwapped:!0}):(b=e,o=e,{state:"blocked",pendingCount:S(e,["PENDING"]),failedCount:S(e,["FAILED","CONFLICT"])})}async function J(t,e){if(!b)return M();const{syncWithServer:r}=await Promise.resolve().then(()=>de);if(await r(t,e),S(b,["PENDING","FAILED","CONFLICT"])>0)return{state:"blocked",pendingCount:S(b,["PENDING"]),failedCount:S(b,["FAILED","CONFLICT"])};const i=b.prepare("SELECT value FROM settings WHERE key = ?").get("device-id");return b.close(),b=null,U(),I({skipSeedIfEmpty:!0}),i!=null&&i.value&&N("device-id",i.value),await r(t,e),{state:"migrated",justSwapped:!0}}function P(t,e,r){o.prepare(`PRAGMA table_info(${t})`).all().some(i=>i.name===e)||o.exec(`ALTER TABLE ${t} ADD COLUMN ${r}`)}function I(t={}){const e=K();o=new x(A()),o.pragma("cipher='sqlcipher'"),o.pragma(`key="x'${e}'"`),o.pragma("journal_mode = WAL"),o.exec(`
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
  `),P("products","category","category TEXT"),P("products","brand","brand TEXT"),P("products","purchase_price","purchase_price REAL NOT NULL DEFAULT 0"),P("products","mrp","mrp REAL"),P("cashier_pins","role","role TEXT"),o.prepare("SELECT COUNT(*) as c FROM products").get().c===0&&!t.skipSeedIfEmpty&&Q()}function Q(){const t=[["8901234567890","SAM-A54-128","Samsung Galaxy A54 128GB","8517",28999,18,15,"Mobile","Samsung"],["8901234567891","IPH-13-128","iPhone 13 128GB","8517",54999,18,8,"Mobile","Apple"],["8901234567892","SCR-IP13","iPhone 13 Screen Assembly","8517",4500,18,25,"Accessories","Apple"],["8901234567893","EAR-BT01","Bluetooth Earbuds TWS","8518",1499,18,50,"Accessories","Generic"],["8901234567894","CHG-C20","Type-C Fast Charger 20W","8504",999,18,100,"Accessories","Generic"]],e=o.prepare(`
    INSERT INTO products (id, barcode, sku, name, hsn_code, sale_price, gst_rate, stock_qty, category, brand)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);for(const[r,n,i,s,d,l,y,h,g]of t)e.run(T.randomUUID(),r,n,i,s,d,l,y,h,g)}function Z(){return o.prepare("SELECT * FROM products ORDER BY name").all()}function ee(t){const e=T.randomUUID();return o.transaction(()=>{o.prepare(`
      INSERT INTO invoices (id, invoice_number, payload, created_at, synced)
      VALUES (?, ?, ?, ?, 0)
    `).run(e,t.invoiceNumber,JSON.stringify(t),new Date().toISOString()),o.prepare(`
      INSERT INTO sync_outbox (id, entity_type, entity_id, operation, payload, status, created_at)
      VALUES (?, 'invoice', ?, 'CREATE', ?, 'PENDING', ?)
    `).run(T.randomUUID(),e,JSON.stringify(t),new Date().toISOString());const n=t.lines;for(const i of n)i.productId&&o.prepare("UPDATE products SET stock_qty = MAX(0, stock_qty - ?) WHERE id = ?").run(i.quantity,i.productId)})(),{id:e}}function F(){return o.prepare("SELECT * FROM sync_outbox WHERE status = 'PENDING'").all()}function te(t){o.prepare("UPDATE sync_outbox SET status = 'SYNCED' WHERE id = ?").run(t)}function C(t,e){o.prepare("UPDATE sync_outbox SET status = ? WHERE id = ?").run(e,t)}function ne(){const t=o.prepare("SELECT COUNT(*) as c FROM sync_outbox WHERE status IN ('FAILED', 'CONFLICT')").get();return(t==null?void 0:t.c)??0}function v(t){const e=o.prepare("SELECT value FROM settings WHERE key = ?").get(t);return(e==null?void 0:e.value)??null}function N(t,e){o.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(t,e)}function X(t){const e=v(t);if(!e)return null;try{return JSON.parse(e)}catch{return null}}function O(t,e){N(t,JSON.stringify(e))}function B(t){const e=o.prepare(`
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
  `);o.transaction(()=>{for(const n of t)e.run({id:n.id,sku:n.sku,barcode:n.barcode??null,name:n.name,hsnCode:n.hsnCode??n.hsn_code,salePrice:Number(n.salePrice??n.sale_price),gstRate:Number(n.gstRate??n.gst_rate),stockQty:Number(n.stockQty??n.stock_qty),category:n.category??null,brand:n.brand??null,purchasePrice:Number(n.purchasePrice??n.purchase_price??0),mrp:n.mrp!=null?Number(n.mrp):null,syncedAt:new Date().toISOString()})})()}function re(){const t=o.prepare("SELECT payload FROM sync_outbox WHERE status = 'PENDING' AND entity_type = 'invoice'").all(),e={};for(const r of t){let n;try{n=JSON.parse(r.payload)}catch{continue}for(const i of n.lines??[])i.productId&&(e[i.productId]=(e[i.productId]??0)+Number(i.quantity??0))}return e}function ie(){const t=o.prepare("SELECT COUNT(*) as c FROM sync_outbox WHERE status = 'PENDING'").get();return(t==null?void 0:t.c)??0}function W(t){const e=v("pin-salt")||(()=>{const r=T.randomUUID();return N("pin-salt",r),r})();return T.createHash("sha256").update(`${e}:${t}`).digest("hex")}function ae(){const t=o.prepare("SELECT COUNT(*) as c FROM cashier_pins").get();return((t==null?void 0:t.c)??0)>0}function oe(t,e,r,n){const i=T.randomUUID();return o.prepare("INSERT INTO cashier_pins (id, label, pin_hash, token, role, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(i,t,W(e),G(r),n??null,new Date().toISOString()),!0}function se(){return X("pin-lockout")??{failedAttempts:0,lockedUntil:null}}function ce(t){const e=se();if(e.lockedUntil&&new Date(e.lockedUntil).getTime()>Date.now())return{ok:!1,lockedForMs:new Date(e.lockedUntil).getTime()-Date.now()};const r=W(t),n=o.prepare("SELECT label, token, role FROM cashier_pins WHERE pin_hash = ?").get(r);if(n)return O("pin-lockout",{failedAttempts:0,lockedUntil:null}),{ok:!0,token:V(n.token),label:n.label,role:n.role};const i=e.failedAttempts+1,s=i>=q?new Date(Date.now()+D).toISOString():null;return O("pin-lockout",{failedAttempts:s?0:i,lockedUntil:s}),{ok:!1,lockedForMs:s?D:void 0}}function pe(){return o.prepare("DELETE FROM cashier_pins").run(),!0}const R="device-id";async function le(t,e){const r=[];let n=1;const i=200;for(;;){const s=await fetch(`${e}/products?page=${n}&pageSize=${i}`,{headers:{Authorization:`Bearer ${t}`}});if(!s.ok)break;const d=await s.json(),l=d.items??d;if(!Array.isArray(l)||l.length===0||(r.push(...l),l.length<i)||(n+=1,n>50))break}return r.length&&B(r),r.length}async function $(t,e){var g,L;const r=ue(),n=e.replace(/\/$/,""),i=F(),s=i.map(p=>({entityType:p.entity_type,entityId:p.entity_id,operation:p.operation,payload:JSON.parse(p.payload)}));let d=0;if(s.length>0){const p=await fetch(`${n}/sync/push?deviceId=${r}`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${t}`},body:JSON.stringify({entries:s})});if(!p.ok){const E=await p.text().catch(()=>"");throw new Error(`Sync push failed (${p.status}): ${E.slice(0,200)}`)}const{results:j}=await p.json(),H=new Map(i.map(E=>[E.entity_id,E]));for(const E of j){const _=H.get(E.entityId);_&&(E.status==="SYNCED"?(te(_.id),d+=1):E.status==="CONFLICT"?C(_.id,"CONFLICT"):E.status==="FAILED"&&C(_.id,"FAILED"))}}const l=await fetch(`${n}/sync/pull?deviceId=${r}`,{headers:{Authorization:`Bearer ${t}`}});let y=!1;if(l.ok){const p=await l.json();(L=(g=p.changes)==null?void 0:g.products)!=null&&L.length&&B(p.changes.products),y=!0}let h=0;try{h=await le(t,n)}catch{}return{pushed:d,pulled:y,catalogCount:h,failed:ne()}}function ue(){const t=v(R);if(t)return t;const e=T.randomUUID();return N(R,e),e}const de=Object.freeze(Object.defineProperty({__proto__:null,syncWithServer:$},Symbol.toStringTag,{value:"Module"}));let w=null;function fe(){const t=[u.join(process.resourcesPath,"app-icon.png"),u.join(__dirname,"../build/icon.png"),u.join(a.app.getAppPath(),"build/icon.png")];for(const e of t)if(c.existsSync(e))return e}(process.env.VITE_DEV_SERVER_URL||process.env.RS_CDP_PORT)&&a.app.commandLine.appendSwitch("remote-debugging-port",process.env.RS_CDP_PORT||"9222");function ye(){const t=fe();w=new a.BrowserWindow({width:1280,height:800,title:"RetailSarathi POS",...t?{icon:t}:{},webPreferences:{preload:u.join(__dirname,"preload.js"),contextIsolation:!0,nodeIntegration:!1,sandbox:!1}}),w.webContents.setWindowOpenHandler(({url:e})=>e.startsWith("blob:")||e.startsWith("data:")?{action:"allow",overrideBrowserWindowOptions:{width:1024,height:900,autoHideMenuBar:!0,webPreferences:{contextIsolation:!0,nodeIntegration:!1}}}:e.startsWith("http:")||e.startsWith("https:")?(a.shell.openExternal(e),{action:"deny"}):{action:"allow"}),process.env.VITE_DEV_SERVER_URL?(w.loadURL(process.env.VITE_DEV_SERVER_URL),w.webContents.openDevTools()):w.loadFile(u.join(__dirname,"../dist/index.html"))}let m={state:"not_needed"};a.app.whenReady().then(()=>{m=M(),m.state==="not_needed"?I():m.state==="migrated"&&I({skipSeedIfEmpty:m.justSwapped}),ye()});a.app.on("window-all-closed",()=>{process.platform!=="darwin"&&a.app.quit()});a.ipcMain.handle("migration:status",()=>m);a.ipcMain.handle("migration:retry",async(t,e,r)=>(m=await J(e,r),m));a.ipcMain.handle("db:products",()=>Z());a.ipcMain.handle("db:save-invoice",(t,e)=>ee(e));a.ipcMain.handle("db:outbox",()=>F());a.ipcMain.handle("db:outbox-count",()=>ie());a.ipcMain.handle("db:pending-qty",()=>re());a.ipcMain.handle("sync:run",(t,e,r)=>$(e,r));a.ipcMain.handle("settings:get",(t,e)=>v(e));a.ipcMain.handle("settings:set",(t,e,r)=>(N(e,r),!0));a.ipcMain.handle("settings:get-json",(t,e)=>X(e));a.ipcMain.handle("settings:set-json",(t,e,r)=>(O(e,r),!0));a.ipcMain.handle("app:set-title",(t,e)=>{const r=String(e||"").trim();return w&&r&&w.setTitle(r),!0});a.ipcMain.handle("auth:has-pins",()=>ae());a.ipcMain.handle("auth:set-pin",(t,e)=>oe(e.label||"Cashier",e.pin,e.token,e.role));a.ipcMain.handle("auth:verify-pin",(t,e)=>ce(e));a.ipcMain.handle("auth:clear-pins",()=>pe());a.ipcMain.handle("update:check",async()=>({available:!1,version:null}));a.ipcMain.handle("update:install",()=>!1);const he=Buffer.from([27,112,0,25,250]);a.ipcMain.handle("print:thermal",async(t,e)=>{const r=a.app.getPath("temp"),n=Date.now(),i=typeof e=="string"?{text:e}:e||{};let s;i.escposBase64?s=Buffer.from(i.escposBase64,"base64"):s=Buffer.from(i.text||"","utf8"),i.kickDrawer&&(s=Buffer.concat([s,he]));const d=u.join(r,`retailsarathi-thermal-${n}.bin`),l=u.join(r,`retailsarathi-thermal-${n}.txt`);c.writeFileSync(d,s),i.text?c.writeFileSync(l,i.text,"utf8"):c.writeFileSync(l,s);const y=(i.comPort||process.env.THERMAL_COM_PORT||"").trim().toUpperCase();let h=!1,g;if(y&&process.platform==="win32"){const L=y.startsWith("COM")?`\\\\.\\${y}`:y;try{c.writeFileSync(L,s),h=!0}catch(p){g=p instanceof Error?p.message:String(p),console.warn("COM thermal write failed:",g)}}if(console.log("--- THERMAL PRINT ---"),i.text&&console.log(i.text),console.log("Thermal .bin saved:",d,"bytes=",s.length,"com=",y||"none",h),!h)try{await a.shell.openPath(d)}catch{}return{ok:!0,path:d,textPath:l,bytes:s.length,comPort:y||null,comWritten:h,comError:g||null,bluetoothAddress:i.bluetoothAddress||null,kickDrawer:!!i.kickDrawer}});a.ipcMain.handle("shell:open-external",(t,e)=>a.shell.openExternal(e));let f=null,k=null;function Ee(t){const e=t.includes("<html")?t:`<!DOCTYPE html><html><head><meta charset="utf-8" /></head><body>${t}</body></html>`,r=`
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
<\/script>`;return/<\/body>/i.test(e)?e.replace(/<\/body>/i,`${r}</body>`):`${e}${r}`}async function ge(){const t=f;if(!t||t.isDestroyed())return{ok:!1,error:"Preview window is closed"};try{const e=await t.webContents.printToPDF({printBackground:!0,pageSize:"A4",margins:{marginType:"default"}}),r=u.join(a.app.getPath("temp"),`retailsarathi-print-${Date.now()}.pdf`);c.writeFileSync(r,e);const n=await a.shell.openPath(r);return n?{ok:!1,error:n}:{ok:!0}}catch(e){return{ok:!1,error:e instanceof Error?e.message:String(e)}}}async function be(){const t=f;return!t||t.isDestroyed()?{ok:!1,error:"Preview window is closed"}:new Promise(e=>{t.webContents.print({silent:!0,printBackground:!0,deviceName:""},(r,n)=>{e(r?{ok:!0}:{ok:!1,error:n||"Print failed — set a default printer in Windows"})})})}async function Te(){const t=f;if(!t||t.isDestroyed())return{ok:!1,error:"Preview window is closed"};const{canceled:e,filePath:r}=await a.dialog.showSaveDialog(t,{title:"Save invoice PDF",defaultPath:u.join(a.app.getPath("documents"),`invoice-${Date.now()}.pdf`),filters:[{name:"PDF",extensions:["pdf"]}]});if(e||!r)return{ok:!1,error:"Save cancelled"};try{const n=await t.webContents.printToPDF({printBackground:!0,pageSize:"A4",margins:{marginType:"default"}});return c.writeFileSync(r,n),await a.shell.openPath(r),{ok:!0}}catch(n){return{ok:!1,error:n instanceof Error?n.message:String(n)}}}function we(){return f&&!f.isDestroyed()&&f.close(),!0}a.ipcMain.handle("print:html",async(t,e)=>{if(!e||typeof e!="string")return{ok:!1,error:"Empty print document"};f&&!f.isDestroyed()&&f.close();const r=Date.now(),n=u.join(a.app.getPath("temp"),`retailsarathi-a4-${r}.html`);k=n,c.writeFileSync(n,Ee(e),"utf8");const i=new a.BrowserWindow({width:920,height:1100,minWidth:640,minHeight:720,show:!1,autoHideMenuBar:!0,title:"RetailSarathi — Print preview",backgroundColor:"#ffffff",webPreferences:{preload:u.join(__dirname,"print-preview-preload.js"),contextIsolation:!0,nodeIntegration:!1,sandbox:!0}});f=i,i.on("closed",()=>{if(f===i&&(f=null),k){try{c.unlinkSync(k)}catch{}k=null}});try{return await i.loadFile(n),i.isMinimized()&&i.restore(),i.show(),i.focus(),i.moveTop(),{ok:!0}}catch(s){return i.isDestroyed()||i.destroy(),{ok:!1,error:s instanceof Error?s.message:String(s)}}});a.ipcMain.handle("print:preview-do-print",()=>ge());a.ipcMain.handle("print:preview-print-direct",()=>be());a.ipcMain.handle("print:preview-save-pdf",()=>Te());a.ipcMain.handle("print:preview-close",()=>we());
