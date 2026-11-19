/**
 * Runs directly inside mail.google.com. This is the piece that makes "no
 * Google OAuth needed" true: it reads the currently-open email thread
 * straight out of the page you're already logged into, and — when you
 * approve a draft — types it into Gmail's own reply box the same way a
 * person would, rather than calling any Gmail API with a stored token.
 *
 * Gmail's DOM structure is not a published API and changes over time — the
 * selectors below are the current known-working ones (as of this writing)
 * for Gmail's standard web view. If Gmail changes its markup, this needs an
 * update; that fragility is the real, honest tradeoff of this approach
 * (see the "no OAuth" README explanation) versus the OAuth-based web app.
 */

let fabButton = null;
let panel = null;

function createFab() {
  if (fabButton) return;
  fabButton = document.createElement('button');
  fabButton.className = 'meridian-fab';
  fabButton.textContent = 'M';
  fabButton.title = 'Meridian — analyze this email';
  fabButton.addEventListener('click', handleFabClick);
  document.body.appendChild(fabButton);
}

function removePanel() {
  if (panel) {
    panel.remove();
    panel = null;
  }
}

/** Extracts the subject, sender, and visible body text of the currently open email thread. */
function extractOpenThread() {
  // Subject: Gmail renders it in an h2 with class "hP" in the open-thread view.
  const subjectEl = document.querySelector('h2.hP');
  const subject = subjectEl ? subjectEl.textContent.trim() : '';

  // Sender: the most recent message's sender name/email, class "gD" holds the email in its "email" attribute.
  const senderEls = document.querySelectorAll('span.gD');
  const lastSender = senderEls[senderEls.length - 1];
  const fromEmail = lastSender?.getAttribute('email') || lastSender?.textContent?.trim() || '';

  // Body: each message body sits in a div with class "a3s" (Gmail's stable-ish internal class for message content).
  const bodyEls = document.querySelectorAll('div.a3s');
  const messages = Array.from(bodyEls).map((el) => el.innerText.trim()).filter(Boolean);
  const latestBody = messages[messages.length - 1] || '';
  const threadContext = messages.slice(0, -1).join('\n---\n');

  return { subject, fromEmail, body: latestBody, threadContext };
}

/** Finds Gmail's reply compose box, if the user has clicked "Reply" and it's open. */
function findComposeBox() {
  // Gmail's editable reply body has role="textbox" and aria-label starting with "Message Body".
  return document.querySelector('div[aria-label^="Message Body"][role="textbox"], div[g_editable="true"][role="textbox"]');
}

function riskBadgeClass(band) {
  return { low: 'meridian-badge-low', moderate: 'meridian-badge-moderate', high: 'meridian-badge-high', critical: 'meridian-badge-critical' }[band] || 'meridian-badge-neutral';
}

function renderPanel(state) {
  removePanel();
  panel = document.createElement('div');
  panel.className = 'meridian-panel';

  if (state.status === 'loading') {
    panel.innerHTML = `
      <button class="meridian-close">&times;</button>
      <h3>Analyzing this email...</h3>
      <p class="meridian-reason">Classifying, checking your company facts, and drafting a reply. This runs real AI calls and can take 10-30 seconds.</p>
    `;
  } else if (state.status === 'error') {
    panel.innerHTML = `
      <button class="meridian-close">&times;</button>
      <h3>Couldn't analyze this email</h3>
      <p class="meridian-reason">${escapeHtml(state.error)}</p>
    `;
  } else if (state.status === 'result') {
    const r = state.result;
    panel.innerHTML = `
      <button class="meridian-close">&times;</button>
      <h3>Meridian's take</h3>
      <span class="meridian-badge ${riskBadgeClass(r.risk.band)}">${r.risk.band} risk · ${r.risk.score}/100</span>
      <span class="meridian-badge meridian-badge-neutral">${r.classification.category.replace(/_/g, ' ')}</span>
      <span class="meridian-badge meridian-badge-neutral">${Math.round(r.classification.confidence * 100)}% confident</span>
      <p class="meridian-reason">${escapeHtml(r.reason)}</p>
      <div class="meridian-draft">${escapeHtml(r.draftText)}</div>
      <button class="meridian-btn-primary" id="meridian-insert">Insert into reply</button>
      <button class="meridian-btn-secondary" id="meridian-copy">Copy text</button>
    `;
    panel.querySelector('#meridian-insert').addEventListener('click', () => insertDraft(r.draftText));
    panel.querySelector('#meridian-copy').addEventListener('click', () => navigator.clipboard.writeText(r.draftText));
  }

  panel.querySelector('.meridian-close')?.addEventListener('click', removePanel);
  document.body.appendChild(panel);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

/** Types the draft into Gmail's reply box. Opens Reply first if it isn't already open. */
function insertDraft(text) {
  let box = findComposeBox();
  if (!box) {
    // Try clicking the "Reply" button Gmail shows at the bottom of the open thread.
    const replyBtn = document.querySelector('span[role="button"][aria-label^="Reply"], span.ams.bkH');
    replyBtn?.click();
    setTimeout(() => {
      box = findComposeBox();
      if (box) writeIntoBox(box, text);
    }, 400);
  } else {
    writeIntoBox(box, text);
  }
}

function writeIntoBox(box, text) {
  box.focus();
  // Gmail's compose box is a contenteditable div; execCommand is deprecated
  // but remains the most reliable cross-browser way to insert text into one
  // such that Gmail's own JS listeners register the change correctly.
  document.execCommand('insertText', false, text);
}

async function handleFabClick() {
  const thread = extractOpenThread();
  if (!thread.body) {
    renderPanel({ status: 'error', error: 'No open email thread found. Open an email in Gmail first, then click this button.' });
    return;
  }
  renderPanel({ status: 'loading' });
  chrome.runtime.sendMessage({ type: 'ANALYZE_EMAIL', payload: thread }, (response) => {
    if (chrome.runtime.lastError) {
      renderPanel({ status: 'error', error: chrome.runtime.lastError.message });
      return;
    }
    if (response?.error) {
      renderPanel({ status: 'error', error: response.error });
      return;
    }
    renderPanel({ status: 'result', result: response.result });
  });
}

createFab();

// Gmail is a single-page app that swaps content without full page reloads;
// re-ensure the floating button survives Gmail's own DOM churn.
const observer = new MutationObserver(() => {
  if (!document.body.contains(fabButton)) createFab();
});
observer.observe(document.body, { childList: true, subtree: false });
