// Genera el código de los fragmentos por sitio (mismo formato que build.py).
export const CHUNK = 250;

export function renderCos(d) {
  return '(globalThis.__mbq||(globalThis.__mbq=[])).push(' + JSON.stringify(d) + ');\n';
}

export function renderSl(d, lib) {
  return "(()=>{'use strict';\n"
    + 'const DATA=' + JSON.stringify(d) + ';\n'
    + "const h=(location.hostname||(()=>{try{return new URL(location.ancestorOrigins[0]).hostname}catch{return''}})()).toLowerCase();\n"
    + "if(!h)return;const L=h.split('.');const K=[];\n"
    + "for(let i=0;i<L.length;i++){K.push(L.slice(i).join('.'));for(let j=i+1;j<L.length;j++)K.push(L.slice(i,j).join('.')+'.*');}\n"
    + 'const run=[],ex=new Set();\n'
    + 'for(const k of K){const e=DATA[k];if(!e)continue;if(e.s)run.push(...e.s);if(e.x)for(const x of e.x)ex.add(x);}\n'
    + "if(!run.length||ex.has('*'))return;\n"
    + lib
    + '\nconst done=new Set();\n'
    + 'for(const s of run){const sig=JSON.stringify(s);if(ex.has(sig)||done.has(sig))continue;done.add(sig);\n'
    + "const f=S[s[0]];if(typeof f==='function'){try{f(...s.slice(1));}catch(e){}}}\n"
    + '})();\n';
}

// Divide los datos por sitio en fragmentos, cada uno con sus patrones de coincidencia
export function chunks(data) {
  const out = [];
  const keys = Object.keys(data);
  const entity = keys.filter((k) => k.endsWith('.*'));
  const normal = keys.filter((k) => !k.endsWith('.*')).sort();
  for (let i = 0; i < normal.length; i += CHUNK) {
    const ks = normal.slice(i, i + CHUNK);
    const d = {};
    for (const k of ks) d[k] = data[k];
    out.push({ suffix: String(i / CHUNK), data: d, matches: ks.map((k) => `*://*.${k}/*`) });
  }
  if (entity.length) {
    const d = {};
    for (const k of entity) d[k] = data[k];
    out.push({ suffix: 'ent', data: d, matches: ['http://*/*', 'https://*/*'] });
  }
  return out;
}

export function genericCssText(generic) {
  let css = '';
  for (let i = 0; i < generic.length; i += 10) css += generic.slice(i, i + 10).join(',') + '{display:none!important}\n';
  return css;
}
