import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Check,
  FastForward,
  Pause,
  Play,
  RotateCcw,
} from 'lucide-react';
import { BlockCategory, DayPlan, ScheduleBlock } from '../types';
import { DeviceMusicPlayer, DeviceMusicPlayerProps } from './DeviceMusicPlayer';

interface FocusTimerViewProps {
  plan: DayPlan | null;
  activeBlockId: string | null;
  sessionStreak: number;
  bestSessionStreak: number;
  musicPlayerProps: DeviceMusicPlayerProps;
  onTimerRunningChange?: (running: boolean) => void;
  onSelectBlock: (blockId: string) => void;
  onCompleteBlock: (blockId: string) => void;
  onIncrementStreak: () => void;
  onBreakStreak: () => void;
  onResetStreak: () => void;
  onBackToPlanner: () => void;
}

export const FocusTimerView: React.FC<FocusTimerViewProps> = ({
  plan,
  activeBlockId,
  sessionStreak,
  bestSessionStreak,
  musicPlayerProps,
  onTimerRunningChange,
  onSelectBlock,
  onCompleteBlock,
  onIncrementStreak,
  onBreakStreak,
  onResetStreak,
  onBackToPlanner,
}) => {
  const blocks = plan?.blocks ?? [];
  const activeBlock: ScheduleBlock | undefined =
    blocks.find((b) => b.id === activeBlockId) ||
    blocks.find((b) => !b.completed && b.category !== BlockCategory.Break) ||
    blocks[0];

  const [secondsLeft, setSecondsLeft] = useState<number>(
    activeBlock ? activeBlock.durationMinutes * 60 : 25 * 60
  );
  const [isRunning, setIsRunning] = useState<boolean>(false);

  useEffect(() => {
    setIsRunning(false);
    setSecondsLeft(activeBlock ? activeBlock.durationMinutes * 60 : 25 * 60);
  }, [activeBlock?.id, activeBlock?.durationMinutes]);

  const [didReachZero, setDidReachZero] = useState<boolean>(false);

  useEffect(() => {
    if (!isRunning) {
      document.title = 'Dayline — Realistic Daily Planning';
      return;
    }

    const interval = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          setIsRunning(false);
          setDidReachZero(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [isRunning]);

  useEffect(() => {
    if (isRunning && activeBlock) {
      const m = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
      const s = String(secondsLeft % 60).padStart(2, '0');
      document.title = `${m}:${s} · ${activeBlock.title} — Dayline`;
    }
    return () => {
      document.title = 'Dayline — Realistic Daily Planning';
    };
  }, [secondsLeft, isRunning, activeBlock]);

  useEffect(() => {
    onTimerRunningChange?.(isRunning);
  }, [isRunning]);

  useEffect(() => {
    if (!didReachZero) return;
    setDidReachZero(false);
    if (!activeBlock) return;

    if (!activeBlock.completed) {
      onCompleteBlock(activeBlock.id);
      if (activeBlock.category !== BlockCategory.Break) {
        onIncrementStreak();
      }
    }

    const currentIndex = blocks.findIndex((b) => b.id === activeBlock.id);
    const afterCurrent = blocks
      .slice(currentIndex + 1)
      .find((b) => !b.completed && b.id !== activeBlock.id);
    const fallbackAny = blocks.find(
      (b) => !b.completed && b.id !== activeBlock.id
    );
    const nextTarget = afterCurrent || fallbackAny;
    if (nextTarget) {
      onSelectBlock(nextTarget.id);
    }
  }, [didReachZero, activeBlock, blocks, onCompleteBlock, onIncrementStreak, onSelectBlock]);

  if (!plan || blocks.length === 0 || !activeBlock) {
    return (
      <div className="max-w-4xl mx-auto py-12 px-6">
        <div className="bg-white border border-[#DCE3EE] rounded-xl p-8 md:p-10 text-center max-w-xl mx-auto">
          <h2 className="text-2xl font-bold text-oxford-950 tracking-tight">
            No scheduled blocks yet
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Generate a daily plan first to run countdown timers, or add tracks from your device library below.
          </p>
          {sessionStreak > 0 && (
            <p className="mt-3 text-xs font-mono font-medium text-cobalt-700 tabular-nums">
              Current session streak: {sessionStreak} consecutive focus{' '}
              {sessionStreak === 1 ? 'block' : 'blocks'}
            </p>
          )}
          <button
            type="button"
            onClick={onBackToPlanner}
            className="mt-6 inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-cobalt-600 hover:bg-cobalt-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Go to Planner
          </button>
        </div>

        <DeviceMusicPlayer {...musicPlayerProps} />
      </div>
    );
  }

  const mins = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const secs = String(secondsLeft % 60).padStart(2, '0');
  const totalSeconds = Math.max(1, activeBlock.durationMinutes * 60);
  const progressPct = Math.min(100, Math.max(0, ((totalSeconds - secondsLeft) / totalSeconds) * 100));
  const isBreakBlock = activeBlock.category === BlockCategory.Break;
  const hasStartedCurrentBlock = isRunning || secondsLeft < totalSeconds;

  const adjustMinutes = (deltaMins: number) => {
    setSecondsLeft((prev) => Math.max(60, prev + deltaMins * 60));
  };

  const advanceToNextUnfinished = (excludeBlockId: string) => {
    const currentIndex = blocks.findIndex((b) => b.id === excludeBlockId);
    const afterCurrent = blocks
      .slice(currentIndex + 1)
      .find((b) => !b.completed && b.id !== excludeBlockId);
    const fallbackAny = blocks.find((b) => !b.completed && b.id !== excludeBlockId);
    const nextTarget = afterCurrent || fallbackAny;
    if (nextTarget) {
      onSelectBlock(nextTarget.id);
    }
  };

  const handleCompleteAndAdvance = () => {
    setIsRunning(false);
    if (!activeBlock.completed) {
      onCompleteBlock(activeBlock.id);
      if (!isBreakBlock) {
        onIncrementStreak();
      }
    }
    advanceToNextUnfinished(activeBlock.id);
  };

  const handleSkipAndAdvance = () => {
    setIsRunning(false);
    if (!activeBlock.completed && !isBreakBlock) {
      onBreakStreak();
    }
    advanceToNextUnfinished(activeBlock.id);
  };

  const handleQueueBlockClick = (targetBlock: ScheduleBlock) => {
    if (targetBlock.id === activeBlock.id) return;
    if (hasStartedCurrentBlock && !activeBlock.completed && !isBreakBlock) {
      onBreakStreak();
    }
    onSelectBlock(targetBlock.id);
  };

  const streakSegments = 5;
  const filledSegments = Math.min(streakSegments, sessionStreak);

  return (
    <div className="max-w-4xl mx-auto py-8 px-6">
      <div className="flex items-center justify-between mb-6">
        <button
          type="button"
          onClick={onBackToPlanner}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-oxford-900 hover:text-cobalt-600 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to timeline
        </button>
        <div className="text-xs text-cobalt-700 font-mono font-medium tabular-nums">
          {activeBlock.startTime} – {activeBlock.endTime} · {activeBlock.durationMinutes}m planned
        </div>
      </div>

      <div className="bg-white border border-[#DCE3EE] rounded-xl p-6 md:p-10">
        {/* Session Streak Indicator */}
        <div
          aria-live="polite"
          className="pb-6 mb-8 border-b border-[#E8EEF6] flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-xs font-semibold text-oxford-900">
                Session streak
              </span>
              <span aria-hidden="true" className="text-xs text-slate-300">
                ·
              </span>
              <span className="font-mono text-sm font-bold text-cobalt-600 tabular-nums">
                {sessionStreak}{' '}
                <span className="font-sans font-semibold text-oxford-950">
                  consecutive focus {sessionStreak === 1 ? 'block' : 'blocks'}
                </span>
              </span>
              {bestSessionStreak > 0 && (
                <>
                  <span aria-hidden="true" className="text-xs text-slate-300">
                    ·
                  </span>
                  <span className="text-xs text-[#B45309] font-mono font-medium tabular-nums">
                    Session best: {bestSessionStreak}
                  </span>
                </>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-600">
              {sessionStreak === 0
                ? 'Complete focus blocks in a row without skipping to build momentum.'
                : isBreakBlock
                  ? 'Recovery break — completing or skipping breaks keeps your focus streak intact.'
                  : 'Streak active — finish this block to extend your consecutive run.'}
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div
              className="flex items-center gap-1"
              aria-label={`Streak progress: ${sessionStreak} consecutive blocks`}
            >
              {Array.from({ length: streakSegments }).map((_, idx) => (
                <div
                  key={idx}
                  className={`w-5 h-2 rounded-xs transition-colors duration-150 ${
                    idx < filledSegments ? 'bg-cobalt-600' : 'bg-surface-tint'
                  }`}
                />
              ))}
              {sessionStreak > streakSegments && (
                <span className="ml-1 font-mono text-xs font-bold text-cobalt-600 tabular-nums">
                  +{sessionStreak - streakSegments}
                </span>
              )}
            </div>

            {sessionStreak > 0 && (
              <button
                type="button"
                onClick={onResetStreak}
                className="text-xs font-medium text-slate-500 hover:text-oxford-950 underline underline-offset-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Reset streak
              </button>
            )}
          </div>
        </div>

        {/* Active Timer Display */}
        <div className="text-center">
          <div className="text-xs font-medium text-cobalt-700 flex items-center justify-center gap-2">
            <span className="capitalize">{activeBlock.category}</span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span className="text-slate-600">{activeBlock.energyDemand} demand</span>
          </div>

          <h1 className="mt-3 text-2xl md:text-3xl font-bold text-oxford-950 tracking-tight max-w-xl mx-auto">
            {activeBlock.title}
          </h1>

          {activeBlock.note && (
            <p className="mt-2 text-sm text-slate-600 max-w-lg mx-auto">
              {activeBlock.note}
            </p>
          )}

          <div className="my-10 font-mono text-6xl md:text-7xl font-bold tracking-tight text-oxford-950 tabular-nums">
            {mins}:{secs}
          </div>

          <div className="max-w-md mx-auto h-2 bg-surface-tint rounded-full overflow-hidden mb-8">
            <div
              className="h-full bg-cobalt-600 transition-transform duration-200 origin-left"
              style={{ transform: `scaleX(${progressPct / 100})` }}
            />
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => adjustMinutes(-5)}
              className="px-3 py-2 text-xs font-mono font-semibold text-oxford-900 bg-surface-tint hover:bg-[#DCE5F2] rounded-lg transition-colors whitespace-nowrap shrink-0 tabular-nums cursor-pointer"
            >
              -5m
            </button>

            <button
              type="button"
              onClick={() => setIsRunning((r) => !r)}
              className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-cobalt-600 hover:bg-cobalt-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
            >
              {isRunning ? (
                <>
                  <Pause className="w-4 h-4" />
                  Pause
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  {secondsLeft < totalSeconds ? 'Resume' : 'Start Focus'}
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => adjustMinutes(5)}
              className="px-3 py-2 text-xs font-mono font-semibold text-oxford-900 bg-surface-tint hover:bg-[#DCE5F2] rounded-lg transition-colors whitespace-nowrap shrink-0 tabular-nums cursor-pointer"
            >
              +5m
            </button>

            <button
              type="button"
              onClick={() => {
                setIsRunning(false);
                setSecondsLeft(activeBlock.durationMinutes * 60);
              }}
              aria-label="Reset timer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium text-oxford-900 hover:bg-surface-tint border border-[#DCE3EE] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </button>

            <button
              type="button"
              onClick={handleCompleteAndAdvance}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-[#15803D] hover:bg-[#166534] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
            >
              <Check className="w-3.5 h-3.5" />
              {activeBlock.completed ? 'Completed' : 'Complete & Next'}
            </button>

            {!activeBlock.completed && (
              <button
                type="button"
                onClick={handleSkipAndAdvance}
                title={
                  isBreakBlock
                    ? 'Skip break and continue to next block'
                    : 'Skip this block (resets consecutive focus streak)'
                }
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium text-slate-600 hover:text-oxford-950 border border-[#DCE3EE] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <FastForward className="w-3.5 h-3.5" />
                Skip
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Personal Device & Library Music Player */}
      <DeviceMusicPlayer {...musicPlayerProps} />

      <div className="mt-8">
        <h2 className="text-sm font-bold text-oxford-950 mb-3">
          Up next in your window
        </h2>
        <div className="bg-white border border-[#DCE3EE] rounded-xl divide-y divide-[#E8EEF6] overflow-hidden">
          {blocks.map((block) => {
            const isSelected = block.id === activeBlock.id;
            return (
              <button
                key={block.id}
                type="button"
                onClick={() => handleQueueBlockClick(block)}
                className={`w-full flex items-center justify-between gap-4 px-4 py-3 text-left transition-colors cursor-pointer ${
                  isSelected ? 'bg-[#F0F5FF]' : 'hover:bg-slate-50/80'
                }`}
              >
                <div className="flex items-center gap-4 min-w-0">
                  <span
                    className={`font-mono text-xs tabular-nums whitespace-nowrap shrink-0 ${
                      isSelected ? 'text-cobalt-600 font-semibold' : 'text-slate-500'
                    }`}
                  >
                    {block.startTime} – {block.endTime}
                  </span>
                  <span
                    className={`text-sm truncate ${
                      block.completed
                        ? 'line-through text-slate-400'
                        : isSelected
                          ? 'font-bold text-oxford-950'
                          : 'font-medium text-oxford-900'
                    }`}
                  >
                    {block.title}
                  </span>
                </div>
                <span
                  className={`text-xs font-mono tabular-nums whitespace-nowrap shrink-0 ${
                    block.completed ? 'text-[#15803D] font-semibold' : 'text-slate-500'
                  }`}
                >
                  {block.completed ? 'Done' : `${block.durationMinutes}m`}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
