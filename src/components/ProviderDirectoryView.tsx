import React, { useState, useMemo } from 'react';
import {
  Key,
  ExternalLink,
  Play,
  Plus,
  Search,
  Server,
} from 'lucide-react';
import {
  PROVIDERS_CATALOG,
  LOCAL_SELF_HOSTED_TOOLS,
  ProviderEntry,
  RegistrationGroup,
} from '../data/providersData';
import { VerifiedModelRecord, preClassifyModel } from '../utils/verifierEngine';

interface ProviderDirectoryViewProps {
  recordsMap: Map<string, VerifiedModelRecord>;
  providerKeys: Record<string, string>;
  onSaveProviderKey: (providerName: string, key: string) => void;
  onVerifyProviderGroup: (group: RegistrationGroup | 'all') => void;
  onVerifySingleProvider: (providerName: string) => void;
  onAddCustomModel: (providerName: string, modelId: string, displayName: string) => void;
}

export const ProviderDirectoryView: React.FC<ProviderDirectoryViewProps> = ({
  recordsMap,
  providerKeys,
  onSaveProviderKey,
  onVerifyProviderGroup,
  onVerifySingleProvider,
  onAddCustomModel,
}) => {
  const [activeGroupTab, setActiveGroupTab] = useState<'separated_all' | 'no_registration' | 'registration_required' | 'phone_verification' | 'local_tools'>('separated_all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingKeyProvider, setEditingKeyProvider] = useState<string | null>(null);
  const [tempKeyInput, setTempKeyInput] = useState('');

  // Custom model form state (to test Step 4(a) "newly seen model not in registry")
  const [customProvider, setCustomProvider] = useState('Groq');
  const [customModelId, setCustomModelId] = useState('');
  const [customDisplayName, setCustomDisplayName] = useState('');

  const groupedProviders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filterFn = (p: ProviderEntry) => {
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.baseUrl.toLowerCase().includes(q) ||
        p.modalities.some((m) => m.toLowerCase().includes(q)) ||
        p.models.some((m) => m.model_id.toLowerCase().includes(q))
      );
    };

    return {
      noRegistration: PROVIDERS_CATALOG.filter((p) => p.group === 'no_registration' && filterFn(p)),
      registrationRequired: PROVIDERS_CATALOG.filter((p) => p.group === 'registration_required' && filterFn(p)),
      phoneVerification: PROVIDERS_CATALOG.filter((p) => p.group === 'phone_verification' && filterFn(p)),
    };
  }, [searchQuery]);

  const liveHeuristicPreview = useMemo(() => {
    if (!customModelId.trim()) return null;
    return preClassifyModel(customModelId.trim(), customDisplayName.trim());
  }, [customModelId, customDisplayName]);

  const handleAddModelSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customModelId.trim()) return;
    onAddCustomModel(
      customProvider,
      customModelId.trim(),
      customDisplayName.trim() || customModelId.trim()
    );
    setCustomModelId('');
    setCustomDisplayName('');
  };

  const renderProviderSection = (
    title: string,
    subtitle: string,
    groupKey: RegistrationGroup,
    providers: ProviderEntry[],
    accentClass: string
  ) => {
    if (providers.length === 0) return null;
    const totalFreeModels = providers.reduce((acc, p) => acc + p.freeModelsCount, 0);

    return (
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white">{title}</h2>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className={`text-xs font-mono tabular-nums ${accentClass}`}>
                {providers.length} Providers / {totalFreeModels} Listed Free Models
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">{subtitle}</p>
          </div>

          <button
            type="button"
            onClick={() => onVerifyProviderGroup(groupKey)}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-950 bg-sky-400 hover:bg-sky-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Verify Entire Group ({providers.length} Providers)</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {providers.map((provider) => {
            const hasSavedKey = Boolean(providerKeys[provider.name]);
            const isEditing = editingKeyProvider === provider.name;

            return (
              <div
                key={provider.id}
                className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-base font-bold text-white">{provider.name}</h3>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                        <span className={accentClass}>
                          {provider.registrationRequirement === 'No'
                            ? 'No Registration / No Credit Card'
                            : provider.registrationRequirement === 'Phone verification'
                              ? 'Phone Verification Required'
                              : 'Registration Required'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">{provider.freeModelsCount} free models</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">Max Context: {provider.maxContext}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          if (isEditing) {
                            setEditingKeyProvider(null);
                          } else {
                            setEditingKeyProvider(provider.name);
                            setTempKeyInput(providerKeys[provider.name] || '');
                          }
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Key className="w-3.5 h-3.5 text-sky-400" />
                        <span>{hasSavedKey ? 'Key Configured' : 'Set API Key'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onVerifySingleProvider(provider.name)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-sky-300 bg-sky-950/60 hover:bg-sky-900/60 border border-sky-800/70 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        <span>Check API</span>
                      </button>
                    </div>
                  </div>

                  {/* Base URL & Get Key Link */}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-slate-950 border border-slate-800/80 rounded-lg px-3 py-2">
                    <div className="font-mono text-slate-300 truncate max-w-md" title={provider.baseUrl}>
                      {provider.baseUrl}
                    </div>
                    {provider.apiKeyUrl !== '-' && (
                      <a
                        href={provider.apiKeyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300 hover:underline whitespace-nowrap shrink-0"
                      >
                        <span>Get API Key</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>

                  {/* Optional Inline API Key Input */}
                  {isEditing && (
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="password"
                        value={tempKeyInput}
                        onChange={(e) => setTempKeyInput(e.target.value)}
                        placeholder={`Paste ${provider.name} API key (optional for live endpoint probe)`}
                        aria-label={`${provider.name} API Key`}
                        className="flex-1 px-3 py-1.5 text-xs font-mono bg-slate-950 border border-slate-700 rounded-md text-white focus:outline-none focus:border-sky-500"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          onSaveProviderKey(provider.name, tempKeyInput.trim());
                          setEditingKeyProvider(null);
                        }}
                        className="px-3 py-1.5 text-xs font-semibold text-slate-950 bg-sky-400 hover:bg-sky-300 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Save Key
                      </button>
                    </div>
                  )}

                  {/* Supported Modalities as clean unboxed text */}
                  <div className="text-xs text-slate-400">
                    <span className="text-slate-500">Modalities: </span>
                    <span className="text-slate-300">{provider.modalities.join(' · ')}</span>
                  </div>

                  {/* Provider Models & Live Verification Status */}
                  <div className="border-t border-slate-800/80 pt-3 space-y-1.5">
                    <div className="text-[11px] font-medium text-slate-400">
                      Configured Models ({provider.models.length})
                    </div>
                    <div className="divide-y divide-slate-800/50">
                      {provider.models.map((m) => {
                        const rec = recordsMap.get(`${provider.name}/${m.model_id}`);
                        return (
                          <div
                            key={m.model_id}
                            className="py-1.5 flex items-center justify-between gap-2 text-xs"
                          >
                            <div className="font-mono text-slate-200 truncate" title={m.model_id}>
                              {m.model_id}
                            </div>
                            <div className="flex items-center gap-2 shrink-0 font-mono text-[11px] tabular-nums">
                              <span className="text-slate-400">{m.max_context}</span>
                              <span aria-hidden="true" className="text-slate-600">·</span>
                              <span className="text-sky-300">
                                {rec ? rec.confirmed_category : preClassifyModel(m.model_id).guessedCategory}
                              </span>
                              <span aria-hidden="true" className="text-slate-600">·</span>
                              <span
                                className={
                                  !rec
                                    ? 'text-slate-500'
                                    : rec.status === 'active'
                                      ? 'text-emerald-400'
                                      : rec.status === 'inactive'
                                        ? 'text-amber-400'
                                        : 'text-rose-400'
                                }
                              >
                                {rec ? rec.status : 'unverified'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    );
  };

  return (
    <div className="space-y-8">
      {/* Header & Registration Group Navigation */}
      <section className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-medium text-sky-400">
              awesome-freellm-apis Directory · Separated by Registration Requirement
            </div>
            <h1 className="text-2xl font-bold text-white mt-1">
              AI Provider Groups &amp; API Key Registry
            </h1>
            <p className="text-sm text-slate-300 mt-1 max-w-3xl">
              All 30 providers from the GitHub directory are separated into distinct groups based on whether they require registration or work without registration/credit card, plus local self-hosted engines.
            </p>
          </div>

          <div className="relative w-full lg:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search providers, base URLs, models..."
              aria-label="Search providers"
              className="w-full pl-9 pr-4 py-2 text-sm bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
            />
          </div>
        </div>

        {/* Group Filter Tabs */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={() => setActiveGroupTab('separated_all')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeGroupTab === 'separated_all'
                ? 'bg-sky-400 text-slate-950'
                : 'bg-slate-950 text-slate-300 hover:bg-slate-800 border border-slate-800'
            }`}
          >
            All Separated Groups (30 Providers)
          </button>

          <button
            type="button"
            onClick={() => setActiveGroupTab('no_registration')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeGroupTab === 'no_registration'
                ? 'bg-emerald-400 text-slate-950'
                : 'bg-slate-950 text-emerald-300 hover:bg-slate-800 border border-slate-800'
            }`}
          >
            Group A: No Registration / No Card (10)
          </button>

          <button
            type="button"
            onClick={() => setActiveGroupTab('registration_required')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeGroupTab === 'registration_required'
                ? 'bg-amber-400 text-slate-950'
                : 'bg-slate-950 text-amber-300 hover:bg-slate-800 border border-slate-800'
            }`}
          >
            Group B: Registration Required (19)
          </button>

          <button
            type="button"
            onClick={() => setActiveGroupTab('phone_verification')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeGroupTab === 'phone_verification'
                ? 'bg-sky-400 text-slate-950'
                : 'bg-slate-950 text-sky-300 hover:bg-slate-800 border border-slate-800'
            }`}
          >
            Group C: Phone Verification (1)
          </button>

          <button
            type="button"
            onClick={() => setActiveGroupTab('local_tools')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeGroupTab === 'local_tools'
                ? 'bg-slate-200 text-slate-950'
                : 'bg-slate-950 text-slate-300 hover:bg-slate-800 border border-slate-800'
            }`}
          >
            Local / Self-Hosted (6)
          </button>
        </div>
      </section>

      {/* Register Newly Seen Model Form (Tests Step 1 Pre-classifier + Step 4a Newly Seen Model) */}
      <section className="bg-slate-900/90 border border-slate-800 rounded-xl p-5">
        <form onSubmit={handleAddModelSubmit} className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-white">
                Register &amp; Probe a Newly Seen Model (Step 1 Heuristic + Step 4a New Model Rule)
              </h2>
              <p className="text-xs text-slate-400">
                Type any model ID (e.g. <code className="font-mono text-sky-300">flux-pro-1.1</code>, <code className="font-mono text-sky-300">whisper-v3</code>, <code className="font-mono text-sky-300">bge-m3-embedding</code>, <code className="font-mono text-sky-300">qwen-vl-max</code>) to preview Step 1 pre-classification and immediately verify it.
              </p>
            </div>
            {liveHeuristicPreview && (
              <div className="text-xs font-mono bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-lg text-slate-300">
                Step 1 Guess: <span className="text-sky-400 font-semibold">{liveHeuristicPreview.guessedCategory}</span>
                <span className="mx-1.5" aria-hidden="true">·</span>
                Fallbacks: <span className="text-slate-400">{liveHeuristicPreview.fallbackCategories.join(', ')}</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label htmlFor="custom-provider" className="block text-xs text-slate-400 mb-1">
                Provider
              </label>
              <select
                id="custom-provider"
                value={customProvider}
                onChange={(e) => setCustomProvider(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white"
              >
                {PROVIDERS_CATALOG.map((p) => (
                  <option key={p.id} value={p.name}>
                    {p.name} ({p.registrationRequirement})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="custom-model-id" className="block text-xs text-slate-400 mb-1">
                Model ID
              </label>
              <input
                id="custom-model-id"
                type="text"
                value={customModelId}
                onChange={(e) => setCustomModelId(e.target.value)}
                placeholder="e.g. stabilityai/sdxl-turbo"
                className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label htmlFor="custom-display-name" className="block text-xs text-slate-400 mb-1">
                Display Name (Optional)
              </label>
              <input
                id="custom-display-name"
                type="text"
                value={customDisplayName}
                onChange={(e) => setCustomDisplayName(e.target.value)}
                placeholder="e.g. SDXL Turbo Image Generator"
                className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-950 bg-sky-400 hover:bg-sky-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add &amp; Verify Model</span>
              </button>
            </div>
          </div>
        </form>
      </section>

      {/* Group 1: No Registration Required */}
      {(activeGroupTab === 'separated_all' || activeGroupTab === 'no_registration') &&
        renderProviderSection(
          'Group A: No Registration / No Credit Card Required',
          'Providers marked "No" in the Credit Card / Registration requirement column — instant free tier access.',
          'no_registration',
          groupedProviders.noRegistration,
          'text-emerald-400'
        )}

      {/* Group 2: Registration Required */}
      {(activeGroupTab === 'separated_all' || activeGroupTab === 'registration_required') &&
        renderProviderSection(
          'Group B: Registration Required Providers',
          'Providers marked "Registration" in the directory — require creating a free account to issue an API token.',
          'registration_required',
          groupedProviders.registrationRequired,
          'text-amber-400'
        )}

      {/* Group 3: Phone Verification Required */}
      {(activeGroupTab === 'separated_all' || activeGroupTab === 'phone_verification') &&
        renderProviderSection(
          'Group C: Phone Verification Required',
          'Providers requiring SMS/phone verification to unlock free microservice endpoints.',
          'phone_verification',
          groupedProviders.phoneVerification,
          'text-sky-400'
        )}

      {/* Local / Self-Hosted Section */}
      {(activeGroupTab === 'separated_all' || activeGroupTab === 'local_tools') && (
        <section className="space-y-4">
          <div className="pb-3 border-b border-slate-800">
            <h2 className="text-lg font-bold text-white">
              Local / Self-Hosted Engines (Unlimited, Private, Free Forever)
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Zero rate limits or cloud registration — expose local OpenAI-compatible endpoints for offline execution.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {LOCAL_SELF_HOSTED_TOOLS.map((tool) => (
              <div
                key={tool.name}
                className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-col justify-between gap-3"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Server className="w-4 h-4 text-sky-400" />
                      <h3 className="text-sm font-bold text-white">{tool.name}</h3>
                    </div>
                    <span className="text-xs text-slate-400 font-mono">{tool.type}</span>
                  </div>
                  <p className="text-xs text-slate-300 mt-2 leading-relaxed">{tool.highlights}</p>
                </div>

                <div className="pt-2 border-t border-slate-800/80 flex justify-end">
                  <a
                    href={tool.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 hover:underline"
                  >
                    <span>Official Site</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
