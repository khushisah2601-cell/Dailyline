import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Check } from 'lucide-react';
import { formatDurationHuman } from '../utils/calendar';

export interface TaskCelebrationPayload {
  key: number;
  blockTitle: string;
  durationMinutes: number;
  isBreak: boolean;
  prevCompletedCount: number;
  newCompletedCount: number;
  totalCount: number;
  completedMinutesTotal: number;
  streakCount: number;
  nextUpTitle?: string;
}

interface TaskCompletionCelebrationProps {
  celebration: TaskCelebrationPayload | null;
  onDismiss: () => void;
}

interface MindMasteryQuote {
  text: string;
  source: string;
}

const TASK_MIND_QUOTES: MindMasteryQuote[] = [
  {
    text: 'You have power over your mind—not outside events. Realize this, and you will find strength.',
    source: 'Marcus Aurelius',
  },
  {
    text: 'Rule your mind, or it will rule you.',
    source: 'Horace',
  },
  {
    text: 'No person is free who is not master of themselves.',
    source: 'Epictetus',
  },
  {
    text: 'First say to yourself what you would be; and then do what you have to do.',
    source: 'Epictetus',
  },
  {
    text: 'He who conquers himself is the mightiest warrior.',
    source: 'Confucius',
  },
  {
    text: 'Mood follows action. Command your hands first, and your mind falls into line.',
    source: 'Iron Discipline',
  },
  {
    text: 'Every promise you keep to yourself rewires who is in command inside your head.',
    source: 'Self-Command',
  },
  {
    text: 'Stop negotiating with hesitation. Decide once, lock the target, and execute.',
    source: 'Mental Mastery',
  },
  {
    text: 'Your impulses ask for comfort now; your future demands authority over this hour.',
    source: 'Relentless Focus',
  },
  {
    text: 'Control your attention, and nothing external can hijack your direction.',
    source: 'Mind Sovereignty',
  },
  {
    text: 'Weakness speaks in excuses. Mastery speaks in finished blocks.',
    source: 'Execution Code',
  },
  {
    text: 'The mind bends to whichever voice you feed—feed it proof that you finish what you start.',
    source: 'Cognitive Command',
  },
  {
    text: 'We suffer far more in imagination and delay than in disciplined action.',
    source: 'Seneca · Adapted',
  },
  {
    text: 'Do not wait to feel motivated. Action is the switch that forces clarity on.',
    source: 'Iron Resolve',
  },
];

const BREAK_MIND_QUOTES: MindMasteryQuote[] = [
  {
    text: 'Calm is a weapon. Reset the nervous system deliberately, then strike the next block clean.',
    source: 'Tactical Composure',
  },
  {
    text: 'Mastery over the mind includes commanding stillness so your next hour hits at full force.',
    source: 'Deliberate Recovery',
  },
  {
    text: 'Quiet the noise, steady the breath, and return to the work with total control.',
    source: 'Mental Command',
  },
];

const FINALE_MIND_QUOTES: MindMasteryQuote[] = [
  {
    text: 'Most people let shifting moods write their day. Today, your discipline wrote the outcome.',
    source: 'Total Self-Mastery',
  },
  {
    text: 'You gave an order to your schedule and executed every single block. That is true command of the mind.',
    source: 'Unbreakable Standard',
  },
];

const CONFETTI_SPARKS = [
  { x: -78, y: -48, rotate: 28, color: '#60A5FA', size: 16, delay: 0.04 },
  { x: 82, y: -44, rotate: -32, color: '#34D399', size: 17, delay: 0.08 },
  { x: -94, y: 8, rotate: 52, color: '#FBBF24', size: 14, delay: 0.12 },
  { x: 96, y: 12, rotate: -48, color: '#93C5FD', size: 15, delay: 0.15 },
  { x: -46, y: -68, rotate: 18, color: '#34D399', size: 13, delay: 0.18 },
  { x: 50, y: -66, rotate: -22, color: '#FBBF24', size: 14, delay: 0.2 },
  { x: -64, y: 42, rotate: 40, color: '#60A5FA', size: 12, delay: 0.22 },
  { x: 68, y: 44, rotate: -36, color: '#34D399', size: 13, delay: 0.24 },
];

const AUTO_DISMISS_MS = 5800;

