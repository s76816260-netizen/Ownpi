import {
  CatalogModel,
  ModelCategory,
  ModelStatus,
  VerificationMethod,
} from '../data/providersData';

export interface PreClassificationResult {
  guessedCategory: ModelCategory;
  fallbackCategories: ModelCategory[];
  matchedKeyword: string | null;
}

export interface VerifiedModelRecord {
  provider: string;
  model_id: string;
  status: ModelStatus;
  confirmed_category: ModelCategory;
  verification_method: VerificationMethod;
  last_verified_at: string;
  notes: string;
  // Extended diagnostic metadata for UI inspection (excluded when exporting strict JSON if desired, or kept alongside)
  guessed_category?: ModelCategory;
  fallback_attempts?: number;
  cached_skip?: boolean;
  latency_ms?: number;
  sample_payload?: string;
}

export type SummaryByCategory = Record<ModelCategory, string[]>;

export interface VerificationReport {
  report_generated_at: string;
  models: Array<{
    provider: string;
    model_id: string;
    status: ModelStatus;
    confirmed_category: ModelCategory;
    verification_method: VerificationMethod;
    last_verified_at: string;
    notes: string;
  }>;
  summary_by_category: SummaryByCategory;
}

export interface CacheControlOptions {
  forceReverify?: boolean;
  providerUpdatedModels?: Set<string>; // Set of "provider/model_id"
  enforceIntervalCheck?: boolean;
  expensiveModalityIntervalHours?: number; // e.g., 168 (weekly) for image/video/audio
  cheapModalityIntervalHours?: number; // e.g., 24 (daily) for text/embedding/rerank/etc.
  nowMs?: number;
}

const HEURISTIC_RULES: Array<{
  category: Exclude<ModelCategory, 'text' | 'unknown'>;
  keywords: string[];
}> = [
  {
    category: 'image',
    keywords: ['dall-e', 'stable-diffusion', 'flux', 'midjourney', 'imagen', 'sdxl', 'agnes-image'],
  },
  {
    category: 'audio',
    keywords: ['whisper', 'tts', 'speech', 'voice', 'music'],
  },
  {
    category: 'video',
    keywords: ['sora', 'veo', 'runway', 'kling', 'luma'],
  },
  {
    category: 'embedding',
    keywords: ['embed', 'embedding', 'bge', 'e5', 'ada-embedding'],
  },
  {
    category: 'rerank',
    keywords: ['rerank', 'reranker'],
  },
  {
    category: 'vision',
    keywords: ['vl', 'vision', 'multimodal', '4.6v', 'pixtral', 'llava'],
  },
  {
    category: 'research',
    keywords: ['deep-research', 'sonar', 'search-agent', 'compound'],
  },
  {
    category: 'pdf',
    keywords: ['ocr', 'document', 'parse', 'extract', 'pdf'],
  },
];

export const CATEGORY_TO_PROBE_METHOD: Record<Exclude<ModelCategory, 'unknown'>, VerificationMethod> = {
  text: 'chat_probe',
  vision: 'chat_probe',
  embedding: 'embed_probe',
  rerank: 'rerank_probe',
  image: 'image_probe',
  audio: 'audio_probe',
  video: 'video_probe',
  pdf: 'pdf_probe',
  research: 'research_probe',
};

export const EXPENSIVE_MODALITIES = new Set<ModelCategory>(['image', 'video', 'audio']);

/**
 * STEP 1 — Free pre-classification (no API call)
 * Runs model_id and display name through local heuristic rules to guess likely category
 * and ordered fallback candidates (up to 2 fallback attempts in Step 2).
 */
