import React, { useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BlockCategory, ScheduleBlock } from '../types';

interface EnergyDemandChartProps {
  blocks: ScheduleBlock[];
}

interface EnergyPoint {
  key: string;
  time: string;
  window: string;
  level: number;
  demandLabel: ScheduleBlock['energyDemand'];
  title: string;
  category: BlockCategory;
  durationMinutes: number;
}

function mapDemandToLevel(demand: ScheduleBlock['energyDemand']): number {
  switch (demand) {
    case 'High':
      return 4;
    case 'Medium':
      return 3;
    case 'Low':
      return 2;
    case 'Recovery':
    default:
      return 1;
  }
}

function formatYAxisTick(value: number): string {
  switch (value) {
    case 4:
      return 'High';
    case 3:
      return 'Med';
    case 2:
      return 'Low';
    case 1:
      return 'Rest';
    default:
      return '';
  }
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: EnergyPoint }>;
}

const EnergyTooltip: React.FC<CustomTooltipProps> = ({ active, payload }) => {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload;

  return (
    <div className="bg-oxford-950 text-white px-3 py-2 rounded-lg shadow-sm text-xs max-w-[240px]">
      <div className="font-mono text-[#93C5FD] tabular-nums">
        {point.window} · {point.durationMinutes}m
      </div>
      <div className="font-semibold text-white mt-0.5 truncate">
        {point.title}
      </div>
      <div className="text-slate-300 mt-0.5 capitalize">
        {point.category} · {point.demandLabel} demand
      </div>
    </div>
  );
};

export const EnergyDemandChart: React.FC<EnergyDemandChartProps> = ({ blocks }) => {
  const { data, highCount, breakCount } = useMemo(() => {
    if (blocks.length === 0) {
      return { data: [] as EnergyPoint[], highCount: 0, breakCount: 0 };
    }

    const points: EnergyPoint[] = blocks.map((b, idx) => ({
      key: `${b.id}-${idx}`,
      time: b.startTime,
      window: `${b.startTime}–${b.endTime}`,
      level: mapDemandToLevel(b.energyDemand),
      demandLabel: b.energyDemand,
      title: b.title,
      category: b.category,
      durationMinutes: b.durationMinutes,
    }));

    const last = blocks[blocks.length - 1];
    points.push({
      key: `${last.id}-end`,
      time: last.endTime,
      window: `${last.startTime}–${last.endTime}`,
      level: mapDemandToLevel(last.energyDemand),
      demandLabel: last.energyDemand,
      title: last.title,
      category: last.category,
      durationMinutes: last.durationMinutes,
    });

    return {
      data: points,
      highCount: blocks.filter((b) => b.energyDemand === 'High').length,
      breakCount: blocks.filter((b) => b.category === BlockCategory.Break).length,
    };
  }, [blocks]);

  if (data.length === 0) return null;

  return (
    <div className="mt-5 pt-4 border-t border-[#E8EEF6]">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
        <span className="text-xs font-semibold text-oxford-950">
          Energy demand over time
        </span>
        <div className="flex items-center gap-1.5 text-xs text-slate-500 font-mono tabular-nums">
          <span>{highCount} high-demand</span>
          <span aria-hidden="true">·</span>
          <span>{breakCount} recovery</span>
        </div>
      </div>

      <div className="h-[132px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 8, right: 8, left: -10, bottom: 0 }}
          >
            <defs>
              <linearGradient id="energyDemandFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#1D4ED8" stopOpacity={0.24} />
                <stop offset="95%" stopColor="#1D4ED8" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              stroke="#E8EEF6"
            />
            <XAxis
              dataKey="time"
              axisLine={false}
              tickLine={false}
              minTickGap={24}
              tick={{
                fill: '#64748B',
                fontSize: 11,
                fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              }}
            />
            <YAxis
              domain={[1, 4]}
              ticks={[1, 2, 3, 4]}
              tickFormatter={formatYAxisTick}
              axisLine={false}
              tickLine={false}
              width={44}
              tick={{
                fill: '#64748B',
                fontSize: 11,
                fontFamily: '"Plus Jakarta Sans", ui-sans-serif, sans-serif',
              }}
            />
            <Tooltip content={<EnergyTooltip />} />
            <Area
              type="monotone"
              dataKey="level"
              stroke="#1D4ED8"
              strokeWidth={2}
              fill="url(#energyDemandFill)"
              isAnimationActive={false}
              dot={{
                r: 2.5,
                fill: '#1D4ED8',
                strokeWidth: 0,
              }}
              activeDot={{
                r: 4.5,
                fill: '#0B192C',
                stroke: '#FFFFFF',
                strokeWidth: 2,
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
