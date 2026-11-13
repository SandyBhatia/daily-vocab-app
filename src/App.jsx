import React, { useState } from 'react';
import { Volume2, ChevronLeft, ChevronRight, Bookmark } from 'lucide-react';

// Starter data format for the UI (AI API logic to be attached here)
const dailyData = [
  {
    type: 'word',
    term: 'Perspicacious',
    pronunciation: 'pur-spi-KAY-shus',
    meaning: 'Having a ready insight into and understanding of things; astute.',
    personalExample: 'She was perspicacious enough to realize that her friends were planning a surprise party.',
    professionalExample: 'The CEO gave a perspicacious analysis of the market trends during the board meeting.',
  },
  {
    type: 'word',
    term: 'Sycophant',
    pronunciation: 'SIK-uh-funt',
    meaning: 'A person who acts obsequiously toward someone important in order to gain advantage.',
    personalExample: 'He was tired of the sycophants who only wanted to be around him because of his sudden wealth.',
    professionalExample: 'A good leader values honest feedback over the agreement of sycophants.',
  },
  {
    type: 'word',
    term: 'Inexorable',
    pronunciation: 'in-EK-ser-uh-bul',
    meaning: 'Impossible to stop or prevent.',
    personalExample: 'The inexorable passing of time makes every moment precious.',
    professionalExample: 'The inexorable shift towards digital transformation is affecting all industries.',
  },
  {
    type: 'word',
    term: 'Mellifluous',
    pronunciation: 'muh-LIF-loo-us',
    meaning: '(Of a voice or words) sweet or musical; pleasant to hear.',
    personalExample: 'Her mellifluous voice was perfect for reading bedtime stories.',
    professionalExample: 'The politician was known for his mellifluous speeches that easily swayed the crowd.',
  },
  {
    type: 'word',
    term: 'Ubiquitous',
    pronunciation: 'yoo-BIK-wi-tus',
    meaning: 'Present, appearing, or found everywhere.',
    personalExample: 'Smartphones have become ubiquitous in modern society.',
    professionalExample: 'The company aims to make its software ubiquitous across all enterprise systems.',
  },
  {
    type: 'slang',
    term: 'Boots on the ground',
    pronunciation: 'boots on thuh ground',
    meaning: 'People who are physically present and working in a particular place, rather than managing from afar.',
    personalExample: 'We need some boots on the ground to see what the local scene is really like.',
    professionalExample: 'Our strategy is solid, but we need boots on the ground in Texas to execute the rollout.',
  },
  {
    type: 'slang',
    term: 'In the weeds',
    pronunciation: 'in thuh weedz',
    meaning: 'Deeply involved in or overwhelmed by details.',
    personalExample: 'I wanted to plan a simple dinner, but I got in the weeds trying to perfect the menu.',
    professionalExample: "Let's not get in the weeds right now; we need to focus on the high-level strategy.",
  },
  {
    type: 'slang',
    term: 'Toque (Canadian)',
    pronunciation: 'took',
    meaning: 'A knitted winter hat (beanie).',
    personalExample: "Don't forget your toque; it's freezing outside today!",
    professionalExample: 'Even the execs wear toques when they visit the Toronto office in January.',
  }
];

export default function App() {
  const [currentIndex, setCurrentIndex] = useState(0);

  const handleNext = () => {
    if (currentIndex < dailyData.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const speakText = (text) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      window.speechSynthesis.speak(utterance);
    } else {
      alert('Text-to-speech is not supported in your browser.');
    }
  };

  const currentItem = dailyData[currentIndex];

  return (
    <div className="min-h-screen flex flex-col p-4 md:p-8 max-w-md mx-auto">
      <header className="mb-8 mt-4">
        <h1 className="text-3xl font-bold text-amber-500">Daily Briefing</h1>
        <p className="text-gray-400 text-sm tracking-widest uppercase mt-1">Curated Vocabulary & Slang</p>
      </header>

      <div className="flex justify-center gap-2 mb-6">
        {dailyData.map((_, idx) => (
          <div
            key={idx}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              idx === currentIndex ? 'w-6 bg-amber-500' : 'w-2 bg-gray-700'
            }`}
          />
        ))}
      </div>

      <div className="flex-1 flex flex-col bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-2xl relative min-h-[450px]">
        <div className="flex justify-between items-start mb-6">
          <span className={`text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider ${
            currentItem.type === 'word' ? 'bg-amber-900/40 text-amber-500 border border-amber-800' : 'bg-blue-900/40 text-blue-400 border border-blue-800'
          }`}>
            {currentItem.type.toUpperCase()}
          </span>
          <div className="flex gap-2">
            <button className="p-2 bg-gray-800 rounded-full text-gray-400 hover:text-white transition">
              <Bookmark size={18} />
            </button>
            <button
              onClick={() => speakText(currentItem.term)}
              className="p-2 bg-gray-800 rounded-full text-amber-400 hover:text-amber-300 hover:bg-gray-700 transition"
              aria-label="Pronounce word"
            >
              <Volume2 size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pr-2 pb-4" style={{scrollbarWidth: 'thin'}}>
          <h2 className="text-3xl md:text-4xl font-extrabold mb-1 tracking-tight text-white">{currentItem.term}</h2>
          <p className="text-gray-500 text-sm font-mono mb-6 italic">{currentItem.pronunciation}</p>
          
          <div className="space-y-6">
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Meaning</h3>
              <p className="text-lg text-gray-200 leading-relaxed">{currentItem.meaning}</p>
            </div>

            <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-800">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span> Professional Context
              </h3>
              <p className="text-gray-300 italic">"{currentItem.professionalExample}"</p>
            </div>

            <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-800">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span> Casual / Personal
              </h3>
              <p className="text-gray-300 italic">"{currentItem.personalExample}"</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center mt-8 px-2">
        <button
          onClick={handlePrev}
          disabled={currentIndex === 0}
          className={`flex items-center gap-2 px-5 py-3 rounded-xl font-medium transition ${
            currentIndex === 0 
              ? 'opacity-30 cursor-not-allowed bg-gray-800 text-gray-400' 
              : 'bg-gray-800 text-white hover:bg-gray-700 active:scale-95'
          }`}
        >
          <ChevronLeft size={20} /> Previous
        </button>
        <button
          onClick={handleNext}
          disabled={currentIndex === dailyData.length - 1}
          className={`flex items-center gap-2 px-5 py-3 rounded-xl font-medium transition ${
            currentIndex === dailyData.length - 1 
              ? 'opacity-30 cursor-not-allowed bg-amber-600 text-white' 
              : 'bg-amber-500 text-gray-950 hover:bg-amber-400 active:scale-95 shadow-lg shadow-amber-500/20'
          }`}
        >
          Next <ChevronRight size={20} />
        </button>
      </div>
    </div>
  );
}