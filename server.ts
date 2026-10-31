import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;

function getAiClient(): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function parseHHMM(value: string): number {
  const parts = String(value || '09:00').split(':');
  const h = Number.parseInt(parts[0] || '9', 10);
  const m = Number.parseInt(parts[1] || '0', 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return 540;
  return h * 60 + m;
}

function formatHHMM(totalMinutes: number): string {
  const norm = ((totalMinutes % 1440) + 1440) % 1440;
  const h = Math.floor(norm / 60);
  const m = norm % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function computeAvailableMinutes(start: string, finish: string): number {
  const s = parseHHMM(start);
  const f = parseHHMM(finish);
  if (f > s) return f - s;
  if (f < s) return 1440 - s + f;
  return 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryDelayMs(message: string, fallbackMs: number): number {
  const retryInfoMatch = message.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/i);
  if (retryInfoMatch) {
    const seconds = Number.parseFloat(retryInfoMatch[1]);
    if (!Number.isNaN(seconds) && seconds > 0) {
      return Math.min(90_000, Math.ceil(seconds * 1000));
    }
  }
  const inlineMatch = message.match(/retry in\s+(\d+(?:\.\d+)?)s/i);
  if (inlineMatch) {
    const seconds = Number.parseFloat(inlineMatch[1]);
    if (!Number.isNaN(seconds) && seconds > 0) {
      return Math.min(90_000, Math.ceil(seconds * 1000));
    }
  }
  return fallbackMs;
}

function summarizeGeminiError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes('RESOURCE_EXHAUSTED') || message.includes('429')) {
    const delayMs = parseRetryDelayMs(message, 45_000);
    return `429 RESOURCE_EXHAUSTED (cooldown ~${Math.round(delayMs / 1000)}s)`;
  }
  if (message.includes('503') || message.includes('UNAVAILABLE')) {
    return '503 UNAVAILABLE (temporary high demand)';
  }
  if (message.includes('API_KEY_INVALID') || message.includes('PERMISSION_DENIED') || message.includes('403')) {
    return '403 PERMISSION_DENIED / API_KEY_INVALID';
  }
  return message.slice(0, 160);
}
function mapGeminiErrorToResponse(err: unknown): { status: number; error: string } {
  const message = err instanceof Error ? err.message : String(err);

  if (message.includes('API_KEY_INVALID') || message.includes('PERMISSION_DENIED') || message.includes('403')) {
    return {
      status: 403,
      error: 'Unable to access Gemini API with the current key. Please check your API key in Settings > Secrets.',
    };
  }

  if (message.includes('RESOURCE_EXHAUSTED') || message.includes('429') || message.includes('billing')) {
    const waitSeconds = Math.round(parseRetryDelayMs(message, 45_000) / 1000);
    return {
      status: 429,
      error: `Free-tier rate limit reached on Gemini API (resets in ~${waitSeconds}s). Wait a moment and retry, or upgrade to a paid tier in Settings > Secrets to select a billing-enabled API key.`,
    };
  }

  if (message.includes('503') || message.includes('UNAVAILABLE')) {
    return {
      status: 503,
      error: 'The AI model is experiencing temporary high demand. Please try again in a moment.',
    };
  }

  return {
    status: 500,
    error: 'Request could not be completed right now. Please try again.',
  };
}

