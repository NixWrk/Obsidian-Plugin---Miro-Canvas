// Capture the actual SDK passed by Obsidian's isolated plugin loader.
// Raw renderer require('obsidian') is not the plugin's require function.
export async function captureNativeSdk(send) {
  const result = await send('Runtime.evaluate', { awaitPromise:true,returnByValue:true,userGesture:false,expression:`(async()=>{
    const base=app.vault.adapter.getBasePath?.().split(String.fromCharCode(92)).join('/');
    if(app.isMobile?app.vault.getName()!=='MiroCanvasTest':!base?.includes('/tools/obsidian_cdp/.out/')||require('@electron/remote').getCurrentWindow().isVisible())throw Error('test vault required');
    if(window.__l20NativeSdk)return {apiVersion:window.__l20NativeSdk.apiVersion,reused:true};
    const original=window.eval,descriptor=Object.getOwnPropertyDescriptor(window,'eval');let calls=0;
    window.eval=function(source){
      const loaded=Reflect.apply(original,this,[source]);
      if(typeof source==='string'&&source.includes('//# sourceURL=plugin:miro-canvas')&&typeof loaded==='function'){
        return function(nativeRequire,module,exports){calls++;window.__l20NativeSdk=nativeRequire('obsidian');return Reflect.apply(loaded,this,[nativeRequire,module,exports]);};
      }
      return loaded;
    };
    try{await app.plugins.disablePlugin('miro-canvas');await app.plugins.enablePlugin('miro-canvas');}
    finally{if(descriptor)Object.defineProperty(window,'eval',descriptor);else window.eval=original;}
    if(calls!==1||!window.__l20NativeSdk)throw Error('actual native SDK capture failed');
    return {apiVersion:window.__l20NativeSdk.apiVersion,evalRestored:window.eval===original};
  })()` });
  if(result.error)throw Error(result.error.message);
  const exception=result.result?.exceptionDetails;
  if(exception)throw Error(exception.exception?.description??exception.text);
  return result.result?.result?.value;
}