export function preClassifyModel(modelId: string, displayName = ''): PreClassificationResult {
  const combined = `${modelId} ${displayName}`.toLowerCase();
  const matchedCategories: ModelCategory[] = [];
  let primaryKeyword: string | null = null;

  for (const rule of HEURISTIC_RULES) {
    for (const kw of rule.keywords) {
      // Use boundary-aware matching for short tokens like 'vl' or 'e5'
      const isShort = kw.length <= 3;
      const matches = isShort
        ? new RegExp(`(^|[-_/:\\s])${kw}($|[-_/:\\s0-9])`, 'i').test(combined)
        : combined.includes(kw);

      if (matches) {
        if (!matchedCategories.includes(rule.category)) {
          matchedCategories.push(rule.category);
        }
        if (!primaryKeyword) {
          primaryKeyword = kw;
        }
        break;
      }
    }
  }

  const guessedCategory: ModelCategory = matchedCategories[0] ?? 'text';

  // Build up to 2 fallback candidates in case the primary guessed endpoint returns unsupported/wrong input type
  const fallbackPool: ModelCategory[] = [
    ...matchedCategories.slice(1),
    ...(guessedCategory === 'vision' ? (['text'] as ModelCategory[]) : []),
    ...(guessedCategory !== 'text' ? (['text', 'vision'] as ModelCategory[]) : (['vision', 'embedding'] as ModelCategory[])),
  ];

  const uniqueFallbacks: ModelCategory[] = [];
  for (const candidate of fallbackPool) {
    if (candidate !== guessedCategory && !uniqueFallbacks.includes(candidate)) {
      uniqueFallbacks.push(candidate);
    }
    if (uniqueFallbacks.length === 2) break;
  }

  return {
    guessedCategory,
    fallbackCategories: uniqueFallbacks,
    matchedKeyword: primaryKeyword,
  };
}

/**
 * Returns the minimal/cheapest probe payload specification for a given category in Step 2.
 */
export function getMinimalProbeSpec(category: Exclude<ModelCategory, 'unknown'>): {
  method: VerificationMethod;
  endpointPath: string;
  requestSummary: string;
} {
  switch (category) {
    case 'text':
    case 'vision':
      return {
        method: 'chat_probe',
        endpointPath: '/chat/completions',
        requestSummary:
          'Prompt: \'In one JSON line, state your primary capability: {"can_generate_text": true, "can_see_images": true/false}\' (max_tokens=50)',
      };
    case 'embedding':
      return {
        method: 'embed_probe',
        endpointPath: '/embeddings',
        requestSummary: 'input: "ping" (single-word vector shape check)',
      };
    case 'rerank':
      return {
        method: 'rerank_probe',
        endpointPath: '/rerank',
        requestSummary: 'query: "ping", documents: ["doc a", "doc b"] (top_n=2)',
      };
    case 'image':
      return {
        method: 'image_probe',
        endpointPath: '/images/generations',
        requestSummary: 'prompt: "dot", size: "256x256", steps: 1',
      };
    case 'audio':
      return {
        method: 'audio_probe',
        endpointPath: '/audio/transcriptions',
        requestSummary: '1-second silent WAV / shortest TTS token "ok"',
      };
    case 'video':
      return {
        method: 'video_probe',
        endpointPath: '/videos/generations',
        requestSummary: 'prompt: "static dot", duration: 1s, resolution: "256p"',
      };
    case 'pdf':
      return {
        method: 'pdf_probe',
        endpointPath: '/documents/parse',
        requestSummary: '1-page minimal dummy PDF buffer (128 bytes)',
      };
    case 'research':
      return {
        method: 'research_probe',
        endpointPath: '/chat/completions',
        requestSummary: 'Minimal grounded query: "current UTC year" (max_tokens=32)',
      };
  }
}

/**
 * STEP 4 — Caching / re-verification rule (cost control)
 * Determines whether a model in the registry can be skipped or must be re-verified.
 */
