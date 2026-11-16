const getDateKeyInTimeZone = (dateInput = new Date(), timeZone = 'America/Chicago') => {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(d);
  } catch (_) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Chicago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(d);
  }
};

const getHourInTimeZone = (dateInput = new Date(), timeZone = 'America/Chicago') => {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  try {
    const hourStr = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      hour12: false
    }).format(d);
    return parseInt(hourStr, 10) % 24;
  } catch (_) {
    return 0;
  }
};

async function generateWithGemini(apiKey, prompt) {
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`;

  const runRequest = async (useLowThinking) => {
    const generationConfig = {
      responseMimeType: 'application/json',
      temperature: 0.85,
      ...(useLowThinking ? { thinkingConfig: { thinkingLevel: 'low' } } : {})
    };

    return fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig
      })
    });
  };

  let geminiRes = await runRequest(true);
  if (geminiRes.status === 400) {
    geminiRes = await runRequest(false);
  }

  if (!geminiRes.ok) {
    const errData = await geminiRes.json().catch(() => ({}));
    throw new Error(`Gemini API (${geminiRes.status}): ${errData?.error?.message || geminiRes.statusText}`);
  }

  return geminiRes.json();
}

export default async function handler(req, res) {
  const apiKey = (process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '').trim();
  const projectId = (process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || '').trim();

  if (!apiKey || !projectId) {
    return res.status(500).json({ error: 'Missing GEMINI_API_KEY or FIREBASE_PROJECT_ID in Vercel.' });
  }

  const docsRoot = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
  const firestoreBase = `${docsRoot}/vocabHistory`;

  try {
    // 1. Determine active time zone: explicit query param -> synced user device TZ -> Dallas fallback
    let activeTimeZone = (req.query?.tz || '').trim();
    if (!activeTimeZone) {
      const configRes = await fetch(`${docsRoot}/appSettings/userConfig`);
      if (configRes.ok) {
        const configJson = await configRes.json();
        activeTimeZone = configJson?.fields?.timeZone?.stringValue || '';
      }
    }
    if (!activeTimeZone) activeTimeZone = 'America/Chicago';

    // 2. If triggered by an hourly cron (?cron=true), only execute during the 12:00 AM hour in activeTimeZone
    const isHourlyCron = req.query?.cron === 'true';
    const localHour = getHourInTimeZone(new Date(), activeTimeZone);
    if (isHourlyCron && localHour !== 0) {
      return res.status(200).json({
        status: 'skipped_not_midnight',
        timeZone: activeTimeZone,
        localHour
      });
    }

    const todayLocalKey = getDateKeyInTimeZone(new Date(), activeTimeZone);

    // 3. Fetch recent history to enforce 1x/day limit & 30-day deduplication
    const listRes = await fetch(`${firestoreBase}?pageSize=150&orderBy=timestamp%20desc`);
    const listJson = listRes.ok ? await listRes.json() : { documents: [] };
    const existingDocs = (listJson.documents || []).map(doc => ({
      term: doc.fields?.term?.stringValue || '',
      timestamp: doc.fields?.timestamp?.stringValue || ''
    }));

    const todaysCount = existingDocs.filter(
      item => item.timestamp && getDateKeyInTimeZone(item.timestamp, activeTimeZone) === todayLocalKey
    ).length;

    if (todaysCount >= 8) {
      return res.status(200).json({
        status: 'already_generated',
        date: todayLocalKey,
        timeZone: activeTimeZone,
        count: todaysCount
      });
    }

    const cardsNeeded = 8 - todaysCount;

    // 4. Generate cards using gemini-3.8-flash with thinkingLevel: "low"
    const existingTerms = existingDocs.slice(0, 120).map(d => d.term).filter(Boolean).join(', ');
    const bannedCliches = 'ubiquitous, perspicacious, sycophant, mellifluous, inexorable, paradigm, synergy, plethora, quintessential, dichotomy';
    const exclusionRule = `Never use basic GRE clichés (${bannedCliches}) or any previously generated terms: ${existingTerms}.`;

    const prompt = `You are a vocabulary curator for a traveling senior advisor / Big 4 consultant who moves across the US and Canada and socializes with local friends.
Generate a JSON array of exactly ${cardsNeeded} items:
- First ${Math.min(5, cardsNeeded)} items (type: "word"): Medium-to-difficult executive English words with the rhetorical weight, precision, and cadence of Barack Obama, Shashi Tharoor, or a senior partner—never basic business English.
- Remaining items (type: "slang"): Authentic North American slangs or idioms mixing everyday US corporate/social slang, Texas regionalisms (labeled "(Texas)"), and Canadian expressions (labeled "(Canadian)").

Requirements:
- Meaning: Nuanced, clear definition including subtle connotation or register.
- Examples: Realistic, natural, multi-clause dialogue showing how an articulate leader or local friend actually uses the term in conversation.
- ${exclusionRule}

Return ONLY a valid JSON array matching this exact schema:
[{"type":"word","term":"string","pronunciation":"string","meaning":"string","personalExample":"string","professionalExample":"string"}]`;

    const geminiJson = await generateWithGemini(apiKey, prompt);
    const rawText = geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const match = rawText.match(/\[\s*\{.*\}\s*\]/s);
    const cleaned = match ? match[0] : rawText.trim().replace(/```json/gi, '').replace(/```/g, '');
    const parsedItems = JSON.parse(cleaned);

    // 5. Deduplicate and write to Firestore
    const seen = new Set(existingDocs.map(d => d.term.toLowerCase().trim()));
    const timestamp = new Date().toISOString();
    const itemsToSave = [];

    for (const item of parsedItems) {
      const key = (item.term || '').toLowerCase().trim();
      if (key && !seen.has(key)) {
        seen.add(key);
        itemsToSave.push({ ...item, timestamp });
      }
      if (itemsToSave.length === cardsNeeded) break;
    }

    await Promise.all(
      itemsToSave.map(item =>
        fetch(firestoreBase, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              type: { stringValue: String(item.type || 'word') },
              term: { stringValue: String(item.term) },
              pronunciation: { stringValue: String(item.pronunciation || '') },
              meaning: { stringValue: String(item.meaning) },
              personalExample: { stringValue: String(item.personalExample || '') },
              professionalExample: { stringValue: String(item.professionalExample || '') },
              timestamp: { stringValue: item.timestamp }
            }
          })
        })
      )
    );

    return res.status(200).json({
      status: 'generated',
      date: todayLocalKey,
      timeZone: activeTimeZone,
      count: itemsToSave.length
    });
  } catch (err) {
    console.error('Daily briefing cron error:', err);
    return res.status(500).json({ error: err.message || 'Failed to generate daily briefing.' });
  }
}