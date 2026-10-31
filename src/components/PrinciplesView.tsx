import React from 'react';
import { ArrowRight } from 'lucide-react';

interface PrinciplesViewProps {
  onStartPlanning: () => void;
}

export const PrinciplesView: React.FC<PrinciplesViewProps> = ({ onStartPlanning }) => {
  const principles = [
    {
      num: '01',
      title: 'Unstructured brain dump, in any language',
      body: 'Write messy thoughts in English, Spanish, Hindi, Japanese, French, or a mix of languages. You never have to pre-tag durations, folders, or priorities—Dayline parses deadlines like "due tomorrow" and mirrors your language back.',
    },
    {
      num: '02',
      title: 'Paced for your actual energy today',
      body: 'Most to-do lists assume robotic peak stamina every day. Choosing High, Medium, or Low energy changes how Dayline sizes focus blocks (from 90-minute deep sprints down to gentle 30-minute starters) and spaces recovery breaks.',
    },
    {
      num: '03',
      title: 'Strict hour math with built-in breathing room',
      body: 'If you have from 14:00 to 19:00, Dayline never schedules past 19:00 and never packs 5 solid hours without transition pauses or meals. Every edit or duration tweak ripples accurately down the timeline.',
    },
    {
      num: '04',
      title: 'Honest deferral over unrealistic cramming',
      body: 'When 10 hours of ambitions meet a 4-hour evening, squeezing everything into 15-minute slivers guarantees burnout. Dayline schedules what truly matters today and sets the rest aside for tomorrow with clear reasoning.',
    },
  ];

  return (
    <div className="max-w-4xl mx-auto py-10 px-6">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-bold text-oxford-950 tracking-tight">
          Why Dayline plans differently
        </h1>
        <p className="mt-3 text-base text-slate-600 leading-relaxed">
          Traditional task managers collect infinite lists without checking whether your afternoon actually has the hours or energy to hold them.
        </p>
      </div>

      <div className="mt-10 bg-white border border-[#DCE3EE] rounded-xl divide-y divide-[#E8EEF6]">
        {principles.map((item) => (
          <div
            key={item.num}
            className="p-6 md:p-8 grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-8 items-baseline hover:bg-[#FAFBFD] transition-colors"
          >
            <div className="md:col-span-4 flex items-baseline gap-3">
              <span className="font-mono text-xs font-semibold text-cobalt-600 tabular-nums">
                {item.num}.
              </span>
              <h2 className="text-base font-semibold text-oxford-950">
                {item.title}
              </h2>
            </div>
            <p className="md:col-span-8 text-sm text-slate-600 leading-relaxed">
              {item.body}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-8 flex items-center justify-between gap-4 pt-2">
        <p className="text-sm text-slate-600">
          Ready to turn what is on your mind into a calm schedule?
        </p>
        <button
          type="button"
          onClick={onStartPlanning}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-cobalt-600 hover:bg-cobalt-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          Back to Planner
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
