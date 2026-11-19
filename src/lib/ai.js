/**
 * Same reasoning as the web-app version this extension is based on: JSON
 * mode alone doesn't reliably make a model include every field a prompt
 * needs unless the exact shape is spelled out explicitly. describeShape()
 * below does that — pass it a plain description object like
 * { category: 'string', confidence: 'number' } and it renders that into the
 * prompt so the model can't silently omit fields.
 */
function describeShape(shape, indent = 1) {
  const pad = '  '.repeat(indent);
  const lines = Object.entries(shape).map(([key, value]) => {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return `${pad}"${key}": ${describeShape(value, indent + 1)}`;
    }
    return `${pad}"${key}": ${value}`;
  });
  return `{\n${lines.join(',\n')}\n${'  '.repeat(indent - 1)}}`;
}

/** Extracts JSON from a raw model response, tolerating stray non-JSON text around it. */
function extractJson(raw) {
  const cleaned = raw.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        // fall through
      }
    }
    throw new Error(`Model returned non-JSON output that could not be parsed: ${cleaned.slice(0, 300)}`);
  }
}

async function callGemini(apiKey, model, system, prompt, { json = false } = {}) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: 1500, ...(json ? { responseMimeType: 'application/json' } : {}) },
  };
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${errText.slice(0, 400)}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (text === undefined) throw new Error(`Gemini returned no text content: ${JSON.stringify(data).slice(0, 400)}`);
  return text;
}

async function callOpenRouter(apiKey, model, system, prompt, { json = false } = {}) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
      max_tokens: 1500,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenRouter API error (${res.status}) for model "${model}": ${errText.slice(0, 400)}`);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (text === undefined) throw new Error(`OpenRouter returned no message content: ${JSON.stringify(data).slice(0, 400)}`);
  return text;
}

/**
 * Runs a structured (JSON-returning) call, trying Gemini first (if
 * configured) then OpenRouter as a silent fallback. Mirrors the web app's
 * profile-router idea but simplified to one chain, since there's no
 * multi-profile UI in the extension — just "does it work."
 */
export async function generateStructured(settings, { system, prompt, shape }) {
  const fullSystem = `${system}\n\nRespond ONLY with a single valid JSON object matching EXACTLY this shape (every field required):\n${describeShape(shape)}\n\nNo markdown fences, no preamble, no explanation text.`;
  const attempts = [];

  if (settings.geminiApiKey) {
    try {
      const raw = await callGemini(settings.geminiApiKey, 'gemini-3.5-flash-lite', fullSystem, prompt, { json: true });
      return extractJson(raw);
    } catch (err) {
      attempts.push(`Gemini: ${err.message}`);
    }
  }
  if (settings.openrouterApiKey) {
    try {
      const raw = await callOpenRouter(settings.openrouterApiKey, 'openrouter/free', fullSystem, prompt, { json: true });
      return extractJson(raw);
    } catch (err) {
      attempts.push(`OpenRouter: ${err.message}`);
    }
  }
  if (attempts.length === 0) {
    throw new Error('No AI provider is configured. Add a Gemini or OpenRouter API key in the extension settings.');
  }
  throw new Error(`All configured AI providers failed:\n${attempts.join('\n')}`);
}

/** Runs a free-text (non-JSON) generation call, e.g. for the actual reply body. */
export async function generateText(settings, { system, prompt }) {
  const attempts = [];
  if (settings.geminiApiKey) {
    try {
      return await callGemini(settings.geminiApiKey, 'gemini-3.6-flash', system, prompt);
    } catch (err) {
      attempts.push(`Gemini: ${err.message}`);
    }
  }
  if (settings.openrouterApiKey) {
    try {
      return await callOpenRouter(settings.openrouterApiKey, 'openrouter/free', system, prompt);
    } catch (err) {
      attempts.push(`OpenRouter: ${err.message}`);
    }
  }
  if (attempts.length === 0) {
    throw new Error('No AI provider is configured. Add a Gemini or OpenRouter API key in the extension settings.');
  }
  throw new Error(`All configured AI providers failed:\n${attempts.join('\n')}`);
}
