import React, { useRef, useState } from 'react';
import {
  Pause,
  Play,
  Plus,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { LocalMusicTrack, LoopMode } from '../types';
import { formatAudioTime, formatFileSize } from '../utils/musicLibrary';

export interface DeviceMusicPlayerProps {
  tracks: LocalMusicTrack[];
  activeTrackId: string | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  loopMode: LoopMode;
  shuffle: boolean;
  syncWithTimer: boolean;
  onAddFiles: (files: FileList | File[]) => void;
  onSelectTrack: (trackId: string, autoPlay?: boolean) => void;
  onTogglePlay: () => void;
  onPrevTrack: () => void;
  onNextTrack: () => void;
  onSeek: (seconds: number) => void;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
  onCycleLoopMode: () => void;
  onToggleShuffle: () => void;
  onToggleSyncWithTimer: () => void;
  onRemoveTrack: (trackId: string) => void;
  onClearLibrary: () => void;
}

export const DeviceMusicPlayer: React.FC<DeviceMusicPlayerProps> = ({
  tracks,
  activeTrackId,
  isPlaying,
  currentTime,
  duration,
  volume,
  isMuted,
  loopMode,
  shuffle,
  syncWithTimer,
  onAddFiles,
  onSelectTrack,
  onTogglePlay,
  onPrevTrack,
  onNextTrack,
  onSeek,
  onVolumeChange,
  onToggleMute,
  onCycleLoopMode,
  onToggleShuffle,
  onToggleSyncWithTimer,
  onRemoveTrack,
  onClearLibrary,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  const activeTrackIndex = tracks.findIndex((t) => t.id === activeTrackId);
  const activeTrack =
    activeTrackIndex >= 0 ? tracks[activeTrackIndex] : tracks[0] ?? null;
  const effectiveDuration =
    duration > 0 ? duration : activeTrack?.durationSeconds ?? 0;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onAddFiles(e.target.files);
      e.target.value = '';
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files).filter(
      (f) =>
        f.type.startsWith('audio/') ||
        /\.(mp3|m4a|aac|wav|ogg|flac|opus|webm)$/i.test(f.name)
    );
    if (droppedFiles.length > 0) {
      onAddFiles(droppedFiles);
    }
  };

  const loopLabel =
    loopMode === LoopMode.One
      ? 'Loop 1'
      : loopMode === LoopMode.All
        ? 'Loop all'
        : 'Loop off';

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      className={`mt-8 bg-white border rounded-xl p-6 md:p-7 transition-colors ${
        isDragOver ? 'border-cobalt-600 bg-[#F8FAFF]' : 'border-[#DCE3EE]'
      }`}
    >
      {/* Hidden native audio picker supporting mobile files/media libraries & desktop folders */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.flac,.opus,.webm"
        multiple
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-oxford-950">
            Personal Music Library
          </h2>
          <p className="mt-0.5 text-xs text-slate-600">
            Play tracks from your phone or computer library—saved privately in your browser.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onToggleSyncWithTimer}
            title="Automatically play and pause your music when you start or pause the Focus Timer"
            className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              syncWithTimer
                ? 'bg-oxford-950 text-white border-oxford-950'
                : 'bg-white text-slate-600 hover:text-oxford-950 border-[#DCE3EE]'
            }`}
          >
            {syncWithTimer ? 'Synced with timer' : 'Sync with timer'}
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-cobalt-600 hover:bg-cobalt-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Add from device
          </button>
        </div>
      </div>

      {tracks.length === 0 ? (
        /* Empty Dropzone / Mobile Device Picker Prompt */
        <div className="mt-5 pt-6 pb-4 border-t border-[#E8EEF6] text-center">
          <p className="text-sm font-medium text-oxford-950">
            Your device playlist is empty
          </p>
          <p className="mt-1 text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
            Select MP3, M4A, WAV, AAC, or ambient audio files from your phone or local music folder, or drag and drop audio files anywhere here.
          </p>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-oxford-950 bg-surface-tint hover:bg-[#DCE5F2] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-cobalt-600" />
            Choose audio files
          </button>
        </div>
      ) : (
        /* Active Transport + Personal Playlist */
        <div className="mt-5 pt-5 border-t border-[#E8EEF6] space-y-5">
          {/* Now Playing Info & Seek Scrub Bar */}
          {activeTrack && (
            <div>
              <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1 mb-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-oxford-950 truncate">
                    {activeTrack.name}
                  </p>
                  <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                    Track {Math.max(1, activeTrackIndex + 1)} of {tracks.length} ·{' '}
                    {formatFileSize(activeTrack.sizeBytes)}
                  </p>
                </div>

                <div className="text-xs font-mono font-semibold text-cobalt-700 tabular-nums shrink-0">
                  {formatAudioTime(currentTime)} / {formatAudioTime(effectiveDuration)}
                </div>
              </div>

              <input
                type="range"
                min={0}
                max={effectiveDuration > 0 ? effectiveDuration : 100}
                step={0.5}
                value={Math.min(currentTime, effectiveDuration > 0 ? effectiveDuration : 100)}
                onChange={(e) => onSeek(Number(e.target.value))}
                aria-label="Seek audio position"
                className="w-full h-1.5 accent-[#1D4ED8] bg-surface-tint rounded-lg cursor-pointer"
              />

              {/* Transport & Volume Controls */}
              <div className="mt-3.5 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onToggleShuffle}
                    aria-label="Toggle shuffle"
                    title={shuffle ? 'Shuffle enabled' : 'Shuffle off'}
                    className={`p-2 rounded-lg border text-xs transition-colors cursor-pointer ${
                      shuffle
                        ? 'bg-oxford-950 text-white border-oxford-950'
                        : 'bg-white text-slate-600 hover:text-oxford-950 border-[#DCE3EE]'
                    }`}
                  >
                    <Shuffle className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={onPrevTrack}
                    disabled={tracks.length < 2 && currentTime < 3}
                    aria-label="Previous track"
                    className="p-2 rounded-lg border border-[#DCE3EE] bg-white text-oxford-950 hover:bg-surface-tint disabled:opacity-40 transition-colors cursor-pointer"
                  >
                    <SkipBack className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={onTogglePlay}
                    aria-label={isPlaying ? 'Pause music' : 'Play music'}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-cobalt-600 hover:bg-cobalt-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
                  >
                    {isPlaying ? (
                      <>
                        <Pause className="w-3.5 h-3.5" />
                        Pause
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5" />
                        Play
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={onNextTrack}
                    disabled={tracks.length < 2}
                    aria-label="Next track"
                    className="p-2 rounded-lg border border-[#DCE3EE] bg-white text-oxford-950 hover:bg-surface-tint disabled:opacity-40 transition-colors cursor-pointer"
                  >
                    <SkipForward className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={onCycleLoopMode}
                    title={`Repeat mode: ${loopLabel}`}
                    className={`inline-flex items-center gap-1 px-2.5 py-2 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      loopMode !== LoopMode.Off
                        ? 'bg-oxford-950 text-white border-oxford-950'
                        : 'bg-white text-slate-600 hover:text-oxford-950 border-[#DCE3EE]'
                    }`}
                  >
                    {loopMode === LoopMode.One ? (
                      <Repeat1 className="w-3.5 h-3.5" />
                    ) : (
                      <Repeat className="w-3.5 h-3.5" />
                    )}
                    <span>{loopLabel}</span>
                  </button>
                </div>

                {/* Volume Control */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onToggleMute}
                    aria-label={isMuted ? 'Unmute audio' : 'Mute audio'}
                    className="p-1.5 text-slate-600 hover:text-oxford-950 rounded cursor-pointer"
                  >
                    {isMuted || volume === 0 ? (
                      <VolumeX className="w-4 h-4" />
                    ) : (
                      <Volume2 className="w-4 h-4" />
                    )}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.02}
                    value={isMuted ? 0 : volume}
                    onChange={(e) => onVolumeChange(Number(e.target.value))}
                    aria-label="Music volume"
                    className="w-24 h-1.5 accent-oxford-950 bg-surface-tint rounded-lg cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Saved Device Tracks List */}
          <div className="pt-4 border-t border-[#E8EEF6]">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-xs font-semibold text-oxford-950">
                Library queue ·{' '}
                <span className="font-mono font-medium text-slate-600 tabular-nums">
                  {tracks.length} {tracks.length === 1 ? 'track' : 'tracks'}
                </span>
              </span>

              {tracks.length > 1 && (
                <button
                  type="button"
                  onClick={onClearLibrary}
                  className="text-xs font-medium text-slate-500 hover:text-red-600 underline underline-offset-2 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Clear library
                </button>
              )}
            </div>

            <div className="divide-y divide-[#E8EEF6] max-h-60 overflow-y-auto">
              {tracks.map((trk, idx) => {
                const isSelected = activeTrack?.id === trk.id;
                return (
                  <div
                    key={trk.id}
                    className={`py-2.5 px-2.5 flex items-center justify-between gap-3 rounded-md transition-colors ${
                      isSelected ? 'bg-[#F0F5FF]' : 'hover:bg-slate-50/80'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectTrack(trk.id, true)}
                      className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer"
                    >
                      <span
                        className={`font-mono text-xs tabular-nums w-6 shrink-0 ${
                          isSelected
                            ? 'font-bold text-cobalt-600'
                            : 'text-slate-400'
                        }`}
                      >
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <span
                        className={`text-sm truncate ${
                          isSelected
                            ? 'font-bold text-oxford-950'
                            : 'font-medium text-oxford-900'
                        }`}
                      >
                        {trk.name}
                      </span>
                    </button>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs font-mono text-slate-500 tabular-nums">
                        {trk.durationSeconds
                          ? formatAudioTime(trk.durationSeconds)
                          : formatFileSize(trk.sizeBytes)}
                      </span>
                      <button
                        type="button"
                        onClick={() => onRemoveTrack(trk.id)}
                        aria-label={`Remove ${trk.name}`}
                        className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