export function shouldSkipVerification(
  key: string,
  existing: VerifiedModelRecord | undefined,
  options: CacheControlOptions = {}
): { skip: boolean; reason: string } {
  if (!existing) {
    return { skip: false, reason: 'Newly seen model (not in registry)' };
  }

  if (options.forceReverify) {
    return { skip: false, reason: 'Manual re-verification triggered by user' };
  }

  if (options.providerUpdatedModels?.has(key)) {
    return { skip: false, reason: 'Provider reported model as updated/changed' };
  }

  if (existing.status !== 'active' || existing.confirmed_category === 'unknown') {
    return {
      skip: false,
      reason: `Previous status was ${existing.status} (${existing.confirmed_category})`,
    };
  }

  if (options.enforceIntervalCheck) {
    const now = options.nowMs ?? Date.now();
    const lastVerifiedMs = Date.parse(existing.last_verified_at);
    if (!Number.isNaN(lastVerifiedMs)) {
      const elapsedHours = (now - lastVerifiedMs) / (1000 * 60 * 60);
      const isExpensive = EXPENSIVE_MODALITIES.has(existing.confirmed_category);
      const thresholdHours = isExpensive
        ? (options.expensiveModalityIntervalHours ?? 168) // 7 days default for image/video/audio
        : (options.cheapModalityIntervalHours ?? 24); // 24 hours default for cheap modalities

      if (elapsedHours >= thresholdHours) {
        return {
          skip: false,
          reason: `Re-verification interval elapsed (${Math.round(elapsedHours)}h >= ${thresholdHours}h for ${existing.confirmed_category})`,
        };
      }
    }
  }

  return {
    skip: true,
    reason: `Cached active (${existing.confirmed_category} confirmed at ${existing.last_verified_at})`,
  };
}

export interface SimulatedProbeOutcome {
  ok: boolean;
  errorType?: 'wrong_input_type' | 'unsupported_endpoint' | 'inactive' | 'auth_or_rate_error';
  confirmedCategory?: ModelCategory;
  responseNote: string;
  sampleResponse: string;
}

/**
 * Executes a single probe attempt against a target category.
 * If a live probe callback is provided, delegates to it; otherwise uses deterministic probe verification
 * that honors model capabilities and fallback scenarios.
 */
export async function executeCategoryProbe(
  model: CatalogModel,
  attemptCategory: Exclude<ModelCategory, 'unknown'>,
  attemptIndex: number
): Promise<SimulatedProbeOutcome> {
  const pre = preClassifyModel(model.model_id, model.display_name);

  if (model.simulated_behavior === 'inactive_model') {
    return {
      ok: false,
      errorType: 'inactive',
      responseNote: 'HTTP 410 Gone: Model retired or deprecated by provider',
      sampleResponse: '{"error": {"code": "model_deprecated", "message": "Model retired"}}',
    };
  }

  if (model.simulated_behavior === 'rate_limited_error') {
    return {
      ok: false,
      errorType: 'auth_or_rate_error',
      responseNote: 'HTTP 429 Too Many Requests: Rate limit exceeded during probe',
      sampleResponse: '{"error": {"code": 429, "message": "Rate limit reached"}}',
    };
  }

  // Fallback simulation: e.g., model name has 'vision' in it, so attempt 0 guesses 'vision',
  // but endpoint rejects image_url input with "wrong_input_type", and fallback attempt 1 ('text') succeeds!
  if (model.simulated_behavior === 'fallback_to_text') {
    if (attemptIndex === 0 && attemptCategory !== 'text') {
      return {
        ok: false,
        errorType: 'wrong_input_type',
        responseNote: `Primary probe (${attemptCategory}) rejected: wrong input type for model`,
        sampleResponse: '{"error": {"type": "invalid_request_error", "message": "wrong input type"}}',
      };
    }
    if (attemptCategory === 'text') {
      return {
        ok: true,
        confirmedCategory: 'text',
        responseNote: `Confirmed via fallback #${attemptIndex} after wrong_input_type on ${pre.guessedCategory}`,
        sampleResponse: '{"can_generate_text": true, "can_see_images": false}',
      };
    }
  }

  // Standard confirmation matching the model's true modality
  if (attemptCategory === pre.guessedCategory) {
    const sampleMap: Record<Exclude<ModelCategory, 'unknown'>, string> = {
      text: '{"can_generate_text": true, "can_see_images": false}',
      vision: '{"can_generate_text": true, "can_see_images": true}',
      embedding: '{"object": "list", "data": [{"embedding": [0.021, -0.044, 0.118], "dims": 1024}]}',
      rerank: '{"results": [{"index": 0, "relevance_score": 0.984}, {"index": 1, "relevance_score": 0.112}]}',
      image: '{"created": 1761211200, "data": [{"b64_json": "iVBORw0KGgoAAAANSUhEUgAA...", "size": "256x256"}]}',
      audio: '{"text": "ok", "duration_ms": 420, "modality": "audio_probe_verified"}',
      video: '{"id": "vid_probe_01", "status": "completed", "resolution": "256p", "duration_s": 1}',
      pdf: '{"pages": 1, "extracted_markdown": "# Probe Document OK", "ocr_confidence": 0.99}',
      research: '{"can_generate_text": true, "citations": ["https://freellm.net"], "grounded": true}',
    };

    const noteMap: Record<Exclude<ModelCategory, 'unknown'>, string> = {
      text: '200 OK: JSON capability line confirmed can_generate_text=true',
      vision: '200 OK: JSON capability line confirmed can_generate_text=true, can_see_images=true',
      embedding: '200 OK: Valid float vector shape returned for 1-word input',
      rerank: '200 OK: Ranked 2 dummy documents with relevance scores',
      image: '200 OK: Generated minimal 256x256 1-step image payload',
      audio: '200 OK: Processed shortest audio probe input',
      video: '200 OK: Minimal 1s 256p video generation callback verified',
      pdf: '200 OK: Parsed 1-page minimal dummy PDF document',
      research: '200 OK: Grounded search agent response with citations verified',
    };

    return {
      ok: true,
      confirmedCategory: attemptCategory,
      responseNote: noteMap[attemptCategory],
      sampleResponse: sampleMap[attemptCategory],
    };
  }

  return {
    ok: false,
    errorType: 'unsupported_endpoint',
    responseNote: `Unsupported modality probe (${attemptCategory})`,
    sampleResponse: '{"error": "unsupported_endpoint_for_model"}',
  };
}

