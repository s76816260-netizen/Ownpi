import React, { useState, useMemo } from 'react';
import { Download, Copy, Check, Terminal } from 'lucide-react';
import { generateOneClickPythonScript } from '../utils/pythonGenerator';

export const PythonProgramView: React.FC = () => {
  const [copied, setCopied] = useState(false);
  const pythonCode = useMemo(() => generateOneClickPythonScript(), []);

  const handleCopy = () => {
    navigator.clipboard.writeText(pythonCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([pythonCode], { type: 'text/x-python' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'free_llm_verifier.py';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8">
      <section className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-3xl">
            <div className="text-xs font-medium text-sky-400">
              Standalone Zero-Dependency Python 3 Program (<code className="font-mono">free_llm_verifier.py</code>)
            </div>
            <h1 className="text-2xl font-bold text-white">
              One-Click Python Capability Verifier &amp; Report Generator
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed">
              This self-contained Python program includes all 30 providers from the GitHub page grouped by registration status, Step 1 local heuristic pre-classification, Step 2 modality probe endpoints with up to 2 fallback retries, Step 3 <code className="font-mono text-xs text-sky-300">verification_report.json</code> persistence, Step 4 cost-control caching (<code className="font-mono text-xs text-sky-300">model_registry_cache.json</code>), and Step 5 <code className="font-mono text-xs text-sky-300">get_summary_by_category()</code> task router.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-950 bg-sky-400 hover:bg-sky-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Download free_llm_verifier.py</span>
            </button>

            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'Copied Python Code' : 'Copy Python Script'}</span>
            </button>
          </div>
        </div>

        {/* One-Click Execution Instructions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-slate-800">
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-1.5">
            <div className="text-xs font-semibold text-white">01. Run One-Click Verification</div>
            <p className="text-xs text-slate-400">
              Uses Python standard library only (<code className="font-mono">urllib.request</code>, <code className="font-mono">json</code>). No pip install required.
            </p>
            <div className="mt-2 font-mono text-xs text-sky-300 bg-slate-900 px-3 py-1.5 rounded">
              python3 free_llm_verifier.py
            </div>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-1.5">
            <div className="text-xs font-semibold text-white">02. Pick Model by Task (Step 5)</div>
            <p className="text-xs text-slate-400">
              Import <code className="font-mono">get_summary_by_category</code> directly without re-reading the full report.
            </p>
            <div className="mt-2 font-mono text-xs text-sky-300 bg-slate-900 px-3 py-1.5 rounded truncate">
              from free_llm_verifier import get_summary_by_category
            </div>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-1.5">
            <div className="text-xs font-semibold text-white">03. Broadcast Prompt to All Active</div>
            <p className="text-xs text-slate-400">
              Call <code className="font-mono">broadcast_prompt_to_category(prompt, category)</code> to query all active models.
            </p>
            <div className="mt-2 font-mono text-xs text-sky-300 bg-slate-900 px-3 py-1.5 rounded truncate">
              broadcast_prompt_to_category(&quot;Hello&quot;, &quot;text&quot;)
            </div>
          </div>
        </div>
      </section>

      {/* Full Python Source Code Viewer */}
      <section className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-300">
            <Terminal className="w-4 h-4 text-sky-400" />
            <span>free_llm_verifier.py</span>
          </div>
          <span className="text-xs font-mono text-slate-400 tabular-nums">
            {pythonCode.split('\n').length} lines · Python 3.8+
          </span>
        </div>
        <pre className="p-5 text-xs font-mono text-slate-200 overflow-x-auto max-h-[640px] leading-relaxed">
          {pythonCode}
        </pre>
      </section>
    </div>
  );
};
