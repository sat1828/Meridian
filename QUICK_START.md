# How to load and test this extension — step by step

## 1. Load it into your browser

1. Unzip this folder somewhere on your computer.
2. Open Chrome (or Edge/Brave — any Chromium browser works the same way).
3. Go to `chrome://extensions` in the address bar.
4. Turn on **Developer mode** — a toggle in the top-right corner of that page.
5. Click **Load unpacked**.
6. Select the folder you unzipped (the one containing `manifest.json` directly inside it).
7. You should see "Meridian — AI Email Agent" appear in your extensions list, and a settings tab
   should open automatically.

## 2. Add your AI key

1. On the settings page that opened, you're on the **AI Setup** tab already.
2. Get a free key at **aistudio.google.com/apikey**, paste it into the Gemini field.
3. Click **Save**.

## 3. Research your company

1. Click the **Company** tab.
2. Enter your real company website.
3. Click **Start research**.
4. A browser permission popup will appear asking to access that specific website — click **Allow**.
5. Watch the progress line update in real time as it reads real pages from your site.
6. When it's done, review the facts it found underneath — click **Accept** or **Reject** on each.

## 4. Set your communication style

Click the **Communication Style** tab, fill in tone/greeting/sign-off, click **Save**.

## 5. Pick a mode

Click the **Mode** tab, choose **Draft** (recommended to start), click **Save**.

## 6. Try it on a real email

1. Open Gmail in a new browser tab (**mail.google.com**).
2. Open any email in your inbox.
3. Look for a small round teal button with an "M" in the bottom-right corner of the page — click it.
4. A panel should appear showing: risk level, category, confidence, the reasoning, and a
   suggested reply.
5. Click **Insert into reply** to have it type the draft into Gmail's reply box, or **Copy text**
   to copy it elsewhere. Nothing is ever sent automatically — you still click Gmail's own Send
   button yourself.

## If something doesn't work

- **The "M" button doesn't appear on Gmail** → refresh the Gmail tab after loading the extension;
  content scripts only inject into tabs opened after the extension loads.
- **Clicking "M" shows an error immediately** → open the browser console right there on the Gmail
  page (F12 → Console tab) and check for red errors — paste that back for debugging.
- **The panel says "Couldn't analyze this email"** → open `chrome://extensions`, find Meridian,
  click **service worker** under "Inspect views" to open its console — that's where the actual AI
  call errors show up, separate from the Gmail page's own console.
- **Research finds zero facts** → check the AI Setup tab has a real key saved, and check the
  research progress line for a specific error message.

Report back with the exact error text from whichever console it appears in, and what you were
doing right before it happened.
