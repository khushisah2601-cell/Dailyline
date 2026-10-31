import { BlockCategory, ScheduleBlock } from '../types';

export interface TagColorTheme {
  id: string;
  rowSurface: string;
  timeText: string;
  tagText: string;
  activeButton: string;
  inactiveButton: string;
}

const CORE_THEMES: Record<string, TagColorTheme> = {
  study: {
    id: 'study',
    rowSurface: 'bg-[#EFF5FF]/85 hover:bg-[#E3EEFF] border-[#C5D8FA]',
    timeText: 'text-[#1D4ED8]',
    tagText: 'text-[#1D4ED8]',
    activeButton: 'bg-[#1D4ED8] text-white border-[#1D4ED8]',
    inactiveButton: 'bg-white text-[#1D4ED8] border-[#C5D8FA] hover:bg-[#EFF5FF]',
  },
  work: {
    id: 'work',
    rowSurface: 'bg-[#F3F1FF]/85 hover:bg-[#EAE6FF] border-[#D4CDFA]',
    timeText: 'text-[#4338CA]',
    tagText: 'text-[#4338CA]',
    activeButton: 'bg-[#4338CA] text-white border-[#4338CA]',
    inactiveButton: 'bg-white text-[#4338CA] border-[#D4CDFA] hover:bg-[#F3F1FF]',
  },
  health: {
    id: 'health',
    rowSurface: 'bg-[#ECFDF3]/85 hover:bg-[#DCFCE7] border-[#B6F0C9]',
    timeText: 'text-[#15803D]',
    tagText: 'text-[#15803D]',
    activeButton: 'bg-[#15803D] text-white border-[#15803D]',
    inactiveButton: 'bg-white text-[#15803D] border-[#B6F0C9] hover:bg-[#ECFDF3]',
  },
  errands: {
    id: 'errands',
    rowSurface: 'bg-[#FFFBEB]/90 hover:bg-[#FEF3C7]/90 border-[#FCD97D]',
    timeText: 'text-[#B45309]',
    tagText: 'text-[#B45309]',
    activeButton: 'bg-[#B45309] text-white border-[#B45309]',
    inactiveButton: 'bg-white text-[#B45309] border-[#FCD97D] hover:bg-[#FFFBEB]',
  },
  personal: {
    id: 'personal',
    rowSurface: 'bg-[#FFF1F2]/85 hover:bg-[#FFE4E6] border-[#FECDD3]',
    timeText: 'text-[#BE123C]',
    tagText: 'text-[#BE123C]',
    activeButton: 'bg-[#BE123C] text-white border-[#BE123C]',
    inactiveButton: 'bg-white text-[#BE123C] border-[#FECDD3] hover:bg-[#FFF1F2]',
  },
  rest: {
    id: 'rest',
    rowSurface: 'bg-[#F0FDFA]/85 hover:bg-[#CCFBF1]/70 border-[#99F6E4]',
    timeText: 'text-[#0F766E]',
    tagText: 'text-[#0F766E]',
    activeButton: 'bg-[#0F766E] text-white border-[#0F766E]',
    inactiveButton: 'bg-white text-[#0F766E] border-[#99F6E4] hover:bg-[#F0FDFA]',
  },
};

const TAG_RULES: Array<{
  tag: string;
  paletteKey: keyof typeof CORE_THEMES;
  keywords: string[];
}> = [
  {
    tag: 'study',
    paletteKey: 'study',
    keywords: [
      'study',
      'math',
      'maths',
      'assignment',
      'revise',
      'revision',
      'java',
      'array',
      'exam',
      'quiz',
      'lecture',
      'homework',
      'read',
      'pages',
      'chapter',
      'book',
      'course',
      'learn',
      'notes',
      'essay',
      'thesis',
      'research',
      'calculus',
      'physics',
      'chemistry',
      'biology',
      'estudiar',
      'leer',
      'capítulo',
    ],
  },
  {
    tag: 'work',
    paletteKey: 'work',
    keywords: [
      'work',
      'email',
      'emails',
      'reply',
      'inbox',
      'client',
      'meeting',
      'standup',
      'sync',
      'report',
      'presentation',
      'slide',
      'budget',
      'code',
      'coding',
      'bug',
      'fix',
      'deploy',
      'review',
      'pr',
      'project',
      'proposal',
      'invoice',
      'desk',
      'organize',
      'cliente',
      'presupuesto',
      'presentación',
      'trabajo',
    ],
  },
  {
    tag: 'health',
    paletteKey: 'health',
    keywords: [
      'health',
      'gym',
      'workout',
      'run',
      'running',
      'jog',
      'walk',
      'stretch',
      'yoga',
      'meditate',
      'meditation',
      'exercise',
      'swim',
      'cycling',
      'cardio',
      'lift',
      'weights',
      'doctor',
      'dentist',
      'hydrate',
      'fitness',
      'correr',
      'dentista',
    ],
  },
  {
    tag: 'errands',
    paletteKey: 'errands',
    keywords: [
      'errand',
      'errands',
      'groceries',
      'grocery',
      'buy',
      'shop',
      'shopping',
      'market',
      'laundry',
      'wash',
      'fold',
      'clean',
      'cleaning',
      'tidy',
      'cook',
      'cooking',
      'pasta',
      'dinner',
      'meal prep',
      'bill',
      'electricity',
      'pay',
      'bank',
      'post',
      'pharmacy',
      'landlord',
      'comprar',
      'verduras',
      'cena',
    ],
  },
  {
    tag: 'personal',
    paletteKey: 'personal',
    keywords: [
      'personal',
      'mom',
      'mum',
      'dad',
      'parents',
      'family',
      'call',
      'phone',
      'friend',
      'catch up',
      'journal',
      'diary',
      'guitar',
      'piano',
      'music',
      'hobby',
      'draw',
      'llamar',
      'familia',
    ],
  },
  {
    tag: 'rest',
    paletteKey: 'rest',
    keywords: [
      'rest',
      'break',
      'pause',
      'breather',
      'coffee',
      'tea',
      'lunch',
      'snack',
      'nap',
      'relax',
      'unwind',
      'recharge',
      'screen break',
      'descanso',
    ],
  },
  // Secondary contextual tags that map cleanly onto the 6 classic themes
  {
    tag: 'coding',
    paletteKey: 'work',
    keywords: ['java', 'array', 'code', 'coding', 'bug', 'login', 'api', 'react', 'python', 'algorithm'],
  },
  {
    tag: 'reading',
    paletteKey: 'study',
    keywords: ['read', 'pages', 'book', 'chapter', 'article', 'paper', 'leer', 'capítulo'],
  },
  {
    tag: 'fitness',
    paletteKey: 'health',
    keywords: ['gym', 'workout', 'run', 'stretch', 'cardio', 'correr', 'yoga'],
  },
  {
    tag: 'admin',
    paletteKey: 'work',
    keywords: ['email', 'emails', 'reply', 'bill', 'pay', 'invoice', 'landlord', 'dentist', 'organize'],
  },
];

