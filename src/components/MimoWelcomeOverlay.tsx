import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ArrowRight, Check, Sparkles } from 'lucide-react';
import { EnergyLevel } from '../types';

interface MimoWelcomeOverlayProps {
  isOpen: boolean;
  userName?: string | null;
  selectedEnergy: EnergyLevel;
  onSelectEnergy: (energy: EnergyLevel) => void;
  onComplete: () => void;
  onCompleteWithSample: () => void;
}

const PREVIEW_BLOCKS = [
  {
    id: 'p1',
    time: '09:00 – 10:15',
    title: 'Maths assignment (due tomorrow)',
    meta: '75m · Focus',
    accent: 'border-[#3B82F6]/40 bg-[#132946]',
    timeTone: 'text-[#93C5FD]',
    checked: true,
  },
  {
    id: 'p2',
    time: '10:15 – 10:30',
    title: 'Screen break & stretch',
    meta: '15m · Recovery',
    accent: 'border-[#34D399]/35 bg-[#0F2937]',
    timeTone: 'text-[#6EE7B7]',
    checked: true,
  },
  {
    id: 'p3',
    time: '10:30 – 11:15',
    title: 'Revise Java arrays & reply to emails',
    meta: '45m · Routine',
    accent: 'border-[#60A5FA]/30 bg-[#132946]/85',
    timeTone: 'text-[#BAE6FD]',
    checked: false,
  },
];

const ENERGY_CARDS: Array<{
  value: EnergyLevel;
  title: string;
  subtitle: string;
  badge: string;
}> = [
  {
    value: EnergyLevel.High,
    title: 'High energy',
    subtitle: 'Front-loads 60–90m deep focus blocks while your mind is sharpest.',
    badge: '60–90m sprints',
  },
  {
    value: EnergyLevel.Medium,
    title: 'Steady & balanced',
    subtitle: 'Paces 45–60m focus blocks with regular breathing room.',
    badge: '45–60m blocks',
  },
  {
    value: EnergyLevel.Low,
    title: 'Gentle pace',
    subtitle: 'Uses lighter 25–40m starter blocks, extra rest, and honest deferral.',
    badge: '25–40m starters',
  },
];

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

interface DayoMascotProps {
  step: number;
  isBlinking: boolean;
}

