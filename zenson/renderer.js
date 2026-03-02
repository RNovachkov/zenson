// renderer.js — shared JSON tree renderer
// Provides: window.JSONRenderer = { render, getPlainText }

window.JSONRenderer = (() => {

  // ── Date helpers ──────────────────────────────────────────────────────────
  const ISO_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
  const UNIX_SEC_MIN = 978307200, UNIX_SEC_MAX = 4102444800;
  const UNIX_MS_MIN  = UNIX_SEC_MIN * 1000, UNIX_MS_MAX = UNIX_SEC_MAX * 1000;

  function isDateStr(s) { return typeof s === 'string' && ISO_RE.test(s.trim()); }
  function isUnixTs(n)  {
    if (!Number.isInteger(n)) return false;
    return (n >= UNIX_SEC_MIN && n <= UNIX_SEC_MAX) ||
           (n >= UNIX_MS_MIN  && n <= UNIX_MS_MAX);
  }
  function toDate(v) {
    if (typeof v === 'string') return new Date(v);
    return new Date(v >= UNIX_MS_MIN ? v : v * 1000);
  }
  function relTime(d) {
    const diff = Date.now() - d.getTime(), abs = Math.abs(diff), fut = diff < 0;
    const f = (n,u) => `${n} ${u}${n!==1?'s':''} ${fut?'from now':'ago'}`;
    if (abs < 60000)       return 'just now';
    if (abs < 3600000)     return f(Math.round(abs/60000),'minute');
    if (abs < 86400000)    return f(Math.round(abs/3600000),'hour');
    if (abs < 2592000000)  return f(Math.round(abs/86400000),'day');
    if (abs < 31536000000) return f(Math.round(abs/2592000000),'month');
    return f(Math.round(abs/31536000000),'year');
  }
  const FMT_LABELS = ['original','ISO 8601','locale','relative','UTC','date only'];
  function applyFmt(origVal, idx) {
    const d = toDate(origVal);
    if (isNaN(d.getTime())) return String(origVal);
    switch(idx) {
      case 0: return typeof origVal === 'number' ? String(origVal) : origVal;
      case 1: return d.toISOString();
      case 2: return d.toLocaleString(undefined,{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});
      case 3: return relTime(d);
      case 4: return d.toUTCString();
      case 5: return d.toISOString().slice(0,10);
    }
    return String(origVal);
  }

  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── Tree renderer ─────────────────────────────────────────────────────────
  // Returns { container: HTMLElement, lineCount: number, dateNodes: [{el,commentEl,origVal,fmtIdx}] }

  function render(parsed, indentSize) {
    const INDENT = typeof indentSize === 'number' ? ' '.repeat(indentSize) : '\t';
    const INDENT_PX = typeof indentSize === 'number' ? indentSize * 7 : 14; // approx px per level
    const dateNodes = [];     // all date elements for global cycling
    let lineCount = 0;

    const container = document.createElement('div');

    function makeToggle() {
      const t = document.createElement('span');
      t.className = 'jv-toggle';
      t.textContent = '▾';
      return t;
    }

    function makeIndent(depth) {
      const s = document.createElement('span');
      s.className = 'jv-indent';
      s.style.width = (depth * INDENT_PX) + 'px';
      return s;
    }

    function p(cls, text) {
      const s = document.createElement('span');
      s.className = cls;
      s.textContent = text;
      return s;
    }

    function makeLine(depth) {
      const line = document.createElement('span');
      line.className = 'jv-line';
      lineCount++;
      line.appendChild(makeIndent(depth));
      return line;
    }

    function renderDateValue(origVal) {
      // Returns { valueEl, commentEl } — the date span + inline comment
      const isNum = typeof origVal === 'number';
      const el = document.createElement('span');
      el.className = 'jv-date';
      el.title = 'Click to cycle all dates to this format';
      el.textContent = isNum ? String(origVal) : `"${origVal}"`;

      const commentEl = document.createElement('span');
      commentEl.className = 'jv-comment';
      commentEl.textContent = ' // original';

      const entry = { el, commentEl, origVal, fmtIdx: 0 };
      dateNodes.push(entry);

      el.addEventListener('click', () => {
        // Advance index
        entry.fmtIdx = (entry.fmtIdx + 1) % FMT_LABELS.length;
        const newFmt = entry.fmtIdx;
        const label  = FMT_LABELS[newFmt];

        // Apply to ALL date nodes
        dateNodes.forEach(node => {
          node.fmtIdx = newFmt;
          const val = applyFmt(node.origVal, newFmt);
          const isN = typeof node.origVal === 'number';
          node.el.textContent = (newFmt === 0 && isN) ? val : (newFmt === 0 ? `"${val}"` : `"${val}"`);
          node.commentEl.textContent = ` // ${label}`;
          node.commentEl.className = 'jv-comment' + (newFmt === 0 ? '' : ' changed');
        });
      });

      return { el, commentEl };
    }

    function renderValue(val, depth, trailingComma, keyPrefix) {
      // keyPrefix: already-built DOM fragment for "key": part, or null for array items

      if (val === null) {
        const line = makeLine(depth);
        if (keyPrefix) keyPrefix.forEach(n => line.appendChild(n));
        line.appendChild(p('jv-null','null'));
        if (trailingComma) line.appendChild(p('jv-punct',','));
        container.appendChild(line);
        return;
      }

      if (typeof val === 'boolean') {
        const line = makeLine(depth);
        if (keyPrefix) keyPrefix.forEach(n => line.appendChild(n));
        line.appendChild(p('jv-bool', String(val)));
        if (trailingComma) line.appendChild(p('jv-punct',','));
        container.appendChild(line);
        return;
      }

      if (typeof val === 'number') {
        const line = makeLine(depth);
        if (keyPrefix) keyPrefix.forEach(n => line.appendChild(n));
        if (isUnixTs(val)) {
          const {el,commentEl} = renderDateValue(val);
          line.appendChild(el);
          line.appendChild(commentEl);
        } else {
          line.appendChild(p('jv-num', String(val)));
        }
        if (trailingComma) line.appendChild(p('jv-punct',','));
        container.appendChild(line);
        return;
      }

      if (typeof val === 'string') {
        const line = makeLine(depth);
        if (keyPrefix) keyPrefix.forEach(n => line.appendChild(n));
        if (isDateStr(val)) {
          const {el,commentEl} = renderDateValue(val);
          line.appendChild(el);
          line.appendChild(commentEl);
        } else {
          line.appendChild(p('jv-str', `"${esc(val)}"`));
        }
        if (trailingComma) line.appendChild(p('jv-punct',','));
        container.appendChild(line);
        return;
      }

      if (Array.isArray(val)) {
        renderCollection(val, depth, trailingComma, keyPrefix, true);
        return;
      }

      if (typeof val === 'object') {
        renderCollection(val, depth, trailingComma, keyPrefix, false);
        return;
      }
    }

    function renderCollection(val, depth, trailingComma, keyPrefix, isArray) {
      const keys   = isArray ? val : Object.keys(val);
      const count  = isArray ? val.length : keys.length;
      const open   = isArray ? '[' : '{';
      const close  = isArray ? ']' : '}';
      const empty  = count === 0;

      // ── Opening line ──────────────────────────────────────────────────────
      const openLine = makeLine(depth);
      const toggle = makeToggle();
      openLine.insertBefore(toggle, openLine.firstChild); // toggle before indent

      if (keyPrefix) keyPrefix.forEach(n => openLine.appendChild(n));
      openLine.appendChild(p('jv-punct', open));

      // Collapsed inline summary (hidden by default)
      const summary = document.createElement('span');
      summary.className = 'jv-collapsed-hint';
      summary.style.display = 'none';
      if (isArray) {
        summary.textContent = ` ${count} item${count!==1?'s':''} `;
      } else {
        const preview = keys.slice(0,3).join(', ') + (keys.length>3?', …':'');
        summary.textContent = ` ${preview} `;
      }
      summary.appendChild(p('jv-punct', close));
      if (trailingComma) summary.appendChild(p('jv-punct',','));
      openLine.appendChild(summary);

      container.appendChild(openLine);

      if (empty) {
        // nothing to collapse
        toggle.style.visibility = 'hidden';
        openLine.querySelector('.jv-collapsed-hint').style.display = 'none';
        openLine.appendChild(p('jv-punct', close));
        if (trailingComma) openLine.appendChild(p('jv-punct',','));
        return;
      }

      // ── Body ──────────────────────────────────────────────────────────────
      const bodyStart = container.children.length; // track where body lines start

      // Render children
      if (isArray) {
        val.forEach((item, i) => {
          renderValue(item, depth + 1, i < count - 1, null);
        });
      } else {
        keys.forEach((k, i) => {
          const kp = [
            p('jv-key', `"${esc(k)}"`),
            p('jv-punct', ': ')
          ];
          renderValue(val[k], depth + 1, i < count - 1, kp);
        });
      }

      const bodyEnd = container.children.length;

      // ── Closing line ──────────────────────────────────────────────────────
      const closeLine = makeLine(depth);
      closeLine.appendChild(p('jv-punct', close));
      if (trailingComma) closeLine.appendChild(p('jv-punct', ','));
      container.appendChild(closeLine);

      // ── Collapse logic ────────────────────────────────────────────────────
      let collapsed = false;
      const bodyLines = () => {
        const all = container.children;
        const result = [];
        for (let i = bodyStart; i < bodyEnd; i++) result.push(all[i]);
        return result;
      };

      function collapse() {
        collapsed = true;
        toggle.classList.add('collapsed');
        bodyLines().forEach(l => l.style.display = 'none');
        closeLine.style.display = 'none';
        summary.style.display = '';
      }
      function expand() {
        collapsed = false;
        toggle.classList.remove('collapsed');
        bodyLines().forEach(l => l.style.display = '');
        closeLine.style.display = '';
        summary.style.display = 'none';
      }

      toggle.addEventListener('click', () => collapsed ? expand() : collapse());
      summary.addEventListener('click', () => expand());
    }

    renderValue(parsed, 0, false, null);
    return { container, lineCount, dateNodes };
  }

  // ── Plain text (for copy) ──────────────────────────────────────────────────
  function getPlainText(indentSize) {
    return null; // caller should use stored pretty string
  }

  return { render, FMT_LABELS };
})();
