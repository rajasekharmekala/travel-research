const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

const placeholder = /REPLACE_WITH|COPY_FROM|No calculation recorded|TODO|lorem ipsum/i;

export const memoWordCount = markdown => String(markdown ?? '').split(/\s+/).filter(Boolean).length;

// Validates the reader-facing advisor memo attached to a destination dossier.
export function validateMemo(memo) {
  if (typeof memo?.headline !== 'string' || memo.headline.trim().length < 10 || memo.headline.length > 200) throw new Error('Memo requires a headline of 10 to 200 characters');
  if (typeof memo.markdown !== 'string') throw new Error('Memo requires markdown text');
  const words = memoWordCount(memo.markdown);
  if (words < 600 || words > 5000) throw new Error('Memo must be 600 to 5000 words');
  if ((memo.markdown.match(/^##\s+\S/gm) ?? []).length < 5) throw new Error('Memo requires at least five ## sections');
  if (placeholder.test(memo.headline) || placeholder.test(memo.markdown)) throw new Error('Memo contains template placeholder text');
  if (/local\/[\w./-]+/.test(memo.markdown)) throw new Error('Memo must not reference private local paths');
}

function inline(text) {
  return escapeHtml(text)
    .replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g, (_, label, url) => `<a href="${url}" rel="noreferrer">${label}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
}

const tableCells = line => line.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());

// Renders a small, safe markdown subset: headings, paragraphs, lists, quotes, pipe tables, bold, italic, https links.
export function renderMarkdown(markdown) {
  const lines = String(markdown ?? '').replace(/\r\n/g, '\n').split('\n');
  const output = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      const level = Math.max(2, heading[1].length);
      const id = heading[2].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      output.push(`<h${level} id="${escapeHtml(id)}">${inline(heading[2])}</h${level}>`);
      index += 1;
    } else if (/^\|/.test(line)) {
      const rows = [];
      while (index < lines.length && /^\|/.test(lines[index])) { rows.push(lines[index]); index += 1; }
      const body = rows.filter(row => !/^\|[\s:|-]+\|?$/.test(row.trim()));
      const [head, ...rest] = body;
      output.push(`<div class="table-scroll"><table class="cost-table"><thead><tr>${tableCells(head).map(cell => `<th>${inline(cell)}</th>`).join('')}</tr></thead><tbody>${rest.map(row => `<tr>${tableCells(row).map(cell => `<td>${inline(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
    } else if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index])) { items.push(lines[index].replace(/^[-*]\s+/, '')); index += 1; }
      output.push(`<ul>${items.map(item => `<li>${inline(item)}</li>`).join('')}</ul>`);
    } else if (/^>\s?/.test(line)) {
      const quoted = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) { quoted.push(lines[index].replace(/^>\s?/, '')); index += 1; }
      output.push(`<blockquote>${inline(quoted.join(' '))}</blockquote>`);
    } else {
      const paragraph = [];
      while (index < lines.length && lines[index].trim() && !/^(#{1,4}\s|\||[-*]\s|>)/.test(lines[index])) { paragraph.push(lines[index].trim()); index += 1; }
      output.push(`<p>${inline(paragraph.join(' '))}</p>`);
    }
  }
  return output.join('');
}

// Splits a memo file into its title (first "# " line) and body.
export function splitMemoTitle(markdown) {
  const text = String(markdown ?? '').replace(/\r\n/g, '\n');
  const match = text.match(/^#\s+(.+)\n?/);
  return match ? { title: match[1].trim(), body: text.slice(match[0].length) } : { title: 'Decision memo', body: text };
}