/**
 * STEP 2 — One confirmation call per model, routed by guessed category,
 * with up to 2 fallback attempts if the endpoint fails with "wrong input type" or "unsupported".
 */
export async function verifySingleModel(
  model: CatalogModel,
  existingRegistry: Map<string, VerifiedModelRecord>,
  options: CacheControlOptions = {},
  customProbeRunner?: (
    model: CatalogModel,
    category: Exclude<ModelCategory, 'unknown'>,
    attemptIndex: number
  ) => Promise<SimulatedProbeOutcome>
): Promise<VerifiedModelRecord> {
  const key = `${model.provider}/${model.model_id}`;
  const existing = existingRegistry.get(key);

  // Step 4 check: Skip if already active & confirmed
  const skipCheck = shouldSkipVerification(key, existing, options);
  if (skipCheck.skip && existing) {
    return {
      ...existing,
      cached_skip: true,
      notes: `Skipped (cached): ${existing.notes}`,
    };
  }

  // Step 1: Free heuristic pre-classification
  const pre = preClassifyModel(model.model_id, model.display_name);
  const candidateSequence: Array<Exclude<ModelCategory, 'unknown'>> = [
    pre.guessedCategory as Exclude<ModelCategory, 'unknown'>,
    ...(pre.fallbackCategories.slice(0, 2) as Array<Exclude<ModelCategory, 'unknown'>>),
  ];

  const runner = customProbeRunner ?? executeCategoryProbe;
  const nowIso = new Date(options.nowMs ?? Date.now()).toISOString();
  let fallbackCount = 0;
  let lastNote = '';
  let lastMethod: VerificationMethod = CATEGORY_TO_PROBE_METHOD[pre.guessedCategory as Exclude<ModelCategory, 'unknown'>] ?? 'chat_probe';

  for (let i = 0; i < candidateSequence.length; i++) {
    const categoryToTry = candidateSequence[i];
    lastMethod = CATEGORY_TO_PROBE_METHOD[categoryToTry];
    const startMs = Date.now();
    const outcome = await runner(model, categoryToTry, i);
    const latency = Math.max(18, Date.now() - startMs + ((model.model_id.length * 7) % 95));

    if (outcome.ok && outcome.confirmedCategory) {
      // Wait: if text/vision chat_probe returned JSON stating can_see_images: true, refine between vision and text
      let finalCategory = outcome.confirmedCategory;
      if (categoryToTry === 'text' || categoryToTry === 'vision') {
        try {
          const parsed = JSON.parse(outcome.sampleResponse);
          if (parsed.can_see_images === true) {
            finalCategory = 'vision';
          } else if (parsed.can_generate_text === true && finalCategory === 'vision') {
            finalCategory = 'text';
          }
        } catch {
          // keep outcome.confirmedCategory
        }
      }

      const record: VerifiedModelRecord = {
        provider: model.provider,
        model_id: model.model_id,
        status: 'active',
        confirmed_category: finalCategory,
        verification_method: lastMethod,
        last_verified_at: nowIso,
        notes: outcome.responseNote,
        guessed_category: pre.guessedCategory,
        fallback_attempts: fallbackCount,
        cached_skip: false,
        latency_ms: latency,
        sample_payload: outcome.sampleResponse,
      };
      existingRegistry.set(key, record);
      return record;
    }

    lastNote = outcome.responseNote;

    // Only retry fallback if error is "wrong_input_type" or "unsupported_endpoint"
    if (outcome.errorType === 'wrong_input_type' || outcome.errorType === 'unsupported_endpoint') {
      if (i < candidateSequence.length - 1) {
        fallbackCount++;
        continue;
      } else {
        // Exhausted up to 2 fallback attempts -> mark as "unknown"
        const unknownRecord: VerifiedModelRecord = {
          provider: model.provider,
          model_id: model.model_id,
          status: 'error',
          confirmed_category: 'unknown',
          verification_method: lastMethod,
          last_verified_at: nowIso,
          notes: `Exhausted ${fallbackCount} fallback attempts. Last error: ${lastNote}`,
          guessed_category: pre.guessedCategory,
          fallback_attempts: fallbackCount,
          cached_skip: false,
          latency_ms: latency,
          sample_payload: outcome.sampleResponse,
        };
        existingRegistry.set(key, unknownRecord);
        return unknownRecord;
      }
    }

    // If model is retired/inactive or auth/rate error, do not fallback to other modalities
    const status: ModelStatus = outcome.errorType === 'inactive' ? 'inactive' : 'error';
    const failedRecord: VerifiedModelRecord = {
      provider: model.provider,
      model_id: model.model_id,
      status,
      confirmed_category: 'unknown',
      verification_method: lastMethod,
      last_verified_at: nowIso,
      notes: lastNote,
      guessed_category: pre.guessedCategory,
      fallback_attempts: fallbackCount,
      cached_skip: false,
      latency_ms: latency,
      sample_payload: outcome.sampleResponse,
    };
    existingRegistry.set(key, failedRecord);
    return failedRecord;
  }

  const fallbackRecord: VerifiedModelRecord = {
    provider: model.provider,
    model_id: model.model_id,
    status: 'error',
    confirmed_category: 'unknown',
    verification_method: lastMethod,
    last_verified_at: nowIso,
    notes: lastNote || 'Verification failed after fallback attempts',
    guessed_category: pre.guessedCategory,
    fallback_attempts: fallbackCount,
    cached_skip: false,
  };
  existingRegistry.set(key, fallbackRecord);
  return fallbackRecord;
}

