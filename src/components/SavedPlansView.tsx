import React, { useState } from 'react';
import { ArrowUpRight, Search, Trash2 } from 'lucide-react';
import { DayPlan } from '../types';
import { formatDurationHuman } from '../utils/calendar';

interface SavedPlansViewProps {
  savedPlans: DayPlan[];
  activePlanId: string | null;
  onLoadPlan: (plan: DayPlan) => void;
  onDeletePlan: (planId: string) => void;
  onCreateNew: () => void;
}

export const SavedPlansView: React.FC<SavedPlansViewProps> = ({
  savedPlans,
  activePlanId,
  onLoadPlan,
  onDeletePlan,
  onCreateNew,
}) => {
  const [query, setQuery] = useState('');

  const filtered = savedPlans.filter((p) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      p.rawDump.toLowerCase().includes(q) ||
      p.dateLabel.toLowerCase().includes(q) ||
      p.detectedLanguage.toLowerCase().includes(q) ||
      p.blocks.some((b) => b.title.toLowerCase().includes(q))
    );
  });

  if (savedPlans.length === 0) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-6 text-center">
        <h2 className="text-2xl font-semibold text-oxford-950 tracking-tight">
          No saved plans yet
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Every day you plan in Dayline is automatically saved on this device so you can revisit or carry over unfinished tasks.
        </p>
        <button
          type="button"
          onClick={onCreateNew}
          className="mt-6 inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-cobalt-600 hover:bg-cobalt-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          Plan Your First Day
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto py-8 px-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-oxford-950 tracking-tight">
            Saved Plans
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Reload a previous schedule or review what got deferred.
          </p>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by task, date, or language..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-[#DCE3EE] rounded-lg text-oxford-950 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cobalt-600/20 focus:border-cobalt-600"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white border border-[#DCE3EE] rounded-xl p-10 text-center">
          <p className="text-sm text-slate-600">
            No saved plans match “{query}”.
          </p>
          <button
            type="button"
            onClick={() => setQuery('')}
            className="mt-3 text-xs font-semibold text-cobalt-600 hover:text-cobalt-700 underline underline-offset-4"
          >
            Clear filter
          </button>
        </div>
      ) : (
        <div className="bg-white border border-[#DCE3EE] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#DCE3EE] bg-surface-tint text-xs font-semibold text-oxford-900">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Brain Dump Preview</th>
                  <th className="py-3 px-4">Window</th>
                  <th className="py-3 px-4">Energy · Language</th>
                  <th className="py-3 px-4 text-right">Progress</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filtered.map((plan) => {
                  const totalMins = plan.blocks.reduce((acc, b) => acc + b.durationMinutes, 0);
                  const doneCount = plan.blocks.filter((b) => b.completed).length;
                  const isActive = plan.id === activePlanId;

                  return (
                    <tr
                      key={plan.id}
                      className={`transition-colors ${
                        isActive ? 'bg-[#F0F5FF]' : 'hover:bg-slate-50/80'
                      }`}
                    >
                      <td className="py-3 px-4 whitespace-nowrap font-semibold text-oxford-950">
                        {plan.dateLabel}
                        {isActive && (
                          <span className="ml-2 text-xs font-medium text-cobalt-600">
                            · Active
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 max-w-xs truncate text-slate-600">
                        {plan.rawDump}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap font-mono text-xs text-cobalt-700 font-medium tabular-nums">
                        {plan.startWindow}–{plan.finishWindow} ({formatDurationHuman(totalMins)})
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-xs text-slate-600 capitalize">
                        {plan.energy} · {plan.detectedLanguage}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-right font-mono text-xs text-oxford-900 font-medium tabular-nums">
                        {doneCount}/{plan.blocks.length} blocks
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-right">
                        <div className="inline-flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => onLoadPlan(plan)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-oxford-950 hover:bg-oxford-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            Open
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeletePlan(plan.id)}
                            aria-label="Delete saved plan"
                            className="p-1.5 text-slate-400 hover:text-red-600 rounded-md transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
