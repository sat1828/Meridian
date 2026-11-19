import { getAll, setStorage } from '../lib/storage.js';
import { runResearch } from '../lib/research.js';

// --- Tab navigation ---
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
  });
});

let state = null;

async function loadAll() {
  state = await getAll();

  document.getElementById('geminiApiKey').value = state.settings.geminiApiKey || '';
  document.getElementById('openrouterApiKey').value = state.settings.openrouterApiKey || '';

  document.getElementById('websiteUrl').value = state.companyProfile.websiteUrl || '';
  document.getElementById('userInstructions').value = state.companyProfile.userInstructions || '';

  document.getElementById('tone').value = state.communicationProfile.tone;
  document.getElementById('formality').value = state.communicationProfile.formality;
  document.getElementById('brevity').value = state.communicationProfile.brevity;
  document.getElementById('greeting').value = state.communicationProfile.greeting;
  document.getElementById('signOff').value = state.communicationProfile.signOff;
  document.getElementById('signature').value = state.communicationProfile.signature || '';
  document.getElementById('useEmoji').checked = !!state.communicationProfile.useEmoji;
  document.getElementById('useContractions').checked = !!state.communicationProfile.useContractions;

  document.querySelector(`input[name="mode"][value="${state.agentMode}"]`)?.setAttribute('checked', 'checked');
  document.querySelectorAll('input[name="mode"]').forEach((r) => { r.checked = r.value === state.agentMode; });

  renderFacts();
  renderActivity();
}

function flashStatus(elId, msg) {
  const el = document.getElementById(elId);
  el.textContent = msg;
  setTimeout(() => { el.textContent = ''; }, 2500);
}

// --- AI Setup tab ---
document.getElementById('saveSettings').addEventListener('click', async () => {
  const settings = {
    ...state.settings,
    geminiApiKey: document.getElementById('geminiApiKey').value.trim(),
    openrouterApiKey: document.getElementById('openrouterApiKey').value.trim(),
  };
  await setStorage('settings', settings);
  state.settings = settings;
  flashStatus('setupStatus', 'Saved.');
});

// --- Company / research tab ---
document.getElementById('runResearch').addEventListener('click', async () => {
  const websiteUrl = document.getElementById('websiteUrl').value.trim();
  const userInstructions = document.getElementById('userInstructions').value;
  if (!websiteUrl) {
    flashStatus('researchStatus', 'Enter a website first.');
    return;
  }
  if (!state.settings.geminiApiKey && !state.settings.openrouterApiKey) {
    flashStatus('researchStatus', 'Add an AI key in the AI Setup tab first.');
    return;
  }

  // Request permission for this specific domain only, on demand — not a
  // blanket "all sites" grant. See manifest.json's optional_host_permissions.
  let origin;
  try {
    origin = new URL(websiteUrl).origin + '/*';
  } catch {
    flashStatus('researchStatus', 'That doesn\'t look like a valid URL.');
    return;
  }
  const granted = await chrome.permissions.request({ origins: [origin] });
  if (!granted) {
    flashStatus('researchStatus', 'Permission to read that site was not granted, so research cannot run.');
    return;
  }

  const companyProfile = { ...state.companyProfile, websiteUrl, userInstructions, onboardingStage: 'research' };
  await setStorage('companyProfile', companyProfile);
  state.companyProfile = companyProfile;

  const progressBox = document.getElementById('researchProgress');
  const progressLine = document.getElementById('progressLine');
  progressBox.classList.remove('hidden');

  try {
    const { facts, pagesAnalyzed } = await runResearch(websiteUrl, state.settings, (update) => {
      if (update.status === 'fetching') progressLine.textContent = `Reading ${update.url}...`;
      else if (update.status === 'extracting') progressLine.textContent = `Extracting facts from ${update.url} (${update.pagesAnalyzed} pages so far)...`;
      else if (update.status === 'extract_failed') progressLine.textContent = `Skipped ${update.url} (extraction failed)`;
      else if (update.status === 'done') progressLine.textContent = `Done — ${update.pagesAnalyzed} pages analyzed, ${update.factsExtracted} facts found.`;
    });

    const merged = [...state.companyFacts, ...facts];
    await setStorage('companyFacts', merged);
    state.companyFacts = merged;
    renderFacts();
    flashStatus('researchStatus', `Found ${facts.length} facts across ${pagesAnalyzed} pages.`);
  } catch (err) {
    progressLine.textContent = `Research failed: ${err.message}`;
  }
});

