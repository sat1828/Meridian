import { getAll } from '../lib/storage.js';

async function render() {
  const { settings, agentRuns, agentMode } = await getAll();
  const statusBox = document.getElementById('statusBox');

  if (!settings.geminiApiKey && !settings.openrouterApiKey) {
    statusBox.textContent = 'No AI key configured yet — open settings to add one.';
    statusBox.classList.add('warn');
  } else {
    statusBox.textContent = `Mode: ${agentMode}. Ready to analyze emails in Gmail.`;
  }

  document.getElementById('statTotal').textContent = agentRuns.length;
  document.getElementById('statAuto').textContent = agentRuns.filter((r) => r.decision === 'auto_send').length;
  document.getElementById('statEscalated').textContent = agentRuns.filter((r) => r.decision === 'escalate').length;
}

document.getElementById('openSettings').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

render();
