(() => {
  window.addEventListener('message', e => {
    if (e.data && e.data.type === 'JSON_PRETTIFIER_TRIGGER') tryPrettifyPage();
  });

  function isRawJsonPage() {
    const ct = document.contentType || '';
    if (ct.includes('json')) return true;
    const pre = document.body && document.body.querySelector('pre');
    return !!(pre && document.body.children.length === 1);
  }

  // ── Inline renderer (same logic as renderer.js, self-contained) ────────────
  const ISO_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
  const UNIX_SEC_MIN=978307200,UNIX_SEC_MAX=4102444800;
  const UNIX_MS_MIN=UNIX_SEC_MIN*1000,UNIX_MS_MAX=UNIX_SEC_MAX*1000;

  function isDateStr(s){return typeof s==='string'&&ISO_RE.test(s.trim())}
  function isUnixTs(n){if(!Number.isInteger(n))return false;return(n>=UNIX_SEC_MIN&&n<=UNIX_SEC_MAX)||(n>=UNIX_MS_MIN&&n<=UNIX_MS_MAX)}
  function toDate(v){if(typeof v==='string')return new Date(v);return new Date(v>=UNIX_MS_MIN?v:v*1000)}
  function relTime(d){
    const diff=Date.now()-d.getTime(),abs=Math.abs(diff),fut=diff<0;
    const f=(n,u)=>`${n} ${u}${n!==1?'s':''} ${fut?'from now':'ago'}`;
    if(abs<60000)return'just now';
    if(abs<3600000)return f(Math.round(abs/60000),'minute');
    if(abs<86400000)return f(Math.round(abs/3600000),'hour');
    if(abs<2592000000)return f(Math.round(abs/86400000),'day');
    if(abs<31536000000)return f(Math.round(abs/2592000000),'month');
    return f(Math.round(abs/31536000000),'year');
  }
  const FMT_LABELS=['original','ISO 8601','locale','relative','UTC','date only'];
  function applyFmt(v,idx){
    const d=toDate(v);if(isNaN(d.getTime()))return String(v);
    switch(idx){
      case 0:return typeof v==='number'?String(v):v;
      case 1:return d.toISOString();
      case 2:return d.toLocaleString(undefined,{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});
      case 3:return relTime(d);
      case 4:return d.toUTCString();
      case 5:return d.toISOString().slice(0,10);
    }
  }
  function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}

  function buildTree(parsed, doc) {
    const dateNodes=[];
    let lineCount=0;
    const container=doc.createElement('div');

    function p(cls,txt){const s=doc.createElement('span');s.className=cls;s.textContent=txt;return s}
    function mkIndent(depth){const s=doc.createElement('span');s.style.cssText=`display:inline-block;width:${depth*14}px`;return s}
    function mkLine(depth){const l=doc.createElement('span');l.className='jv-line';lineCount++;l.appendChild(mkIndent(depth));return l}

    function mkDateVal(orig){
      const isNum=typeof orig==='number';
      const el=doc.createElement('span');el.className='jv-date';
      el.title='Click to cycle all dates to this format';
      el.textContent=isNum?String(orig):`"${orig}"`;
      const cm=doc.createElement('span');cm.className='jv-comment';cm.textContent=' // original';
      const entry={el,commentEl:cm,origVal:orig,fmtIdx:0};
      dateNodes.push(entry);
      el.addEventListener('click',()=>{
        entry.fmtIdx=(entry.fmtIdx+1)%FMT_LABELS.length;
        const newFmt=entry.fmtIdx,label=FMT_LABELS[newFmt];
        dateNodes.forEach(node=>{
          node.fmtIdx=newFmt;
          const val=applyFmt(node.origVal,newFmt);
          node.el.textContent=(newFmt===0&&typeof node.origVal==='number')?val:`"${val}"`;
          node.commentEl.textContent=` // ${label}`;
          node.commentEl.className='jv-comment'+(newFmt===0?'':' changed');
        });
      });
      return{el,commentEl:cm};
    }

    function renderVal(val,depth,comma,keyPfx){
      if(val===null){const l=mkLine(depth);if(keyPfx)keyPfx.forEach(n=>l.appendChild(n));l.appendChild(p('jv-null','null'));if(comma)l.appendChild(p('jv-punct',','));container.appendChild(l);return}
      if(typeof val==='boolean'){const l=mkLine(depth);if(keyPfx)keyPfx.forEach(n=>l.appendChild(n));l.appendChild(p('jv-bool',String(val)));if(comma)l.appendChild(p('jv-punct',','));container.appendChild(l);return}
      if(typeof val==='number'){
        const l=mkLine(depth);if(keyPfx)keyPfx.forEach(n=>l.appendChild(n));
        if(isUnixTs(val)){const{el,commentEl}=mkDateVal(val);l.appendChild(el);l.appendChild(commentEl);}
        else l.appendChild(p('jv-num',String(val)));
        if(comma)l.appendChild(p('jv-punct',','));container.appendChild(l);return;
      }
      if(typeof val==='string'){
        const l=mkLine(depth);if(keyPfx)keyPfx.forEach(n=>l.appendChild(n));
        if(isDateStr(val)){const{el,commentEl}=mkDateVal(val);l.appendChild(el);l.appendChild(commentEl);}
        else l.appendChild(p('jv-str',`"${esc(val)}"`));
        if(comma)l.appendChild(p('jv-punct',','));container.appendChild(l);return;
      }
      if(Array.isArray(val)||typeof val==='object')renderColl(val,depth,comma,keyPfx,Array.isArray(val));
    }

    function renderColl(val,depth,comma,keyPfx,isArr){
      const keys=isArr?val:Object.keys(val),count=keys.length;
      const open=isArr?'[':'{',close=isArr?']':'}';

      const openLine=mkLine(depth);
      const toggle=doc.createElement('span');
      toggle.className='jv-toggle';toggle.textContent='▾';
      openLine.insertBefore(toggle,openLine.firstChild);
      if(keyPfx)keyPfx.forEach(n=>openLine.appendChild(n));
      openLine.appendChild(p('jv-punct',open));

      const summary=doc.createElement('span');
      summary.className='jv-collapsed-hint';summary.style.display='none';
      if(isArr){summary.textContent=` ${count} item${count!==1?'s':''} `;}
      else{const preview=keys.slice(0,3).join(', ')+(keys.length>3?', …':'');summary.textContent=` ${preview} `;}
      summary.appendChild(p('jv-punct',close));
      if(comma)summary.appendChild(p('jv-punct',','));
      openLine.appendChild(summary);
      container.appendChild(openLine);

      if(count===0){toggle.style.visibility='hidden';openLine.appendChild(p('jv-punct',close));if(comma)openLine.appendChild(p('jv-punct',','));return}

      const bodyStart=container.children.length;
      if(isArr)val.forEach((item,i)=>renderVal(item,depth+1,i<count-1,null));
      else keys.forEach((k,i)=>renderVal(val[k],depth+1,i<count-1,[p('jv-key',`"${esc(k)}"`),p('jv-punct',': ')]));
      const bodyEnd=container.children.length;

      const closeLine=mkLine(depth);
      closeLine.appendChild(p('jv-punct',close));
      if(comma)closeLine.appendChild(p('jv-punct',','));
      container.appendChild(closeLine);

      let collapsed=false;
      function getBodyLines(){const all=container.children,r=[];for(let i=bodyStart;i<bodyEnd;i++)r.push(all[i]);return r}
      function doCollapse(){collapsed=true;toggle.classList.add('collapsed');getBodyLines().forEach(l=>l.style.display='none');closeLine.style.display='none';summary.style.display=''}
      function doExpand(){collapsed=false;toggle.classList.remove('collapsed');getBodyLines().forEach(l=>l.style.display='');closeLine.style.display='';summary.style.display='none'}

      toggle.addEventListener('click',()=>collapsed?doExpand():doCollapse());
      summary.addEventListener('click',()=>doExpand());
    }

    renderVal(parsed,0,false,null);
    return{container,lineCount,dateNodes};
  }

  // ── Page prettifier ─────────────────────────────────────────────────────────
  function tryPrettifyPage() {
    if(document.getElementById('jp-root'))return;
    const pre=document.body.querySelector('pre');
    const raw=pre?pre.textContent:document.body.innerText;
    let parsed;
    try{parsed=JSON.parse(raw)}
    catch(e){alert('JSON Prettifier: Could not parse JSON.\n'+e.message);return}

    const pretty=JSON.stringify(parsed,null,2);

    // Inject styles
    const style=document.createElement('style');
    style.textContent=`
      *{box-sizing:border-box;margin:0;padding:0}
      body{background:#0f1117;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
      #jp-toolbar{
        position:fixed;top:0;left:0;right:0;z-index:9999;
        display:flex;align-items:center;gap:12px;
        padding:10px 18px;background:#0d1018;border-bottom:1px solid #1e2535;
        font-size:13px;
      }
      #jp-logo{width:26px;height:26px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff}
      #jp-title{font-weight:600;color:#f1f5f9;font-size:14px}
      #jp-stats{color:#475569;font-size:12px}
      #jp-hint{color:#3d5a3e;font-style:italic;font-size:11px}
      #jp-copy-btn{margin-left:auto;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border:none;border-radius:6px;padding:5px 14px;font-size:12px;font-weight:600;cursor:pointer}
      #jp-copy-btn:hover{opacity:.85}
      #jp-wrap{margin-top:52px;display:flex;font-family:'Cascadia Code','Fira Code','JetBrains Mono',Menlo,monospace;font-size:13px;line-height:1.7}
      #jp-gutter{padding:24px 10px 24px 6px;text-align:right;color:#2a3a50;background:#080b11;border-right:1px solid #141c28;user-select:none;white-space:pre;flex-shrink:0;min-width:46px;font-size:12px;line-height:1.7}
      #jp-root{padding:24px 28px;flex:1}
      .jv-line{display:block;white-space:nowrap;line-height:1.7}
      .jv-key{color:#7dd3fc}.jv-str{color:#86efac}.jv-num{color:#fb923c}.jv-bool{color:#a78bfa}.jv-null{color:#94a3b8}.jv-punct{color:#3d5068}
      .jv-date{color:#f0c070;cursor:pointer;border-bottom:1px dashed #7a6030}
      .jv-date:hover{color:#ffd580;border-bottom-color:#c09040}
      .jv-comment{color:#3a5c3e;font-style:italic;user-select:none}
      .jv-comment.changed{color:#5a9460}
      .jv-toggle{display:inline-block;width:14px;text-align:center;cursor:pointer;color:#475569;user-select:none;font-size:10px;margin-right:2px;transition:transform .15s}
      .jv-toggle:hover{color:#94a3b8}
      .jv-toggle.collapsed{transform:rotate(-90deg)}
      .jv-collapsed-hint{color:#475569;font-style:italic;cursor:pointer;user-select:none}
      .jv-collapsed-hint:hover{color:#64748b}
    `;
    document.head.appendChild(style);

    const {container,lineCount,dateNodes}=buildTree(parsed,document);
    const datesFound=dateNodes.length;

    const toolbar=document.createElement('div');
    toolbar.id='jp-toolbar';
    toolbar.innerHTML=`
      <span id="jp-title">ZenSON</span>
      <span id="jp-stats">${lineCount} lines · ${(raw.length/1024).toFixed(1)} KB${datesFound?` · ${datesFound} date${datesFound>1?'s':''} detected`:''}</span>
      ${datesFound?'<span id="jp-hint">· click 🟡 any date to cycle all formats</span>':''}
      <button id="jp-copy-btn">Copy JSON</button>
    `;

    const gutter=document.createElement('div');
    gutter.id='jp-gutter';
    gutter.textContent=Array.from({length:lineCount},(_,i)=>i+1).join('\n');

    const root=document.createElement('div');
    root.id='jp-root';
    root.appendChild(container);

    const wrap=document.createElement('div');
    wrap.id='jp-wrap';
    wrap.appendChild(gutter);
    wrap.appendChild(root);

    document.body.innerHTML='';
    document.body.appendChild(toolbar);
    document.body.appendChild(wrap);

    document.getElementById('jp-copy-btn').addEventListener('click',()=>{
      navigator.clipboard.writeText(pretty).then(()=>{
        const btn=document.getElementById('jp-copy-btn');
        btn.textContent='✓ Copied!';
        setTimeout(()=>{btn.textContent='Copy JSON'},1500);
      });
    });
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',()=>{if(isRawJsonPage())tryPrettifyPage()});
  } else {
    if(isRawJsonPage())tryPrettifyPage();
  }
})();
