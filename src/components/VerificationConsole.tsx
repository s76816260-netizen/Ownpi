import React, { useState, useMemo } from 'react';
import {
  Play,
  RotateCcw,
  Download,
  Copy,
  Check,
  Search,
  RefreshCw,
  Sliders,
  FileJson,
  ArrowRight,
} from 'lucide-react';
import {
  ModelCategory,
  PROVIDERS_CATALOG,
} from '../data/providersData';
import {
  VerifiedModelRecord,
  VerificationReport,
  getMinimalProbeSpec,
  EXPENSIVE_MODALITIES,
} from '../utils/verifierEngine';

interface VerificationConsoleProps {
  records: VerifiedModelRecord[];
  report: VerificationReport;
  isRunning: boolean;
  lastRunStats: {
    probedCount: number;
    skippedCachedCount: number;
    fallbackTriggeredCount: number;
    durationMs: number;
  };
  enforceIntervals: boolean;
  setEnforceIntervals: (val: boolean) => void;
  expensiveIntervalHours: number;
  setExpensiveIntervalHours: (val: number) => void;
  cheapIntervalHours: number;
  setCheapIntervalHours: (val: number) => void;
  onRunVerification: (options: { forceReverify?: boolean; simulateUpdate?: boolean }) => void;
  onTriggerFallbackDemo: () => void;
  onVerifySingleModel: (providerName: string, modelId: string) => void;
}

const ALL_CATEGORIES: ModelCategory[] = [
  'text',
  'vision',
  'image',
  'video',
  'audio',
  'embedding',
  'rerank',
  'pdf',
  'research',
  'unknown',
];