export const TaskCompletionCelebration: React.FC<TaskCompletionCelebrationProps> = ({
  celebration,
  onDismiss,
}) => {
  const lastQuoteIndexRef = useRef<number>(-1);
  const [activeQuote, setActiveQuote] = useState<MindMasteryQuote>(TASK_MIND_QUOTES[0]);
  const [isPaused, setIsPaused] = useState<boolean>(false);

  const isAllDone = Boolean(
    celebration &&
      celebration.totalCount > 0 &&
      celebration.newCompletedCount >= celebration.totalCount
  );

  // Pick a fresh, non-repeating strong mind-mastery quote on every task completion
  useEffect(() => {
    if (!celebration) return;
    setIsPaused(false);

    const pool = isAllDone
      ? FINALE_MIND_QUOTES
      : celebration.isBreak
        ? BREAK_MIND_QUOTES
        : TASK_MIND_QUOTES;

    let nextIdx = Math.floor(Math.random() * pool.length);
    if (pool.length > 1 && nextIdx === lastQuoteIndexRef.current) {
      nextIdx = (nextIdx + 1) % pool.length;
    }
    lastQuoteIndexRef.current = nextIdx;
    setActiveQuote(pool[nextIdx]);
  }, [celebration?.key, isAllDone]);

  // Auto-dismiss after reading window (pauses while hovered so user can read at their own pace)
  useEffect(() => {
    if (!celebration || isPaused) return;
    const timer = window.setTimeout(() => {
      onDismiss();
    }, AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [celebration?.key, isPaused, onDismiss]);

  // Keyboard dismiss (Enter, Space, Escape)
  useEffect(() => {
    if (!celebration) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ') {
        e.preventDefault();
        onDismiss();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [celebration, onDismiss]);

  const prevPct = celebration
    ? Math.round(
        (celebration.prevCompletedCount / Math.max(1, celebration.totalCount)) * 100
      )
    : 0;
  const newPct = celebration
    ? Math.min(
        100,
        Math.round(
          (celebration.newCompletedCount / Math.max(1, celebration.totalCount)) * 100
        )
      )
    : 0;

  return (
    <AnimatePresence>
      {celebration && (
        <motion.div
          key={celebration.key}
          role="dialog"
          aria-modal="true"
          aria-label="Task completed motivation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.18 } }}
          onClick={onDismiss}
          className="fixed inset-0 z-50 bg-oxford-950/65 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6"
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
            initial={{ opacity: 0, scale: 0.88, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: -14 }}
            transition={{ type: 'spring', stiffness: 380, damping: 24 }}
            className="relative w-full max-w-md bg-[#0B192C] text-white border border-[#1E3A5F] rounded-2xl overflow-hidden shadow-2xl"
          >
            {/* Radial Mimo Celebration Glow */}
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute inset-0 ${
                isAllDone
                  ? 'bg-[radial-gradient(circle_at_50%_18%,rgba(16,185,129,0.28),transparent_62%)]'
                  : 'bg-[radial-gradient(circle_at_50%_18%,rgba(37,99,235,0.28),transparent_62%)]'
              }`}
            />

            <div className="relative z-10 p-6 sm:p-7">
              {/* Mascot + Confetti Burst + Strong Mind-Mastery Quote Bubble */}
              <div className="flex flex-col items-center text-center">
                <div className="relative w-22 h-22 flex items-center justify-center">
                  {/* Geometric Vector Confetti Burst */}
                  {CONFETTI_SPARKS.map((spark, idx) => (
                    <motion.svg
                      key={idx}
                      initial={{ opacity: 0, scale: 0, x: 0, y: 0, rotate: 0 }}
                      animate={{
                        opacity: [0, 1, 0.9, 0],
                        scale: [0.3, 1.2, 0.95, 0.6],
                        x: spark.x,
                        y: spark.y,
                        rotate: spark.rotate,
                      }}
                      transition={{
                        duration: 0.95,
                        delay: spark.delay,
                        ease: 'easeOut',
                      }}
                      viewBox="0 0 16 16"
                      style={{ width: spark.size, height: spark.size }}
                      className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                    >
                      <path
                        d="M8 0L10.2 5.8L16 8L10.2 10.2L8 16L5.8 10.2L0 8L5.8 5.8Z"
                        fill={spark.color}
                      />
                    </motion.svg>
                  ))}

                  {/* Mimo-Style Celebrating Dayo Companion */}
                  <motion.svg
                    viewBox="0 0 120 120"
                    className="w-22 h-22 drop-shadow-[0_10px_20px_rgba(0,0,0,0.4)]"
                    initial={{ scale: 0.65, y: 16 }}
                    animate={{
                      scale: [0.7, 1.08, 1],
                      y: [12, -10, 0, -5, 0],
                      rotate: [0, -4, 4, -2, 0],
                    }}
                    transition={{
                      duration: 0.72,
                      ease: 'easeOut',
                    }}
                  >
                    <line
                      x1="60"
                      y1="11"
                      x2="60"
                      y2="22"
                      stroke={isAllDone ? '#34D399' : '#60A5FA'}
                      strokeWidth="4"
                      strokeLinecap="round"
                    />
                    <circle
                      cx="60"
                      cy="9"
                      r="5.5"
                      fill={isAllDone ? '#FBBF24' : '#93C5FD'}
                    />

                    {/* Raised Cheering Arms */}
                    <motion.path
                      d="M20 58 C8 46, 8 34, 17 30"
                      stroke={isAllDone ? '#10B981' : '#2563EB'}
                      strokeWidth="7"
                      strokeLinecap="round"
                      fill="none"
                      animate={{ rotate: [0, -14, 8, 0] }}
                      transition={{ duration: 0.65, delay: 0.1 }}
                    />
                    <motion.path
                      d="M100 58 C112 46, 112 34, 103 30"
                      stroke={isAllDone ? '#10B981' : '#2563EB'}
                      strokeWidth="7"
                      strokeLinecap="round"
                      fill="none"
                      animate={{ rotate: [0, 14, -8, 0] }}
                      transition={{ duration: 0.65, delay: 0.1 }}
                    />

                    {/* 3D Chassis Shadow */}
                    <rect
                      x="22"
                      y="28"
                      width="76"
                      height="70"
                      rx="21"
                      fill={isAllDone ? '#065F46' : '#1E3A8A'}
                    />
                    {/* Main Rounded-Square Chassis */}
                    <rect
                      x="22"
                      y="22"
                      width="76"
                      height="70"
                      rx="21"
                      fill={isAllDone ? '#10B981' : '#2563EB'}
                    />

                    {/* Inner Visor Face */}
                    <rect x="31" y="33" width="58" height="45" rx="13" fill="#0B192C" />

                    {/* Joyful ^ ^ Eyes */}
                    <path
                      d="M41 53 Q47 45 53 53"
                      stroke={isAllDone ? '#6EE7B7' : '#93C5FD'}
                      strokeWidth="4"
                      strokeLinecap="round"
                      fill="none"
                    />
                    <path
                      d="M67 53 Q73 45 79 53"
                      stroke={isAllDone ? '#6EE7B7' : '#93C5FD'}
                      strokeWidth="4"
                      strokeLinecap="round"
                      fill="none"
                    />

                    {/* Confident Smile */}
                    <path
                      d="M49 62 Q60 72 71 62"
                      stroke="#FFFFFF"
                      strokeWidth="3.4"
                      strokeLinecap="round"
                      fill="none"
                    />

                    {/* Checkmark Badge on Chin */}
                    <circle cx="60" cy="85" r="5" fill="#FFFFFF" opacity="0.92" />
                    <path
                      d="M57.8 85 L59.4 86.7 L62.5 83.4"
                      stroke={isAllDone ? '#059669' : '#1D4ED8'}
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                    />
                  </motion.svg>
                </div>

                {/* Task Completed Heading */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08 }}
                  className="mt-2"
                >
                  <span
                    className={`text-[11px] font-mono font-bold uppercase tracking-wider ${
                      isAllDone ? 'text-[#6EE7B7]' : 'text-[#93C5FD]'
                    }`}
                  >
                    {isAllDone
                      ? 'All Blocks Executed'
                      : celebration.isBreak
                        ? 'Mind Reset Complete'
                        : 'Block Executed'}
                  </span>
                  <h2 className="mt-0.5 text-base sm:text-lg font-bold text-white leading-snug line-clamp-1">
                    {celebration.blockTitle}
                  </h2>
                </motion.div>

                {/* Tactile Mimo Mind-Command Quote Speech Bubble */}
                <motion.blockquote
                  initial={{ opacity: 0, scale: 0.94, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ type: 'spring', stiffness: 360, damping: 24, delay: 0.13 }}
                  className="relative mt-4 w-full bg-white text-oxford-950 rounded-xl border-b-4 border-[#CBD5E1] px-4 py-3.5 text-left shadow-md"
                >
                  <div
                    aria-hidden="true"
                    className="absolute left-1/2 -ml-1.5 -top-1.5 w-3 h-3 bg-white rotate-45"
                  />
                  <p className="text-sm sm:text-[15px] font-bold text-oxford-950 leading-relaxed">
                    “{activeQuote.text}”
                  </p>
                  <footer className="mt-2 flex items-center justify-between text-[11px] font-mono uppercase tracking-wider text-cobalt-700 font-semibold">
                    <span>Mind Command</span>
                    <span>— {activeQuote.source}</span>
                  </footer>
                </motion.blockquote>
              </div>

              {/* Animated Mimo Daily Progress Bar */}
              <div className="mt-4 bg-[#0F223B] border border-[#1E3A5F] rounded-xl p-3.5">
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="font-semibold text-slate-200">Daily schedule command</span>
                  <span className="font-mono font-bold text-[#93C5FD] tabular-nums">
                    {celebration.newCompletedCount}/{celebration.totalCount} blocks · {newPct}%
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-[#091423] overflow-hidden">
                  <motion.div
                    initial={{ width: `${prevPct}%` }}
                    animate={{ width: `${newPct}%` }}
                    transition={{
                      type: 'spring',
                      stiffness: 180,
                      damping: 22,
                      delay: 0.18,
                    }}
                    className={`h-full rounded-full ${
                      isAllDone ? 'bg-[#10B981]' : 'bg-[#3B82F6]'
                    }`}
                  />
                </div>
              </div>

              {/* Dual Mimo Stat Cards (Time Banked + Streak) */}
              <div className="mt-3 grid grid-cols-2 gap-3">
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.22 }}
                  className="bg-[#0F223B] border border-[#1E3A5F] rounded-xl p-3"
                >
                  <span className="block text-[11px] text-slate-400">Time locked in</span>
                  <span className="mt-0.5 block font-mono text-base font-bold text-[#6EE7B7] tabular-nums">
                    +{celebration.durationMinutes}m
                  </span>
                  <span className="block text-[11px] text-slate-400 font-mono tabular-nums mt-0.5">
                    {formatDurationHuman(celebration.completedMinutesTotal)} today
                  </span>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.27 }}
                  className="bg-[#0F223B] border border-[#1E3A5F] rounded-xl p-3"
                >
                  <span className="block text-[11px] text-slate-400">Discipline streak</span>
                  <span className="mt-0.5 block font-mono text-base font-bold text-[#93C5FD] tabular-nums">
                    {celebration.streakCount}{' '}
                    <span className="text-xs font-sans font-semibold text-slate-200">
                      in a row
                    </span>
                  </span>
                  <div className="mt-1.5 flex items-center gap-1" aria-hidden="true">
                    {[0, 1, 2, 3, 4].map((idx) => (
                      <div
                        key={idx}
                        className={`h-1.5 flex-1 rounded-xs ${
                          idx < Math.min(5, celebration.streakCount)
                            ? 'bg-[#3B82F6]'
                            : 'bg-[#162B49]'
                        }`}
                      />
                    ))}
                  </div>
                </motion.div>
              </div>

              {celebration.nextUpTitle && !isAllDone && (
                <p className="mt-3 text-xs text-slate-300 truncate text-center">
                  Next target:{' '}
                  <span className="font-semibold text-white">
                    {celebration.nextUpTitle}
                  </span>
                </p>
              )}

              {/* Tactile 3D Mimo Continue Button */}
              <button
                type="button"
                onClick={onDismiss}
                className={`mt-4 w-full inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-bold tracking-wide text-white rounded-xl border-b-4 active:border-b-0 active:translate-y-[3px] transition-all cursor-pointer ${
                  isAllDone
                    ? 'bg-[#10B981] hover:bg-[#34D399] border-[#047857]'
                    : 'bg-[#2563EB] hover:bg-[#3B82F6] border-[#1E40AF]'
                }`}
              >
                <Check className="w-4 h-4 stroke-[2.8]" />
                {isAllDone ? 'Day Conquered' : 'Lock In Next Task'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {/* Auto-Dismiss Countdown Hairline (pauses when hovered so user can read quote) */}
            {!isPaused && (
              <motion.div
                key={`timer-${celebration.key}`}
                initial={{ scaleX: 1 }}
                animate={{ scaleX: 0 }}
                transition={{ duration: AUTO_DISMISS_MS / 1000, ease: 'linear' }}
                className="h-1 bg-[#60A5FA]/55 origin-left"
              />
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