export const DEFAULT_TAG_POOL = ['study', 'work', 'health', 'errands', 'personal', 'rest'] as const;

export function normalizeTag(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^#+/, '')
    .replace(/[^a-z0-9_-]/g, '');
}

export function getTagTheme(tag: string): TagColorTheme {
  const normalized = normalizeTag(tag);
  if (CORE_THEMES[normalized]) {
    return CORE_THEMES[normalized];
  }

  const ruleMatch = TAG_RULES.find((r) => r.tag === normalized);
  if (ruleMatch) {
    return {
      ...CORE_THEMES[ruleMatch.paletteKey],
      id: normalized,
    };
  }

  // Deterministic classic fallback for custom user-entered tags
  const keys = Object.keys(CORE_THEMES);
  let hash = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash * 31 + normalized.charCodeAt(i)) >>> 0;
  }
  const chosen = CORE_THEMES[keys[hash % keys.length]];
  return {
    ...chosen,
    id: normalized || 'work',
  };
}

export function suggestTagsForTitle(
  title: string,
  category?: BlockCategory
): { matched: string[]; suggestions: string[] } {
  const lower = title.trim().toLowerCase();

  if (!lower) {
    if (category === BlockCategory.Break) {
      return { matched: ['rest'], suggestions: ['rest', 'health', 'personal', 'study', 'work', 'errands'] };
    }
    if (category === BlockCategory.Errand) {
      return { matched: ['errands'], suggestions: ['errands', 'health', 'personal', 'work', 'study', 'rest'] };
    }
    return { matched: [], suggestions: [...DEFAULT_TAG_POOL] };
  }

  const scored: Array<{ tag: string; score: number }> = [];

  for (const rule of TAG_RULES) {
    let score = 0;
    for (const kw of rule.keywords) {
      if (lower.includes(kw)) {
        // Exact word boundary bonus
        const boundaryRegex = new RegExp(`(^|[^a-z0-9])${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'i');
        score += boundaryRegex.test(lower) ? 3 : 1;
      }
    }
    if (score > 0) {
      scored.push({ tag: rule.tag, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const matched = scored.map((s) => s.tag);

  // Build ordered suggestion bar: matched tags first, followed by remaining core tags
  const ordered = new Set<string>(matched);
  if (category === BlockCategory.Break) ordered.add('rest');
  if (category === BlockCategory.Errand) ordered.add('errands');
  for (const baseTag of DEFAULT_TAG_POOL) {
    ordered.add(baseTag);
  }

  return {
    matched: matched.slice(0, 3),
    suggestions: Array.from(ordered).slice(0, 7),
  };
}

export function inferCategoryFromTag(tag: string): BlockCategory | null {
  const norm = normalizeTag(tag);
  if (norm === 'rest') return BlockCategory.Break;
  if (norm === 'errands' || norm === 'health' || norm === 'fitness') return BlockCategory.Errand;
  if (norm === 'study' || norm === 'coding' || norm === 'reading') return BlockCategory.Focus;
  if (norm === 'work' || norm === 'admin' || norm === 'personal') return BlockCategory.Routine;
  return null;
}

export function resolveBlockTags(block: ScheduleBlock): string[] {
  if (Array.isArray(block.tags) && block.tags.length > 0) {
    return block.tags.map(normalizeTag).filter(Boolean);
  }

  if (block.category === BlockCategory.Break) {
    return ['rest'];
  }

  const { matched } = suggestTagsForTitle(block.title, block.category);
  if (matched.length > 0) {
    return matched.slice(0, 2);
  }

  switch (block.category) {
    case BlockCategory.Focus:
      return ['study'];
    case BlockCategory.Errand:
      return ['errands'];
    case BlockCategory.Routine:
    default:
      return ['work'];
  }
}