function renderFacts() {
  const container = document.getElementById('factsList');
  const reviewBox = document.getElementById('factsReview');
  const summary = document.getElementById('factsSummary');
  if (!state.companyFacts.length) {
    reviewBox.classList.add('hidden');
    return;
  }
  reviewBox.classList.remove('hidden');
  const pending = state.companyFacts.filter((f) => f.status === 'needs_review').length;
  summary.textContent = `${state.companyFacts.length} facts total — ${pending} awaiting your review.`;

  container.innerHTML = '';
  state.companyFacts.forEach((fact) => {
    const card = document.createElement('div');
    card.className = 'fact-card';
    const badgeClass = fact.status === 'accepted' ? 'fact-badge-accepted' : fact.status === 'rejected' ? 'fact-badge-rejected' : 'fact-badge-review';
    const badgeLabel = fact.status === 'accepted' ? 'Accepted' : fact.status === 'rejected' ? 'Rejected' : 'Needs review';
    card.innerHTML = `
      <div class="fact-text">${escapeHtml(fact.fact)}</div>
      <div class="fact-meta">
        <span><a href="${fact.source}" target="_blank">${new URL(fact.source).hostname}</a> · ${Math.round(fact.confidence * 100)}%</span>
        <span class="fact-badge ${badgeClass}">${badgeLabel}</span>
      </div>
      <div class="fact-actions" style="margin-top:8px;">
        <button data-action="accept" data-id="${fact.id}">Accept</button>
        <button data-action="reject" data-id="${fact.id}">Reject</button>
      </div>
    `;
    container.appendChild(card);
  });

  container.querySelectorAll('button[data-action]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      const fact = state.companyFacts.find((f) => f.id === id);
      if (fact) fact.status = action === 'accept' ? 'accepted' : 'rejected';
      await setStorage('companyFacts', state.companyFacts);
      renderFacts();
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

// --- Communication style tab ---
document.getElementById('saveStyle').addEventListener('click', async () => {
  const communicationProfile = {
    tone: document.getElementById('tone').value,
    formality: document.getElementById('formality').value,
    brevity: document.getElementById('brevity').value,
    greeting: document.getElementById('greeting').value,
    signOff: document.getElementById('signOff').value,
    signature: document.getElementById('signature').value,
    useEmoji: document.getElementById('useEmoji').checked,
    useContractions: document.getElementById('useContractions').checked,
  };
  await setStorage('communicationProfile', communicationProfile);
  state.communicationProfile = communicationProfile;
  flashStatus('styleStatus', 'Saved.');
});

// --- Mode tab ---
document.getElementById('saveMode').addEventListener('click', async () => {
  const mode = document.querySelector('input[name="mode"]:checked')?.value || 'draft';
  await setStorage('agentMode', mode);
  state.agentMode = mode;
  flashStatus('modeStatus', 'Saved.');
});

// --- Activity tab ---
function renderActivity() {
  const container = document.getElementById('activityList');
  if (!state.agentRuns.length) {
    container.innerHTML = '<p class="sub">No activity yet — open an email in Gmail and click the Meridian button.</p>';
    return;
  }
  container.innerHTML = '';
  state.agentRuns.forEach((run) => {
    const item = document.createElement('div');
    item.className = 'activity-item';
    item.innerHTML = `
      <div class="activity-top">
        <strong>${escapeHtml(run.subject || '(no subject)')}</strong>
        <span class="activity-meta">${new Date(run.timestamp).toLocaleString()}</span>
      </div>
      <div class="activity-meta">${escapeHtml(run.fromEmail)} · ${run.category} · ${run.riskBand} risk (${run.riskScore}/100) · ${run.decision.replace(/_/g, ' ')}</div>
    `;
    container.appendChild(item);
  });
}

loadAll();
