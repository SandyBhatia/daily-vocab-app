import React, { useState, useEffect } from 'react';
import { Volume2, ChevronLeft, ChevronRight, Loader2, RefreshCw, Calendar } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, query, orderBy, limit } from 'firebase/firestore';

// 1. Initialize Firebase
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// High-bar starter deck so the app opens immediately on first launch
const STARTER_DECK = [
  {
    type: 'word',
    term: 'Trenchant',
    pronunciation: 'TREN-chunt',
    meaning: 'Vigorous, incisive, and sharply perceptive in analysis or expression.',
    professionalExample: 'Rather than softening the bad news, the managing partner offered a trenchant critique of why our Q3 pricing model failed.',
    personalExample: 'Her trenchant observations about local politics always cut straight through the noise at dinner.'
  },
  {
    type: 'word',
    term: 'Prevaricate',
    pronunciation: 'pri-VAIR-uh-kayt',
    meaning: 'To speak or act in an evasive, equivocating way to avoid committing to the direct truth.',
    professionalExample: 'When the audit committee pressed for a firm timeline on the cloud migration, the vendor refused to prevaricate and admitted a six-week delay.',
    personalExample: 'Stop prevaricating about whether you booked the flights—just tell me if we are going to Banff or not.'
  },
  {
    type: 'word',
    term: 'Bellwether',
    pronunciation: 'BEL-weth-er',
    meaning: 'A leading indicator or predictor of broader economic, political, or industry trends.',
    professionalExample: 'Enterprise software renewals in the financial sector often serve as a bellwether for broader corporate capital spending.',
    personalExample: 'How packed the patio is on a Thursday night in Uptown is a pretty reliable bellwether for how busy the weekend will be.'
  },
  {
    type: 'word',
    term: 'Insouciance',
    pronunciation: 'in-SOO-see-uns',
    meaning: 'Casual lack of concern; effortless, unbothered composure under pressure.',
    professionalExample: 'Even when the live demo stalled in front of three hundred clients, she fielded questions with remarkable insouciance.',
    personalExample: 'He strolled into the gate two minutes before boarding closed with complete insouciance.'
  },
  {
    type: 'word',
    term: 'Magnanimous',
    pronunciation: 'mag-NAN-uh-mus',
    meaning: 'Generous, noble, and forgiving, particularly toward a rival or someone in a weaker position.',
    professionalExample: 'In a magnanimous gesture after winning the account, our lead director praised the incumbent team’s groundwork during the transition.',
    personalExample: 'She was magnanimous in victory after beating all of us at trivia night.'
  },
  {
    type: 'slang',
    term: 'Boil the ocean',
    pronunciation: 'boil thuh OH-shun',
    meaning: 'To waste time undertaking an impossibly broad, over-engineered analysis instead of focusing on what moves the needle.',
    professionalExample: 'We have forty-eight hours before the steering committee—let’s isolate the top three margin leaks instead of trying to boil the ocean.',
    personalExample: 'You don’t need to boil the ocean comparing every steakhouse in Dallas; just book a table in Knox-Henderson.'
  },
  {
    type: 'slang',
    term: "Fixin' to (Texas)",
    pronunciation: 'FIK-sin tuh',
    meaning: 'Getting ready or about to do something imminently (classic Texas and Southern US conversational staple).',
    professionalExample: 'We’re fixin’ to wrap up the Dallas workshop early so everyone can catch the evening flight out of DFW.',
    personalExample: 'I’m fixin’ to head over to Deep Ellum for live music—let me know if you want a ride.'
  },
  {
    type: 'slang',
    term: 'Double-double (Canadian)',
    pronunciation: 'DUB-ul DUB-ul',
    meaning: 'A coffee ordered with two creams and two sugars, an everyday cultural touchstone across Canada.',
    professionalExample: 'Our Toronto engagement manager never starts an 8 AM client readout without a Tim Hortons double-double on his desk.',
    personalExample: 'It’s minus twelve in Calgary this morning—grab me a double-double before we walk over to the rink.'
  }
];

const withTimeout = (promise, ms, timeoutMsg) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(timeoutMsg)), ms))
  ]);