const PLAN_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    detectedLanguage: {
      type: Type.STRING,
      description:
        'Human-readable name of the language used in the user dump (e.g., English, Español, हिन्दी, Français, Mixed).',
    },
    summaryNote: {
      type: Type.STRING,
      description:
        '1-2 concise, calm, encouraging sentences written in the SAME language as the user input explaining how the day was paced realistically for their energy level and time window.',
    },
    blocks: {
      type: Type.ARRAY,
      description:
        'Ordered chronological schedule blocks starting at Start time and never exceeding available minutes.',
      items: {
        type: Type.OBJECT,
        properties: {
          title: {
            type: Type.STRING,
            description:
              'Clear, concise task or break title in the SAME language as the user input.',
          },
          durationMinutes: {
            type: Type.INTEGER,
            description:
              'Realistic duration in minutes (multiples of 5, e.g., 15, 25, 30, 45, 60, 90).',
          },
          category: {
            type: Type.STRING,
            description: 'Must be one of: focus, routine, errand, break',
          },
          energyDemand: {
            type: Type.STRING,
            description: 'Must be one of: High, Medium, Low, Recovery',
          },
          note: {
            type: Type.STRING,
            description:
              'Short, practical 1-line pacing tip or concrete sub-step in the SAME language as the user input.',
          },
        },
        required: ['title', 'durationMinutes', 'category', 'energyDemand', 'note'],
      },
    },
    deferred: {
      type: Type.ARRAY,
      description:
        'Tasks from the brain dump that genuinely cannot fit realistically into the available hours or energy level without causing burnout.',
      items: {
        type: Type.OBJECT,
        properties: {
          title: {
            type: Type.STRING,
            description: 'Task title in the SAME language as the user input.',
          },
          estimatedMinutes: {
            type: Type.INTEGER,
            description: 'Estimated minutes needed tomorrow.',
          },
          reason: {
            type: Type.STRING,
            description:
              'Short, honest reason why deferring this makes today realistic, in the SAME language as the user input.',
          },
        },
        required: ['title', 'estimatedMinutes', 'reason'],
      },
    },
  },
  required: ['detectedLanguage', 'summaryNote', 'blocks', 'deferred'],
};

// Distinct per-model quota buckets (avoid 'gemini-flash-latest' + 'gemini-3.8-flash' duplication,
// which shares the same 5-RPM Free Tier quota bucket).
const PLAN_MODELS = ['gemini-3.1-flash-lite', 'gemini-3.8-flash'] as const;

const modelCooldownUntil = new Map<string, number>();

interface RawModelPlan {
  detectedLanguage: string;
  summaryNote: string;
  blocks: Array<{
    title: string;
    durationMinutes: number;
    category: string;
    energyDemand: string;
    note: string;
  }>;
  deferred: Array<{
    title: string;
    estimatedMinutes: number;
    reason: string;
  }>;
}

const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = 50;
const planCache = new Map<string, { expiresAt: number; payload: RawModelPlan }>();
const inFlightPlans = new Map<string, Promise<RawModelPlan>>();

function setBoundedCache<T>(
  cache: Map<string, { expiresAt: number; payload: T }>,
  key: string,
  payload: T
): void {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) {
      cache.delete(oldestKey);
    }
  }
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, payload });
}

function getValidCached<T>(
  cache: Map<string, { expiresAt: number; payload: T }>,
  key: string
): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.payload;
}

function recordModelCooldown(modelName: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429')) {
    const cooldownMs = parseRetryDelayMs(msg, 45_000);
    modelCooldownUntil.set(modelName, Date.now() + cooldownMs);
  } else if (msg.includes('503') || msg.includes('UNAVAILABLE')) {
    modelCooldownUntil.set(modelName, Date.now() + 8_000);
  }
}

function isModelCoolingDown(modelName: string): boolean {
  const until = modelCooldownUntil.get(modelName) ?? 0;
  if (until <= Date.now()) {
    if (until > 0) modelCooldownUntil.delete(modelName);
    return false;
  }
  return true;
}

function detectLanguageHeuristic(text: string): string {
  if (/[\u0900-\u097F]/.test(text)) return 'हिन्दी';
  if (/[áéíóúñ¿¡]/i.test(text) || /\b(mañana|para|comprar|llamar|leer|ir\s+a)\b/i.test(text)) {
    return 'Español';
  }
  if (/[àâçèéêëîïôùûü]/i.test(text) || /\b(demain|pour|acheter|réviser)\b/i.test(text)) {
    return 'Français';
  }
  return 'English';
}

