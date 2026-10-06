// L01 real-browser fallback, partial face cleanup and retry; isolated vault only.
import assert from "node:assert/strict";
import { connectByTitle, evaluate } from "./cdp.mjs";
const port = Number(process.argv[2] ?? 9336);
const { send, close } = await connectByTitle(port);
try {
  const result = await evaluate(send, `
    const path=app.vault.adapter.getBasePath?.()?.split(String.fromCharCode(92)).join('/')??'';
    if(app.isMobile ? app.vault.getName()!=='MiroCanvasTest' : !path.includes('/tools/obsidian_cdp/.out/'))throw Error('isolated test vault required');
    const registry=new app.plugins.plugins['miro-canvas'].fontFaces.constructor();
    const failures=[];
    const failed=e=>failures.push(String(e.reason));
    window.addEventListener('unhandledrejection',failed);
    const revoked=[];
    const revoke=URL.revokeObjectURL;
    URL.revokeObjectURL=url=>{revoked.push(url);revoke.call(URL,url)};
    const probe=document.createElement('span');
    probe.textContent='Fallback width';probe.style.fontFamily='"Lint Broken", monospace';
    document.body.appendChild(probe);
    let missing=true;
    try {
      registry.attach(document);
      registry.setFileReader(async file=>{
        if(missing&&file.endsWith('italic.woff2'))throw Error('missing local face');
        return new Uint8Array([1,2,3,4]).buffer;
      });
      registry.configure([{id:'lint',dir:'lint',families:[
        {family:'Lint Broken',faces:[{style:'normal',weight:'400',file:'regular.woff2'},{style:'italic',weight:'400',file:'italic.woff2'}]},
        {family:'Lint Other',faces:[{style:'normal',weight:'400',file:'other.woff2'}]},
      ],aliases:[{family:'Lint Alias',target:'Lint Broken'}]}],[],'lint');
      const width=probe.getBoundingClientRect().width;
      registry.want(['Lint Alias','Lint Other']);
      await new Promise(r=>window.setTimeout(r,60));
      const first={rules:registry.styles.get(document).sheet.cssRules.length,revoked:revoked.length,
        sameWidth:probe.getBoundingClientRect().width===width,failures:failures.length};
      probe.remove();
      missing=false;
      registry.want(['Lint Alias']);
      await new Promise(r=>window.setTimeout(r,60));
      return {first,retriedRules:registry.styles.get(document).sheet.cssRules.length,failures:failures.length};
    } finally {
      probe.remove();registry.dispose();URL.revokeObjectURL=revoke;
      window.removeEventListener('unhandledrejection',failed);
    }
  `);
  if (result?.error) throw Error(result.error);
  assert.deepEqual(result,{first:{rules:1,revoked:1,sameWidth:true,failures:0},retriedRules:5,failures:0});
  console.log('OK real Obsidian font fallback, isolated failure, partial Blob cleanup and alias retry');
} finally { close(); }
