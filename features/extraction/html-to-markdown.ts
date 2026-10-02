/**
 * HTML → Markdown Converter
 * =========================
 *
 * Zero-dependency converter that renders cleaned HTML as readable Markdown,
 * preserving:
 *  - headings (h1–h6), paragraphs, lists (nested), blockquotes, code blocks
 *  - tables (GitHub-flavored)
 *  - links (`[text](url)`), bold/italic/code spans
 *  - image alt text (critical for sponsor names rendered as logos)
 *
 * The converter is intentionally tolerant: unclosed tags keep their remaining
 * content rather than truncating the document.
 */

import { decodeHtmlEntities } from '../universal-parser/html-utils.js';

const VOID_TAGS = new Set(['br', 'img', 'hr', 'meta', 'link', 'input', 'source', 'track', 'wbr']);

const BLOCK_TAGS = new Set([
  'div', 'section', 'article', 'main', 'aside', 'header', 'footer', 'nav',
  'p', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'figure', 'figcaption',
  'details', 'summary', 'dl', 'dt', 'dd',
]);

const INLINE_TAGS = new Set([
  'a', 'strong', 'b', 'em', 'i', 'code', 'span', 'u', 's', 'del', 'mark',
  'sub', 'sup', 'small', 'abbr', 'cite', 'kbd', 'q', 'label', 'time', 'font',
]);

/** Count structural elements in raw (pre-conversion) HTML for stats. */
export function countStructure(html: string): { headings: number; tables: number; lists: number; links: number } {
  return {
    headings: (html.match(/<h[1-6]\b/gi) ?? []).length,
    tables: (html.match(/<table\b/gi) ?? []).length,
    lists: (html.match(/<(?:ul|ol)\b/gi) ?? []).length,
    links: (html.match(/<a\b[^>]*href=/gi) ?? []).length,
  };
}

function getAttr(attrsStr: string, name: string): string | null {
  const m = attrsStr.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return m?.[1] ?? null;
}

/** Find the index of the matching close tag for `name` starting at `start`. */
function findCloseTag(html: string, name: string, start: number): number {
  const openTag = `<${name}`;
  const closeTag = `</${name}>`;
  let depth = 1;
  let i = start;
  while (i < html.length) {
    const nextOpen = html.indexOf(openTag, i);
    const nextClose = html.indexOf(closeTag, i);
    if (nextClose === -1) return -1;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      i = nextOpen + openTag.length;
    } else {
      depth--;
      if (depth === 0) return nextClose;
      i = nextClose + closeTag.length;
    }
  }
  return -1;
}

function escapePipe(cell: string): string {
  return cell.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
}

function renderTable(inner: string): string {
  const rows: string[][] = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRe.exec(inner)) !== null) {
    const cells: string[] = [];
    const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRe.exec(rowMatch[1] ?? '')) !== null) {
      cells.push(escapePipe(convertHtml(cellMatch[1] ?? '')));
    }
    if (cells.length > 0) rows.push(cells);
  }
  if (rows.length === 0) return '';

  const header = rows[0] ?? [];
  const colCount = Math.max(header.length, ...rows.map(r => r.length));
  const pad = (row: string[]): string[] => {
    const out = [...row];
    while (out.length < colCount) out.push('');
    return out;
  };

  const lines: string[] = [];
  lines.push(`| ${pad(header).join(' | ')} |`);
  lines.push(`| ${pad(header).map(() => '---').join(' | ')} |`);
  for (const row of rows.slice(1)) {
    lines.push(`| ${pad(row).join(' | ')} |`);
  }
  return `\n\n${lines.join('\n')}\n\n`;
}

function renderList(inner: string, ordered: boolean): string {
  const items: string[] = [];
  let idx = 0;
  while (idx < inner.length) {
    const open = inner.indexOf('<li', idx);
    if (open === -1) break;
    const gt = inner.indexOf('>', open);
    if (gt === -1) break;
    const close = findCloseTag(inner, 'li', gt + 1);
    const liInner = close === -1 ? inner.slice(gt + 1) : inner.slice(gt + 1, close);
    items.push(liInner);
    idx = close === -1 ? inner.length : close + 4;
  }

  if (items.length === 0) {
    return `\n\n${convertHtml(inner).trim()}\n\n`;
  }

  const lines: string[] = [];
  let counter = 1;
  for (const item of items) {
    const marker = ordered ? `${counter}. ` : '- ';
    counter++;
    const rendered = convertHtml(item).trim();
    lines.push(marker + rendered.replace(/\n/g, '\n  '));
  }
  return `\n${lines.join('\n')}\n`;
}