export const VerificationConsole: React.FC<VerificationConsoleProps> = ({
  records,
  report,
  isRunning,
  lastRunStats,
  enforceIntervals,
  setEnforceIntervals,
  expensiveIntervalHours,
  setExpensiveIntervalHours,
  cheapIntervalHours,
  setCheapIntervalHours,
  onRunVerification,
  onTriggerFallbackDemo,
  onVerifySingleModel,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<ModelCategory | 'all'>('all');
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<'all' | 'no_registration' | 'registration_required' | 'phone_verification'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'error'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedJson, setCopiedJson] = useState(false);
  const [showJsonPanel, setShowJsonPanel] = useState(false);

  const providerGroupLookup = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of PROVIDERS_CATALOG) {
      map.set(p.name, p.group);
    }
    return map;
  }, []);

  const filteredRecords = useMemo(() => {
    return records.filter((rec) => {
      if (selectedCategory !== 'all' && rec.confirmed_category !== selectedCategory) {
        return false;
      }
      if (statusFilter !== 'all' && rec.status !== statusFilter) {
        return false;
      }
      if (selectedGroupFilter !== 'all') {
        const grp = providerGroupLookup.get(rec.provider) ?? 'registration_required';
        if (grp !== selectedGroupFilter) return false;
      }
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        return (
          rec.provider.toLowerCase().includes(q) ||
          rec.model_id.toLowerCase().includes(q) ||
          rec.confirmed_category.toLowerCase().includes(q) ||
          rec.verification_method.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [records, selectedCategory, statusFilter, selectedGroupFilter, searchQuery, providerGroupLookup]);

  const activeCount = useMemo(
    () => records.filter((r) => r.status === 'active').length,
    [records]
  );
  const inactiveOrErrorCount = useMemo(
    () => records.filter((r) => r.status !== 'active').length,
    [records]
  );

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  const handleDownloadJson = () => {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'verification_report.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8">
      {/* Top Architecture Overview & Primary Controls */}
      <section className="bg-slate-900/90 border border-slate-800 rounded-xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 pb-6 border-b border-slate-800">
          <div className="space-y-2 max-w-3xl">
            <div className="text-xs font-medium text-sky-400">
              5-Step Capability Verification &amp; Liveness Architecture
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Single-Probe Model Capability Verifier &amp; Report Engine
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed">
              Pre-classifies every free LLM API model via zero-cost local heuristics (Step 1), routes a single minimal modality-specific confirmation call with up to 2 fallback retries (Step 2), persists the structured JSON report (Step 3), enforces cache skipping &amp; interval cost control (Step 4), and exposes <code className="text-sky-300 font-mono text-xs">summary_by_category</code> for instant task routing (Step 5).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => onRunVerification({ forceReverify: false })}
              disabled={isRunning}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-950 bg-sky-400 hover:bg-sky-300 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>{isRunning ? 'Verifying Models...' : 'Run Verification (Smart Cache)'}</span>
            </button>

            <button
              type="button"
              onClick={() => onRunVerification({ forceReverify: true })}
              disabled={isRunning}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Force Re-Verify All</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadJson}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Export Report JSON</span>
            </button>
          </div>
        </div>

        {/* 4-Column Telemetry Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 pt-6">
          <div>
            <div className="text-xs text-slate-400">Total Registry Models</div>
            <div className="mt-1 text-2xl font-bold text-white font-mono tabular-nums">
              {records.length}
            </div>
            <div className="mt-1 text-xs text-slate-400">
              <span>30 Providers</span>
              <span className="mx-1.5" aria-hidden="true">·</span>
              <span>3 Registration Groups</span>
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-400">Confirmed Active Models</div>
            <div className="mt-1 text-2xl font-bold text-emerald-400 font-mono tabular-nums">
              {activeCount}
            </div>
            <div className="mt-1 text-xs text-slate-400 sm:whitespace-nowrap">
              <span>In summary_by_category</span>
              <span className="mx-1.5" aria-hidden="true">·</span>
              <span className="text-amber-400 font-mono tabular-nums">{inactiveOrErrorCount} inactive</span>
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-400">Last Run Cost Control (Step 4)</div>
            <div className="mt-1 text-2xl font-bold text-sky-400 font-mono tabular-nums">
              {lastRunStats.skippedCachedCount} skipped
            </div>
            <div className="mt-1 text-xs text-slate-400 font-mono tabular-nums">
              <span>{lastRunStats.probedCount} probed</span>
              <span className="mx-1.5" aria-hidden="true">·</span>
              <span>{lastRunStats.durationMs}ms</span>
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-400">Fallback Recoveries (Step 2)</div>
            <div className="mt-1 text-2xl font-bold text-white font-mono tabular-nums">
              {lastRunStats.fallbackTriggeredCount}
            </div>
            <div className="mt-1 text-xs text-slate-400">
              <span>Max 2 retries before unknown</span>
            </div>
          </div>
        </div>
      </section>

      {/* Step 4 Cost Control & Step 2 Fallback Interactive Bar */}
      <section className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Sliders className="w-4 h-4 text-sky-400" />
              <span>Step 4 Caching &amp; Modality Interval Policy</span>
            </div>

            <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={enforceIntervals}
                onChange={(e) => setEnforceIntervals(e.target.checked)}
                className="rounded border-slate-700 bg-slate-800 text-sky-500 focus:ring-sky-500"
              />
              <span>Enforce Modality Re-verification Intervals</span>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <label htmlFor="expensive-interval" className="text-slate-400 whitespace-nowrap">
                Expensive (image/video/audio):
              </label>
              <select
                id="expensive-interval"
                value={expensiveIntervalHours}
                onChange={(e) => setExpensiveIntervalHours(Number(e.target.value))}
                className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-xs font-mono text-white"
              >
                <option value={168}>168h (Weekly)</option>
                <option value={336}>336h (Bi-weekly)</option>
                <option value={720}>720h (Monthly)</option>
              </select>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-300">
              <label htmlFor="cheap-interval" className="text-slate-400 whitespace-nowrap">
                Cheap (text/embed/rerank):
              </label>
              <select
                id="cheap-interval"
                value={cheapIntervalHours}
                onChange={(e) => setCheapIntervalHours(Number(e.target.value))}
                className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-xs font-mono text-white"
              >
                <option value={24}>24h (Daily)</option>
                <option value={12}>12h (Twice daily)</option>
                <option value={1}>1h (Hourly)</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800/80">
          <div className="text-xs text-slate-400">
            Active confirmed models are skipped by default on subsequent runs unless updated, expired, or forced.
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => onRunVerification({ simulateUpdate: true })}
              className="px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Simulate Provider Update Event
            </button>
            <button
              type="button"
              onClick={onTriggerFallbackDemo}
              className="px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Test 2-Retry Fallback &rarr; Unknown
            </button>
            <button
              type="button"
              onClick={() => setShowJsonPanel((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-sky-300 bg-sky-950/60 hover:bg-sky-900/60 border border-sky-800/70 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FileJson className="w-3.5 h-3.5" />
              <span>{showJsonPanel ? 'Hide Live JSON Report' : 'Inspect Step 3 JSON Report'}</span>
            </button>
          </div>
        </div>
      </section>

      {/* Collapsible Step 3 Raw JSON Report Viewer */}
      {showJsonPanel && (
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white">
                Step 3 Persisted Output Report (<code className="font-mono text-xs text-sky-300">verification_report.json</code>)
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Generated at <span className="font-mono tabular-nums text-slate-300">{report.report_generated_at}</span> · Only active models are populated in <code className="font-mono text-xs">summary_by_category</code>.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyJson}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {copiedJson ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedJson ? 'Copied JSON' : 'Copy JSON'}</span>
              </button>
            </div>
          </div>
          <pre className="bg-slate-950 border border-slate-800 rounded-lg p-4 text-xs font-mono text-slate-300 overflow-x-auto max-h-96 leading-relaxed">
            {JSON.stringify(report, null, 2)}
          </pre>
        </section>
      )}

      {/* Step 5: Summary By Category Interactive Selector */}
      <section className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-white">
              Step 5: Confirmed Capability Summary (<code className="text-xs font-mono text-sky-400">summary_by_category</code>)
            </h2>
            <p className="text-xs text-slate-400">
              Select a modality below to filter models verified via modality-specific confirmation probes.
            </p>
          </div>
          {selectedCategory !== 'all' && selectedCategory !== 'unknown' && (
            <div className="text-xs text-slate-300 font-mono">
              Endpoint: {getMinimalProbeSpec(selectedCategory).endpointPath} · {getMinimalProbeSpec(selectedCategory).method}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 lg:grid-cols-11 gap-2">
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
              selectedCategory === 'all'
                ? 'bg-sky-500/15 border-sky-500 text-white'
                : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <div className="text-xs text-slate-400 whitespace-nowrap">All Models</div>
            <div className="mt-1 text-lg font-bold font-mono tabular-nums">{records.length}</div>
          </button>

          {ALL_CATEGORIES.map((cat) => {
            const count =
              cat === 'unknown'
                ? records.filter((r) => r.confirmed_category === 'unknown').length
                : report.summary_by_category[cat]?.length ?? 0;
            const isExpensive = EXPENSIVE_MODALITIES.has(cat);

            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-sky-500/15 border-sky-500 text-white'
                    : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-medium capitalize whitespace-nowrap">
                    {cat === 'pdf' ? 'PDF' : cat}
                  </span>
                  {isExpensive && (
                    <span className="text-[10px] text-amber-400 font-mono" title="Expensive modality (weekly cache interval)">
                      7d
                    </span>
                  )}
                </div>
                <div className="mt-1 text-lg font-bold font-mono tabular-nums">{count}</div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Filter Bar & High-Density Verification Table */}
      <section className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by provider, model_id, or probe method..."
              aria-label="Filter verified models"
              className="w-full pl-9 pr-4 py-2 text-sm bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Registration Group Segmented Control */}
            <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg">
              <button
                type="button"
                onClick={() => setSelectedGroupFilter('all')}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  selectedGroupFilter === 'all'
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All Groups
              </button>
              <button
                type="button"
                onClick={() => setSelectedGroupFilter('no_registration')}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  selectedGroupFilter === 'no_registration'
                    ? 'bg-emerald-950/90 text-emerald-300 border border-emerald-800/60'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                No Registration Required
              </button>
              <button
                type="button"
                onClick={() => setSelectedGroupFilter('registration_required')}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  selectedGroupFilter === 'registration_required'
                    ? 'bg-amber-950/90 text-amber-300 border border-amber-800/60'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Registration Required
              </button>
              <button
                type="button"
                onClick={() => setSelectedGroupFilter('phone_verification')}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  selectedGroupFilter === 'phone_verification'
                    ? 'bg-sky-950/90 text-sky-300 border border-sky-800/60'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Phone Verification
              </button>
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg">
              {(['all', 'active', 'inactive', 'error'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-2.5 py-1 text-xs font-medium capitalize rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    statusFilter === st
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-xs font-semibold text-slate-400">
                <th className="py-3 px-4">Provider &amp; Group</th>
                <th className="py-3 px-4">Model ID</th>
                <th className="py-3 px-4">Step 1 Guess &rarr; Step 2 Confirmed</th>
                <th className="py-3 px-4">Verification Method</th>
                <th className="py-3 px-4">Status &amp; Cache</th>
                <th className="py-3 px-4">Notes &amp; Callback Proof</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-sm">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    No models match the current filter criteria. Try selecting "All Models" or clearing the search box.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((rec) => {
                  const grp = providerGroupLookup.get(rec.provider) ?? 'registration_required';
                  const groupLabel =
                    grp === 'no_registration'
                      ? 'No Registration'
                      : grp === 'phone_verification'
                        ? 'Phone Verification'
                        : 'Registration Req.';

                  return (
                    <tr
                      key={`${rec.provider}/${rec.model_id}`}
                      className="hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3 px-4 align-top">
                        <div className="font-medium text-white">{rec.provider}</div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          <span
                            className={
                              grp === 'no_registration'
                                ? 'text-emerald-400'
                                : grp === 'phone_verification'
                                  ? 'text-sky-400'
                                  : 'text-amber-400'
                            }
                          >
                            {groupLabel}
                          </span>
                        </div>
                      </td>

                      <td className="py-3 px-4 align-top font-mono text-xs text-slate-200">
                        <div>{rec.model_id}</div>
                        {rec.latency_ms && (
                          <div className="text-slate-500 mt-0.5 tabular-nums">
                            {rec.latency_ms}ms
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 align-top text-xs">
                        <div className="flex items-center gap-1.5 font-mono">
                          <span className="text-slate-400">{rec.guessed_category ?? rec.confirmed_category}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          <span
                            className={
                              rec.confirmed_category === 'unknown'
                                ? 'text-rose-400 font-semibold'
                                : rec.guessed_category && rec.guessed_category !== rec.confirmed_category
                                  ? 'text-amber-300 font-semibold'
                                  : 'text-sky-300 font-semibold'
                            }
                          >
                            {rec.confirmed_category}
                          </span>
                        </div>
                        {(rec.fallback_attempts ?? 0) > 0 && (
                          <div className="text-amber-400 text-[11px] mt-0.5 font-mono tabular-nums">
                            Fallback retries: {rec.fallback_attempts}/2
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 align-top font-mono text-xs text-slate-300">
                        {rec.verification_method}
                      </td>

                      <td className="py-3 px-4 align-top text-xs">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`font-semibold capitalize ${
                              rec.status === 'active'
                                ? 'text-emerald-400'
                                : rec.status === 'inactive'
                                  ? 'text-amber-400'
                                  : 'text-rose-400'
                            }`}
                          >
                            {rec.status}
                          </span>
                          <span aria-hidden="true" className="text-slate-600">·</span>
                          <span className="text-slate-400">
                            {rec.cached_skip ? 'Cached Skip' : 'Probed'}
                          </span>
                        </div>
                        <div className="text-slate-500 font-mono tabular-nums text-[11px] mt-0.5">
                          {rec.last_verified_at.slice(0, 19).replace('T', ' ')}
                        </div>
                      </td>

                      <td className="py-3 px-4 align-top text-xs text-slate-300 max-w-md">
                        <div>{rec.notes}</div>
                        {rec.sample_payload && (
                          <div className="mt-1 font-mono text-[11px] text-slate-400 truncate max-w-xs" title={rec.sample_payload}>
                            Callback: {rec.sample_payload}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 align-top text-right">
                        <button
                          type="button"
                          onClick={() => onVerifySingleModel(rec.provider, rec.model_id)}
                          aria-label={`Re-verify ${rec.provider} ${rec.model_id}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Re-probe</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