function buildLocalFallbackPlan(
  dump: string,
  availableMinutes: number,
  energyStr: string
): RawModelPlan {
  const detectedLanguage = detectLanguageHeuristic(dump);
  const rawItems = dump
    .split(/[\n,;•]+/)
    .map((s) => s.replace(/^[-*\d.)\s]+/, '').trim())
    .filter(Boolean);

  const items = rawItems.length > 0 ? rawItems : [dump.trim()];

  const classifyTask = (taskText: string) => {
    const lower = taskText.toLowerCase();
    const isUrgent =
      /\b(tomorrow|urgent|due|asap|standup|deadline|exam|mañana|hoy|demain)\b/i.test(lower);

    const explicitMinMatch = lower.match(/\b(\d{1,3})\s*(?:min|mins|minutes|m)\b/);
    const explicitMinutes = explicitMinMatch
      ? Math.max(10, Math.min(120, Math.round(Number.parseInt(explicitMinMatch[1], 10) / 5) * 5))
      : null;

    if (/\b(rest|nap|stretch|meditat|walk|coffee|tea|lunch|dinner|break|descans)\b/i.test(lower)) {
      return {
        title: taskText.charAt(0).toUpperCase() + taskText.slice(1),
        category: 'break',
        energyDemand: 'Recovery',
        durationMinutes: explicitMinutes ?? 20,
        note: 'Step away from screens so the next block feels fresh.',
        urgent: false,
      };
    }

    if (
      /\b(assignment|math|maths|java|code|coding|bug|study|revise|read|essay|report|project|design|presentaci[oó]n|presupuesto|le[eé]r|chapitre)\b/i.test(
        lower
      )
    ) {
      const baseDur = energyStr === 'high' ? 60 : energyStr === 'low' ? 30 : 45;
      return {
        title: taskText.charAt(0).toUpperCase() + taskText.slice(1),
        category: 'focus',
        energyDemand: energyStr === 'low' ? 'Medium' : 'High',
        durationMinutes: explicitMinutes ?? baseDur,
        note: isUrgent
          ? 'Prioritized early while mental focus is sharpest.'
          : 'Single-task with notifications muted for steady progress.',
        urgent: isUrgent,
      };
    }

    if (
      /\b(gym|workout|run|correr|grocer|buy|shop|comprar|verduras|market|errand|pharmacy|dentist|bank|post)\b/i.test(
        lower
      )
    ) {
      const baseDur = energyStr === 'low' ? 35 : 45;
      return {
        title: taskText.charAt(0).toUpperCase() + taskText.slice(1),
        category: 'errand',
        energyDemand: /\b(gym|workout|run|correr)\b/i.test(lower) ? 'Medium' : 'Low',
        durationMinutes: explicitMinutes ?? baseDur,
        note: 'Batch movement and out-of-desk tasks together.',
        urgent: isUrgent,
      };
    }

    const baseDur = energyStr === 'high' ? 30 : energyStr === 'low' ? 20 : 25;
    return {
      title: taskText.charAt(0).toUpperCase() + taskText.slice(1),
      category: 'routine',
      energyDemand: 'Low',
      durationMinutes: explicitMinutes ?? baseDur,
      note: 'Keep this lightweight and time-boxed so it stays effortless.',
      urgent: isUrgent,
    };
  };

  const classified = items.map(classifyTask);
  // Stable urgency-first ordering
  const ordered = [
    ...classified.filter((item) => item.urgent),
    ...classified.filter((item) => !item.urgent),
  ];

  const blocks: RawModelPlan['blocks'] = [];
  const deferred: RawModelPlan['deferred'] = [];
  let usedMinutes = 0;
  let consecutiveWorkBlocks = 0;

  for (let i = 0; i < ordered.length; i += 1) {
    const item = ordered[i];

    // Insert a 15m recovery breather after every 2 work blocks if room allows
    if (
      item.category !== 'break' &&
      consecutiveWorkBlocks >= 2 &&
      usedMinutes + 15 + item.durationMinutes <= availableMinutes
    ) {
      blocks.push({
        title: detectedLanguage === 'Español' ? 'Pausa de recuperación' : 'Recovery breather',
        durationMinutes: 15,
        category: 'break',
        energyDemand: 'Recovery',
        note:
          detectedLanguage === 'Español'
            ? 'Estira las piernas e hidrátate antes del siguiente bloque.'
            : 'Stretch, hydrate, and reset your eyes before the next block.',
      });
      usedMinutes += 15;
      consecutiveWorkBlocks = 0;
    }

    if (usedMinutes + item.durationMinutes <= availableMinutes) {
      blocks.push({
        title: item.title,
        durationMinutes: item.durationMinutes,
        category: item.category,
        energyDemand: item.energyDemand,
        note: item.note,
      });
      usedMinutes += item.durationMinutes;
      consecutiveWorkBlocks = item.category === 'break' ? 0 : consecutiveWorkBlocks + 1;
    } else if (availableMinutes - usedMinutes >= 20 && item.category !== 'break' && blocks.length === 0) {
      const fitted = Math.floor((availableMinutes - usedMinutes) / 5) * 5;
      blocks.push({
        title: item.title,
        durationMinutes: fitted,
        category: item.category,
        energyDemand: item.energyDemand,
        note: item.note,
      });
      usedMinutes += fitted;
    } else if (item.category !== 'break') {
      deferred.push({
        title: item.title,
        estimatedMinutes: item.durationMinutes,
        reason:
          detectedLanguage === 'Español'
            ? 'Reservado para mañana para respetar tu horario y energía de hoy.'
            : 'Saved for tomorrow so today stays realistic within your window.',
      });
    }
  }

  return {
    detectedLanguage,
    summaryNote:
      detectedLanguage === 'Español'
        ? 'Plan estructurado localmente según tu ventana y energía mientras se renueva la cuota gratuita de Gemini (puedes ampliar tu cuota en Settings > Secrets).'
        : 'Paced around your available hours and energy using smart local scheduling while Free Tier Gemini quota cools down (select a billing-enabled key in Settings > Secrets anytime for higher rate limits).',
    blocks,
    deferred,
  };
}

