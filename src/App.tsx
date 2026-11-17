import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  PROVIDERS_CATALOG,
  CatalogModel,
  RegistrationGroup,
  getAllCatalogModels,
} from './data/providersData';
import {
  VerifiedModelRecord,
  verifySingleModel,
  buildVerificationReport,
  getSummaryByCategory,
} from './utils/verifierEngine';
import { VerificationConsole } from './components/VerificationConsole';
import { ProviderDirectoryView } from './components/ProviderDirectoryView';
import { BroadcastRouterView } from './components/BroadcastRouterView';
import { PythonProgramView } from './components/PythonProgramView';

type ActiveTab = 'console' | 'providers' | 'broadcast' | 'python';

const REGISTRY_STORAGE_KEY = 'freellm_verified_registry_v1';
const KEYS_STORAGE_KEY = 'freellm_provider_api_keys_v1';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('console');
  const [customModels, setCustomModels] = useState<CatalogModel[]>([]);
  const [registryMap, setRegistryMap] = useState<Map<string, VerifiedModelRecord>>(() => {
    try {
      const saved = localStorage.getItem(REGISTRY_STORAGE_KEY);
      if (saved) {
        const parsed: VerifiedModelRecord[] = JSON.parse(saved);
        return new Map(parsed.map((r) => [`${r.provider}/${r.model_id}`, r]));
      }
    } catch {
      // ignore storage errors
    }
    return new Map();
  });

  const [providerKeys, setProviderKeys] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem(KEYS_STORAGE_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [isRunning, setIsRunning] = useState(false);
  const [enforceIntervals, setEnforceIntervals] = useState(false);
  const [expensiveIntervalHours, setExpensiveIntervalHours] = useState(168);
  const [cheapIntervalHours, setCheapIntervalHours] = useState(24);
  const [lastRunStats, setLastRunStats] = useState({
    probedCount: 0,
    skippedCachedCount: 0,
    fallbackTriggeredCount: 0,
    durationMs: 0,
  });

  const allModels = useMemo(() => {
    return [...getAllCatalogModels(), ...customModels];
  }, [customModels]);

  const persistRegistry = useCallback((nextMap: Map<string, VerifiedModelRecord>) => {
    try {
      localStorage.setItem(
        REGISTRY_STORAGE_KEY,
        JSON.stringify(Array.from(nextMap.values()))
      );
    } catch {
      // ignore storage errors
    }
  }, []);

  const runVerificationPass = useCallback(
    async (options: {
      forceReverify?: boolean;
      simulateUpdate?: boolean;
      subsetModels?: CatalogModel[];
    } = {}) => {
      setIsRunning(true);
      const startMs = Date.now();
      const workingMap = new Map<string, VerifiedModelRecord>(registryMap);
      const targetModels = options.subsetModels ?? allModels;

      const updatedSet = new Set<string>();
      if (options.simulateUpdate) {
        // Mark first 4 models as provider-updated to demonstrate Step 4(b)
        for (const m of targetModels.slice(0, 4)) {
          updatedSet.add(`${m.provider}/${m.model_id}`);
        }
      }

      let probed = 0;
      let skipped = 0;
      let fallbacks = 0;

      for (const model of targetModels) {
        const res = await verifySingleModel(model, workingMap, {
          forceReverify: options.forceReverify,
          providerUpdatedModels: updatedSet,
          enforceIntervalCheck: enforceIntervals,
          expensiveModalityIntervalHours: expensiveIntervalHours,
          cheapModalityIntervalHours: cheapIntervalHours,
        });

        if (res.cached_skip) {
          skipped++;
        } else {
          probed++;
        }
        if ((res.fallback_attempts ?? 0) > 0) {
          fallbacks++;
        }
      }

      const elapsed = Math.max(12, Date.now() - startMs);
      setRegistryMap(workingMap);
      persistRegistry(workingMap);
      setLastRunStats({
        probedCount: probed,
        skippedCachedCount: skipped,
        fallbackTriggeredCount: fallbacks,
        durationMs: elapsed,
      });
      setIsRunning(false);
    },
    [
      registryMap,
      allModels,
      enforceIntervals,
      expensiveIntervalHours,
      cheapIntervalHours,
      persistRegistry,
    ]
  );

  // Run initial verification on first load if registry is empty
  useEffect(() => {
    if (registryMap.size === 0) {
      runVerificationPass({ forceReverify: false });
    }
  }, []);

  const handleTriggerFallbackDemo = useCallback(async () => {
    const workingMap = new Map<string, VerifiedModelRecord>(registryMap);
    const demoModel: CatalogModel = {
      provider: 'OpenRouter',
      model_id: 'experimental/multimodal-flux-broken:free',
      display_name: 'Experimental Broken Modality (2-Retry Unknown Demo)',
      max_context: '32K',
      rate_limit: '10 RPM',
    };

    const record = await verifySingleModel(
      demoModel,
      workingMap,
      { forceReverify: true },
      async (_m, cat, idx) => ({
        ok: false,
        errorType: 'wrong_input_type',
        responseNote: `Attempt #${idx + 1} (${cat}) failed: wrong input type for endpoint`,
        sampleResponse: `{"error": "wrong_input_type", "attempted_modality": "${cat}"}`,
      })
    );

    setRegistryMap(workingMap);
    persistRegistry(workingMap);
    setLastRunStats((prev) => ({
      ...prev,
      probedCount: prev.probedCount + 1,
      fallbackTriggeredCount: prev.fallbackTriggeredCount + (record.fallback_attempts ?? 2),
    }));
  }, [registryMap, persistRegistry]);

  const handleVerifySingleModel = useCallback(
    async (providerName: string, modelId: string) => {
      const target = allModels.find(
        (m) => m.provider === providerName && m.model_id === modelId
      );
      if (!target) return;
      await runVerificationPass({
        forceReverify: true,
        subsetModels: [target],
      });
    },
    [allModels, runVerificationPass]
  );

  const handleVerifyProviderGroup = useCallback(
    async (group: RegistrationGroup | 'all') => {
      const modelsInGroup =
        group === 'all'
          ? allModels
          : PROVIDERS_CATALOG.filter((p) => p.group === group).flatMap((p) => p.models);
      await runVerificationPass({
        forceReverify: true,
        subsetModels: modelsInGroup,
      });
      setActiveTab('console');
    },
    [allModels, runVerificationPass]
  );

  const handleVerifySingleProvider = useCallback(
    async (providerName: string) => {
      const providerModels = allModels.filter((m) => m.provider === providerName);
      await runVerificationPass({
        forceReverify: true,
        subsetModels: providerModels,
      });
      setActiveTab('console');
    },
    [allModels, runVerificationPass]
  );

  const handleAddCustomModel = useCallback(
    async (providerName: string, modelId: string, displayName: string) => {
      const newModel: CatalogModel = {
        provider: providerName,
        model_id: modelId,
        display_name: displayName,
        max_context: '128K',
        rate_limit: 'Custom Probe',
      };
      setCustomModels((prev) => [...prev, newModel]);

      const workingMap = new Map<string, VerifiedModelRecord>(registryMap);
      await verifySingleModel(newModel, workingMap, { forceReverify: true });
      setRegistryMap(workingMap);
      persistRegistry(workingMap);
      setActiveTab('console');
    },
    [registryMap, persistRegistry]
  );

  const handleSaveProviderKey = useCallback((providerName: string, key: string) => {
    setProviderKeys((prev) => {
      const next = { ...prev, [providerName]: key };
      try {
        localStorage.setItem(KEYS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const recordsList = useMemo(() => Array.from(registryMap.values()), [registryMap]);
  const report = useMemo(() => buildVerificationReport(recordsList), [recordsList]);
  const summaryByCategory = useMemo(
    () => getSummaryByCategory(recordsList),
    [recordsList]
  );

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 md:gap-8 px-4 sm:px-6 py-3.5 border-b border-slate-800 bg-slate-950/95 sticky top-0 z-30">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('console');
          }}
          className="text-base sm:text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0"
        >
          FreeLLM Capability Hub
        </a>

        {/* Zone 2: 4 clean single-line text navigation links */}
        <nav className="order-3 sm:order-2 w-full sm:w-auto flex items-center gap-4 sm:gap-6 text-xs sm:text-sm font-medium text-slate-300 overflow-x-auto">
          <a
            href="#console"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('console');
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'console'
                ? 'text-white underline underline-offset-8 decoration-sky-400 decoration-2'
                : 'text-slate-400 hover:text-white hover:underline hover:underline-offset-8'
            }`}
          >
            Verification Console
          </a>
          <a
            href="#providers"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('providers');
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'providers'
                ? 'text-white underline underline-offset-8 decoration-sky-400 decoration-2'
                : 'text-slate-400 hover:text-white hover:underline hover:underline-offset-8'
            }`}
          >
            Provider Groups
          </a>
          <a
            href="#broadcast"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('broadcast');
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'broadcast'
                ? 'text-white underline underline-offset-8 decoration-sky-400 decoration-2'
                : 'text-slate-400 hover:text-white hover:underline hover:underline-offset-8'
            }`}
          >
            Broadcast Router
          </a>
          <a
            href="#python"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('python');
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'python'
                ? 'text-white underline underline-offset-8 decoration-sky-400 decoration-2'
                : 'text-slate-400 hover:text-white hover:underline hover:underline-offset-8'
            }`}
          >
            Python Program
          </a>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="order-2 sm:order-3 flex items-center shrink-0">
          <button
            type="button"
            onClick={() => runVerificationPass({ forceReverify: false })}
            disabled={isRunning}
            className="px-3.5 sm:px-4 py-1.5 sm:py-2 text-xs font-semibold text-slate-950 bg-sky-400 hover:bg-sky-300 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isRunning ? 'Running Probes...' : 'Run Verification'}
          </button>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-[1360px] w-full mx-auto px-4 sm:px-6 py-8">
        {activeTab === 'console' && (
          <VerificationConsole
            records={recordsList}
            report={report}
            isRunning={isRunning}
            lastRunStats={lastRunStats}
            enforceIntervals={enforceIntervals}
            setEnforceIntervals={setEnforceIntervals}
            expensiveIntervalHours={expensiveIntervalHours}
            setExpensiveIntervalHours={setExpensiveIntervalHours}
            cheapIntervalHours={cheapIntervalHours}
            setCheapIntervalHours={setCheapIntervalHours}
            onRunVerification={runVerificationPass}
            onTriggerFallbackDemo={handleTriggerFallbackDemo}
            onVerifySingleModel={handleVerifySingleModel}
          />
        )}

        {activeTab === 'providers' && (
          <ProviderDirectoryView
            recordsMap={registryMap}
            providerKeys={providerKeys}
            onSaveProviderKey={handleSaveProviderKey}
            onVerifyProviderGroup={handleVerifyProviderGroup}
            onVerifySingleProvider={handleVerifySingleProvider}
            onAddCustomModel={handleAddCustomModel}
          />
        )}

        {activeTab === 'broadcast' && (
          <BroadcastRouterView summaryByCategory={summaryByCategory} />
        )}

        {activeTab === 'python' && <PythonProgramView />}
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-800/80 py-6 px-6 text-xs text-slate-400">
        <div className="max-w-[1360px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            FreeLLM Capability Hub · Synchronized with awesome-freellm-apis directory (30 Providers · 526+ Free APIs)
          </div>
          <div className="flex items-center gap-4">
            <a
              href="https://freellm.net/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white transition-colors"
            >
              freellm.net
            </a>
            <span aria-hidden="true">·</span>
            <a
              href="https://github.com/open-free-llm-api/awesome-freellm-apis"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white transition-colors"
            >
              GitHub Repository
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