function renderInline(name: string, inner: string, attrsStr: string): string {
  const text = convertHtml(inner);
  switch (name) {
    case 'a': {
      const href = getAttr(attrsStr, 'href');
      const trimmed = text.trim();
      if (href && trimmed && !href.startsWith('#') && !href.startsWith('javascript:')) {
        return `[${trimmed}](${href})`;
      }
      return trimmed;
    }
    case 'strong':
    case 'b':
      return text.trim() ? `**${text.trim()}**` : '';
    case 'em':
    case 'i':
      return text.trim() ? `*${text.trim()}*` : '';
    case 'code':
      return text.trim() ? `\`${text.trim()}\`` : '';
    case 'img': {
      const alt = getAttr(attrsStr, 'alt') ?? getAttr(attrsStr, 'src') ?? '';
      return decodeHtmlEntities(alt.trim());
    }
    default:
      return text;
  }
}

function renderBlock(name: string, inner: string): string {
  const converted = convertHtml(inner).trim();

  if (/^h[1-6]$/.test(name)) {
    const level = parseInt(name.slice(1), 10);
    return `\n\n${'#'.repeat(level)} ${converted}\n\n`;
  }

  switch (name) {
    case 'p':
      return `\n\n${converted}\n\n`;
    case 'ul':
      return renderList(inner, false);
    case 'ol':
      return renderList(inner, true);
    case 'li':
      return `\n- ${converted}`;
    case 'table':
      return renderTable(inner);
    case 'blockquote':
      return `\n\n> ${converted.replace(/\n/g, '\n> ')}\n\n`;
    case 'pre':
      return `\n\n\`\`\`\n${converted}\n\`\`\`\n\n`;
    case 'code':
      return `\`${converted}\``;
    case 'thead':
    case 'tbody':
    case 'tfoot':
    case 'tr':
    case 'th':
    case 'td':
      return converted;
    default:
      return `\n\n${converted}\n\n`;
  }
}

/**
 * Convert an HTML fragment to Markdown. `convertHtml` is recursive: block and
 * inline open tags consume their matching subtree and render it appropriately.
 */
function convertHtml(html: string): string {
  const parts: string[] = [];
  const len = html.length;
  let i = 0;

  while (i < len) {
    const lt = html.indexOf('<', i);

    if (lt === -1) {
      const text = decodeHtmlEntities(html.slice(i)).replace(/[ \t]+/g, ' ');
      if (text.trim()) parts.push(text);
      break;
    }

    if (lt > i) {
      const text = decodeHtmlEntities(html.slice(i, lt)).replace(/[ \t]+/g, ' ');
      if (text.trim()) parts.push(text);
    }

    // Declarations and comments (doctype, CDATA, …) carry no content.
    if (html.startsWith('<!', lt)) {
      const gt = html.indexOf('>', lt);
      i = gt === -1 ? len : gt + 1;
      continue;
    }

    const tagMatch = html.slice(lt).match(/^<\/?([a-zA-Z0-9]+)((?:\s[^<>]*?)?)(\/?)\s*>/);
    if (!tagMatch) {
      parts.push(html[lt] ?? '');
      i = lt + 1;
      continue;
    }

    const full = tagMatch[0];
    const name = (tagMatch[1] ?? '').toLowerCase();
    const attrsStr = tagMatch[2] ?? '';
    const selfClosing = tagMatch[3] === '/' || VOID_TAGS.has(name);

    // Closing tags are consumed by their matching opener.
    if (full.startsWith('</')) {
      i = lt + full.length;
      continue;
    }

    if (name === '!--' || selfClosing) {
      if (name === 'br') {
        parts.push('\n');
      } else if (name === 'hr') {
        parts.push('\n\n---\n\n');
      } else if (name === 'img') {
        const alt = getAttr(attrsStr, 'alt') ?? getAttr(attrsStr, 'src') ?? '';
        if (alt.trim()) parts.push(decodeHtmlEntities(alt.trim()));
      }
      i = lt + full.length;
      continue;
    }

    const close = findCloseTag(html, name, lt + full.length);
    const inner = close === -1 ? html.slice(lt + full.length) : html.slice(lt + full.length, close);
    const rendered = INLINE_TAGS.has(name) ? renderInline(name, inner, attrsStr) : renderBlock(name, inner);
    parts.push(rendered);
    i = close === -1 ? len : close + name.length + 3;
  }

  return parts.join('');
}

/** Convert cleaned HTML to Markdown with normalized blank lines. */
export function htmlToMarkdown(html: string): string {
  return convertHtml(html)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
