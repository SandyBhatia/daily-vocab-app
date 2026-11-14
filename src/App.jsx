import React, { useState, useEffect } from 'react';
import { Volume2, ChevronLeft, ChevronRight, Loader2, RefreshCw, Calendar } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { GoogleGenerativeAI } from '@google/generative-ai';

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

// 2. Initialize Gemini
const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);

export default function App() {
  const [dailyData, setDailyData] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Swipe State
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  const minSwipeDistance = 50;

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const q = query(collection(db, "vocabHistory"), orderBy("timestamp", "desc"), limit(240));
      const querySnapshot = await getDocs(q);
      const history = [];
      querySnapshot.forEach((doc) => history.push(doc.data()));
      
      if (history.length > 0) {
        setDailyData(history);
      }
    } catch (err) {
      console.error("Error loading history:", err);
      setError(err.message || "Failed to connect to database.");
    }
  };

  const generateNewBriefing = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Corrected to the stable 1.5 flash model
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      
      const existingTerms = dailyData.map(item => item.term).join(', ');
      const exclusionRule = existingTerms 
        ? `Do NOT repeat any of these previously generated words or slangs from the last 30 days: ${existingTerms}.` 
        : '';

      const prompt = `You are a vocabulary curator for a traveling executive based in Dallas. 
      Generate a JSON array containing exactly 8 items: 5 advanced, highly articulate words (the kind used by top executives, Big 4 analysts, or politicians like Barack Obama or Shashi Tharoor) and 3 North American slangs (include at least one Texas regionalism and one Canadian term). 
      Ensure the words are distinct from basic vocabulary.
      ${exclusionRule}
      
      Return ONLY a valid JSON array matching this exact structure, with no markdown formatting, markdown blocks, or extra text:
      [
        {
          "type": "word", 
          "term": "string",
          "pronunciation": "string",
          "meaning": "string",
          "personalExample": "string",
          "professionalExample": "string"
        }
      ]`;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text().trim().replace(/```json/g, '').replace(/```/g, '');
      const parsedData = JSON.parse(responseText);

      const timestamp = new Date().toISOString();
      const itemsToSave = parsedData.map(item => ({ ...item, timestamp }));

      const batchPromises = itemsToSave.map(item => addDoc(collection(db, "vocabHistory"), item));
      await Promise.all(batchPromises);

      setDailyData(prev => [...itemsToSave, ...prev].slice(0, 240));
      setCurrentIndex(0);
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to generate new vocabulary. Please check API keys.");
    } finally {
      setIsLoading(false);
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
    
    if (distance > minSwipeDistance && currentIndex < dailyData.length - 1) {
      setCurrentIndex(c => c + 1);
    }
    if (distance < -minSwipeDistance && currentIndex > 0) {
      setCurrentIndex(c => c - 1);
    }
  };

  const speakText = (text) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      window.speechSynthesis.speak(utterance);
    }
  };

  const formatDate = (isoString) => {
    if (!isoString) return 'Unknown Date';
    return new Date(isoString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const uniqueDates = [...new Set(dailyData.map(item => formatDate(item.timestamp)))];

  const handleDateJump = (e) => {
    const selectedDate = e.target.value;
    const targetIndex = dailyData.findIndex(item => formatDate(item.timestamp) === selectedDate);
    if (targetIndex !== -1) {
      setCurrentIndex(targetIndex);
    }
  };

  if (dailyData.length === 0 && !isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-gray-950 text-center">
        <h1 className="text-3xl font-bold text-amber-500 mb-4">Daily Briefing</h1>
        <p className="text-gray-400 mb-6">No vocabulary history found. Generate your first briefing!</p>
        
        {/* ADDED: Error message will now show here if something breaks! */}
        {error && (
          <div className="mb-6 p-4 bg-red-900/20 border border-red-900 rounded-lg max-w-sm w-full">
            <p className="text-red-400 text-sm font-mono break-words">{error}</p>
          </div>
        )}

        <button onClick={generateNewBriefing} className="bg-amber-500 text-gray-950 px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-amber-400 transition">
          <RefreshCw size={20} /> Generate First Briefing
        </button>
      </div>
    );
  }

  const currentItem = dailyData[currentIndex];
  const dotIndex = currentIndex % 8;

  return (
    <div className="min-h-screen flex flex-col p-4 md:p-8 max-w-md mx-auto">
      <header className="mb-6 mt-4 flex justify-between items-start gap-2">
        <div>
          <h1 className="text-3xl font-bold text-amber-500">Daily Briefing</h1>
          <p className="text-gray-400 text-xs tracking-widest uppercase mt-1">30-Day Archive ({dailyData.length} items)</p>
        </div>
        <div className="flex items-center gap-2">
          {uniqueDates.length > 1 && (
            <select value={formatDate(currentItem?.timestamp)} onChange={handleDateJump} className="bg-gray-800 text-gray-200 text-xs rounded-lg px-2.5 py-2 border border-gray-700 focus:outline-none focus:border-amber-500">
              {uniqueDates.map(dateStr => (
                <option key={dateStr} value={dateStr}>{dateStr}</option>
              ))}
            </select>
          )}
          <button onClick={generateNewBriefing} disabled={isLoading} className="p-2 bg-gray-800 rounded-full text-amber-500 hover:bg-gray-700 transition disabled:opacity-50">
            {isLoading ? <Loader2 size={20} className="animate-spin" /> : <RefreshCw size={20} />}
          </button>
        </div>
      </header>

      {error && <p className="text-red-400 mb-4 text-sm bg-red-900/20 p-3 rounded-lg border border-red-900">{error}</p>}

      {isLoading ? (
        <div className="flex-1 flex flex-col items-center justify-center bg-gray-900 border border-gray-800 rounded-2xl min-h-[450px]">
          <Loader2 size={48} className="text-amber-500 animate-spin mb-4" />
          <p className="text-gray-400 animate-pulse">Curating executive vocabulary...</p>
        </div>
      ) : (
        <>
          <div className="flex justify-center gap-2 mb-6">
            {[...Array(8)].map((_, idx) => (
              <div key={idx} className={`h-1.5 rounded-full transition-all duration-300 ${idx === dotIndex ? 'w-6 bg-amber-500' : 'w-2 bg-gray-700'}`} />
            ))}
          </div>

          <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} className="flex-1 flex flex-col bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-2xl relative min-h-[450px]">
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-3">
                <span className={`text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider ${currentItem?.type === 'word' ? 'bg-amber-900/40 text-amber-500 border border-amber-800' : 'bg-blue-900/40 text-blue-400 border border-blue-800'}`}>
                  {currentItem?.type?.toUpperCase()}
                </span>
                {currentItem?.timestamp && (
                  <span className="text-xs text-gray-500 flex items-center gap-1 font-medium">
                    <Calendar size={12} /> {formatDate(currentItem.timestamp)}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => speakText(currentItem?.term)} className="p-2 bg-gray-800 rounded-full text-amber-400 hover:text-amber-300 hover:bg-gray-700 transition">
                  <Volume2 size={18} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 pb-4" style={{scrollbarWidth: 'thin'}}>
              <h2 className="text-3xl md:text-4xl font-extrabold mb-1 tracking-tight text-white">{currentItem?.term}</h2>
              <p className="text-gray-500 text-sm font-mono mb-6 italic">{currentItem?.pronunciation}</p>
              
              <div className="space-y-6">
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Meaning</h3>
                  <p className="text-lg text-gray-200 leading-relaxed">{currentItem?.meaning}</p>
                </div>
                <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-800">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span> Professional Context
                  </h3>
                  <p className="text-gray-300 italic">"{currentItem?.professionalExample}"</p>
                </div>
                <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-800">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span> Casual / Personal
                  </h3>
                  <p className="text-gray-300 italic">"{currentItem?.personalExample}"</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center mt-8 px-2">
            <button onClick={() => setCurrentIndex(c => Math.max(0, c - 1))} disabled={currentIndex === 0} className={`flex items-center gap-2 px-5 py-3 rounded-xl font-medium transition ${currentIndex === 0 ? 'opacity-30 cursor-not-allowed bg-gray-800 text-gray-400' : 'bg-gray-800 text-white hover:bg-gray-700'}`}>
              <ChevronLeft size={20} /> Newer
            </button>
            <span className="text-xs text-gray-500 font-mono">{currentIndex + 1} / {dailyData.length}</span>
            <button onClick={() => setCurrentIndex(c => Math.min(dailyData.length - 1, c + 1))} disabled={currentIndex === dailyData.length - 1} className={`flex items-center gap-2 px-5 py-3 rounded-xl font-medium transition ${currentIndex === dailyData.length - 1 ? 'opacity-30 cursor-not-allowed bg-amber-600 text-white' : 'bg-amber-500 text-gray-950 hover:bg-amber-400 shadow-lg shadow-amber-500/20'}`}>
              Older <ChevronRight size={20} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}