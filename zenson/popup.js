(() => {
  const inputEl     = document.getElementById('input');
  const outputEl    = document.getElementById('output');
  const gutterEl    = document.getElementById('line-gutter');
  const dot         = document.getElementById('status-dot');
  const statusText  = document.getElementById('status-text');
  const indentSelect = document.getElementById('indent-select');

  let lastValidJson = null;

  function getIndent() {
    const v = indentSelect.value;
    return v === 'tab' ? '\t' : parseInt(v, 10);
  }

  function setStatus(type, msg) {
    dot.className = 'status-dot ' + type;
    statusText.textContent = msg;
  }

  function updateGutter(lines) {
    gutterEl.textContent = Array.from({length: lines}, (_,i) => i+1).join('\n');
  }

  function renderOutput(parsed, pretty) {
    lastValidJson = pretty;
    outputEl.innerHTML = '';

    const indent = getIndent();
    const indentPx = typeof indent === 'number' ? indent : 1;
    const { container, lineCount, dateNodes } = JSONRenderer.render(parsed, indentPx);
    outputEl.appendChild(container);
    updateGutter(lineCount);

    const keys  = (pretty.match(/"[^"]+"\s*:/g) || []).length;
    const lines = pretty.split('\n').length;
    const dates = dateNodes.length;
    setStatus('ok',
      `Valid JSON · ${lines} lines · ~${keys} keys` +
      (dates ? ` · ${dates} date${dates>1?'s':''} — click any to cycle all` : '')
    );
  }

  function format() {
    const raw = inputEl.value.trim();
    if (!raw) {
      outputEl.innerHTML = ''; gutterEl.textContent = '';
      setStatus('', 'Ready'); lastValidJson = null; return;
    }
    try {
      const parsed = JSON.parse(raw);
      const indent = getIndent();
      const pretty = JSON.stringify(parsed, null, indent);
      renderOutput(parsed, pretty);
    } catch(e) {
      lastValidJson = null;
      outputEl.innerHTML = `<span style="color:#f87171">⚠ ${e.message}</span>`;
      gutterEl.textContent = '1';
      setStatus('err', 'Invalid JSON');
    }
  }

  function minify() {
    const raw = inputEl.value.trim();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      const mini = JSON.stringify(parsed);
      lastValidJson = mini;
      outputEl.innerHTML = '';
      // For minified, just show plain highlighted text (no tree needed)
      const pre = document.createElement('span');
      pre.style.cssText = 'white-space:pre-wrap;word-break:break-all';
      pre.innerHTML = highlightMini(mini);
      outputEl.appendChild(pre);
      gutterEl.textContent = '1';
      setStatus('ok', `Minified · ${mini.length} chars`);
    } catch(e) {
      outputEl.innerHTML = `<span style="color:#f87171">⚠ ${e.message}</span>`;
      gutterEl.textContent = '1';
      setStatus('err', 'Invalid JSON');
    }
  }

  // Simple inline highlighter for minified view (no dates/collapsing needed)
  function highlightMini(json) {
    const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return esc(json).replace(
      /("(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"(?:\s*:)?|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|[{}\[\],:])/g,
      m => {
        if (/^"/.test(m) && /:$/.test(m)) return `<span class="jv-key">${m.slice(0,-1)}</span><span class="jv-punct">:</span>`;
        if (/^"/.test(m)) return `<span class="jv-str">${m}</span>`;
        if (/^-?\d/.test(m)) return `<span class="jv-num">${m}</span>`;
        if (m==='true'||m==='false') return `<span class="jv-bool">${m}</span>`;
        if (m==='null') return `<span class="jv-null">${m}</span>`;
        return `<span class="jv-punct">${m}</span>`;
      }
    );
  }

  // Events
  inputEl.addEventListener('paste', () => setTimeout(format, 50));
  inputEl.addEventListener('input', () => {
    if (!inputEl.value.trim()) {
      outputEl.innerHTML = ''; gutterEl.textContent = '';
      setStatus('', 'Ready'); lastValidJson = null;
    }
  });

  document.getElementById('btn-format').addEventListener('click', format);
  document.getElementById('btn-minify').addEventListener('click', minify);

  document.getElementById('btn-clear').addEventListener('click', () => {
    inputEl.value = ''; outputEl.innerHTML = ''; gutterEl.textContent = '';
    lastValidJson = null; setStatus('', 'Ready');
  });

  document.getElementById('btn-copy').addEventListener('click', () => {
    const text = lastValidJson;
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      const btn = document.getElementById('btn-copy');
      btn.textContent = '✓ Copied';
      setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
    });
  });

  document.getElementById('btn-page').addEventListener('click', () => {
    chrome.tabs.query({active:true,currentWindow:true}, tabs => {
      chrome.scripting.executeScript({
        target: {tabId: tabs[0].id},
        func: () => window.postMessage({type:'JSON_PRETTIFIER_TRIGGER'},'*')
      });
    });
    window.close();
  });

  indentSelect.addEventListener('change', () => { if (lastValidJson) format(); });
})();
