import test from 'node:test';
import assert from 'node:assert/strict';
import {
  preClassifyModel,
  verifySingleModel,
  shouldSkipVerification,
  buildVerificationReport,
  getSummaryByCategory,
  VerifiedModelRecord,
} from './verifierEngine';
import { PROVIDERS_CATALOG, getAllCatalogModels } from '../data/providersData';

test('Step 1: preClassifyModel accurately matches all 9 categories without API calls', () => {
  assert.equal(preClassifyModel('black-forest-labs/flux-1-schnell').guessedCategory, 'image');
  assert.equal(preClassifyModel('imagen-3.0-generate-002').guessedCategory, 'image');
  assert.equal(preClassifyModel('whisper-large-v3-turbo').guessedCategory, 'audio');
  assert.equal(preClassifyModel('veo-2.0-generate-001').guessedCategory, 'video');
  assert.equal(preClassifyModel('@cf/baai/bge-large-en-v1.5').guessedCategory, 'embedding');
  assert.equal(preClassifyModel('nvidia/nv-embedqa-e5-v5').guessedCategory, 'embedding');
  assert.equal(preClassifyModel('rerank-v3.5').guessedCategory, 'rerank');
  assert.equal(preClassifyModel('nvidia/nemotron-3.5-super-vl:free').guessedCategory, 'vision');
  assert.equal(preClassifyModel('glm-4.6v-flash').guessedCategory, 'vision');
  assert.equal(preClassifyModel('perplexity/sonar-deep-research:free').guessedCategory, 'research');
  assert.equal(preClassifyModel('groq/compound').guessedCategory, 'research');
  assert.equal(preClassifyModel('mistral-ocr-document-latest').guessedCategory, 'pdf');
  assert.equal(preClassifyModel('llama-3.3-70b-versatile').guessedCategory, 'text');
});

test('Step 2: verifySingleModel confirms capability and handles up to 2 fallback attempts', async () => {
  const registry = new Map<string, VerifiedModelRecord>();

  // 1. Normal vision model
  const visionRes = await verifySingleModel(
    {
      provider: 'OpenRouter',
      model_id: 'nvidia/nemotron-3.5-super-vl:free',
      display_name: 'Nemotron VL',
      max_context: '1M',
      rate_limit: '20 RPM',
    },
    registry
  );
  assert.equal(visionRes.status, 'active');
  assert.equal(visionRes.confirmed_category, 'vision');
  assert.equal(visionRes.verification_method, 'chat_probe');
  assert.equal(visionRes.fallback_attempts, 0);

  // 2. Fallback model: guessed 'vision' fails with wrong_input_type, falls back to 'text' and succeeds
  const fallbackRes = await verifySingleModel(
    {
      provider: 'NVIDIA NIM',
      model_id: 'nvidia/cosmos-vision-chat-hybrid',
      display_name: 'Cosmos Hybrid',
      max_context: '128K',
      rate_limit: '40 RPM',
      simulated_behavior: 'fallback_to_text',
    },
    registry
  );
  assert.equal(fallbackRes.status, 'active');
  assert.equal(fallbackRes.guessed_category, 'vision');
  assert.equal(fallbackRes.confirmed_category, 'text');
  assert.equal(fallbackRes.fallback_attempts, 1);

  // 3. Exhausting 2 fallback attempts marks confirmed_category as "unknown"
  let attemptsMade = 0;
  const exhaustedRes = await verifySingleModel(
    {
      provider: 'TestProvider',
      model_id: 'broken-flux-model',
      display_name: 'Broken Flux',
      max_context: '4K',
      rate_limit: '10 RPM',
    },
    registry,
    {},
    async () => {
      attemptsMade++;
      return {
        ok: false,
        errorType: 'unsupported_endpoint',
        responseNote: 'Endpoint rejected input',
        sampleResponse: '{"error": "unsupported"}',
      };
    }
  );
  // Primary + 2 fallbacks = 3 total calls (2 fallback retries)
  assert.equal(attemptsMade, 3);
  assert.equal(exhaustedRes.fallback_attempts, 2);
  assert.equal(exhaustedRes.confirmed_category, 'unknown');
  assert.equal(exhaustedRes.status, 'error');
});

