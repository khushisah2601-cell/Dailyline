/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowDown,
  ArrowUp,
  Calendar,
  Check,
  Coffee,
  Copy,
  FileDown,
  Mic,
  MicOff,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  SkipForward,
  Trash2,
} from 'lucide-react';
import {
  BlockCategory,
  DayPlan,
  DeferredItem,
  EnergyLevel,
  LocalMusicTrack,
  LoopMode,
  ScheduleBlock,
} from './types';
import {
  applyBreakSuggestion,
  calculateWindowMinutes,
  findLongestWorkStreakSuggestion,
  formatDurationHuman,
  formatMinutesToTime,
  generateIcsContent,
  generateMarkdownPlan,
  parseTimeToMinutes,
  recalculateTimeline,
} from './utils/calendar';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, onSnapshot } from 'firebase/firestore';
import { exportPlanToPdf } from './utils/pdfExport';
import { FocusTimerView } from './components/FocusTimerView';
import { SavedPlansView } from './components/SavedPlansView';
import { PrinciplesView } from './components/PrinciplesView';
import { SuggestionsView } from './components/SuggestionsView';
import { MimoWelcomeOverlay } from './components/MimoWelcomeOverlay';
import {
  TaskCelebrationPayload,
  TaskCompletionCelebration,
} from './components/TaskCompletionCelebration';
import { EnergyDemandChart } from './components/EnergyDemandChart';
import {
  APP_OWNER_EMAIL,
  auth,
  db,
  handleFirestoreError,
  OperationType,
} from './firebase';
import {
  getTagTheme,
  inferCategoryFromTag,
  normalizeTag,
  resolveBlockTags,
  suggestTagsForTitle,
} from './utils/tags';
import {
  cleanTrackTitle,
  clearDeviceLibrary,
  formatAudioTime,
  loadTracksFromDeviceLibrary,
  probeAudioDuration,
  removeTrackFromDeviceLibrary,
  saveTrackToDeviceLibrary,
} from './utils/musicLibrary';

const DEFAULT_PLACEHOLDER =
  'maths assignment due tomorrow, revise Java arrays, gym, reply to emails, call mom, buy groceries, laundry, read 20 pages';

const SAMPLE_DUMPS: Array<{
  label: string;
  text: string;
  start: string;
  finish: string;
  energy: EnergyLevel;
}> = [
  {
    label: 'Student day',
    text: 'maths assignment due tomorrow, revise Java arrays, gym, reply to emails, call mom, buy groceries, laundry, read 20 pages',
    start: '09:00',
    finish: '20:00',
    energy: EnergyLevel.Medium,
  },
  {
    label: 'Español',
    text: 'terminar presentación del cliente para mañana, revisar presupuesto trimestral, ir a correr 30 min, comprar verduras para la cena, llamar al dentista, leer un capítulo',
    start: '10:00',
    finish: '19:30',
    energy: EnergyLevel.High,
  },
  {
    label: 'Tight evening',
    text: 'fix login bug before standup tomorrow, pay electricity bill, cook pasta, fold laundry, stretch 15 mins, reply to landlord, organize desk',
    start: '18:00',
    finish: '22:00',
    energy: EnergyLevel.Low,
  },
];

enum ActiveTab {
  Planner = 'planner',
  Focus = 'focus',
  Saved = 'saved',
  Suggestions = 'suggestions',
  Principles = 'principles',
}

enum TimelineFilter {
  All = 'all',
  Focus = 'focus',
  Routine = 'routine',
  Break = 'break',
}

