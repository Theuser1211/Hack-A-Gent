/**
 * HTML Cleaner — Boilerplate Removal
 * ==================================
 *
 * Removes scripts, styles, navigation, footers, ads, tracking, hidden
 * elements, and repeated UI from raw HTML before Markdown conversion.
 *
 * The cleaning is conservative: content that could carry hackathon signal
 * (sponsor logo alt text, sidebar metadata, tables, list items) is preserved.
 * `removedBlocks` counts how many boilerplate blocks were stripped so the
 * benchmark can measure cleaning effectiveness.
 */

export interface CleanedHtml {
  html: string;
  removedBlocks: number;
}

/** Replace matching blocks while counting how many were removed. */
function countAndRemove(html: string, re: RegExp): { html: string; removed: number } {
  const matches = html.match(re);
  return {
    html: html.replace(re, ''),
    removed: matches ? matches.length : 0,
  };
}

/** Remove `<header>` only when it is pure navigation (contains no heading). */
function removeNavHeader(html: string, counter: { count: number }): string {
  return html.replace(/<header[^>]*>([\s\S]*?)<\/header>/gi, (match, inner: string) => {
    if (/<(h1|h2|h3)[^>]*>/i.test(inner)) return match;
    counter.count++;
    return '';
  });
}

/** Remove anchors whose label is a common navigation/utility action. */
function removeNavAnchors(html: string, counter: { count: number }): string {
  const labelRe = /\b(sign in|log in|sign out|log out|subscribe|unsubscribe|follow us|share on|search|my account|shopping cart|menu)\b/i;
  return html.replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, (match, inner: string) => {
    const text = inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (text && labelRe.test(text)) {
      counter.count++;
      return '';
    }
    return match;
  });
}

/**
 * Strip boilerplate from raw HTML. Returns the cleaned HTML and a count of
 * removed blocks for benchmarking purposes.
 */
export function cleanHtml(input: string): CleanedHtml {
  let html = input;
  const removed = { count: 0 };
  const apply = (re: RegExp): void => {
    const res = countAndRemove(html, re);
    html = res.html;
    removed.count += res.removed;
  };

  // Declarations and document wrappers (metadata is extracted separately)
  apply(/<!DOCTYPE[^>]*>/gi);
  apply(/<!\[CDATA\[[\s\S]*?\]\]>/g);
  html = html.replace(/<\/?(?:html|body)\b[^>]*>/gi, '');

  // Head / asset markup (metadata is extracted separately)
  apply(/<head[^>]*>[\s\S]*?<\/head>/gi);

  // Executable / non-content blocks
  apply(/<script[^>]*>[\s\S]*?<\/script>/gi);
  apply(/<style[^>]*>[\s\S]*?<\/style>/gi);
  apply(/<svg[^>]*>[\s\S]*?<\/svg>/gi);
  apply(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi);
  apply(/<(?:embed|object|template)[^>]*>[\s\S]*?<\/(?:embed|object|template)>/gi);
  apply(/<form[^>]*>[\s\S]*?<\/form>/gi);

  // <noscript> fallback content is often meaningful — keep the inner text.
  html = html.replace(/<noscript[^>]*>/gi, '').replace(/<\/noscript>/gi, '');

  // Comments and standalone tags
  apply(/<!--[\s\S]*?-->/g);
  html = html.replace(/<link[^>]*>/gi, '');
  html = html.replace(/<meta[^>]*>/gi, '');
  html = html.replace(/<input[^>]*>/gi, '');

  // Structural boilerplate
  apply(/<nav[^>]*>[\s\S]*?<\/nav>/gi);
  apply(/<footer[^>]*>[\s\S]*?<\/footer>/gi);
  html = removeNavHeader(html, removed);

  // Class / id based boilerplate (ads, cookie, newsletter, repeated UI, …).
  // The backreference (`\1`) closes the SAME element that opened, and the
  // pass repeats until stable so nested boilerplate is removed innermost-first.
  const classBoilerplate =
    /<([a-z0-9]+)[^>]*(?:class|id)=["'][^"']*\b(?:cookie|consent|newsletter|subscribe|signup|sign-up|advert|ad-|ads|banner|modal|overlay|popup|pop-up|toast|announcement|promo|breadcrumb|pagination|share-|social-share|related|recommend|trending|most-read|popular|sidebar-nav|auth-buttons|user-nav|footer-nav|global-header|navigation|navbar|menu-bar|tracking|analytics|gtm)[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi;
  let prevRemoved = -1;
  while (prevRemoved !== removed.count) {
    prevRemoved = removed.count;
    apply(classBoilerplate);
  }

  // role-based navigation/banner/advertising regions
  const roleBoilerplate =
    /<[a-z0-9]+[^>]*role=["'](?:navigation|banner|complementary|contentinfo|search)["'][^>]*>[\s\S]*?<\/[a-z0-9]+>/gi;
  apply(roleBoilerplate);

  // Hidden content
  const hidden =
    /<[a-z0-9]+[^>]*(?:aria-hidden=["']true["']|style=["'][^"']*display\s*:\s*none|class=["'][^"']*\b(?:hidden|visually-hidden|sr-only)\b)[^>]*>[\s\S]*?<\/[a-z0-9]+>/gi;
  apply(hidden);
  apply(/<[a-z0-9]+[^>]*\shidden(?:=[^>]*)?>[\s\S]*?<\/[a-z0-9]+>/gi);

  // Navigation/utility anchors
  html = removeNavAnchors(html, removed);

  return { html, removedBlocks: removed.count };
}