test('Step 3 & Step 5: buildVerificationReport and getSummaryByCategory include ONLY active models', async () => {
  const registry = new Map<string, VerifiedModelRecord>();
  const models = getAllCatalogModels();
  for (const m of models) {
    await verifySingleModel(m, registry);
  }

  const report = buildVerificationReport(registry.values(), '2026-10-23T09:00:00.000Z');
  assert.equal(report.report_generated_at, '2026-10-23T09:00:00.000Z');
  assert.equal(report.models.length, models.length);

  // Retired models must be inactive and NOT in summary_by_category
  const retired = report.models.find((m) => m.model_id === 'glm-4-5-flash-retirement-announced');
  assert.ok(retired);
  assert.equal(retired.status, 'inactive');

  const allSummarized = Object.values(report.summary_by_category).flat();
  assert.equal(
    allSummarized.includes('Z AI (Zhipu AI)/glm-4-5-flash-retirement-announced'),
    false
  );
  assert.equal(allSummarized.includes('Groq/llama-3.3-70b-versatile'), true);
  assert.equal(report.summary_by_category.image.includes('Google Gemini/imagen-3.0-generate-002'), true);
  assert.equal(report.summary_by_category.rerank.includes('Cohere/rerank-v3.5'), true);
});

test('Step 4: Caching / re-verification rule skips confirmed active models and respects modality intervals', () => {
  const baseTime = Date.parse('2026-10-20T00:00:00.000Z');
  const activeTextRecord: VerifiedModelRecord = {
    provider: 'Groq',
    model_id: 'llama-3.3-70b-versatile',
    status: 'active',
    confirmed_category: 'text',
    verification_method: 'chat_probe',
    last_verified_at: new Date(baseTime).toISOString(),
    notes: '200 OK',
  };

  const activeVideoRecord: VerifiedModelRecord = {
    provider: 'Google Gemini',
    model_id: 'veo-2.0-generate-001',
    status: 'active',
    confirmed_category: 'video',
    verification_method: 'video_probe',
    last_verified_at: new Date(baseTime).toISOString(),
    notes: '200 OK',
  };

  // Default behavior: skip confirmed active models
  assert.equal(shouldSkipVerification('Groq/llama-3.3-70b-versatile', activeTextRecord).skip, true);

  // Force re-verify: do not skip
  assert.equal(
    shouldSkipVerification('Groq/llama-3.3-70b-versatile', activeTextRecord, { forceReverify: true }).skip,
    false
  );

  // Provider reported model updated: do not skip
  assert.equal(
    shouldSkipVerification('Groq/llama-3.3-70b-versatile', activeTextRecord, {
      providerUpdatedModels: new Set(['Groq/llama-3.3-70b-versatile']),
    }).skip,
    false
  );

  // Interval check after 48 hours: cheap modality (24h threshold) re-verifies, expensive modality (168h weekly threshold) still skips!
  const after48Hours = baseTime + 48 * 3600 * 1000;
  assert.equal(
    shouldSkipVerification('Groq/llama-3.3-70b-versatile', activeTextRecord, {
      enforceIntervalCheck: true,
      cheapModalityIntervalHours: 24,
      expensiveModalityIntervalHours: 168,
      nowMs: after48Hours,
    }).skip,
    false
  );
  assert.equal(
    shouldSkipVerification('Google Gemini/veo-2.0-generate-001', activeVideoRecord, {
      enforceIntervalCheck: true,
      cheapModalityIntervalHours: 24,
      expensiveModalityIntervalHours: 168,
      nowMs: after48Hours,
    }).skip,
    true
  );
});

test('Provider directory includes all 30 providers properly separated by registration requirement', () => {
  assert.equal(PROVIDERS_CATALOG.length, 30);
  const noReg = PROVIDERS_CATALOG.filter((p) => p.group === 'no_registration');
  const regReq = PROVIDERS_CATALOG.filter((p) => p.group === 'registration_required');
  const phoneReq = PROVIDERS_CATALOG.filter((p) => p.group === 'phone_verification');

  assert.equal(noReg.length, 10);
  assert.equal(regReq.length, 19);
  assert.equal(phoneReq.length, 1);
});