const STORAGE_KEY_SAVED = 'dayline_saved_plans_v1';
const STORAGE_KEY_CURRENT = 'dayline_current_plan_v1';
const SESSION_KEY_STREAK = 'dayline_session_streak_v1';
const SESSION_KEY_BEST_STREAK = 'dayline_session_best_streak_v1';
const SESSION_KEY_WELCOME_SEEN = 'dayline_welcome_seen_v1';

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>(ActiveTab.Planner);
  const [showWelcomeOverlay, setShowWelcomeOverlay] = useState<boolean>(false);
  const [taskCelebration, setTaskCelebration] =
    useState<TaskCelebrationPayload | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [ownerNewSuggestionsCount, setOwnerNewSuggestionsCount] = useState<number>(0);

  const handleDismissWelcome = () => {
    setShowWelcomeOverlay(false);
    try {
      sessionStorage.setItem(SESSION_KEY_WELCOME_SEEN, '1');
    } catch {
      // Ignore sessionStorage errors
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const isVerifiedOwner = Boolean(
      firebaseUser &&
        firebaseUser.emailVerified &&
        firebaseUser.email?.toLowerCase() === APP_OWNER_EMAIL.toLowerCase()
    );
    if (!authReady || !isVerifiedOwner) {
      setOwnerNewSuggestionsCount(0);
      return;
    }

    const unsubscribe = onSnapshot(
      collection(db, 'suggestions'),
      (snap) => {
        const unread = snap.docs.filter((d) => d.data().status === 'new').length;
        setOwnerNewSuggestionsCount(unread);
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, 'suggestions');
        } catch {
          // Structured error logged via handleFirestoreError
        }
      }
    );

    return () => unsubscribe();
  }, [authReady, firebaseUser]);

  // Composer inputs
  const [dump, setDump] = useState<string>('');
  const [startWindow, setStartWindow] = useState<string>('09:00');
  const [finishWindow, setFinishWindow] = useState<string>('20:00');
  const [energy, setEnergy] = useState<EnergyLevel>(EnergyLevel.Medium);

  // Plan & persistence state
  const [currentPlan, setCurrentPlan] = useState<DayPlan | null>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_CURRENT);
      return raw ? (JSON.parse(raw) as DayPlan) : null;
    } catch {
      return null;
    }
  });

  const [savedPlans, setSavedPlans] = useState<DayPlan[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_SAVED);
      return raw ? (JSON.parse(raw) as DayPlan[]) : [];
    } catch {
      return [];
    }
  });

  // UI states
  const [isPlanning, setIsPlanning] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<TimelineFilter>(TimelineFilter.All);
  const [activeFocusBlockId, setActiveFocusBlockId] = useState<string | null>(null);
  const [copiedFeedback, setCopiedFeedback] = useState<boolean>(false);
  const [pdfExportedFeedback, setPdfExportedFeedback] = useState<boolean>(false);

  // Current session focus streak state
  const [sessionStreak, setSessionStreak] = useState<number>(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY_STREAK);
      const parsed = raw ? Number.parseInt(raw, 10) : 0;
      return Number.isNaN(parsed) ? 0 : Math.max(0, parsed);
    } catch {
      return 0;
    }
  });

  const [bestSessionStreak, setBestSessionStreak] = useState<number>(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY_BEST_STREAK);
      const parsed = raw ? Number.parseInt(raw, 10) : 0;
      return Number.isNaN(parsed) ? 0 : Math.max(0, parsed);
    } catch {
      return 0;
    }
  });


  // Inline block editing / adding state
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string>('');
  const [isAddingBlock, setIsAddingBlock] = useState<boolean>(false);
  const [newBlockTitle, setNewBlockTitle] = useState<string>('');
  const [newBlockDuration, setNewBlockDuration] = useState<number>(30);
  const [newBlockCategory, setNewBlockCategory] = useState<BlockCategory>(BlockCategory.Focus);
  const [selectedNewTags, setSelectedNewTags] = useState<string[]>(['study']);
  const [userTouchedTags, setUserTouchedTags] = useState<boolean>(false);
  const [userTouchedCategory, setUserTouchedCategory] = useState<boolean>(false);
  const [customTagInput, setCustomTagInput] = useState<string>('');
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
  const [showBreakSuggestion, setShowBreakSuggestion] = useState<boolean>(false);
  const [recentlyInsertedBreakId, setRecentlyInsertedBreakId] = useState<string | null>(null);
  const [isConfirmingClearAll, setIsConfirmingClearAll] = useState<boolean>(false);
  const [clearedSnapshot, setClearedSnapshot] = useState<{
    plan: DayPlan | null;
    dumpText: string;
    wasInSaved: boolean;
  } | null>(null);
  const clearUndoTimerRef = useRef<number | null>(null);

  // Personal Device Music Library state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const autoPlayNextRef = useRef<boolean>(false);
  const [musicTracks, setMusicTracks] = useState<LocalMusicTrack[]>([]);
  const [activeMusicTrackId, setActiveMusicTrackId] = useState<string | null>(null);
  const [isMusicPlaying, setIsMusicPlaying] = useState<boolean>(false);
  const [musicCurrentTime, setMusicCurrentTime] = useState<number>(0);
  const [musicDuration, setMusicDuration] = useState<number>(0);
  const [musicVolume, setMusicVolume] = useState<number>(0.8);
  const [isMusicMuted, setIsMusicMuted] = useState<boolean>(false);
  const [musicLoopMode, setMusicLoopMode] = useState<LoopMode>(LoopMode.All);
  const [musicShuffle, setMusicShuffle] = useState<boolean>(false);
  const [syncMusicWithTimer, setSyncMusicWithTimer] = useState<boolean>(false);

  // Voice dictation (Web Speech API)
  const [isListening, setIsListening] = useState<boolean>(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const speechSupported = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const win = window as unknown as Record<string, unknown>;
    return Boolean(win.SpeechRecognition || win.webkitSpeechRecognition);
  }, []);

  useEffect(() => {
    try {
      if (currentPlan) {
        localStorage.setItem(STORAGE_KEY_CURRENT, JSON.stringify(currentPlan));
      } else {
        localStorage.removeItem(STORAGE_KEY_CURRENT);
      }
    } catch {
      // Ignore storage quota errors
    }
  }, [currentPlan]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_SAVED, JSON.stringify(savedPlans));
    } catch {
      // Ignore storage quota errors
    }
  }, [savedPlans]);

  useEffect(() => {
    try {
      sessionStorage.setItem(SESSION_KEY_STREAK, String(sessionStreak));
      sessionStorage.setItem(SESSION_KEY_BEST_STREAK, String(bestSessionStreak));
    } catch {
      // Ignore sessionStorage errors
    }
  }, [sessionStreak, bestSessionStreak]);

  // Hydrate saved device music library on mount
  useEffect(() => {
    let cancelled = false;
    loadTracksFromDeviceLibrary().then((loaded) => {
      if (cancelled) {
        loaded.forEach((t) => URL.revokeObjectURL(t.objectUrl));
        return;
      }
      if (loaded.length > 0) {
        setMusicTracks(loaded);
        setActiveMusicTrackId(loaded[0].id);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeMusicTrack = useMemo(() => {
    if (musicTracks.length === 0) return null;
    return musicTracks.find((t) => t.id === activeMusicTrackId) ?? musicTracks[0];
  }, [musicTracks, activeMusicTrackId]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = isMusicMuted ? 0 : musicVolume;
  }, [musicVolume, isMusicMuted]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!activeMusicTrack) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      setIsMusicPlaying(false);
      setMusicCurrentTime(0);
      setMusicDuration(0);
      return;
    }

    if (audio.src !== activeMusicTrack.objectUrl) {
      audio.src = activeMusicTrack.objectUrl;
      audio.load();
      setMusicCurrentTime(0);
      setMusicDuration(activeMusicTrack.durationSeconds ?? 0);
      if (autoPlayNextRef.current) {
        autoPlayNextRef.current = false;
        audio.play().catch(() => setIsMusicPlaying(false));
      }
    }
  }, [activeMusicTrack?.id, activeMusicTrack?.objectUrl]);

  const handleAddDeviceMusicFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter(
      (f) =>
        f.type.startsWith('audio/') ||
        /\.(mp3|m4a|aac|wav|ogg|flac|opus|webm)$/i.test(f.name)
    );
    if (files.length === 0) return;

    const createdTracks: LocalMusicTrack[] = [];
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      const objectUrl = URL.createObjectURL(file);
      const durationSeconds = await probeAudioDuration(objectUrl);
      const id = `dev-trk-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`;
      const trackMeta = {
        id,
        name: cleanTrackTitle(file.name),
        fileName: file.name,
        sizeBytes: file.size,
        mimeType: file.type || 'audio/mpeg',
        durationSeconds,
        addedAt: new Date().toISOString(),
      };
      await saveTrackToDeviceLibrary(trackMeta, file);
      createdTracks.push({
        ...trackMeta,
        objectUrl,
      });
    }

    setMusicTracks((prev) => {
      const updated = [...prev, ...createdTracks];
      if (!activeMusicTrackId && createdTracks[0]) {
        setActiveMusicTrackId(createdTracks[0].id);
      }
      return updated;
    });
  };

  const handleSelectMusicTrack = (trackId: string, autoPlay = true) => {
    const audio = audioRef.current;
    if (activeMusicTrack?.id === trackId) {
      if (!audio) return;
      if (audio.paused) {
        audio.play().catch(() => setIsMusicPlaying(false));
      } else if (!autoPlay) {
        audio.pause();
      }
      return;
    }
    autoPlayNextRef.current = autoPlay;
    setActiveMusicTrackId(trackId);
  };

  const handleToggleMusicPlay = () => {
    const audio = audioRef.current;
    if (!audio || !activeMusicTrack) return;
    if (audio.paused) {
      audio.play().catch(() => setIsMusicPlaying(false));
    } else {
      audio.pause();
    }
  };

  const handleNextMusicTrack = (fromEnded = false) => {
    if (musicTracks.length === 0) return;
    const audio = audioRef.current;

    if (fromEnded && musicLoopMode === LoopMode.One && audio) {
      audio.currentTime = 0;
      audio.play().catch(() => setIsMusicPlaying(false));
      return;
    }

    const currentIndex = musicTracks.findIndex((t) => t.id === activeMusicTrack?.id);
    if (musicShuffle && musicTracks.length > 1) {
      const candidates = musicTracks.filter((t) => t.id !== activeMusicTrack?.id);
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      if (pick) {
        autoPlayNextRef.current = isMusicPlaying || fromEnded;
        setActiveMusicTrackId(pick.id);
      }
      return;
    }

    const isLast = currentIndex >= musicTracks.length - 1;
    if (isLast && fromEnded && musicLoopMode === LoopMode.Off) {
      setIsMusicPlaying(false);
      return;
    }

    const nextIndex = isLast ? 0 : currentIndex + 1;
    const nextTrack = musicTracks[nextIndex];
    if (nextTrack) {
      if (nextTrack.id === activeMusicTrack?.id && audio) {
        audio.currentTime = 0;
        if (isMusicPlaying || fromEnded) {
          audio.play().catch(() => setIsMusicPlaying(false));
        }
      } else {
        autoPlayNextRef.current = isMusicPlaying || fromEnded;
        setActiveMusicTrackId(nextTrack.id);
      }
    }
  };

  const handlePrevMusicTrack = () => {
    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    if (musicTracks.length < 2) return;
    const currentIndex = musicTracks.findIndex((t) => t.id === activeMusicTrack?.id);
    const prevIndex = currentIndex <= 0 ? musicTracks.length - 1 : currentIndex - 1;
    const prevTrack = musicTracks[prevIndex];
    if (prevTrack) {
      autoPlayNextRef.current = isMusicPlaying;
      setActiveMusicTrackId(prevTrack.id);
    }
  };

  const handleSeekMusic = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = seconds;
    setMusicCurrentTime(seconds);
  };

  const handleCycleLoopMode = () => {
    setMusicLoopMode((prev) =>
      prev === LoopMode.All
        ? LoopMode.One
        : prev === LoopMode.One
          ? LoopMode.Off
          : LoopMode.All
    );
  };

  const handleRemoveMusicTrack = async (trackId: string) => {
    const target = musicTracks.find((t) => t.id === trackId);
    if (target) {
      URL.revokeObjectURL(target.objectUrl);
    }
    await removeTrackFromDeviceLibrary(trackId);
    setMusicTracks((prev) => {
      const remaining = prev.filter((t) => t.id !== trackId);
      if (activeMusicTrack?.id === trackId) {
        autoPlayNextRef.current = false;
        setActiveMusicTrackId(remaining[0]?.id ?? null);
      }
      return remaining;
    });
  };

  const handleClearMusicLibrary = async () => {
    musicTracks.forEach((t) => URL.revokeObjectURL(t.objectUrl));
    await clearDeviceLibrary();
    autoPlayNextRef.current = false;
    setMusicTracks([]);
    setActiveMusicTrackId(null);
    setIsMusicPlaying(false);
  };

  const handleTimerRunningSync = (timerRunning: boolean) => {
    if (!syncMusicWithTimer || !activeMusicTrack || !audioRef.current) return;
    if (timerRunning && audioRef.current.paused) {
      audioRef.current.play().catch(() => setIsMusicPlaying(false));
    } else if (!timerRunning && !audioRef.current.paused) {
      audioRef.current.pause();
    }
  };

  // Native Mobile Lock Screen / Headphone Media Session support
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    if (activeMusicTrack && typeof MediaMetadata !== 'undefined') {
      ms.metadata = new MediaMetadata({
        title: activeMusicTrack.name,
        artist: 'Dayline Personal Library',
      });
    } else {
      ms.metadata = null;
    }

    try {
      ms.setActionHandler('play', () => {
        audioRef.current?.play().catch(() => setIsMusicPlaying(false));
      });
      ms.setActionHandler('pause', () => {
        audioRef.current?.pause();
      });
      ms.setActionHandler('previoustrack', handlePrevMusicTrack);
      ms.setActionHandler('nexttrack', () => handleNextMusicTrack(false));
    } catch {
      // Ignore unsupported media session actions on older browsers
    }
  }, [activeMusicTrack?.id, activeMusicTrack?.name, musicTracks.length, isMusicPlaying, musicShuffle]);

  const handleIncrementStreak = () => {
    setSessionStreak((prev) => {
      const next = prev + 1;
      setBestSessionStreak((best) => Math.max(best, next));
      return next;
    });
  };

  const handleBreakStreak = () => {
    setSessionStreak(0);
  };

  const handleResetStreak = () => {
    setSessionStreak(0);
    setBestSessionStreak(0);
  };

  const syncPlanUpdate = (updated: DayPlan) => {
    setCurrentPlan(updated);
    setSavedPlans((prev) => {
      const exists = prev.some((p) => p.id === updated.id);
      if (!exists) return [updated, ...prev].slice(0, 30);
      return prev.map((p) => (p.id === updated.id ? updated : p));
    });
  };

  const availableMinutes = useMemo(
    () => calculateWindowMinutes(startWindow, finishWindow),
    [startWindow, finishWindow]
  );

  const energyHint = useMemo(() => {
    switch (energy) {
      case EnergyLevel.High:
        return 'Front-loads 60–90m deep focus blocks for demanding tasks.';
      case EnergyLevel.Medium:
        return 'Balances 45–60m focus blocks with steady transition breathers.';
      case EnergyLevel.Low:
        return 'Uses gentle 25–40m starter blocks, extra rest, and defers non-urgent work.';
    }
  }, [energy]);

  const toggleDictation = () => {
    if (!speechSupported) return;

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    const win = window as unknown as Record<
      string,
      new () => SpeechRecognitionLike
    >;
    const SpeechCtor = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SpeechCtor) return;

    const recognition = new SpeechCtor();
    recognition.continuous = true;
    recognition.interimResults = false;

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      let chunk = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        if (event.results[i].isFinal) {
          chunk += event.results[i][0].transcript + ' ';
        }
      }
      if (chunk.trim()) {
        setDump((prev) => (prev.trim() ? `${prev.trim()}, ${chunk.trim()}` : chunk.trim()));
      }
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  };

  const generatePlan = async (overrideParams?: {
    dumpText: string;
    start: string;
    finish: string;
    energyLevel: EnergyLevel;
    remainingOnly?: boolean;
  }) => {
    const targetDump = (overrideParams?.dumpText ?? dump).trim() || DEFAULT_PLACEHOLDER;
    const targetStart = overrideParams?.start ?? startWindow;
    const targetFinish = overrideParams?.finish ?? finishWindow;
    const targetEnergy = overrideParams?.energyLevel ?? energy;

    if (!overrideParams && !dump.trim()) {
      setDump(DEFAULT_PLACEHOLDER);
    }

    setIsPlanning(true);
    setErrorMessage(null);
    setActiveTab(ActiveTab.Planner);

    try {
      const response = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dump: targetDump,
          start: targetStart,
          finish: targetFinish,
          energy: targetEnergy,
          remainingOnly: Boolean(overrideParams?.remainingOnly),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Could not generate your plan.');
      }

      const now = new Date();
      const dateLabel = now.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });

      const createdPlan: DayPlan = {
        id: `plan-${Date.now()}`,
        createdAt: now.toISOString(),
        dateLabel,
        rawDump: targetDump,
        startWindow: targetStart,
        finishWindow: targetFinish,
        energy: targetEnergy,
        detectedLanguage: data.detectedLanguage || 'English',
        summaryNote: data.summaryNote || '',
        blocks: (data.blocks || []) as ScheduleBlock[],
        deferred: (data.deferred || []) as DeferredItem[],
      };

      setCurrentPlan(createdPlan);
      setSavedPlans((prev) => [createdPlan, ...prev].slice(0, 30));
      setFilter(TimelineFilter.All);
      setActiveTagFilter(null);
      setShowBreakSuggestion(false);
      setRecentlyInsertedBreakId(null);
      setIsConfirmingClearAll(false);
      setClearedSnapshot(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong while planning.';
      setErrorMessage(msg);
    } finally {
      setIsPlanning(false);
    }
  };


  const handleReplanRemaining = () => {
    if (!currentPlan) return;
    const unfinishedTasks = currentPlan.blocks
      .filter((b) => !b.completed && b.category !== BlockCategory.Break)
      .map((b) => `${b.title} (~${b.durationMinutes}m)`);
    const deferredTasks = currentPlan.deferred.map((d) => d.title);
    const combined = [...unfinishedTasks, ...deferredTasks].join(', ');

    if (!combined.trim()) return;

    generatePlan({
      dumpText: combined,
      start: startWindow,
      finish: finishWindow,
      energyLevel: energy,
      remainingOnly: true,
    });
  };

  const triggerTaskCompletionCelebration = (
    planSnapshot: DayPlan,
    completedBlock: ScheduleBlock,
    nextStreakValue: number
  ) => {
    const prevCompletedCount = planSnapshot.blocks.filter(
      (b) => b.completed && b.id !== completedBlock.id
    ).length;
    const updatedBlocks = planSnapshot.blocks.map((b) =>
      b.id === completedBlock.id ? { ...b, completed: true } : b
    );
    const newCompletedCount = updatedBlocks.filter((b) => b.completed).length;
    const completedMinutesTotal = updatedBlocks
      .filter((b) => b.completed)
      .reduce((sum, b) => sum + b.durationMinutes, 0);

    const completedIdx = updatedBlocks.findIndex((b) => b.id === completedBlock.id);
    const nextIncomplete =
      updatedBlocks.slice(completedIdx + 1).find((b) => !b.completed) ||
      updatedBlocks.find((b) => !b.completed);

    setTaskCelebration({
      key: Date.now(),
      blockTitle: completedBlock.title,
      durationMinutes: completedBlock.durationMinutes,
      isBreak: completedBlock.category === BlockCategory.Break,
      prevCompletedCount,
      newCompletedCount,
      totalCount: updatedBlocks.length,
      completedMinutesTotal,
      streakCount: nextStreakValue,
      nextUpTitle: nextIncomplete?.title,
    });
  };

  const handleToggleComplete = (blockId: string) => {
    if (!currentPlan) return;
    const target = currentPlan.blocks.find((b) => b.id === blockId);
    if (!target) return;

    const isCompletingNow = !target.completed;
    let nextStreak = sessionStreak;

    if (isCompletingNow) {
      if (target.category !== BlockCategory.Break) {
        nextStreak = sessionStreak + 1;
        setSessionStreak(nextStreak);
        setBestSessionStreak((best) => Math.max(best, nextStreak));
      }
      triggerTaskCompletionCelebration(currentPlan, target, nextStreak);
    } else if (target.category !== BlockCategory.Break) {
      nextStreak = Math.max(0, sessionStreak - 1);
      setSessionStreak(nextStreak);
    }

    const updatedBlocks = currentPlan.blocks.map((b) =>
      b.id === blockId ? { ...b, completed: !b.completed } : b
    );
    syncPlanUpdate({ ...currentPlan, blocks: updatedBlocks });
  };

  const handleCompleteBlockInFocus = (blockId: string) => {
    if (!currentPlan) return;
    const target = currentPlan.blocks.find((b) => b.id === blockId);
    if (target && !target.completed) {
      const projectedStreak =
        target.category !== BlockCategory.Break ? sessionStreak + 1 : sessionStreak;
      triggerTaskCompletionCelebration(currentPlan, target, projectedStreak);
    }
    const updatedBlocks = currentPlan.blocks.map((b) =>
      b.id === blockId ? { ...b, completed: true } : b
    );
    syncPlanUpdate({ ...currentPlan, blocks: updatedBlocks });
  };

  const handleAdjustDuration = (blockId: string, deltaMinutes: number) => {
    if (!currentPlan) return;
    const modified = currentPlan.blocks.map((b) =>
      b.id === blockId
        ? { ...b, durationMinutes: Math.max(5, b.durationMinutes + deltaMinutes) }
        : b
    );
    const recalculated = recalculateTimeline(modified, currentPlan.startWindow);
    syncPlanUpdate({ ...currentPlan, blocks: recalculated });
  };

  const handleMoveBlock = (index: number, direction: -1 | 1) => {
    if (!currentPlan) return;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= currentPlan.blocks.length) return;
    const nextBlocks = [...currentPlan.blocks];
    const [moved] = nextBlocks.splice(index, 1);
    nextBlocks.splice(targetIndex, 0, moved);
    const recalculated = recalculateTimeline(nextBlocks, currentPlan.startWindow);
    syncPlanUpdate({ ...currentPlan, blocks: recalculated });
  };

  const handleDeleteBlock = (blockId: string) => {
    if (!currentPlan) return;
    const remaining = currentPlan.blocks.filter((b) => b.id !== blockId);
    const recalculated = recalculateTimeline(remaining, currentPlan.startWindow);
    syncPlanUpdate({ ...currentPlan, blocks: recalculated });
  };

  const handleClearAllTasks = () => {
    const wasInSaved = currentPlan
      ? savedPlans.some((p) => p.id === currentPlan.id)
      : false;

    setClearedSnapshot({
      plan: currentPlan,
      dumpText: dump,
      wasInSaved,
    });

    if (currentPlan) {
      const targetId = currentPlan.id;
      setSavedPlans((prev) => prev.filter((p) => p.id !== targetId));
    }

    setCurrentPlan(null);
    setDump('');
    setActiveFocusBlockId(null);
    setEditingBlockId(null);
    setEditingTitle('');
    setIsAddingBlock(false);
    setShowBreakSuggestion(false);
    setRecentlyInsertedBreakId(null);
    setActiveTagFilter(null);
    setFilter(TimelineFilter.All);
    setIsConfirmingClearAll(false);

    if (clearUndoTimerRef.current) {
      window.clearTimeout(clearUndoTimerRef.current);
    }
    clearUndoTimerRef.current = window.setTimeout(() => {
      setClearedSnapshot(null);
      clearUndoTimerRef.current = null;
    }, 8000);
  };

  const handleUndoClearAllTasks = () => {
    if (!clearedSnapshot) return;
    if (clearUndoTimerRef.current) {
      window.clearTimeout(clearUndoTimerRef.current);
      clearUndoTimerRef.current = null;
    }

    if (clearedSnapshot.plan) {
      const restoredPlan = clearedSnapshot.plan;
      setCurrentPlan(restoredPlan);
      if (clearedSnapshot.wasInSaved) {
        setSavedPlans((prev) => {
          const exists = prev.some((p) => p.id === restoredPlan.id);
          return exists ? prev : [restoredPlan, ...prev].slice(0, 30);
        });
      }
    }
    setDump(clearedSnapshot.dumpText);
    setClearedSnapshot(null);
  };

  const handleSaveBlockTitle = (blockId: string) => {
    if (!currentPlan) return;
    const trimmed = editingTitle.trim();
    if (trimmed) {
      const updated = currentPlan.blocks.map((b) => {
        if (b.id !== blockId) return b;
        const { matched } = suggestTagsForTitle(trimmed, b.category);
        return {
          ...b,
          title: trimmed,
          tags: matched.length > 0 ? matched.slice(0, 2) : b.tags,
        };
      });
      syncPlanUpdate({ ...currentPlan, blocks: updated });
    }
    setEditingBlockId(null);
    setEditingTitle('');
  };

  const titleTagAnalysis = useMemo(
    () => suggestTagsForTitle(newBlockTitle, newBlockCategory),
    [newBlockTitle, newBlockCategory]
  );

  const handleNewBlockTitleChange = (val: string) => {
    setNewBlockTitle(val);
    const { matched } = suggestTagsForTitle(val, newBlockCategory);
    if (!userTouchedTags && matched.length > 0) {
      setSelectedNewTags(matched.slice(0, 2));
      if (!userTouchedCategory) {
        const inferredCat = inferCategoryFromTag(matched[0]);
        if (inferredCat) {
          setNewBlockCategory(inferredCat);
        }
      }
    }
  };

  const handleToggleSuggestedTag = (tag: string) => {
    const norm = normalizeTag(tag);
    if (!norm) return;
    setUserTouchedTags(true);
    setSelectedNewTags((prev) => {
      if (prev.includes(norm)) {
        return prev.filter((t) => t !== norm);
      }
      if (!userTouchedCategory && prev.length === 0) {
        const inferredCat = inferCategoryFromTag(norm);
        if (inferredCat) setNewBlockCategory(inferredCat);
      }
      return [...prev, norm];
    });
  };

  const handleAddCustomTagChip = () => {
    const norm = normalizeTag(customTagInput);
    if (!norm) return;
    setUserTouchedTags(true);
    setSelectedNewTags((prev) => (prev.includes(norm) ? prev : [...prev, norm]));
    setCustomTagInput('');
  };

  const handleAddCustomBlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPlan || !newBlockTitle.trim()) return;
    const pendingCustom = normalizeTag(customTagInput);
    const finalTags = Array.from(
      new Set([
        ...selectedNewTags,
        ...(pendingCustom ? [pendingCustom] : []),
      ])
    ).filter(Boolean);

    const resolvedTags =
      finalTags.length > 0
        ? finalTags
        : titleTagAnalysis.matched.length > 0
          ? titleTagAnalysis.matched.slice(0, 2)
          : [newBlockCategory === BlockCategory.Break ? 'rest' : 'work'];

    const newBlock: ScheduleBlock = {
      id: `blk-custom-${Date.now()}`,
      startTime: currentPlan.startWindow,
      endTime: currentPlan.startWindow,
      durationMinutes: Math.max(5, newBlockDuration),
      title: newBlockTitle.trim(),
      category: newBlockCategory,
      energyDemand:
        newBlockCategory === BlockCategory.Break
          ? 'Recovery'
          : newBlockCategory === BlockCategory.Focus
            ? 'High'
            : 'Medium',
      note: 'Added manually',
      completed: false,
      tags: resolvedTags,
    };
    const recalculated = recalculateTimeline(
      [...currentPlan.blocks, newBlock],
      currentPlan.startWindow
    );
    syncPlanUpdate({ ...currentPlan, blocks: recalculated });
    setNewBlockTitle('');
    setCustomTagInput('');
    setSelectedNewTags(['study']);
    setUserTouchedTags(false);
    setUserTouchedCategory(false);
    setIsAddingBlock(false);
  };

  const handlePromoteDeferred = (item: DeferredItem) => {
    if (!currentPlan) return;
    const promoted: ScheduleBlock = {
      id: `blk-prom-${Date.now()}`,
      startTime: currentPlan.startWindow,
      endTime: currentPlan.startWindow,
      durationMinutes: Math.max(15, item.estimatedMinutes),
      title: item.title,
      category: BlockCategory.Routine,
      energyDemand: 'Medium',
      note: 'Moved in from deferred list',
      completed: false,
    };
    const nextDeferred = currentPlan.deferred.filter((d) => d.id !== item.id);
    const recalculated = recalculateTimeline(
      [...currentPlan.blocks, promoted],
      currentPlan.startWindow
    );
    syncPlanUpdate({
      ...currentPlan,
      blocks: recalculated,
      deferred: nextDeferred,
    });
  };

  const handleDownloadIcs = () => {
    if (!currentPlan || currentPlan.blocks.length === 0) return;
    const content = generateIcsContent(currentPlan);
    const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `dayline-${currentPlan.dateLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportPdf = () => {
    if (!currentPlan || currentPlan.blocks.length === 0) return;
    exportPlanToPdf(currentPlan);
    setPdfExportedFeedback(true);
    window.setTimeout(() => setPdfExportedFeedback(false), 2000);
  };

  const handleCopyMarkdown = async () => {
    if (!currentPlan) return;
    try {
      await navigator.clipboard.writeText(generateMarkdownPlan(currentPlan));
      setCopiedFeedback(true);
      window.setTimeout(() => setCopiedFeedback(false), 2000);
    } catch {
      // Clipboard blocked fallback ignored
    }
  };

  const availablePlanTags = useMemo(() => {
    if (!currentPlan) return [];
    const seen = new Set<string>();
    for (const b of currentPlan.blocks) {
      for (const t of resolveBlockTags(b)) {
        seen.add(t);
      }
    }
    return Array.from(seen);
  }, [currentPlan]);

  const filteredBlocks = useMemo(() => {
    if (!currentPlan) return [];
    return currentPlan.blocks.filter((b) => {
      const matchesCategory =
        filter === TimelineFilter.All
          ? true
          : filter === TimelineFilter.Focus
            ? b.category === BlockCategory.Focus
            : filter === TimelineFilter.Break
              ? b.category === BlockCategory.Break
              : b.category === BlockCategory.Routine || b.category === BlockCategory.Errand;

      if (!matchesCategory) return false;
      if (!activeTagFilter) return true;
      return resolveBlockTags(b).includes(activeTagFilter);
    });
  }, [currentPlan, filter, activeTagFilter]);

  const planMetrics = useMemo(() => {
    if (!currentPlan) return null;
    const totalMinutes = currentPlan.blocks.reduce((acc, b) => acc + b.durationMinutes, 0);
    const breakMinutes = currentPlan.blocks
      .filter((b) => b.category === BlockCategory.Break)
      .reduce((acc, b) => acc + b.durationMinutes, 0);
    const workMinutes = totalMinutes - breakMinutes;
    const completedCount = currentPlan.blocks.filter((b) => b.completed).length;
    return {
      totalMinutes,
      breakMinutes,
      workMinutes,
      completedCount,
      totalCount: currentPlan.blocks.length,
    };
  }, [currentPlan]);


  const activeBreakSuggestion = useMemo(
    () => (currentPlan ? findLongestWorkStreakSuggestion(currentPlan.blocks) : null),
    [currentPlan]
  );

  const projectedBreakWindowNote = useMemo(() => {
    if (!currentPlan || !activeBreakSuggestion) return null;
    const planWindowMins = calculateWindowMinutes(
      currentPlan.startWindow,
      currentPlan.finishWindow
    );
    const totalUsed = currentPlan.blocks.reduce((sum, b) => sum + b.durationMinutes, 0);
    const nextTotal = totalUsed + 15;
    const nextEndStr = formatMinutesToTime(
      parseTimeToMinutes(currentPlan.startWindow) + nextTotal
    );
    if (nextTotal <= planWindowMins) {
      return `Schedule finishes at ${nextEndStr} (within your ${currentPlan.finishWindow} finish window)`;
    }
    const overBy = nextTotal - planWindowMins;
    return `Shifts schedule end to ${nextEndStr} (+${overBy}m past ${currentPlan.finishWindow})`;
  }, [currentPlan, activeBreakSuggestion]);

  const handleAcceptBreakSuggestion = () => {
    if (!currentPlan || !activeBreakSuggestion) return;
    const { blocks: updatedBlocks, insertedBreakId } = applyBreakSuggestion(
      currentPlan.blocks,
      activeBreakSuggestion,
      currentPlan.startWindow
    );
    syncPlanUpdate({ ...currentPlan, blocks: updatedBlocks });
    if (filter === TimelineFilter.Focus || filter === TimelineFilter.Routine) {
      setFilter(TimelineFilter.All);
    }
    if (activeTagFilter && activeTagFilter !== 'rest') {
      setActiveTagFilter(null);
    }
    setShowBreakSuggestion(false);
    setRecentlyInsertedBreakId(insertedBreakId);
    window.setTimeout(() => {
      setRecentlyInsertedBreakId((prev) => (prev === insertedBreakId ? null : prev));
    }, 4000);
  };

  return (
    <div className="min-h-screen flex flex-col bg-canvas text-oxford-950">
      <TaskCompletionCelebration
        celebration={taskCelebration}
        onDismiss={() => setTaskCelebration(null)}
      />

      <MimoWelcomeOverlay
        isOpen={showWelcomeOverlay}
        userName={firebaseUser?.displayName}
        selectedEnergy={energy}
        onSelectEnergy={(picked) => setEnergy(picked)}
        onComplete={handleDismissWelcome}
        onCompleteWithSample={() => {
          handleDismissWelcome();
          const sample = SAMPLE_DUMPS[0];
          setDump(sample.text);
          setStartWindow(sample.start);
          setFinishWindow(sample.finish);
          generatePlan({
            dumpText: sample.text,
            start: sample.start,
            finish: sample.finish,
            energyLevel: energy,
          });
        }}
      />

      {/* Top Bar Contract: Classic Deep Oxford Navy Header with 3 exact zones separated by gap-8 */}
      <header className="bg-oxford-950 text-white border-b border-oxford-800 sticky top-0 z-20">
        <div className="max-w-[1280px] mx-auto px-6 h-15 flex items-center justify-between gap-8">
          {/* Zone 1: Single text element wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab(ActiveTab.Planner)}
            className="text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0 cursor-pointer"
          >
            Dayline
          </button>

          {/* Zone 2: 4 concise single-line nav links */}
          <nav className="flex items-center gap-5 md:gap-7 text-sm font-medium text-slate-300 overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveTab(ActiveTab.Planner)}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === ActiveTab.Planner
                  ? 'text-white font-semibold underline underline-offset-[19px] decoration-2 decoration-[#60A5FA]'
                  : 'hover:text-white'
              }`}
            >
              Planner
            </button>
            <button
              type="button"
              onClick={() => setActiveTab(ActiveTab.Focus)}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === ActiveTab.Focus
                  ? 'text-white font-semibold underline underline-offset-[19px] decoration-2 decoration-[#60A5FA]'
                  : 'hover:text-white'
              }`}
            >
              Focus Timer
            </button>
            <button
              type="button"
              onClick={() => setActiveTab(ActiveTab.Saved)}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === ActiveTab.Saved
                  ? 'text-white font-semibold underline underline-offset-[19px] decoration-2 decoration-[#60A5FA]'
                  : 'hover:text-white'
              }`}
            >
              Saved Plans
            </button>
            <button
              type="button"
              onClick={() => setActiveTab(ActiveTab.Suggestions)}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === ActiveTab.Suggestions
                  ? 'text-white font-semibold underline underline-offset-[19px] decoration-2 decoration-[#60A5FA]'
                  : 'hover:text-white'
              }`}
            >
              Suggestions
              {ownerNewSuggestionsCount > 0 ? (
                <span className="ml-1 font-mono text-xs text-[#93C5FD] tabular-nums">
                  ({ownerNewSuggestionsCount})
                </span>
              ) : null}
            </button>
          </nav>

          {/* Zone 3: 1 bold primary action */}
          <div className="shrink-0">
            {currentPlan && currentPlan.blocks.length > 0 ? (
              <button
                type="button"
                onClick={handleDownloadIcs}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-cobalt-600 hover:bg-cobalt-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Calendar className="w-3.5 h-3.5" />
                Export .ICS
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  const sample = SAMPLE_DUMPS[0];
                  setDump(sample.text);
                  setStartWindow(sample.start);
                  setFinishWindow(sample.finish);
                  setEnergy(sample.energy);
                  generatePlan({
                    dumpText: sample.text,
                    start: sample.start,
                    finish: sample.finish,
                    energyLevel: sample.energy,
                  });
                }}
                disabled={isPlanning}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-cobalt-600 hover:bg-cobalt-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Try Sample Plan
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Persistent HTML5 Audio Element for Device Music Library */}
      <audio
        ref={audioRef}
        onPlay={() => setIsMusicPlaying(true)}
        onPause={() => setIsMusicPlaying(false)}
        onTimeUpdate={(e) => setMusicCurrentTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          if (Number.isFinite(e.currentTarget.duration)) {
            setMusicDuration(e.currentTarget.duration);
          }
        }}
        onEnded={() => handleNextMusicTrack(true)}
        className="hidden"
      />

      {/* Compact Now Playing Strip when listening across non-Focus tabs */}
      {activeTab !== ActiveTab.Focus && activeMusicTrack && isMusicPlaying && (
        <div className="bg-white border-b border-[#DCE3EE]">
          <div className="max-w-[1280px] mx-auto px-6 py-2 flex items-center justify-between gap-4 text-xs">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={handleToggleMusicPlay}
                aria-label="Pause music"
                className="p-1 text-cobalt-600 hover:text-cobalt-700 rounded cursor-pointer shrink-0"
              >
                <Pause className="w-3.5 h-3.5" />
              </button>
              {musicTracks.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleNextMusicTrack(false)}
                  aria-label="Next track"
                  className="p-1 text-slate-600 hover:text-oxford-950 rounded cursor-pointer shrink-0"
                >
                  <SkipForward className="w-3.5 h-3.5" />
                </button>
              )}
              <span className="font-semibold text-oxford-950 truncate">
                {activeMusicTrack.name}
              </span>
              <span className="font-mono text-slate-500 tabular-nums shrink-0 hidden sm:inline">
                {formatAudioTime(musicCurrentTime)} /{' '}
                {formatAudioTime(musicDuration || activeMusicTrack.durationSeconds || 0)}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setActiveTab(ActiveTab.Focus)}
              className="font-semibold text-cobalt-600 hover:text-cobalt-700 underline underline-offset-2 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Music library
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1">
        {activeTab === ActiveTab.Focus && (
          <FocusTimerView
            plan={currentPlan}
            activeBlockId={activeFocusBlockId}
            sessionStreak={sessionStreak}
            bestSessionStreak={bestSessionStreak}
            musicPlayerProps={{
              tracks: musicTracks,
              activeTrackId: activeMusicTrack?.id ?? null,
              isPlaying: isMusicPlaying,
              currentTime: musicCurrentTime,
              duration: musicDuration,
              volume: musicVolume,
              isMuted: isMusicMuted,
              loopMode: musicLoopMode,
              shuffle: musicShuffle,
              syncWithTimer: syncMusicWithTimer,
              onAddFiles: handleAddDeviceMusicFiles,
              onSelectTrack: handleSelectMusicTrack,
              onTogglePlay: handleToggleMusicPlay,
              onPrevTrack: handlePrevMusicTrack,
              onNextTrack: () => handleNextMusicTrack(false),
              onSeek: handleSeekMusic,
              onVolumeChange: (vol) => {
                setMusicVolume(vol);
                if (vol > 0 && isMusicMuted) setIsMusicMuted(false);
              },
              onToggleMute: () => setIsMusicMuted((m) => !m),
              onCycleLoopMode: handleCycleLoopMode,
              onToggleShuffle: () => setMusicShuffle((s) => !s),
              onToggleSyncWithTimer: () => setSyncMusicWithTimer((s) => !s),
              onRemoveTrack: handleRemoveMusicTrack,
              onClearLibrary: handleClearMusicLibrary,
            }}
            onTimerRunningChange={handleTimerRunningSync}
            onSelectBlock={(id) => setActiveFocusBlockId(id)}
            onCompleteBlock={handleCompleteBlockInFocus}
            onIncrementStreak={handleIncrementStreak}
            onBreakStreak={handleBreakStreak}
            onResetStreak={handleResetStreak}
            onBackToPlanner={() => setActiveTab(ActiveTab.Planner)}
          />
        )}

        {activeTab === ActiveTab.Saved && (
          <SavedPlansView
            savedPlans={savedPlans}
            activePlanId={currentPlan?.id ?? null}
            onLoadPlan={(plan) => {
              setCurrentPlan(plan);
              setDump(plan.rawDump);
              setStartWindow(plan.startWindow);
              setFinishWindow(plan.finishWindow);
              setEnergy(plan.energy);
              setShowBreakSuggestion(false);
              setRecentlyInsertedBreakId(null);
              setActiveTab(ActiveTab.Planner);
            }}
            onDeletePlan={(planId) => {
              setSavedPlans((prev) => prev.filter((p) => p.id !== planId));
              if (currentPlan?.id === planId) {
                setCurrentPlan(null);
              }
            }}
            onCreateNew={() => setActiveTab(ActiveTab.Planner)}
          />
        )}

        {activeTab === ActiveTab.Suggestions && (
          <SuggestionsView currentUser={firebaseUser} authReady={authReady} />
        )}

        {activeTab === ActiveTab.Principles && (
          <PrinciplesView onStartPlanning={() => setActiveTab(ActiveTab.Planner)} />
        )}

        {activeTab === ActiveTab.Planner && (
          <div className="max-w-[1280px] mx-auto px-6 py-8 lg:py-10">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">
              {/* Left Column: Brain Dump & Constraints Composer */}
              <section className="lg:col-span-5 bg-white border border-[#DCE3EE] rounded-xl p-6 md:p-7">
                <div>
                  <h1 className="text-2xl md:text-[28px] font-bold text-oxford-950 tracking-tight leading-snug">
                    Dump everything on your mind, in any language.
                  </h1>
                  <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                    Dayline turns it into a realistic plan for the hours you have.
                  </p>
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    generatePlan();
                  }}
                  className="mt-6 space-y-5"
                >
                  {/* Brain Dump Textarea */}
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <label
                        htmlFor="brain-dump-input"
                        className="text-sm font-semibold text-oxford-950"
                      >
                        Everything on your mind
                      </label>

                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        {speechSupported && (
                          <button
                            type="button"
                            onClick={toggleDictation}
                            className={`inline-flex items-center gap-1 font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                              isListening
                                ? 'text-red-600 hover:text-red-700'
                                : 'text-cobalt-600 hover:text-cobalt-700'
                            }`}
                          >
                            {isListening ? (
                              <>
                                <MicOff className="w-3.5 h-3.5" />
                                Stop mic
                              </>
                            ) : (
                              <>
                                <Mic className="w-3.5 h-3.5" />
                                Dictate
                              </>
                            )}
                          </button>
                        )}
                        {(dump.trim().length > 0 || currentPlan !== null) && (
                          <button
                            type="button"
                            onClick={() => {
                              if (currentPlan) {
                                setIsConfirmingClearAll(true);
                              } else {
                                handleClearAllTasks();
                              }
                            }}
                            className="inline-flex items-center gap-1 text-slate-500 hover:text-red-600 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Clear all tasks
                          </button>
                        )}
                      </div>
                    </div>

                    <textarea
                      id="brain-dump-input"
                      rows={5}
                      value={dump}
                      onChange={(e) => setDump(e.target.value)}
                      placeholder={DEFAULT_PLACEHOLDER}
                      className="w-full rounded-lg border border-[#DCE3EE] bg-[#F9FBFE] px-3.5 py-3 text-sm text-oxford-950 placeholder:text-slate-400 leading-relaxed focus:bg-white focus:outline-none focus:ring-2 focus:ring-cobalt-600/20 focus:border-cobalt-600 transition-colors resize-y"
                    />

                    {/* Sample presets as clean unboxed text links */}
                    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                      <span>Try example:</span>
                      {SAMPLE_DUMPS.map((sample, idx) => (
                        <React.Fragment key={sample.label}>
                          {idx > 0 && <span aria-hidden="true">·</span>}
                          <button
                            type="button"
                            onClick={() => {
                              setDump(sample.text);
                              setStartWindow(sample.start);
                              setFinishWindow(sample.finish);
                              setEnergy(sample.energy);
                            }}
                            className="font-medium text-cobalt-600 hover:text-cobalt-700 underline underline-offset-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            {sample.label}
                          </button>
                        </React.Fragment>
                      ))}
                    </div>
                  </div>

                  {/* Start & Finish Window */}
                  <div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label
                          htmlFor="start-time-input"
                          className="block text-sm font-semibold text-oxford-950 mb-1.5"
                        >
                          Start
                        </label>
                        <input
                          id="start-time-input"
                          type="time"
                          value={startWindow}
                          onChange={(e) => setStartWindow(e.target.value)}
                          className="w-full rounded-lg border border-[#DCE3EE] bg-white px-3 py-2 text-sm font-mono font-medium tabular-nums text-oxford-950 focus:outline-none focus:ring-2 focus:ring-cobalt-600/20 focus:border-cobalt-600"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="finish-time-input"
                          className="block text-sm font-semibold text-oxford-950 mb-1.5"
                        >
                          Finish
                        </label>
                        <input
                          id="finish-time-input"
                          type="time"
                          value={finishWindow}
                          onChange={(e) => setFinishWindow(e.target.value)}
                          className="w-full rounded-lg border border-[#DCE3EE] bg-white px-3 py-2 text-sm font-mono font-medium tabular-nums text-oxford-950 focus:outline-none focus:ring-2 focus:ring-cobalt-600/20 focus:border-cobalt-600"
                        />
                      </div>
                    </div>
                    <p className="mt-1.5 text-xs text-cobalt-700 font-mono font-medium tabular-nums">
                      Available window: {formatDurationHuman(availableMinutes)}
                    </p>
                  </div>

                  {/* Energy today */}
                  <div>
                    <span className="block text-sm font-semibold text-oxford-950 mb-1.5">
                      Energy today
                    </span>
                    <div
                      role="group"
                      aria-label="Energy today"
                      className="grid grid-cols-3 gap-1 p-1 bg-surface-tint rounded-lg"
                    >
                      {(
                        [
                          { value: EnergyLevel.High, label: 'High' },
                          { value: EnergyLevel.Medium, label: 'Medium' },
                          { value: EnergyLevel.Low, label: 'Low' },
                        ] as const
                      ).map((opt) => {
                        const selected = energy === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setEnergy(opt.value)}
                            className={`py-2 px-3 text-sm font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                              selected
                                ? 'bg-oxford-950 text-white shadow-xs'
                                : 'text-slate-600 hover:text-oxford-950'
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-1.5 text-xs text-slate-600">{energyHint}</p>
                  </div>

                  {/* Bold Primary CTA */}
                  <button
                    type="submit"
                    disabled={isPlanning || availableMinutes < 15}
                    className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-cobalt-600 hover:bg-cobalt-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
                  >
                    {isPlanning ? 'Planning your day...' : 'Plan my day'}
                  </button>
                </form>
              </section>

              {/* Right Column: Realistic Timeline & Overflow Triage */}
              <section className="lg:col-span-7 space-y-6">
                {clearedSnapshot && (
                  <div
                    role="status"
                    className="bg-white border border-[#DCE3EE] rounded-xl px-4 py-3 flex items-center justify-between gap-4 text-xs"
                  >
                    <span className="text-oxford-950 font-medium">
                      All tasks cleared from your planner.
                    </span>
                    <button
                      type="button"
                      onClick={handleUndoClearAllTasks}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 font-semibold text-cobalt-600 hover:text-cobalt-700 bg-[#F4F8FF] hover:bg-[#E8F0FE] rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Undo
                    </button>
                  </div>
                )}

                {errorMessage && (
                  <div
                    role="alert"
                    className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start justify-between gap-4"
                  >
                    <div>
                      <p className="text-sm font-semibold text-red-900">
                        Unable to build schedule
                      </p>
                      <p className="text-xs text-red-700 mt-0.5">{errorMessage}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => generatePlan()}
                      className="px-3 py-1.5 text-xs font-semibold text-red-900 bg-white border border-red-200 hover:bg-red-100 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Retry
                    </button>
                  </div>
                )}

                {isPlanning ? (
                  /* Clean Skeleton State matching timeline row geometry */
                  <div className="bg-white border border-[#DCE3EE] rounded-xl p-6 md:p-7">
                    <div className="h-5 w-48 bg-surface-tint rounded animate-pulse" />
                    <div className="mt-2 h-4 w-80 max-w-full bg-surface-tint rounded animate-pulse" />
                    <div className="mt-6 divide-y divide-[#E8EEF6] border-t border-[#E8EEF6]">
                      {[1, 2, 3, 4, 5, 6].map((row) => (
                        <div key={row} className="py-4 flex items-center gap-4">
                          <div className="w-5 h-5 rounded border border-[#DCE3EE] bg-surface-tint shrink-0" />
                          <div className="w-24 h-4 bg-surface-tint rounded font-mono shrink-0 animate-pulse" />
                          <div className="flex-1 space-y-2">
                            <div className="h-4 w-3/5 bg-surface-tint rounded animate-pulse" />
                            <div className="h-3 w-2/5 bg-slate-100 rounded animate-pulse" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : !currentPlan ? (
                  /* Calm Empty State */
                  <div className="bg-white border border-[#DCE3EE] rounded-xl p-8 md:p-10">
                    <div className="max-w-lg">
                      <h2 className="text-xl font-bold text-oxford-950 tracking-tight">
                        Your realistic timeline appears here
                      </h2>
                      <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                        Type whatever is floating in your head on the left—deadlines, errands, study topics, or chores—set your start and finish times, and press{' '}
                        <strong className="font-semibold text-oxford-950">Plan my day</strong>.
                      </p>

                      <div className="mt-6 pt-6 border-t border-[#E8EEF6] space-y-3 text-xs text-slate-600">
                        <div className="flex items-baseline gap-3">
                          <span className="font-mono font-semibold text-cobalt-600 tabular-nums shrink-0">
                            09:00 – 10:15
                          </span>
                          <span>
                            Urgent focus blocks placed when your energy supports them
                          </span>
                        </div>
                        <div className="flex items-baseline gap-3">
                          <span className="font-mono font-semibold text-oxford-800 tabular-nums shrink-0">
                            10:15 – 10:30
                          </span>
                          <span>
                            Built-in screen breaks and meal buffers so you stay on track
                          </span>
                        </div>
                        <div className="flex items-baseline gap-3">
                          <span className="font-mono font-semibold text-[#B45309] tabular-nums shrink-0">
                            Overflow
                          </span>
                          <span>
                            Tasks that exceed your finish hour are deferred honestly instead of crammed
                          </span>
                        </div>
                      </div>

                      <div className="mt-7">
                        <button
                          type="button"
                          onClick={() => {
                            const sample = SAMPLE_DUMPS[0];
                            setDump(sample.text);
                            setStartWindow(sample.start);
                            setFinishWindow(sample.finish);
                            setEnergy(sample.energy);
                            generatePlan({
                              dumpText: sample.text,
                              start: sample.start,
                              finish: sample.finish,
                              energyLevel: sample.energy,
                            });
                          }}
                          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-oxford-950 hover:bg-oxford-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          Load sample & plan now
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Populated Realistic Timeline */
                  <div className="space-y-6">
                    <div className="bg-white border border-[#DCE3EE] rounded-xl p-6 md:p-7">
                      {/* Plan Header & Unboxed Metadata */}
                      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
                        <h2 className="text-lg font-bold text-oxford-950 tracking-tight">
                          Today’s Plan · {currentPlan.dateLabel}
                        </h2>
                        {planMetrics && (
                          <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600 font-mono tabular-nums">
                            <span className="text-cobalt-700 font-semibold">
                              {formatDurationHuman(planMetrics.workMinutes)} tasks
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{formatDurationHuman(planMetrics.breakMinutes)} breaks</span>
                            <span aria-hidden="true">·</span>
                            <span className="text-[#15803D] font-semibold">
                              {planMetrics.completedCount}/{planMetrics.totalCount} done
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="font-sans text-oxford-900 font-medium">
                              {currentPlan.detectedLanguage}
                            </span>
                          </div>
                        )}
                      </div>

                      {currentPlan.summaryNote && (
                        <p className="mt-2.5 text-sm text-slate-600 leading-relaxed">
                          {currentPlan.summaryNote}
                        </p>
                      )}

                      {/* Energy Demand Curve over Scheduled Window */}
                      <EnergyDemandChart blocks={currentPlan.blocks} />

                      {/* Interactive Filter & Utility Bar */}
                      <div className="mt-5 pt-4 border-t border-[#E8EEF6] flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-1 p-1 bg-surface-tint rounded-lg overflow-x-auto">
                          {(
                            [
                              { id: TimelineFilter.All, label: 'All' },
                              { id: TimelineFilter.Focus, label: 'Focus' },
                              { id: TimelineFilter.Routine, label: 'Routine & Errands' },
                              { id: TimelineFilter.Break, label: 'Breaks' },
                            ] as const
                          ).map((tab) => (
                            <button
                              key={tab.id}
                              type="button"
                              onClick={() => setFilter(tab.id)}
                              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                                filter === tab.id
                                  ? 'bg-oxford-950 text-white shadow-xs'
                                  : 'text-slate-600 hover:text-oxford-950'
                              }`}
                            >
                              {tab.label}
                            </button>
                          ))}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setShowBreakSuggestion((v) => !v)}
                            disabled={!activeBreakSuggestion}
                            title="Identify the longest continuous work streak and suggest a 15-minute break in the middle"
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                              showBreakSuggestion
                                ? 'bg-oxford-950 text-white border-oxford-950'
                                : 'text-cobalt-700 bg-white hover:bg-[#F0F5FF] border-cobalt-600/30'
                            }`}
                          >
                            <Coffee className="w-3.5 h-3.5" />
                            Suggest Break
                          </button>

                          <button
                            type="button"
                            onClick={handleReplanRemaining}
                            title="Re-plan unfinished tasks into your current Start–Finish window"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-cobalt-700 hover:bg-[#F0F5FF] border border-cobalt-600/30 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            Re-plan unfinished
                          </button>

                          <button
                            type="button"
                            onClick={handleExportPdf}
                            disabled={currentPlan.blocks.length === 0}
                            title="Download a clean, printable PDF of today's schedule"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-oxford-950 bg-white hover:bg-surface-tint border border-[#DCE3EE] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <FileDown className="w-3.5 h-3.5 text-cobalt-600" />
                            {pdfExportedFeedback ? 'PDF Saved' : 'Export to PDF'}
                          </button>

                          <button
                            type="button"
                            onClick={handleCopyMarkdown}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-oxford-900 hover:bg-surface-tint border border-[#DCE3EE] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            {copiedFeedback ? 'Copied' : 'Copy'}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setIsAddingBlock((v) => !v);
                              setIsConfirmingClearAll(false);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-oxford-900 hover:bg-surface-tint border border-[#DCE3EE] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Add block
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setIsConfirmingClearAll((v) => !v);
                              setIsAddingBlock(false);
                              setShowBreakSuggestion(false);
                            }}
                            title="Clear all scheduled tasks and deferred items"
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                              isConfirmingClearAll
                                ? 'bg-red-600 text-white border-red-600'
                                : 'text-slate-600 hover:text-red-600 bg-white hover:bg-red-50/70 border-[#DCE3EE] hover:border-red-200'
                            }`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Clear all tasks
                          </button>
                        </div>
                      </div>

                      {/* Inline Clear All Tasks Confirmation Strip */}
                      {isConfirmingClearAll && (
                        <div className="mt-4 p-4 bg-red-50/70 border border-red-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-oxford-950">
                              Clear all tasks from today’s plan?
                            </p>
                            <p className="mt-0.5 text-xs text-slate-600">
                              Removes all {currentPlan.blocks.length} scheduled{' '}
                              {currentPlan.blocks.length === 1 ? 'block' : 'blocks'}
                              {currentPlan.deferred.length > 0
                                ? ` and ${currentPlan.deferred.length} deferred ${
                                    currentPlan.deferred.length === 1 ? 'item' : 'items'
                                  }`
                                : ''}{' '}
                              so you can start with a clean slate.
                            </p>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={handleClearAllTasks}
                              className="px-3.5 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              Yes, clear all tasks
                            </button>
                            <button
                              type="button"
                              onClick={() => setIsConfirmingClearAll(false)}
                              className="px-2.5 py-2 text-xs font-medium text-slate-600 hover:text-oxford-950 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Longest Continuous Work Streak — 15m Midpoint Break Suggestion */}
                      {showBreakSuggestion && activeBreakSuggestion && (
                        <div className="mt-4 p-4 bg-[#F4F8FF] border border-[#C7D7FE] rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-600">
                              <span className="font-semibold text-oxford-950">
                                Longest continuous work streak
                              </span>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono font-semibold text-cobalt-700 tabular-nums">
                                {formatDurationHuman(activeBreakSuggestion.streakDurationMinutes)}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono tabular-nums">
                                {activeBreakSuggestion.streakStartTime} –{' '}
                                {activeBreakSuggestion.streakEndTime}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span>
                                {activeBreakSuggestion.streakBlockCount}{' '}
                                {activeBreakSuggestion.streakBlockCount === 1
                                  ? 'work block'
                                  : 'consecutive blocks'}
                              </span>
                            </div>

                            <p className="text-sm text-oxford-950 leading-snug">
                              {activeBreakSuggestion.mode === 'split' ? (
                                <>
                                  Insert a{' '}
                                  <span className="font-mono font-semibold tabular-nums">15m</span>{' '}
                                  recovery break at{' '}
                                  <span className="font-mono font-semibold text-cobalt-700 tabular-nums">
                                    {activeBreakSuggestion.proposedBreakTime}
                                  </span>{' '}
                                  by splitting{' '}
                                  <span className="font-semibold">
                                    “{activeBreakSuggestion.splitTitle}”
                                  </span>{' '}
                                  into{' '}
                                  <span className="font-mono tabular-nums">
                                    {activeBreakSuggestion.firstHalfMinutes}m +{' '}
                                    {activeBreakSuggestion.secondHalfMinutes}m
                                  </span>
                                  .
                                </>
                              ) : activeBreakSuggestion.afterTitle ? (
                                <>
                                  Insert a{' '}
                                  <span className="font-mono font-semibold tabular-nums">15m</span>{' '}
                                  recovery break at{' '}
                                  <span className="font-mono font-semibold text-cobalt-700 tabular-nums">
                                    {activeBreakSuggestion.proposedBreakTime}
                                  </span>{' '}
                                  between{' '}
                                  <span className="font-semibold">
                                    “{activeBreakSuggestion.beforeTitle}”
                                  </span>{' '}
                                  and{' '}
                                  <span className="font-semibold">
                                    “{activeBreakSuggestion.afterTitle}”
                                  </span>
                                  .
                                </>
                              ) : (
                                <>
                                  Insert a{' '}
                                  <span className="font-mono font-semibold tabular-nums">15m</span>{' '}
                                  recovery break at{' '}
                                  <span className="font-mono font-semibold text-cobalt-700 tabular-nums">
                                    {activeBreakSuggestion.proposedBreakTime}
                                  </span>{' '}
                                  right after{' '}
                                  <span className="font-semibold">
                                    “{activeBreakSuggestion.beforeTitle}”
                                  </span>
                                  .
                                </>
                              )}
                            </p>

                            {projectedBreakWindowNote && (
                              <p className="text-xs text-slate-600 font-mono tabular-nums">
                                {projectedBreakWindowNote}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={handleAcceptBreakSuggestion}
                              className="px-3.5 py-2 text-xs font-semibold text-white bg-cobalt-600 hover:bg-cobalt-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              Insert 15m break
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowBreakSuggestion(false)}
                              className="px-2.5 py-2 text-xs font-medium text-slate-600 hover:text-oxford-950 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              Dismiss
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Add Custom Block Inline Form with Auto-Suggest Tag System */}
                      {isAddingBlock && (
                        <form
                          onSubmit={handleAddCustomBlock}
                          className="mt-4 p-4 bg-surface-tint/70 border border-[#DCE3EE] rounded-lg space-y-3"
                        >
                          <div className="flex flex-wrap items-center gap-2.5">
                            <input
                              type="text"
                              value={newBlockTitle}
                              onChange={(e) => handleNewBlockTitleChange(e.target.value)}
                              placeholder="Block title (e.g., Revise Java, Reply to client, Gym workout)"
                              className="flex-1 min-w-[200px] px-3 py-1.5 text-xs bg-white border border-[#DCE3EE] rounded-md text-oxford-950 focus:outline-none focus:border-cobalt-600"
                            />
                            <select
                              value={newBlockCategory}
                              onChange={(e) => {
                                setUserTouchedCategory(true);
                                setNewBlockCategory(e.target.value as BlockCategory);
                              }}
                              aria-label="Block category"
                              className="px-2.5 py-1.5 text-xs bg-white border border-[#DCE3EE] rounded-md text-oxford-900"
                            >
                              <option value={BlockCategory.Focus}>Focus</option>
                              <option value={BlockCategory.Routine}>Routine</option>
                              <option value={BlockCategory.Errand}>Errand</option>
                              <option value={BlockCategory.Break}>Break</option>
                            </select>
                            <input
                              type="number"
                              min={5}
                              max={240}
                              step={5}
                              value={newBlockDuration}
                              onChange={(e) => setNewBlockDuration(Number(e.target.value) || 30)}
                              aria-label="Duration in minutes"
                              className="w-20 px-2.5 py-1.5 text-xs font-mono tabular-nums bg-white border border-[#DCE3EE] rounded-md text-oxford-950"
                            />
                            <span className="text-xs text-slate-500">min</span>
                            <button
                              type="submit"
                              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-cobalt-600 hover:bg-cobalt-700 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              Add
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setIsAddingBlock(false);
                                setUserTouchedTags(false);
                                setUserTouchedCategory(false);
                              }}
                              className="px-2.5 py-1.5 text-xs text-slate-600 hover:text-oxford-950 whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>

                          {/* Auto-Suggest Tag Bar */}
                          <div className="pt-2 border-t border-[#DCE3EE]/80 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-xs font-medium text-slate-600 mr-1">
                                {titleTagAnalysis.matched.length > 0
                                  ? 'Auto-suggested tags:'
                                  : 'Tags:'}
                              </span>
                              {Array.from(
                                new Set([...titleTagAnalysis.suggestions, ...selectedNewTags])
                              ).map((tag) => {
                                const isSelected = selectedNewTags.includes(tag);
                                const isMatched = titleTagAnalysis.matched.includes(tag);
                                const theme = getTagTheme(tag);

                                return (
                                  <button
                                    key={tag}
                                    type="button"
                                    onClick={() => handleToggleSuggestedTag(tag)}
                                    className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                                      isSelected ? theme.activeButton : theme.inactiveButton
                                    }`}
                                  >
                                    #{tag}
                                    {isMatched && !isSelected ? ' +' : ''}
                                  </button>
                                );
                              })}
                            </div>

                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                value={customTagInput}
                                onChange={(e) => setCustomTagInput(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ',') {
                                    e.preventDefault();
                                    handleAddCustomTagChip();
                                  }
                                }}
                                placeholder="+ custom tag"
                                aria-label="Add custom tag"
                                className="w-28 px-2 py-1 text-xs bg-white border border-[#DCE3EE] rounded-md text-oxford-950 placeholder:text-slate-400 focus:outline-none focus:border-cobalt-600"
                              />
                              {customTagInput.trim() && (
                                <button
                                  type="button"
                                  onClick={handleAddCustomTagChip}
                                  className="px-2 py-1 text-xs font-semibold text-oxford-950 bg-white border border-[#DCE3EE] hover:bg-slate-50 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
                                >
                                  Tag
                                </button>
                              )}
                            </div>
                          </div>
                        </form>
                      )}

                      {/* Interactive Color-Coded Tag Filter Strip */}
                      {availablePlanTags.length > 0 && (
                        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                          <span className="text-slate-500 mr-1">Color-coded tags:</span>
                          <button
                            type="button"
                            onClick={() => setActiveTagFilter(null)}
                            className={`px-2 py-0.5 rounded-md border font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                              activeTagFilter === null
                                ? 'bg-oxford-950 text-white border-oxford-950'
                                : 'bg-white text-slate-600 border-[#DCE3EE] hover:text-oxford-950'
                            }`}
                          >
                            All
                          </button>
                          {availablePlanTags.map((tag) => {
                            const theme = getTagTheme(tag);
                            const isSelected = activeTagFilter === tag;
                            return (
                              <button
                                key={tag}
                                type="button"
                                onClick={() =>
                                  setActiveTagFilter((prev) => (prev === tag ? null : tag))
                                }
                                className={`px-2 py-0.5 rounded-md border font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                                  isSelected ? theme.activeButton : theme.inactiveButton
                                }`}
                              >
                                #{tag}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Color-Coded Chronological Rows */}
                      {filteredBlocks.length === 0 ? (
                        <div className="py-10 text-center text-sm text-slate-500">
                          No blocks match the selected filter.
                        </div>
                      ) : (
                        <div className="mt-4 space-y-2.5">
                          {filteredBlocks.map((block) => {
                            const realIndex = currentPlan.blocks.findIndex(
                              (b) => b.id === block.id
                            );
                            const isBreak = block.category === BlockCategory.Break;
                            const isEditing = editingBlockId === block.id;
                            const blockTags = resolveBlockTags(block);
                            const primaryTag = blockTags[0] || 'work';
                            const tagTheme = getTagTheme(primaryTag);

                            const isInSuggestedStreak =
                              showBreakSuggestion &&
                              activeBreakSuggestion !== null &&
                              realIndex >= activeBreakSuggestion.streakStartIndex &&
                              realIndex <= activeBreakSuggestion.streakEndIndex;
                            const isJustInsertedBreak = block.id === recentlyInsertedBreakId;

                            return (
                              <div
                                key={block.id}
                                className={`group py-3 px-3.5 rounded-lg border transition-colors flex flex-col sm:flex-row sm:items-start justify-between gap-3 ${
                                  block.completed
                                    ? 'bg-slate-50/80 border-slate-200'
                                    : tagTheme.rowSurface
                                } ${
                                  isJustInsertedBreak
                                    ? 'ring-2 ring-cobalt-600/40'
                                    : isInSuggestedStreak
                                      ? 'ring-1 ring-cobalt-600/35'
                                      : ''
                                }`}
                              >
                                <div className="flex items-start gap-3.5 min-w-0 flex-1">
                                  <button
                                    type="button"
                                    onClick={() => handleToggleComplete(block.id)}
                                    aria-label={
                                      block.completed
                                        ? `Mark ${block.title} incomplete`
                                        : `Mark ${block.title} completed`
                                    }
                                    className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                                      block.completed
                                        ? 'bg-[#15803D] border-[#15803D] text-white'
                                        : 'border-slate-300 bg-white hover:border-cobalt-600'
                                    }`}
                                  >
                                    {block.completed && (
                                      <motion.span
                                        initial={{ scale: 0.4, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        transition={{
                                          type: 'spring',
                                          stiffness: 450,
                                          damping: 20,
                                        }}
                                        className="flex items-center justify-center"
                                      >
                                        <Check className="w-3.5 h-3.5" />
                                      </motion.span>
                                    )}
                                  </button>

                                  <div
                                    className={`font-mono text-xs tabular-nums pt-0.5 whitespace-nowrap shrink-0 w-[106px] font-semibold ${
                                      block.completed ? 'text-slate-400' : tagTheme.timeText
                                    }`}
                                  >
                                    {block.startTime} – {block.endTime}
                                  </div>

                                  <div className="min-w-0 flex-1">
                                    {isEditing ? (
                                      <form
                                        onSubmit={(e) => {
                                          e.preventDefault();
                                          handleSaveBlockTitle(block.id);
                                        }}
                                        className="flex items-center gap-2"
                                      >
                                        <input
                                          type="text"
                                          value={editingTitle}
                                          onChange={(e) => setEditingTitle(e.target.value)}
                                          autoFocus
                                          className="flex-1 px-2.5 py-1 text-sm bg-white border border-cobalt-600 rounded text-oxford-950 focus:outline-none"
                                        />
                                        <button
                                          type="submit"
                                          className="px-2.5 py-1 text-xs font-semibold text-white bg-cobalt-600 rounded whitespace-nowrap shrink-0 cursor-pointer"
                                        >
                                          Save
                                        </button>
                                      </form>
                                    ) : (
                                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setEditingBlockId(block.id);
                                            setEditingTitle(block.title);
                                          }}
                                          className={`text-left text-sm transition-colors cursor-pointer ${
                                            block.completed
                                              ? 'line-through text-slate-400 font-medium'
                                              : isBreak
                                                ? 'text-oxford-900 hover:text-oxford-950 font-medium'
                                                : 'text-oxford-950 hover:text-cobalt-600 font-semibold'
                                          }`}
                                          title="Click to edit title"
                                        >
                                          {block.title}
                                        </button>
                                        <span className="text-xs text-slate-600 font-mono tabular-nums">
                                          {block.durationMinutes}m ·{' '}
                                          <span className="font-sans capitalize">
                                            {block.category}
                                          </span>
                                          {!isBreak && (
                                            <span className="font-sans">
                                              {' '}
                                              · {block.energyDemand}
                                            </span>
                                          )}
                                          {blockTags.map((t) => {
                                            const tTheme = getTagTheme(t);
                                            return (
                                              <React.Fragment key={t}>
                                                <span aria-hidden="true"> · </span>
                                                <span
                                                  className={`font-sans font-semibold ${
                                                    block.completed
                                                      ? 'text-slate-400'
                                                      : tTheme.tagText
                                                  }`}
                                                >
                                                  #{t}
                                                </span>
                                              </React.Fragment>
                                            );
                                          })}
                                        </span>
                                      </div>
                                    )}

                                    {block.note && !block.completed && (
                                      <p className="mt-0.5 text-xs text-slate-600 leading-relaxed">
                                        {block.note}
                                      </p>
                                    )}
                                  </div>
                                </div>

                                {/* Row Interactive Affordances */}
                                <div className="flex flex-wrap items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 transition-opacity shrink-0 pl-8 sm:pl-0">
                                  {!block.completed && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setActiveFocusBlockId(block.id);
                                        setActiveTab(ActiveTab.Focus);
                                      }}
                                      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold text-white bg-cobalt-600 hover:bg-cobalt-700 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                                    >
                                      <Play className="w-3 h-3" />
                                      Focus
                                    </button>
                                  )}


                                  <button
                                    type="button"
                                    onClick={() => handleAdjustDuration(block.id, -5)}
                                    disabled={block.durationMinutes <= 5}
                                    title="Shorten by 5 minutes"
                                    className="px-1.5 py-1 text-xs font-mono tabular-nums text-slate-600 hover:text-cobalt-600 disabled:opacity-30 bg-white/80 rounded cursor-pointer"
                                  >
                                    -5m
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleAdjustDuration(block.id, 5)}
                                    title="Extend by 5 minutes"
                                    className="px-1.5 py-1 text-xs font-mono tabular-nums text-slate-600 hover:text-cobalt-600 bg-white/80 rounded cursor-pointer"
                                  >
                                    +5m
                                  </button>

                                  {filter === TimelineFilter.All && activeTagFilter === null && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => handleMoveBlock(realIndex, -1)}
                                        disabled={realIndex <= 0}
                                        aria-label="Move earlier"
                                        className="p-1 text-slate-500 hover:text-oxford-950 disabled:opacity-30 bg-white/80 rounded cursor-pointer"
                                      >
                                        <ArrowUp className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleMoveBlock(realIndex, 1)}
                                        disabled={realIndex >= currentPlan.blocks.length - 1}
                                        aria-label="Move later"
                                        className="p-1 text-slate-500 hover:text-oxford-950 disabled:opacity-30 bg-white/80 rounded cursor-pointer"
                                      >
                                        <ArrowDown className="w-3.5 h-3.5" />
                                      </button>
                                    </>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() => handleDeleteBlock(block.id)}
                                    aria-label="Remove block"
                                    className="p-1 text-slate-500 hover:text-red-600 bg-white/80 rounded cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Deferred Overflow Section */}
                    {currentPlan.deferred.length > 0 && (
                      <div className="bg-white border border-[#DCE3EE] rounded-xl p-6 md:p-7">
                        <div className="flex items-baseline justify-between gap-4">
                          <div>
                            <h3 className="text-base font-bold text-oxford-950">
                              Deferred for tomorrow
                            </h3>
                            <p className="mt-1 text-xs text-slate-600">
                              Kept off today’s timeline so your schedule stays realistic for your hours and energy.
                            </p>
                          </div>
                          <span className="text-xs font-mono font-semibold text-[#B45309] tabular-nums whitespace-nowrap shrink-0">
                            {currentPlan.deferred.length}{' '}
                            {currentPlan.deferred.length === 1 ? 'item' : 'items'}
                          </span>
                        </div>

                        <div className="mt-4 divide-y divide-[#E8EEF6]">
                          {currentPlan.deferred.map((item) => (
                            <div
                              key={item.id}
                              className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                            >
                              <div className="min-w-0">
                                <div className="flex items-baseline gap-2">
                                  <span className="text-sm font-semibold text-oxford-950">
                                    {item.title}
                                  </span>
                                  <span className="text-xs font-mono text-[#B45309] font-medium tabular-nums">
                                    ~{item.estimatedMinutes}m
                                  </span>
                                </div>
                                <p className="text-xs text-slate-600 mt-0.5">{item.reason}</p>
                              </div>

                              <button
                                type="button"
                                onClick={() => handlePromoteDeferred(item)}
                                className="self-start sm:self-center px-3 py-1.5 text-xs font-semibold text-oxford-950 hover:bg-surface-tint border border-[#DCE3EE] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                Fit into today
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </section>
            </div>
          </div>
        )}
      </main>

      {/* Quiet, classic footer */}
      <footer className="border-t border-[#DCE3EE] bg-white mt-12">
        <div className="max-w-[1280px] mx-auto px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
          <span className="font-medium text-oxford-950">
            Dayline — Realistic daily planning for the hours you actually have.
          </span>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <button
              type="button"
              onClick={() => setActiveTab(ActiveTab.Suggestions)}
              className="font-semibold text-cobalt-600 hover:text-cobalt-700 underline underline-offset-2 cursor-pointer"
            >
              Send a suggestion
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => setActiveTab(ActiveTab.Principles)}
              className="font-medium text-slate-600 hover:text-oxford-950 underline underline-offset-2 cursor-pointer"
            >
              Principles
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => setShowWelcomeOverlay(true)}
              className="font-medium text-slate-600 hover:text-oxford-950 underline underline-offset-2 cursor-pointer"
            >
              Replay welcome
            </button>
            <span aria-hidden="true">·</span>
            <span>Multilingual input supported</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
