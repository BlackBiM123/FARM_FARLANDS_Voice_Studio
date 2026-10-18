window.farlands_install = function(callback) {
 window.addEventListener('message',function(e){if(e.source===parent && e.origin===location.origin && e.data?.channel==='farlands-core')callback(JSON.stringify(e.data));});
 parent.postMessage({channel:'farlands-core',ready:true},location.origin);
};
window.farlands_send = function(json){parent.postMessage(JSON.parse(json),location.origin);};
const coreEngine = new Engine({executable:'engine',canvas:document.getElementById('canvas'),canvasResizePolicy:0,focusCanvas:false,ensureCrossOriginIsolationHeaders:false,experimentalVK:false,gdextensionLibs:[],fileSizes:{},args:[],onPrintError:(...args)=>parent.postMessage({channel:'farlands-core',error:args.join(' ')},location.origin)});
coreEngine.startGame().catch(e=>parent.postMessage({channel:'farlands-core',fatal:true,error:String(e)},location.origin));
