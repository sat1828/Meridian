/**
 * All persistent data for this extension lives in chrome.storage.local —
 * on the user's own machine, inside their own browser profile. There is no
 * server, no database, no service-role key, nothing that can "pause" from
 * inactivity. This is the single biggest architectural difference from the
 * web-app version: it trades multi-tenant SaaS capability (many customers,
 * one shared backend) for zero backend at all — exactly right for a
 * personal, single-user tool each person installs and runs themselves.
 *
 * Storage keys used by this extension:
 *   settings              -> { aiProvider, geminiApiKey, openrouterApiKey, ... }
 *   companyProfile        -> { websiteUrl, userInstructions, onboardingStage }
 *   companyFacts           -> array of { id, category, fact, source, confidence, status }
 *   communicationProfile  -> { tone, formality, greeting, signOff, ... }
 *   processedMessageIds   -> array of Gmail message IDs already handled (dedupe)
 *   agentRuns             -> array of recent { messageId, classification, decision, draftText, ... } for the activity log
 *   agentMode             -> 'observe' | 'draft' | 'autonomous'
 */

const DEFAULTS = {
  settings: { aiProvider: 'gemini', geminiApiKey: '', openrouterApiKey: '', researchApiKey: '' },
  companyProfile: { websiteUrl: '', userInstructions: '', onboardingStage: 'company' },
  companyFacts: [],
  communicationProfile: {
    tone: 'professional',
    formality: 'balanced',
    brevity: 'concise',
    greeting: 'Hi {first_name},',
    signOff: 'Best,',
    signature: '',
    useEmoji: false,
    useContractions: true,
  },
  processedMessageIds: [],
  agentRuns: [],
  agentMode: 'draft',
};

export async function getStorage(key) {
  const result = await chrome.storage.local.get(key);
  return key in result ? result[key] : DEFAULTS[key];
}

export async function setStorage(key, value) {
  await chrome.storage.local.set({ [key]: value });
}

export async function getAll() {
  const keys = Object.keys(DEFAULTS);
  const result = await chrome.storage.local.get(keys);
  const merged = {};
  for (const key of keys) {
    merged[key] = key in result ? result[key] : DEFAULTS[key];
  }
  return merged;
}

/** Appends to an array-valued key, capping its length so storage never grows unbounded. */
export async function appendCapped(key, item, maxItems) {
  const current = (await getStorage(key)) ?? [];
  const next = [item, ...current].slice(0, maxItems);
  await setStorage(key, next);
  return next;
}

export async function clearAll() {
  await chrome.storage.local.clear();
}
