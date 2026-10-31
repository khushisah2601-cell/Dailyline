import { BlockCategory, DayPlan, ScheduleBlock } from '../types';

export interface BreakSuggestion {
  streakStartIndex: number;
  streakEndIndex: number;
  streakDurationMinutes: number;
  streakBlockCount: number;
  streakStartTime: string;
  streakEndTime: string;
  proposedBreakTime: string;
  mode: 'between' | 'split';
  insertBeforeIndex: number;
  beforeTitle: string;
  afterTitle?: string;
  splitBlockIndex?: number;
  splitTitle?: string;
  firstHalfMinutes?: number;
  secondHalfMinutes?: number;
}

export function parseTimeToMinutes(timeStr: string): number {
  const [hoursStr, minutesStr] = timeStr.split(':');
  const hours = Number.parseInt(hoursStr || '9', 10);
  const minutes = Number.parseInt(minutesStr || '0', 10);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return 9 * 60;
  return hours * 60 + minutes;
}

export function formatMinutesToTime(totalMinutes: number): string {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function calculateWindowMinutes(start: string, finish: string): number {
  const s = parseTimeToMinutes(start);
  const f = parseTimeToMinutes(finish);
  if (f > s) return f - s;
  if (f < s) return 1440 - s + f;
  return 0;
}

export function formatDurationHuman(totalMinutes: number): string {
  if (totalMinutes <= 0) return '0m';
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function recalculateTimeline(
  blocks: ScheduleBlock[],
  startWindow: string
): ScheduleBlock[] {
  let cursor = parseTimeToMinutes(startWindow);
  return blocks.map((block) => {
    const dur = Math.max(5, Math.round(block.durationMinutes));
    const startTime = formatMinutesToTime(cursor);
    const endTime = formatMinutesToTime(cursor + dur);
    cursor += dur;
    return {
      ...block,
      durationMinutes: dur,
      startTime,
      endTime,
    };
  });
}

function collectContinuousWorkRuns(
  blocks: ScheduleBlock[],
  incompleteOnly: boolean
): Array<{ startIdx: number; endIdx: number; totalMinutes: number; count: number }> {
  const runs: Array<{ startIdx: number; endIdx: number; totalMinutes: number; count: number }> = [];
  let runStart = -1;
  let runMinutes = 0;

  for (let i = 0; i < blocks.length; i += 1) {
    const b = blocks[i];
    const isEligibleWork =
      b.category !== BlockCategory.Break && (!incompleteOnly || !b.completed);

    if (isEligibleWork) {
      if (runStart === -1) {
        runStart = i;
        runMinutes = 0;
      }
      runMinutes += b.durationMinutes;
    } else if (runStart !== -1) {
      runs.push({
        startIdx: runStart,
        endIdx: i - 1,
        totalMinutes: runMinutes,
        count: i - runStart,
      });
      runStart = -1;
      runMinutes = 0;
    }
  }

  if (runStart !== -1) {
    runs.push({
      startIdx: runStart,
      endIdx: blocks.length - 1,
      totalMinutes: runMinutes,
      count: blocks.length - runStart,
    });
  }

  return runs;
}

export function findLongestWorkStreakSuggestion(
  blocks: ScheduleBlock[]
): BreakSuggestion | null {
  if (blocks.length === 0) return null;

  let runs = collectContinuousWorkRuns(blocks, true);
  if (runs.length === 0) {
    runs = collectContinuousWorkRuns(blocks, false);
  }
  if (runs.length === 0) return null;

  // Pick longest streak by total continuous minutes, breaking ties by block count
  const bestRun = runs.reduce((best, candidate) => {
    if (candidate.totalMinutes > best.totalMinutes) return candidate;
    if (
      candidate.totalMinutes === best.totalMinutes &&
      candidate.count > best.count
    ) {
      return candidate;
    }
    return best;
  }, runs[0]);

  const { startIdx, endIdx, totalMinutes, count } = bestRun;
  const streakStartTime = blocks[startIdx].startTime;
  const streakEndTime = blocks[endIdx].endTime;
  const halfway = totalMinutes / 2;

  // Single-block continuous work streak
  if (count === 1) {
    const single = blocks[startIdx];
    if (single.durationMinutes >= 30) {
      const rawHalf = Math.round(single.durationMinutes / 2 / 5) * 5;
      const firstHalf = Math.max(15, Math.min(single.durationMinutes - 15, rawHalf));
      const secondHalf = single.durationMinutes - firstHalf;
      const proposedBreakTime = formatMinutesToTime(
        parseTimeToMinutes(single.startTime) + firstHalf
      );

      return {
        streakStartIndex: startIdx,
        streakEndIndex: endIdx,
        streakDurationMinutes: totalMinutes,
        streakBlockCount: count,
        streakStartTime,
        streakEndTime,
        proposedBreakTime,
        mode: 'split',
        insertBeforeIndex: startIdx + 1,
        beforeTitle: single.title,
        splitBlockIndex: startIdx,
        splitTitle: single.title,
        firstHalfMinutes: firstHalf,
        secondHalfMinutes: secondHalf,
      };
    }

    return {
      streakStartIndex: startIdx,
      streakEndIndex: endIdx,
      streakDurationMinutes: totalMinutes,
      streakBlockCount: count,
      streakStartTime,
      streakEndTime,
      proposedBreakTime: single.endTime,
      mode: 'between',
      insertBeforeIndex: startIdx + 1,
      beforeTitle: single.title,
      afterTitle: blocks[startIdx + 1]?.title,
    };
  }

  // Multi-block continuous work streak: locate block containing midpoint & closest inter-block boundary
  let cumulative = 0;
  let midBlockIndex = startIdx;
  let offsetInMid = halfway;
  let bestBoundaryIndex = startIdx + 1;
  let bestBoundaryDistance = Number.POSITIVE_INFINITY;

  for (let i = startIdx; i <= endIdx; i += 1) {
    const dur = blocks[i].durationMinutes;
    if (halfway >= cumulative && halfway <= cumulative + dur) {
      midBlockIndex = i;
      offsetInMid = halfway - cumulative;
    }
    cumulative += dur;
    if (i < endIdx) {
      const dist = Math.abs(cumulative - halfway);
      if (dist < bestBoundaryDistance) {
        bestBoundaryDistance = dist;
        bestBoundaryIndex = i + 1;
      }
    }
  }

  const midBlock = blocks[midBlockIndex];
  const rawFirstHalf = Math.round(offsetInMid / 5) * 5;
  const clampedFirstHalf = Math.max(
    15,
    Math.min(midBlock.durationMinutes - 15, rawFirstHalf)
  );
  const clampedSecondHalf = midBlock.durationMinutes - clampedFirstHalf;

  // Split a dominating block in half only if no inter-block boundary is reasonably close to the middle
  if (
    bestBoundaryDistance > 25 &&
    midBlock.durationMinutes >= 50 &&
    clampedFirstHalf >= 15 &&
    clampedSecondHalf >= 15
  ) {
    const proposedBreakTime = formatMinutesToTime(
      parseTimeToMinutes(midBlock.startTime) + clampedFirstHalf
    );
    return {
      streakStartIndex: startIdx,
      streakEndIndex: endIdx,
      streakDurationMinutes: totalMinutes,
      streakBlockCount: count,
      streakStartTime,
      streakEndTime,
      proposedBreakTime,
      mode: 'split',
      insertBeforeIndex: midBlockIndex + 1,
      beforeTitle: midBlock.title,
      splitBlockIndex: midBlockIndex,
      splitTitle: midBlock.title,
      firstHalfMinutes: clampedFirstHalf,
      secondHalfMinutes: clampedSecondHalf,
    };
  }

  const beforeBlock = blocks[bestBoundaryIndex - 1];
  const afterBlock = blocks[bestBoundaryIndex];

  return {
    streakStartIndex: startIdx,
    streakEndIndex: endIdx,
    streakDurationMinutes: totalMinutes,
    streakBlockCount: count,
    streakStartTime,
    streakEndTime,
    proposedBreakTime: beforeBlock.endTime,
    mode: 'between',
    insertBeforeIndex: bestBoundaryIndex,
    beforeTitle: beforeBlock.title,
    afterTitle: afterBlock?.title,
  };
}

export function applyBreakSuggestion(
  blocks: ScheduleBlock[],
  suggestion: BreakSuggestion,
  startWindow: string
): { blocks: ScheduleBlock[]; insertedBreakId: string } {
  const stamp = Date.now();
  const insertedBreakId = `blk-break-${stamp}`;

  const breakBlock: ScheduleBlock = {
    id: insertedBreakId,
    startTime: suggestion.proposedBreakTime,
    endTime: suggestion.proposedBreakTime,
    durationMinutes: 15,
    title: 'Recovery break',
    category: BlockCategory.Break,
    energyDemand: 'Recovery',
    note:
      suggestion.mode === 'split' && suggestion.splitTitle
        ? `15m breather in the middle of ${suggestion.splitTitle}`
        : suggestion.afterTitle
          ? `15m breather between ${suggestion.beforeTitle} and ${suggestion.afterTitle}`
          : `15m breather after ${suggestion.beforeTitle}`,
    completed: false,
    tags: ['rest'],
  };

  const nextBlocks = [...blocks];

  if (
    suggestion.mode === 'split' &&
    suggestion.splitBlockIndex !== undefined &&
    nextBlocks[suggestion.splitBlockIndex]
  ) {
    const target = nextBlocks[suggestion.splitBlockIndex];
    const baseTitle = target.title.replace(/\s*\(Part\s+\d+\)\s*$/i, '').trim();
    const firstDur = suggestion.firstHalfMinutes ?? Math.max(15, Math.floor(target.durationMinutes / 2));
    const secondDur = suggestion.secondHalfMinutes ?? Math.max(15, target.durationMinutes - firstDur);

    const part1: ScheduleBlock = {
      ...target,
      id: `${target.id}-p1-${stamp}`,
      title: `${baseTitle} (Part 1)`,
      durationMinutes: firstDur,
    };
    const part2: ScheduleBlock = {
      ...target,
      id: `${target.id}-p2-${stamp}`,
      title: `${baseTitle} (Part 2)`,
      durationMinutes: secondDur,
    };

    nextBlocks.splice(suggestion.splitBlockIndex, 1, part1, breakBlock, part2);
  } else {
    const safeIndex = Math.max(0, Math.min(nextBlocks.length, suggestion.insertBeforeIndex));
    nextBlocks.splice(safeIndex, 0, breakBlock);
  }

  return {
    blocks: recalculateTimeline(nextBlocks, startWindow),
    insertedBreakId,
  };
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

export function generateIcsContent(plan: DayPlan): string {
  const now = new Date();
  const year = now.getFullYear();
  const dtStamp = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  let dayOffset = 0;
  let prevStartMin = -1;

  const events = plan.blocks.map((block) => {
    const startMin = parseTimeToMinutes(block.startTime);
    if (prevStartMin !== -1 && startMin < prevStartMin) {
      dayOffset += 1;
    }
    prevStartMin = startMin;

    const startDate = new Date(year, now.getMonth(), now.getDate() + dayOffset);
    const sHours = Math.floor(startMin / 60);
    const sMins = startMin % 60;
    startDate.setHours(sHours, sMins, 0, 0);

    const endDate = new Date(startDate.getTime() + block.durationMinutes * 60 * 1000);

    const fmtLocal = (d: Date) => {
      const y = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, '0');
      const da = String(d.getDate()).padStart(2, '0');
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return `${y}${mo}${da}T${hh}${mm}00`;
    };

    return [
      'BEGIN:VEVENT',
      `UID:${block.id}-${plan.id}@dayline.local`,
      `DTSTAMP:${dtStamp}`,
      `DTSTART:${fmtLocal(startDate)}`,
      `DTEND:${fmtLocal(endDate)}`,
      `SUMMARY:${escapeIcsText(block.title)}`,
      `DESCRIPTION:${escapeIcsText(`${block.category.toUpperCase()} (${block.durationMinutes}m) - ${block.note}`)}`,
      'END:VEVENT',
    ].join('\r\n');
  });

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Dayline//Realistic Day Planner//EN',
    'CALSCALE:GREGORIAN',
    ...events,
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

export function generateMarkdownPlan(plan: DayPlan): string {
  const lines: string[] = [
    `# Dayline Plan — ${plan.dateLabel}`,
    `Window: ${plan.startWindow}–${plan.finishWindow} · Energy: ${plan.energy}`,
    '',
    `> ${plan.summaryNote}`,
    '',
    '## Timeline',
    ...plan.blocks.map(
      (b) =>
        `- [${b.completed ? 'x' : ' '}] **${b.startTime}–${b.endTime}** (${b.durationMinutes}m) ${b.title}${b.note ? ` — _${b.note}_` : ''}`
    ),
  ];

  if (plan.deferred.length > 0) {
    lines.push('', '## Deferred for Tomorrow');
    for (const d of plan.deferred) {
      lines.push(`- [ ] ${d.title} (~${d.estimatedMinutes}m) — ${d.reason}`);
    }
  }

  return lines.join('\n');
}
