import React, { useState, useEffect, useRef } from 'react';
import { Volume2, ChevronLeft, ChevronRight, Loader2, RefreshCw, Calendar, CheckCircle2 } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, setDoc, addDoc, getDocs, query, orderBy, limit } from 'firebase/firestore';

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

const STARTER_DECK = [
  {
    type: 'word',
    term: 'Trenchant',
    pronunciation: 'TREN-chunt',
    meaning: 'Vigorous, incisive, and sharply perceptive in analysis or expression.',
    professionalExample: 'Rather than softening the bad news, the managing partner offered a trenchant critique of why our Q3 pricing model failed.',
    personalExample: 'Her trenchant observations about local politics always cut straight through the noise at dinner.',
    isStarter: true
  },
  {
    type: 'word',
    term: 'Prevaricate',
    pronunciation: 'pri-VAIR-uh-kayt',
    meaning: 'To speak or act in an evasive, equivocating way to avoid committing to the direct truth.',
    professionalExample: 'When the audit committee pressed for a firm timeline on the cloud migration, the vendor refused to prevaricate and admitted a six-week delay.',
    personalExample: 'Stop prevaricating about whether you booked the flights—just tell me if we are going to Banff or not.',
    isStarter: true
  },
  {
    type: 'word',
    term: 'Bellwether',
    pronunciation: 'BEL-weth-er',
    meaning: 'A leading indicator or predictor of broader economic, political, or industry trends.',
    professionalExample: 'Enterprise software renewals in the financial sector often serve as a bellwether for broader corporate capital spending.',
    personalExample: 'How packed the patio is on a Thursday night in Uptown is a pretty reliable bellwether for how busy the weekend will be.',
    isStarter: true
  },
  {
    type: 'word',
    term: 'Insouciance',
    pronunciation: 'in-SOO-see-uns',
    meaning: 'Casual lack of concern; effortless, unbothered composure under pressure.',
    professionalExample: 'Even when the live demo stalled in front of three hundred clients, she fielded questions with remarkable insouciance.',
    personalExample: 'He strolled into the gate two minutes before boarding closed with complete insouciance.',
    isStarter: true
  },
  {
    type: 'word',
    term: 'Magnanimous',
    pronunciation: 'mag-NAN-uh-mus',
    meaning: 'Generous, noble, and forgiving, particularly toward a rival or someone in a weaker position.',
    professionalExample: 'In a magnanimous gesture after winning the account, our lead director praised the incumbent team’s groundwork during the transition.',
    personalExample: 'She was magnanimous in victory after beating all of us at trivia night.',
    isStarter: true
  },
  {
    type: 'slang',
    term: 'Boil the ocean',
    pronunciation: 'boil thuh OH-shun',
    meaning: 'To waste time undertaking an impossibly broad, over-engineered analysis instead of focusing on what moves the needle.',
    professionalExample: 'We have forty-eight hours before the steering committee—let’s isolate the top three margin leaks instead of trying to boil the ocean.',
    personalExample: 'You don’t need to boil the ocean comparing every steakhouse in Dallas; just book a table in Knox-Henderson.',
    isStarter: true
  },
  {
    type: 'slang',
    term: "Fixin' to (Texas)",
    pronunciation: 'FIK-sin tuh',
    meaning: 'Getting ready or about to do something imminently (classic Texas and Southern US conversational staple).',
    professionalExample: 'We’re fixin’ to wrap up the Dallas workshop early so everyone can catch the evening flight out of DFW.',
    personalExample: 'I’m fixin’ to head over to Deep Ellum for live music—let me know if you want a ride.',
    isStarter: true
  },
  {
    type: 'slang',
    term: 'Double-double (Canadian)',
    pronunciation: 'DUB-ul DUB-ul',
    meaning: 'A coffee ordered with two creams and two sugars, an everyday cultural touchstone across Canada.',
    professionalExample: 'Our Toronto engagement manager never starts an 8 AM client readout without a Tim Hortons double-double on his desk.',
    personalExample: 'It’s minus twelve in Calgary this morning—grab me a double-double before we walk over to the rink.',
    isStarter: true
  }
];

const withTimeout = (promise, ms, timeoutMsg) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(timeoutMsg)), ms))
  ]);

const getDeviceTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Chicago';
  } catch (_) {
    return 'America/Chicago';
  }
};

const getLocalDateKey = (dateInput = new Date(), timeZone = getDeviceTimeZone()) => {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(d);
  } catch (_) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
};

export default function App() {
  const [dailyData, setDailyData] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState(null);
  const [activeTimeZone, setActiveTimeZone] = useState(getDeviceTimeZone);
  const generationLockRef = useRef(false);
  const initialAutoCheckDoneRef = useRef(false);

  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  const minSwipeDistance = 50;

  useEffect(() => {
    const tz = getDeviceTimeZone();
    setActiveTimeZone(tz);

    // Sync current device time zone to Firestore so midnight cron uses your active location
    if (firebaseConfig.projectId) {
      setDoc(
        doc(db, 'appSettings', 'userConfig'),
        { timeZone: tz, updatedAt: new Date().toISOString() },
        { merge: true }
      ).catch(() => {});
    }

    initLoad(tz);
  }, []);

  useEffect(() => {
    if (!isLoading) {
      setElapsedSeconds(0);
      return;
    }
    const timer = setInterval(() => setElapsedSeconds(s => s + 1), 1000);
    return () => clearInterval(timer);
  }, [isLoading]);

  const loadHistory = async (tz = activeTimeZone) => {
    if (!firebaseConfig.projectId) {
      setDailyData(STARTER_DECK);
      return { items: STARTER_DECK, dbOk: false };
    }
    try {
      const q = query(collection(db, 'vocabHistory'), orderBy('timestamp', 'desc'), limit(260));
      const querySnapshot = await withTimeout(getDocs(q), 6000, 'Firestore timeout');

      const seen = new Set();
      const cleanedHistory = [];
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const dateKey = data.timestamp ? getLocalDateKey(data.timestamp, tz) : 'starter';
        const dedupeKey = `${dateKey}_${(data.term || '').toLowerCase().trim()}`;
        if (!seen.has(dedupeKey)) {
          seen.add(dedupeKey);
          cleanedHistory.push(data);
        }
      });

      const finalItems = cleanedHistory.length > 0 ? cleanedHistory.slice(0, 240) : STARTER_DECK;
      setDailyData(finalItems);
      return { items: finalItems, dbOk: true };
    } catch (err) {
      console.error('History load fallback:', err);
      setDailyData(STARTER_DECK);
      return { items: STARTER_DECK, dbOk: false };
    }
  };

  const initLoad = async (tz) => {
    const { items, dbOk } = await loadHistory(tz);
    if (initialAutoCheckDoneRef.current || !dbOk) return;
    initialAutoCheckDoneRef.current = true;

    // If past 12:00 AM in current time zone and today's 8 cards aren't generated yet, auto-generate now
    const todayKey = getLocalDateKey(new Date(), tz);
    const todaysCount = items.filter(
      item => !item.isStarter && item.timestamp && getLocalDateKey(item.timestamp, tz) === todayKey
    ).length;

    if (todaysCount < 8) {
      await generateNewBriefing(items, tz);
    }
  };

  const todayKey = getLocalDateKey(new Date(), activeTimeZone);
  const todaysSavedCards = dailyData.filter(
    item => !item.isStarter && item.timestamp && getLocalDateKey(item.timestamp, activeTimeZone) === todayKey
  );
  const hasTodaysBriefing = todaysSavedCards.length >= 8;

  const generateNewBriefing = async (existingItemsOverride = null, tzOverride = null) => {
    const tz = tzOverride || activeTimeZone;
    const baseItems = Array.isArray(existingItemsOverride) ? existingItemsOverride : dailyData;
    const currentTodayCount = baseItems.filter(
      item => !item.isStarter && item.timestamp && getLocalDateKey(item.timestamp, tz) === getLocalDateKey(new Date(), tz)
    ).length;

    if (generationLockRef.current || currentTodayCount >= 8) return;
    generationLockRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/daily-briefing?tz=${encodeURIComponent(tz)}`);
      if (res.ok) {
        await loadHistory(tz);
        setCurrentIndex(0);
        return;
      }

      // Local `npm run dev` fallback
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Server error (${res.status})`);
      }

      const existingRealItems = baseItems.filter(item => !item.isStarter);
      const existingTerms = existingRealItems.slice(0, 120).map(item => item.term).join(', ');
      const prompt = `Generate a JSON array of 8 items: 5 executive English words (Barack Obama / Shashi Tharoor / Big 4 partner caliber) and 3 North American slangs (1 US corporate/social, 1 Texas labeled "(Texas)", 1 Canadian labeled "(Canadian)"). Do NOT repeat: ${existingTerms}.
Schema: [{"type":"word","term":"string","pronunciation":"string","meaning":"string","personalExample":"string","professionalExample":"string"}]`;

      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey.trim()}`;
      const gRes = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.85,
            thinkingConfig: { thinkingLevel: 'low' }
          }
        })
      });

      if (!gRes.ok) {
        const errData = await gRes.json().catch(() => ({}));
        throw new Error(`Gemini API (${gRes.status}): ${errData?.error?.message || gRes.statusText}`);
      }

      const gData = await gRes.json();
      const rawText = gData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const match = rawText.match(/\[\s*\{.*\}\s*\]/s);
      const parsed = JSON.parse(match ? match[0] : rawText);
      const timestamp = new Date().toISOString();
      const stamped = parsed.slice(0, 8).map(item => ({ ...item, timestamp }));

      setDailyData([...stamped, ...existingRealItems].slice(0, 240));
      setCurrentIndex(0);
      Promise.allSettled(stamped.map(item => addDoc(collection(db, 'vocabHistory'), item)));
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to generate new briefing.');
    } finally {
      setIsLoading(false);
      generationLockRef.current = false;
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
    if (!isoString) return 'Sample Deck';
    return new Date(isoString).toLocaleDateString('en-US', {
      timeZone: activeTimeZone,
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const currentItem = dailyData[currentIndex] || STARTER_DECK[0];
  const currentDateStr = formatDate(currentItem?.timestamp);

  const uniqueDates = [...new Set(dailyData.map(item => formatDate(item.timestamp)))];
  const currentDayIdx = uniqueDates.indexOf(currentDateStr);
  const currentDayItems = dailyData.filter(item => formatDate(item.timestamp) === currentDateStr);
  const indexInDay = Math.max(0, currentDayItems.indexOf(currentItem));

  const jumpToDate = (dateStr) => {
    const targetIndex = dailyData.findIndex(item => formatDate(item.timestamp) === dateStr);
    if (targetIndex !== -1) setCurrentIndex(targetIndex);
  };

  const shortTzName = activeTimeZone.split('/').pop()?.replace(/_/g, ' ') || activeTimeZone;

  return (
    <div className="min-h-screen flex flex-col justify-between p-4 md:py-5 md:px-6 max-w-md mx-auto">
      <div>
        <header className="mb-3 flex justify-between items-center gap-2">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-amber-500 leading-tight">Daily Briefing</h1>
            <p className="text-gray-400 text-[11px] tracking-widest uppercase mt-0.5">
              12 AM {shortTzName} • {dailyData.length} Items
            </p>
          </div>
          <button
            onClick={() => generateNewBriefing()}
            disabled={isLoading || hasTodaysBriefing}
            title={
              hasTodaysBriefing
                ? `Today's briefing is ready. Next briefing triggers at 12:00 AM (${activeTimeZone}).`
                : 'Generate today’s 8-card briefing now'
            }
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition ${
              hasTodaysBriefing
                ? 'bg-emerald-950/50 text-emerald-400 border-emerald-800/70 cursor-not-allowed'
                : 'bg-gray-800 text-amber-500 border-gray-700 hover:bg-gray-700 disabled:opacity-50'
            }`}
          >
            {isLoading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Curating...</span>
              </>
            ) : hasTodaysBriefing ? (
              <>
                <CheckCircle2 size={16} />
                <span>Ready Today</span>
              </>
            ) : (
              <>
                <RefreshCw size={16} />
                <span>New Briefing</span>
              </>
            )}
          </button>
        </header>

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
          <p className="text-gray-400 animate-pulse text-sm">Curating today's executive briefing ({elapsedSeconds}s)...</p>
        </div>
      ) : (
        <>
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