(function(){'use strict';const noop=function(){};const w=window;w.ga=w.ga||noop;const dl=w.dataLayer;if(dl instanceof Object===false)return;
if(dl.hide instanceof Object&&typeof dl.hide.end==='function'){dl.hide.end();dl.hide.end=()=>{}}
if(typeof dl.push==='function'){const doCb=function(item){if(item instanceof Object===false)return;if(typeof item.eventCallback!=='function')return;setTimeout(item.eventCallback,1);item.eventCallback=()=>{}};
dl.push=new Proxy(dl.push,{apply(t,th,a){doCb(a[0]);return Reflect.apply(t,th,a)}});if(Array.isArray(dl)){for(const it of dl.slice())doCb(it)}}})();