const DayoMascot: React.FC<DayoMascotProps> = ({ step, isBlinking }) => {
  const isCelebrating = step === 2;

  return (
    <div className="relative w-24 h-24 shrink-0 select-none" aria-hidden="true">
      {/* Celebratory geometric vector sparks on Step 3 */}
      <AnimatePresence>
        {isCelebrating && (
          <>
            {[
              { x: -34, y: -22, delay: 0.05, color: '#60A5FA' },
              { x: 36, y: -20, delay: 0.12, color: '#34D399' },
              { x: -38, y: 18, delay: 0.18, color: '#FBBF24' },
              { x: 38, y: 16, delay: 0.22, color: '#93C5FD' },
            ].map((spark, idx) => (
              <motion.svg
                key={idx}
                initial={{ opacity: 0, scale: 0, x: 0, y: 0 }}
                animate={{
                  opacity: [0, 1, 0.85],
                  scale: [0.3, 1.15, 0.95],
                  x: spark.x,
                  y: spark.y,
                  rotate: [0, 45, 90],
                }}
                exit={{ opacity: 0, scale: 0 }}
                transition={{
                  duration: 0.55,
                  delay: spark.delay,
                  ease: 'easeOut',
                }}
                viewBox="0 0 16 16"
                className="w-4 h-4 absolute left-1/2 top-1/2 -ml-2 -mt-2 pointer-events-none"
              >
                <path
                  d="M8 0L10 6L16 8L10 10L8 16L6 10L0 8L6 6Z"
                  fill={spark.color}
                />
              </motion.svg>
            ))}
          </>
        )}
      </AnimatePresence>

      {/* Main Mimo-inspired tactile buddy */}
      <motion.svg
        key={step}
        viewBox="0 0 120 120"
        className="w-full h-full drop-shadow-[0_10px_22px_rgba(0,0,0,0.38)]"
        initial={{ scale: 0.84, y: 10, rotate: step === 1 ? -4 : 0 }}
        animate={{
          scale: 1,
          y: isCelebrating ? [0, -9, 0] : [0, -3, 0],
          rotate: step === 0 ? [0, -2, 2, 0] : step === 1 ? [-2, 1, 0] : [0, -3, 3, 0],
        }}
        transition={{
          scale: { type: 'spring', stiffness: 360, damping: 18 },
          y: {
            duration: isCelebrating ? 0.65 : 2.6,
            repeat: Infinity,
            repeatType: 'mirror',
            ease: 'easeInOut',
          },
          rotate: { duration: 0.55, ease: 'easeOut' },
        }}
      >
        {/* Top Antenna Stem & Signal Node */}
        <line
          x1="60"
          y1="10"
          x2="60"
          y2="22"
          stroke="#60A5FA"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <circle cx="60" cy="9" r="5" fill="#93C5FD" />

        {/* Friendly Waving Left Arm */}
        <motion.path
          d={step === 0 ? 'M18 62 C8 52, 8 42, 15 38' : 'M18 64 C10 66, 10 74, 16 76'}
          stroke="#2563EB"
          strokeWidth="7"
          strokeLinecap="round"
          fill="none"
          animate={
            step === 0
              ? { rotate: [0, -14, 10, -10, 0] }
              : isCelebrating
                ? { rotate: [0, -18, 12, 0] }
                : { rotate: 0 }
          }
          style={{ originX: '18px', originY: '62px' }}
          transition={{ duration: 0.9, delay: 0.15 }}
        />

        {/* Right Arm */}
        <path
          d={isCelebrating ? 'M102 62 C112 50, 112 40, 105 36' : 'M102 64 C110 66, 110 74, 104 76'}
          stroke="#2563EB"
          strokeWidth="7"
          strokeLinecap="round"
          fill="none"
        />

        {/* 3D Bottom Bezel Shadow of Chassis */}
        <rect x="20" y="28" width="80" height="74" rx="22" fill="#1E3A8A" />

        {/* Main Rounded-Square Royal Cobalt Chassis */}
        <rect x="20" y="22" width="80" height="74" rx="22" fill="#2563EB" />

        {/* Subtle Top Highlight */}
        <path
          d="M36 27 H84"
          stroke="#60A5FA"
          strokeWidth="2.5"
          strokeLinecap="round"
          opacity="0.65"
        />

        {/* Inner Oxford Visor Screen */}
        <rect x="29" y="33" width="62" height="48" rx="14" fill="#0B192C" />

        {/* Expressive Eyes */}
        {isCelebrating ? (
          <>
            {/* Happy ^ ^ eyes */}
            <path
              d="M40 55 Q46 47 52 55"
              stroke="#93C5FD"
              strokeWidth="4"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d="M68 55 Q74 47 80 55"
              stroke="#93C5FD"
              strokeWidth="4"
              strokeLinecap="round"
              fill="none"
            />
          </>
        ) : isBlinking ? (
          <>
            <line
              x1="40"
              y1="53"
              x2="52"
              y2="53"
              stroke="#93C5FD"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
            <line
              x1="68"
              y1="53"
              x2="80"
              y2="53"
              stroke="#93C5FD"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
          </>
        ) : (
          <>
            <circle cx={step === 1 ? 48 : 46} cy="52" r="5.5" fill="#93C5FD" />
            <circle cx={step === 1 ? 49.5 : 47.8} cy="50.2" r="2" fill="#FFFFFF" />
            <circle cx={step === 1 ? 76 : 74} cy="52" r="5.5" fill="#93C5FD" />
            <circle cx={step === 1 ? 77.5 : 75.8} cy="50.2" r="2" fill="#FFFFFF" />
          </>
        )}

        {/* Warm Rosy Cheek Accents */}
        <circle cx="37" cy="62" r="3.2" fill="#38BDF8" opacity="0.35" />
        <circle cx="83" cy="62" r="3.2" fill="#38BDF8" opacity="0.35" />

        {/* Friendly Smile */}
        <path
          d={
            isCelebrating
              ? 'M50 64 Q60 74 70 64'
              : step === 1
                ? 'M53 65 Q60 70 67 65'
                : 'M51 64 Q60 71 69 64'
          }
          stroke="#FFFFFF"
          strokeWidth="3.2"
          strokeLinecap="round"
          fill="none"
        />

        {/* Mini Timeline Bar Indicator on Chin */}
        <rect x="44" y="86" width="14" height="4" rx="2" fill="#93C5FD" />
        <rect x="61" y="86" width="8" height="4" rx="2" fill="#60A5FA" opacity="0.7" />
        <rect x="72" y="86" width="5" height="4" rx="2" fill="#60A5FA" opacity="0.45" />
      </motion.svg>
    </div>
  );
};