async function generatePlanWithRetry(
  ai: GoogleGenAI,
  systemInstruction: string,
  userPrompt: string
): Promise<RawModelPlan> {
  let lastError: unknown = null;

  // Prefer models not currently in cooldown first; if all are in cooldown, try once in order
  const healthyModels = PLAN_MODELS.filter((m) => !isModelCoolingDown(m));
  const modelsToTry = healthyModels.length > 0 ? healthyModels : [...PLAN_MODELS];

  for (let attempt = 0; attempt < modelsToTry.length; attempt += 1) {
    const modelName = modelsToTry[attempt];
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: userPrompt,
        config: {
          systemInstruction,
          ...(modelName === 'gemini-3.8-flash'
            ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
            : {}),
          responseMimeType: 'application/json',
          responseSchema: PLAN_RESPONSE_SCHEMA,
        },
      });

      const text = (response.text ?? '').trim();
      if (text) {
        modelCooldownUntil.delete(modelName);
        return JSON.parse(text) as RawModelPlan;
      }
    } catch (err: unknown) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);

      if (msg.includes('API_KEY_INVALID') || msg.includes('PERMISSION_DENIED') || msg.includes('403')) {
        throw err;
      }

      recordModelCooldown(modelName, err);
      console.warn(
        `[Dayline] Model ${modelName} unavailable for /api/plan: ${summarizeGeminiError(err)}`
      );

      if (attempt < modelsToTry.length - 1) {
        await sleep(300);
      }
    }
  }

  throw lastError ?? new Error('Unable to generate schedule at this moment.');
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  // 1. Daily Realistic Planner Endpoint
  app.post('/api/plan', async (req, res) => {
    try {
      const { dump, start, finish, energy, remainingOnly } = req.body ?? {};

      if (!dump || typeof dump !== 'string' || !dump.trim()) {
        res.status(400).json({ error: 'Please enter at least one task or thought to plan.' });
        return;
      }

      const normalizedDump = dump.trim();
      const startStr = typeof start === 'string' && start.includes(':') ? start : '09:00';
      const finishStr = typeof finish === 'string' && finish.includes(':') ? finish : '21:00';
      const energyStr = ['high', 'medium', 'low'].includes(String(energy).toLowerCase())
        ? String(energy).toLowerCase()
        : 'medium';

      const availableMinutes = computeAvailableMinutes(startStr, finishStr);
      if (availableMinutes < 15) {
        res.status(400).json({
          error: 'Your Finish time must be at least 15 minutes after your Start time.',
        });
        return;
      }

      const cacheKey = JSON.stringify({
        d: normalizedDump,
        s: startStr,
        f: finishStr,
        e: energyStr,
        r: Boolean(remainingOnly),
      });

      let parsed = getValidCached(planCache, cacheKey);

      if (!parsed) {
        let pendingPromise = inFlightPlans.get(cacheKey);
        if (!pendingPromise) {
          pendingPromise = (async (): Promise<RawModelPlan> => {
            const ai = getAiClient();

            const systemInstruction = `You are Dayline, an expert, humane daily planner.
Users dump everything on their mind in ANY language (or mix of languages). Your job is to turn that brain dump into a realistic, unhurried, chronological plan strictly within their available window.

STRICT SCHEDULING RULES:
1. Language Mirroring: Write ALL task titles, notes, summaryNote, and deferred reasons in the SAME primary language as the user's brain dump.
2. Time Math Integrity: The user has exactly ${availableMinutes} minutes available (from ${startStr} to ${finishStr}). The sum of durationMinutes across all "blocks" MUST NOT exceed ${availableMinutes} minutes.
3. Realistic Pacing & Buffers:
   - Never pack 100% of hours with nonstop heavy work. Insert realistic transition/rest/meal breaks (category: "break", energyDemand: "Recovery", 10 to 45 mins) every 60-90 minutes of deep work, and meal breaks if crossing standard meal hours (e.g. 12:30-13:30 or 19:00-20:00).
   - Group small administrative chores (emails, calls, quick messages) or errands (groceries, laundry) logically instead of scattering context switches everywhere.
   - Respect urgency cues (e.g., "due tomorrow", "urgent") by prioritizing them early when focus is freshest.
4. Energy Adaptation (User's energy today is "${energyStr.toUpperCase()}"):
   - If HIGH: Front-load demanding deep work blocks (60-90m), tackle urgent analytical tasks early, keep momentum crisp.
   - If MEDIUM: Cap individual deep focus blocks at 45-60m with 15m breathers between them; alternate cognitive work with lighter admin/physical tasks.
   - If LOW: Be extra gentle. Break scary tasks into approachable 25-40m starter blocks, insert generous recovery breaks, prioritize only true must-dos (like assignments due tomorrow), and defer non-urgent heavy items to "deferred".
5. Honest Overflow ("deferred"):
   - If the tasks + humane breaks exceed ${availableMinutes} minutes (or exceed what a ${energyStr} energy human can realistically sustain), DO NOT shrink a 90-minute assignment into an unrealistic 15-minute slot. Instead, schedule the highest-priority items properly and place the excess in "deferred" with an honest, reassuring reason.
6. Categories:
   - "focus": Deep studying, coding, writing, assignments, reading.
   - "routine": Admin, emails, calling family, laundry, tidying, habits.
   - "errand": Gym, groceries, commuting, appointments outside.
   - "break": Rest, coffee/tea walk, lunch, dinner, screen break.`;

            const userPrompt = remainingOnly
              ? `Re-plan these remaining unfinished items realistically for the remaining window ${startStr} to ${finishStr} (${availableMinutes} minutes total) with ${energyStr.toUpperCase()} energy:\n\n${normalizedDump}`
              : `Brain dump:\n"""\n${normalizedDump}\n"""\n\nWindow: ${startStr} to ${finishStr} (${availableMinutes} minutes available)\nEnergy today: ${energyStr.toUpperCase()}`;

            try {
              const result = await generatePlanWithRetry(ai, systemInstruction, userPrompt);
              setBoundedCache(planCache, cacheKey, result);
              return result;
            } catch (upstreamErr: unknown) {
              const msg =
                upstreamErr instanceof Error ? upstreamErr.message : String(upstreamErr);
              const isQuotaOrOverload =
                msg.includes('RESOURCE_EXHAUSTED') ||
                msg.includes('429') ||
                msg.includes('503') ||
                msg.includes('UNAVAILABLE');

              if (isQuotaOrOverload) {
                console.warn(
                  '[Dayline] Serving local fallback plan while Gemini Free Tier quota cools down.'
                );
                return buildLocalFallbackPlan(normalizedDump, availableMinutes, energyStr);
              }
              throw upstreamErr;
            }
          })();

          inFlightPlans.set(cacheKey, pendingPromise);
        }

        try {
          parsed = await pendingPromise;
        } finally {
          inFlightPlans.delete(cacheKey);
        }
      }

      let cursor = parseHHMM(startStr);
      const maxEndCursor = cursor + availableMinutes;
      const validCategories = new Set(['focus', 'routine', 'errand', 'break']);
      const validEnergy = new Set(['High', 'Medium', 'Low', 'Recovery']);
      const nowStamp = Date.now();

      const finalBlocks: Array<{
        id: string;
        startTime: string;
        endTime: string;
        durationMinutes: number;
        title: string;
        category: string;
        energyDemand: string;
        note: string;
        completed: boolean;
      }> = [];

      const extraDeferred: Array<{
        id: string;
        title: string;
        estimatedMinutes: number;
        reason: string;
      }> = [];

      const rawBlocks = Array.isArray(parsed.blocks) ? parsed.blocks : [];
      rawBlocks.forEach((b, idx) => {
        const rawDur = Number(b.durationMinutes) || 30;
        const dur = Math.max(5, Math.round(rawDur / 5) * 5);
        const cat = validCategories.has(String(b.category)) ? String(b.category) : 'routine';
        const demand = validEnergy.has(String(b.energyDemand)) ? String(b.energyDemand) : 'Medium';
        const title = String(b.title || 'Untitled block').trim();
        const note = String(b.note || '').trim();

        if (cursor + dur <= maxEndCursor) {
          const blockStart = formatHHMM(cursor);
          const blockEnd = formatHHMM(cursor + dur);
          cursor += dur;
          finalBlocks.push({
            id: `blk-${nowStamp}-${idx}`,
            startTime: blockStart,
            endTime: blockEnd,
            durationMinutes: dur,
            title,
            category: cat,
            energyDemand: demand,
            note,
            completed: false,
          });
        } else if (cursor < maxEndCursor && maxEndCursor - cursor >= 15 && cat !== 'break') {
          const remainingDur = Math.floor((maxEndCursor - cursor) / 5) * 5;
          const blockStart = formatHHMM(cursor);
          const blockEnd = formatHHMM(cursor + remainingDur);
          cursor += remainingDur;
          finalBlocks.push({
            id: `blk-${nowStamp}-${idx}`,
            startTime: blockStart,
            endTime: blockEnd,
            durationMinutes: remainingDur,
            title,
            category: cat,
            energyDemand: demand,
            note,
            completed: false,
          });
        } else if (cat !== 'break') {
          extraDeferred.push({
            id: `def-extra-${nowStamp}-${idx}`,
            title,
            estimatedMinutes: dur,
            reason: 'Exceeded your finish time window.',
          });
        }
      });

      const modelDeferred = Array.isArray(parsed.deferred)
        ? parsed.deferred.map((d, idx) => ({
            id: `def-${nowStamp}-${idx}`,
            title: String(d.title || 'Deferred task').trim(),
            estimatedMinutes: Math.max(10, Number(d.estimatedMinutes) || 30),
            reason: String(d.reason || 'Saved for tomorrow to keep today realistic.').trim(),
          }))
        : [];

      res.json({
        detectedLanguage: String(parsed.detectedLanguage || 'English'),
        summaryNote: String(
          parsed.summaryNote ||
            'Paced around your available hours with breathing room between focus blocks.'
        ),
        blocks: finalBlocks,
        deferred: [...modelDeferred, ...extraDeferred],
      });
    } catch (err: unknown) {
      console.warn('[Dayline] /api/plan failed:', summarizeGeminiError(err));
      const mapped = mapGeminiErrorToResponse(err);
      res.status(mapped.status).json({ error: mapped.error });
    }
  });


  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Dayline server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
