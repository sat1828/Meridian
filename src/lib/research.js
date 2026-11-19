import { generateStructured } from './ai.js';

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return m ? m[1].trim() : '';
}

/** Tries a handful of common paths beyond the homepage — no sitemap parsing (kept simple/fast for in-browser use). */
function candidatePaths(baseUrl) {
  const paths = ['', '/about', '/about-us', '/products', '/services', '/pricing', '/team', '/leadership', '/careers', '/contact', '/blog'];
  return paths.map((p) => new URL(p, baseUrl).toString());
}

/**
 * Fetches a handful of pages from the company's own site and asks the AI to
 * extract real facts from each one — same spirit as the web app's research
 * pipeline, simplified: no external search API required (Tavily is
 * optional here), no background job queue (the extension just awaits it
 * with a progress callback), no per-page database row — everything is
 * appended directly into the `companyFacts` array in chrome.storage.
 */
export async function runResearch(websiteUrl, settings, onProgress) {
  const urls = candidatePaths(websiteUrl);
  const facts = [];
  let pagesAnalyzed = 0;

  for (const url of urls) {
    onProgress?.({ status: 'fetching', url });
    let html;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) continue;
      html = await res.text();
    } catch {
      continue; // a single page failing must not kill the whole research run
    }

    const text = stripHtml(html).slice(0, 6000);
    if (text.length < 50) continue; // page too thin to be worth extracting from

    pagesAnalyzed++;
    onProgress?.({ status: 'extracting', url, pagesAnalyzed });

    try {
      const result = await generateStructured(settings, {
        system:
          'You extract factual, verifiable claims about a company from a single web page. ' +
          'Only extract facts explicitly present in the text. Never invent facts. Assign each ' +
          'fact to one category (identity, history, mission, products, services, industries, ' +
          'customers, geography, leadership, business_info, competitors, partnerships, ' +
          'technology, policies, careers, announcements) and a confidence score 0-1.',
        prompt: `Page URL: ${url}\nPage title: ${extractTitle(html)}\n\nPage text:\n${text}`,
        shape: { facts: 'array of { category: string, fact: string, confidence: number }' },
      });
      for (const f of result.facts ?? []) {
        facts.push({
          id: crypto.randomUUID(),
          category: f.category,
          fact: f.fact,
          confidence: f.confidence,
          source: url,
          status: 'needs_review',
        });
      }
    } catch (err) {
      onProgress?.({ status: 'extract_failed', url, error: err.message });
      continue;
    }
  }

  onProgress?.({ status: 'done', pagesAnalyzed, factsExtracted: facts.length });
  return { facts, pagesAnalyzed };
}

/** Generates a handful of realistic example customer questions from the accepted facts — used by the reply-style preview. */
export async function generateExampleQueries(facts, settings) {
  const accepted = facts.filter((f) => f.status === 'accepted' || f.status === 'needs_review').slice(0, 25);
  if (accepted.length === 0) return [];
  try {
    const result = await generateStructured(settings, {
      system:
        'Given facts about a company, write realistic short email questions a prospective ' +
        'customer might send. Base every question only on what these facts suggest the company ' +
        'offers — do not invent products or services.',
      prompt: `Company facts:\n${accepted.map((f) => `- (${f.category}) ${f.fact}`).join('\n')}`,
      shape: { queries: 'array of string' },
    });
    return result.queries ?? [];
  } catch {
    return [];
  }
}