export const MimoWelcomeOverlay: React.FC<MimoWelcomeOverlayProps> = ({
  isOpen,
  userName,
  selectedEnergy,
  onSelectEnergy,
  onComplete,
  onCompleteWithSample,
}) => {
  const [step, setStep] = useState<number>(0);
  const [isBlinking, setIsBlinking] = useState<boolean>(false);

  // Reset to step 0 whenever reopened
  useEffect(() => {
    if (isOpen) {
      setStep(0);
    }
  }, [isOpen]);

  // Natural eye-blink loop like Mimo's mascot
  useEffect(() => {
    if (!isOpen) return;
    const interval = window.setInterval(() => {
      setIsBlinking(true);
      window.setTimeout(() => setIsBlinking(false), 150);
    }, 3200);
    return () => window.clearInterval(interval);
  }, [isOpen]);

  // Keyboard navigation (Escape skips, Enter advances)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onComplete();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (step < 2) {
          setStep((s) => s + 1);
        } else {
          onComplete();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, step, onComplete]);

  const greeting = useMemo(() => {
    const base = getTimeGreeting();
    const firstName = userName?.trim().split(/\s+/)[0];
    return firstName ? `${base}, ${firstName}` : base;
  }, [userName]);

  const speechText = useMemo(() => {
    if (step === 0) {
      return `${greeting}! Welcome to Dayline. Dump everything on your mind—in any language—and I’ll fit it calmly into the hours you actually have.`;
    }
    if (step === 1) {
      return 'Quick check-in: how is your energy feeling today? I’ll size your focus sprints and recovery breaks around it.';
    }
    const paceName =
      selectedEnergy === EnergyLevel.High
        ? 'High-energy'
        : selectedEnergy === EnergyLevel.Low
          ? 'Gentle'
          : 'Balanced';
    return `${paceName} pace locked in! Ready to turn messy thoughts into a clear, realistic schedule for today?`;
  }, [step, greeting, selectedEnergy]);

  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      }),
    []
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Welcome to Dayline"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, y: -16, transition: { duration: 0.24, ease: 'easeInOut' } }}
          className="fixed inset-0 z-50 bg-[#0B192C] text-white flex flex-col justify-between overflow-y-auto"
        >
          {/* Subtle Mimo-inspired radial glow + crisp geometric dot matrix */}
          <div
            aria-hidden="true"
            className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_26%,rgba(37,99,235,0.24),transparent_60%)]"
          />

          {/* Top Bar: Mimo Segmented Progress Track + Skip */}
          <div className="relative z-10 w-full max-w-xl mx-auto px-6 pt-6 sm:pt-8 flex items-center gap-4">
            {step > 0 ? (
              <button
                type="button"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                aria-label="Previous step"
                className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer shrink-0"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            ) : (
              <span className="text-xs font-bold tracking-wider text-[#93C5FD] uppercase shrink-0">
                Dayline
              </span>
            )}

            {/* 3-Segment Mimo Progress Track */}
            <div className="flex-1 grid grid-cols-3 gap-2" aria-label={`Step ${step + 1} of 3`}>
              {[0, 1, 2].map((idx) => {
                const active = idx <= step;
                return (
                  <div
                    key={idx}
                    className="h-2.5 rounded-full bg-[#162B49] overflow-hidden"
                  >
                    <motion.div
                      initial={false}
                      animate={{ width: active ? '100%' : '0%' }}
                      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                      className="h-full rounded-full bg-[#3B82F6]"
                    />
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={onComplete}
              className="text-xs font-semibold text-slate-400 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Skip
            </button>
          </div>

          {/* Center Interactive Stage */}
          <div className="relative z-10 w-full max-w-xl mx-auto px-6 py-6 my-auto">
            {/* Mascot + Tactile Speech Bubble Row */}
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-5">
              <DayoMascot step={step} isBlinking={isBlinking} />

              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  initial={{ opacity: 0, y: 10, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 25 }}
                  className="relative flex-1 bg-white text-oxford-950 rounded-2xl border-b-4 border-[#CBD5E1] px-5 py-4 shadow-lg"
                >
                  {/* Desktop Speech Pointer */}
                  <div
                    aria-hidden="true"
                    className="hidden sm:block absolute -left-2 top-7 w-4 h-4 bg-white rotate-45 rounded-xs"
                  />
                  {/* Mobile Top Speech Pointer */}
                  <div
                    aria-hidden="true"
                    className="sm:hidden absolute left-1/2 -ml-2 -top-2 w-4 h-4 bg-white rotate-45 rounded-xs"
                  />
                  <p className="relative text-sm sm:text-[15px] font-semibold text-oxford-950 leading-relaxed">
                    {speechText}
                  </p>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Step Body Content */}
            <div className="mt-7">
              <AnimatePresence mode="wait">
                {step === 0 && (
                  <motion.div
                    key="step-0"
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.22 }}
                    className="bg-[#0F223B] border border-[#1E3A5F] rounded-2xl p-4 sm:p-5 space-y-2.5"
                  >
                    <div className="flex items-center justify-between text-xs text-slate-400 pb-1">
                      <span className="font-semibold text-slate-200">
                        Live preview · Chaos to clarity
                      </span>
                      <span className="font-mono text-[#93C5FD] tabular-nums">
                        09:00 – 11:15
                      </span>
                    </div>

                    {PREVIEW_BLOCKS.map((item, idx) => (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, x: -16 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{
                          type: 'spring',
                          stiffness: 320,
                          damping: 24,
                          delay: 0.12 + idx * 0.11,
                        }}
                        className={`rounded-xl border px-3.5 py-2.5 flex items-center justify-between gap-3 ${item.accent}`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <motion.div
                            initial={{ scale: 0.5, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ delay: 0.28 + idx * 0.12, type: 'spring' }}
                            className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${
                              item.checked
                                ? 'bg-[#10B981] text-[#052E16]'
                                : 'border border-slate-500/70 bg-[#0B192C]'
                            }`}
                          >
                            {item.checked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                          </motion.div>

                          <div className="min-w-0">
                            <p className="text-xs sm:text-sm font-semibold text-white truncate">
                              {item.title}
                            </p>
                            <p className="text-[11px] text-slate-400 font-mono tabular-nums">
                              {item.time} · {item.meta}
                            </p>
                          </div>
                        </div>

                        <span
                          className={`hidden sm:inline font-mono text-xs font-semibold tabular-nums shrink-0 ${item.timeTone}`}
                        >
                          {item.time.split('–')[0].trim()}
                        </span>
                      </motion.div>
                    ))}
                  </motion.div>
                )}

                {step === 1 && (
                  <motion.div
                    key="step-1"
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.22 }}
                    role="radiogroup"
                    aria-label="Choose your energy today"
                    className="space-y-3"
                  >
                    {ENERGY_CARDS.map((card, idx) => {
                      const isSelected = selectedEnergy === card.value;
                      return (
                        <motion.button
                          key={card.value}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.06 }}
                          onClick={() => onSelectEnergy(card.value)}
                          className={`w-full text-left rounded-2xl px-4 py-3.5 border-2 border-b-4 transition-all active:translate-y-[2px] active:border-b-2 cursor-pointer flex items-center justify-between gap-4 ${
                            isSelected
                              ? 'bg-[#152E52] border-[#60A5FA] border-b-[#2563EB] text-white'
                              : 'bg-[#0F223B] border-[#1E3A5F] border-b-[#091423] text-slate-200 hover:border-[#33588A]'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-white">
                                {card.title}
                              </span>
                              <span className="text-xs font-mono text-[#93C5FD] tabular-nums">
                                · {card.badge}
                              </span>
                            </div>
                            <p className="mt-0.5 text-xs text-slate-300 leading-relaxed">
                              {card.subtitle}
                            </p>
                          </div>

                          <div
                            className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                              isSelected
                                ? 'bg-[#3B82F6] border-[#60A5FA] text-white'
                                : 'border-slate-500'
                            }`}
                          >
                            {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                          </div>
                        </motion.button>
                      );
                    })}
                  </motion.div>
                )}

                {step === 2 && (
                  <motion.div
                    key="step-2"
                    initial={{ opacity: 0, scale: 0.96, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ type: 'spring', stiffness: 320, damping: 24 }}
                    className="bg-[#0F223B] border border-[#2563EB]/45 rounded-2xl p-5 space-y-4"
                  >
                    <div className="flex items-center justify-between gap-3 border-b border-[#1E3A5F] pb-3.5">
                      <div>
                        <span className="text-[11px] font-mono uppercase tracking-wider text-[#93C5FD]">
                          Today’s Setup
                        </span>
                        <h3 className="text-base font-bold text-white mt-0.5">
                          {todayLabel}
                        </h3>
                      </div>

                      <div className="text-right">
                        <span className="text-[11px] text-slate-400 block">
                          Energy pace
                        </span>
                        <span className="text-sm font-bold text-[#60A5FA] capitalize">
                          {selectedEnergy}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div className="bg-[#0B192C] border border-[#1E3A5F] rounded-xl p-3">
                        <span className="block font-mono text-sm font-bold text-white tabular-nums">
                          Any
                        </span>
                        <span className="block text-[11px] text-slate-400 mt-0.5">
                          Language
                        </span>
                      </div>
                      <div className="bg-[#0B192C] border border-[#1E3A5F] rounded-xl p-3">
                        <span className="block font-mono text-sm font-bold text-[#6EE7B7] tabular-nums">
                          Auto
                        </span>
                        <span className="block text-[11px] text-slate-400 mt-0.5">
                          Smart breaks
                        </span>
                      </div>
                      <div className="bg-[#0B192C] border border-[#1E3A5F] rounded-xl p-3">
                        <span className="block font-mono text-sm font-bold text-[#93C5FD] tabular-nums">
                          PDF / ICS
                        </span>
                        <span className="block text-[11px] text-slate-400 mt-0.5">
                          1-click export
                        </span>
                      </div>
                    </div>

                    <div className="pt-1 text-center">
                      <button
                        type="button"
                        onClick={onCompleteWithSample}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#93C5FD] hover:text-white underline underline-offset-4 transition-colors cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        Or jump straight in with a sample plan
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Bottom Tactile Mimo CTA Dock */}
          <div className="relative z-10 w-full border-t border-[#162B49] bg-[#0B192C]/95 backdrop-blur-xs">
            <div className="max-w-xl mx-auto px-6 py-4 sm:py-5 flex items-center justify-between gap-4">
              <span className="hidden sm:inline text-xs text-slate-400 font-mono tabular-nums">
                {step + 1} / 3 · Press Enter
              </span>

              <button
                type="button"
                onClick={() => {
                  if (step < 2) {
                    setStep((s) => s + 1);
                  } else {
                    onComplete();
                  }
                }}
                className="w-full sm:w-auto sm:min-w-[210px] inline-flex items-center justify-center gap-2 px-6 py-3.5 text-sm font-bold tracking-wide text-white bg-[#2563EB] hover:bg-[#3B82F6] border-b-4 border-[#1E40AF] active:border-b-0 active:translate-y-[3px] rounded-xl transition-all cursor-pointer whitespace-nowrap"
              >
                {step === 0
                  ? 'Continue'
                  : step === 1
                    ? 'Lock in my pace'
                    : 'Start planning'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
