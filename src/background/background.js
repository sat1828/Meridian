import { getAll } from '../lib/storage.js';
import { runAgentPipeline } from '../lib/pipeline.js';

/**
 * The background service worker is where all AI calls actually happen —
 * not in the content script. This keeps API keys and network calls in one
 * controlled place, and matches Manifest V3's intended architecture (content
 * scripts talk to the service worker via messages; the service worker does
 * the real work).
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'ANALYZE_EMAIL') {
    handleAnalyze(message.payload)
      .then((result) => sendResponse({ result }))
      .catch((err) => sendResponse({ error: err.message }));
    return true; // keep the message channel open for the async response
  }
});

async function handleAnalyze(thread) {
  const { settings, companyProfile, communicationProfile, companyFacts, agentMode } = await getAll();

  if (!settings.geminiApiKey && !settings.openrouterApiKey) {
    throw new Error('No AI provider configured yet. Open the extension settings and add a Gemini or OpenRouter API key.');
  }

  const result = await runAgentPipeline({
    settings,
    companyProfile,
    communicationProfile,
    facts: companyFacts,
    mode: agentMode,
    fromEmail: thread.fromEmail,
    subject: thread.subject,
    body: thread.body,
    threadContext: thread.threadContext,
  });

  const { agentRuns } = await getAll();
  const entry = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    fromEmail: thread.fromEmail,
    subject: thread.subject,
    category: result.classification.category,
    riskBand: result.risk.band,
    riskScore: result.risk.score,
    decision: result.decision,
    reason: result.reason,
    draftText: result.draftText,
  };
  const nextRuns = [entry, ...agentRuns].slice(0, 200);
  await chrome.storage.local.set({ agentRuns: nextRuns });

  return result;
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.runtime.openOptionsPage();
});