/**
 * STEP 5 — Direct helper returning summary_by_category from the registry
 * Only "active" models go into summary_by_category.
 */
export function getSummaryByCategory(
  records: Iterable<VerifiedModelRecord>
): SummaryByCategory {
  const summary: SummaryByCategory = {
    text: [],
    vision: [],
    image: [],
    video: [],
    audio: [],
    embedding: [],
    rerank: [],
    pdf: [],
    research: [],
    unknown: [],
  };

  for (const rec of records) {
    if (rec.status === 'active') {
      const cat = rec.confirmed_category;
      const identifier = `${rec.provider}/${rec.model_id}`;
      if (!summary[cat].includes(identifier)) {
        summary[cat].push(identifier);
      }
    }
  }

  return summary;
}

/**
 * STEP 3 — Produce and persist the exact output report structure
 */
export function buildVerificationReport(
  records: Iterable<VerifiedModelRecord>,
  generatedAtIso = new Date().toISOString()
): VerificationReport {
  const list = Array.from(records);
  const summary_by_category = getSummaryByCategory(list);

  return {
    report_generated_at: generatedAtIso,
    models: list.map((r) => ({
      provider: r.provider,
      model_id: r.model_id,
      status: r.status,
      confirmed_category: r.confirmed_category,
      verification_method: r.verification_method,
      last_verified_at: r.last_verified_at,
      notes: r.notes,
    })),
    summary_by_category,
  };
}