async function callGeminiFull(apiKey, prompt, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey.trim()}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.85
        }
      })
    });
    clearTimeout(timer);

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(`Gemini API (${response.status}): ${errData?.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const match = rawText.match(/\[\s*\{.*\}\s*\]/s);
    const cleaned = match ? match[0] : rawText.trim().replace(/```json/gi, '').replace(/```/g, '');
    return JSON.parse(cleaned);
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw new Error(`Request exceeded ${timeoutMs / 1000}s. Please try again.`);
    }
    throw err;
  }
}

export default function App() {
  const [dailyData, setDailyData] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isBgSyncing, setIsBgSyncing] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState(null);

  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  const minSwipeDistance = 50;

  useEffect(() => {
    loadHistory();
  }, []);

  useEffect(() => {
    if (!isLoading) {
      setElapsedSeconds(0);
      return;
    }
    const timer = setInterval(() => setElapsedSeconds(s => s + 1), 1000);
    return () => clearInterval(timer);
  }, [isLoading]);

  const saveItemsInBackground = (items) => {
    if (!firebaseConfig.projectId || !items?.length) return;
    Promise.allSettled(items.map(item => addDoc(collection(db, 'vocabHistory'), item)))
      .then((results) => {
        const rejected = results.find(r => r.status === 'rejected');
        if (rejected) {
          console.error('Firestore write error:', rejected.reason);
          setError('Displayed locally, but Firestore blocked saving. Check Firebase Rules.');
        }
      });
  };

  const loadHistory = async () => {
    if (!firebaseConfig.projectId) {
      setDailyData(STARTER_DECK);
      return;
    }
    try {
      const q = query(collection(db, 'vocabHistory'), orderBy('timestamp', 'desc'), limit(240));
      const querySnapshot = await withTimeout(getDocs(q), 5000, 'Firestore timeout');
      const history = [];
      querySnapshot.forEach((doc) => history.push(doc.data()));

      if (history.length > 0) {
        setDailyData(history);
      } else {
        const now = new Date().toISOString();
        const seeded = STARTER_DECK.map(item => ({ ...item, timestamp: now }));
        setDailyData(seeded);
        saveItemsInBackground(seeded);
      }
    } catch (err) {
      console.error('History load fallback:', err);
      setDailyData(STARTER_DECK);
    }
  };

  const generateNewBriefing = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) throw new Error('Gemini API Key is missing in Vercel.');

      const existingTerms = dailyData.slice(0, 120).map(item => item.term).join(', ');
      const bannedCliches = 'ubiquitous, perspicacious, sycophant, mellifluous, inexorable, paradigm, synergy, plethora, quintessential, dichotomy';
      const exclusionRule = `Never use basic GRE clichés (${bannedCliches}) or any previously generated terms: ${existingTerms}.`;
      const batchTimestamp = new Date().toISOString();

      const qualityStandards = `
Quality & Tone Requirements:
- Audience: A Dallas-based senior advisor / Big 4 consultant who travels across the US and Canada and socializes with local friends.
- Executive Words: Must reflect the rhetorical weight, precision, and cadence of Barack Obama, Shashi Tharoor, or a senior partner—never basic business English.
- Meaning: Nuanced, clear definition including subtle connotation or register.
- Examples: Realistic, natural, multi-clause dialogue showing how an articulate leader or local friend actually uses the term in conversation (not stiff textbook sentences).`;

      // STAGE 1: Fetch 1 high-caliber executive word on full gemini-3.8-flash (~2-3s)
      const firstCardPrompt = `Generate a JSON array with exactly 1 medium-to-difficult executive English word.
${qualityStandards}
${exclusionRule}
Return ONLY a valid JSON array:
[{"type":"word","term":"string","pronunciation":"string","meaning":"string","personalExample":"string","professionalExample":"string"}]`;

      const firstBatch = await callGeminiFull(apiKey, firstCardPrompt, 20000);
      const firstStamped = firstBatch.slice(0, 1).map(item => ({ ...item, timestamp: batchTimestamp }));

      setDailyData(prev => [...firstStamped, ...prev].slice(0, 240));
      setCurrentIndex(0);
      setIsLoading(false);
      saveItemsInBackground(firstStamped);

      // STAGE 2: Run 2 parallel specialist requests on full gemini-3.8-flash (~5-7s)
      setIsBgSyncing(true);
      const updatedExclusions = `${firstStamped[0]?.term || ''}, ${existingTerms}`;

      const wordsPrompt = `Generate a JSON array with exactly 4 distinct medium-to-difficult executive English words.
${qualityStandards}
Never use basic GRE clichés (${bannedCliches}) or any of these terms: ${updatedExclusions}.
Return ONLY a valid JSON array:
[{"type":"word","term":"string","pronunciation":"string","meaning":"string","personalExample":"string","professionalExample":"string"}]`;

      const slangPrompt = `Generate a JSON array with exactly 3 authentic North American slangs or idioms:
1. One everyday high-context American corporate/social idiom used in US client meetings and casual drinks.
2. One authentic Texas / DFW regional expression (label region in parentheses on the term, e.g., "Term (Texas)").
3. One authentic Canadian expression used in cities like Toronto or Calgary (label region in parentheses on the term, e.g., "Term (Canadian)").
${qualityStandards}
Never repeat any of these terms: ${updatedExclusions}.
Return ONLY a valid JSON array:
[{"type":"slang","term":"string","pronunciation":"string","meaning":"string","personalExample":"string","professionalExample":"string"}]`;

      const [wordsRes, slangRes] = await Promise.all([
        callGeminiFull(apiKey, wordsPrompt, 30000),
        callGeminiFull(apiKey, slangPrompt, 30000)
      ]);

      const restStamped = [...wordsRes.slice(0, 4), ...slangRes.slice(0, 3)].map(item => ({
        ...item,
        timestamp: batchTimestamp
      }));

      setDailyData(prev => {
        const [head, ...tail] = prev;
        return [head, ...restStamped, ...tail].slice(0, 240);
      });
      saveItemsInBackground(restStamped);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to generate new vocabulary.');
      setIsLoading(false);
    } finally {
      setIsBgSyncing(false);
    }
  };

  const onTouchStart = (e) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    if (distance > minSwipeDistance && currentIndex < dailyData.length - 1) setCurrentIndex(c => c + 1);
    if (distance < -minSwipeDistance && currentIndex > 0) setCurrentIndex(c => c - 1);
  };

  const speakText = (text) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const cleanTerm = text.replace(/\s*\([^)]*\)/g, '');
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(cleanTerm));
    }
  };

  const formatDate = (isoString) => {
    if (!isoString) return 'Starter Deck';
    return new Date(isoString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const currentItem = dailyData[currentIndex] || STARTER_DECK[0];
  const currentDateStr = formatDate(currentItem?.timestamp);

  // Build ordered list of unique saved days + item counts
  const uniqueDates = [...new Set(dailyData.map(item => formatDate(item.timestamp)))];
  const currentDayIdx = uniqueDates.indexOf(currentDateStr);
  const currentDayItems = dailyData.filter(item => formatDate(item.timestamp) === currentDateStr);
  const indexInDay = Math.max(0, currentDayItems.indexOf(currentItem));

  const jumpToDate = (dateStr) => {
    const targetIndex = dailyData.findIndex(item => formatDate(item.timestamp) === dateStr);
    if (targetIndex !== -1) setCurrentIndex(targetIndex);
  };

  return (
    <div className="min-h-screen flex flex-col justify-between p-4 md:py-5 md:px-6 max-w-md mx-auto">
      <div>
        {/* Header */}
        <header className="mb-3 flex justify-between items-center gap-2">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-amber-500 leading-tight">Daily Briefing</h1>
            <p className="text-gray-400 text-[11px] tracking-widest uppercase mt-0.5">
              30-Day Archive ({dailyData.length} items)
              {isBgSyncing && <span className="text-amber-400 ml-2">• Curating +7...</span>}
            </p>
          </div>
          <button
            onClick={generateNewBriefing}
            disabled={isLoading || isBgSyncing}
            title="Generate fresh daily briefing"
            className="flex items-center gap-1.5 px-3 py-2 bg-gray-800 rounded-xl text-amber-500 hover:bg-gray-700 transition disabled:opacity-50 text-xs font-semibold border border-gray-700"
          >
            {isLoading || isBgSyncing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            <span>New Briefing</span>
          </button>
        </header>

        {/* Always-Visible Day / Date Archive Selector */}
        <div className="mb-3 bg-gray-900/90 border border-gray-800 rounded-xl px-3 py-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Calendar size={14} className="text-amber-500 shrink-0" />
            <select
              value={currentDateStr}
              onChange={(e) => jumpToDate(e.target.value)}
              aria-label="Select briefing date"
              className="bg-transparent text-gray-200 text-xs font-medium focus:outline-none cursor-pointer truncate w-full"
            >
              {uniqueDates.map((dateStr, idx) => {
                const count = dailyData.filter(i => formatDate(i.timestamp) === dateStr).length;
                const label = idx === 0 ? `${dateStr} (Latest • ${count})` : `${dateStr} (${count} cards)`;
                return (
                  <option key={dateStr} value={dateStr} className="bg-gray-900 text-gray-200">
                    {label}
                  </option>
                );
              })}
            </select>
          </div>

          {uniqueDates.length > 1 && (
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => jumpToDate(uniqueDates[currentDayIdx + 1])}
                disabled={currentDayIdx >= uniqueDates.length - 1}
                className="px-2 py-1 text-[11px] rounded bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Prev Day
              </button>
              <button
                onClick={() => jumpToDate(uniqueDates[currentDayIdx - 1])}
                disabled={currentDayIdx <= 0}
                className="px-2 py-1 text-[11px] rounded bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Next Day
              </button>
            </div>
          )}
        </div>

        {error && (
          <p className="text-red-400 mb-3 text-xs font-mono bg-red-900/20 p-2.5 rounded-lg border border-red-900">
            {error}
          </p>
        )}
      </div>

      {isLoading ? (
        <div className="flex-1 flex flex-col items-center justify-center bg-gray-900 border border-gray-800 rounded-2xl min-h-[380px]">
          <Loader2 size={44} className="text-amber-500 animate-spin mb-4" />
          <p className="text-gray-400 animate-pulse text-sm">Curating first executive word ({elapsedSeconds}s)...</p>
        </div>
      ) : (
        <>
          {/* Progress Dots for Current Day */}
          <div className="flex justify-center gap-1.5 mb-3">
            {[...Array(Math.min(8, currentDayItems.length))].map((_, idx) => (
              <div
                key={idx}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  idx === (indexInDay % 8) ? 'w-6 bg-amber-500' : 'w-2 bg-gray-700'
                }`}
              />
            ))}
          </div>

          {/* Flashcard */}
          <div
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            className="flex-1 flex flex-col bg-gray-900 border border-gray-800 rounded-2xl p-5 shadow-2xl relative min-h-[380px]"
          >
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2.5">
                <span
                  className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                    currentItem?.type === 'word'
                      ? 'bg-amber-900/40 text-amber-500 border border-amber-800'
                      : 'bg-blue-900/40 text-blue-400 border border-blue-800'
                  }`}
                >
                  {currentItem?.type?.toUpperCase()}
                </span>
                <span className="text-xs text-gray-500 font-medium">
                  Card {indexInDay + 1} of {currentDayItems.length}
                </span>
              </div>
              <button
                onClick={() => speakText(currentItem?.term)}
                className="p-2 bg-gray-800 rounded-full text-amber-400 hover:text-amber-300 hover:bg-gray-700 transition"
                aria-label="Pronounce term"
              >
                <Volume2 size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
              <h2 className="text-2xl md:text-3xl font-extrabold mb-0.5 tracking-tight text-white">
                {currentItem?.term}
              </h2>
              <p className="text-gray-500 text-xs font-mono mb-4 italic">{currentItem?.pronunciation}</p>

              <div className="space-y-4">
                <div>
                  <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Meaning</h3>
                  <p className="text-base text-gray-200 leading-relaxed">{currentItem?.meaning}</p>
                </div>
                <div className="bg-gray-800/50 p-3.5 rounded-xl border border-gray-800">
                  <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span> Professional Context
                  </h3>
                  <p className="text-sm text-gray-300 italic leading-relaxed">"{currentItem?.professionalExample}"</p>
                </div>
                <div className="bg-gray-800/50 p-3.5 rounded-xl border border-gray-800">
                  <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span> Casual / Personal
                  </h3>
                  <p className="text-sm text-gray-300 italic leading-relaxed">"{currentItem?.personalExample}"</p>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Card Navigation: Previous (Left) & Next (Right) */}
          <div className="flex justify-between items-center mt-4 pt-1">
            <button
              onClick={() => setCurrentIndex(c => Math.max(0, c - 1))}
              disabled={currentIndex === 0}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium transition ${
                currentIndex === 0
                  ? 'opacity-30 cursor-not-allowed bg-gray-800 text-gray-400'
                  : 'bg-gray-800 text-white hover:bg-gray-700 active:scale-95'
              }`}
            >
              <ChevronLeft size={18} /> Previous
            </button>

            <span className="text-xs text-gray-500 font-mono">
              {currentIndex + 1} / {dailyData.length}
            </span>

            <button
              onClick={() => setCurrentIndex(c => Math.min(dailyData.length - 1, c + 1))}
              disabled={currentIndex === dailyData.length - 1}
              className={`flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold transition ${
                currentIndex === dailyData.length - 1
                  ? 'opacity-30 cursor-not-allowed bg-amber-600 text-white'
                  : 'bg-amber-500 text-gray-950 hover:bg-amber-400 active:scale-95 shadow-lg shadow-amber-500/20'
              }`}
            >
              Next <ChevronRight size={18} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}