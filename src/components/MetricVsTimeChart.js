import { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

export default function MetricVsTimeChart({ data = [], metricKey = 'value', timeKey = 'date', title }) {
  const [enlarged, setEnlarged] = useState(false);
  const chartData = Array.isArray(data) ? data : [];

  const download = () => {
    const csv = ['date,value\n' + chartData.map((d) => `${d.date || d.name},${d.value}`).join('\n')];
    const blob = new Blob(csv, { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `metric_vs_time_${metricKey}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const content = (
    <>
      <div className="metric-time-chart-header">
        {title && <span className="metric-time-chart-title">{title}</span>}
        <div className="metric-time-chart-actions">
          <button type="button" onClick={() => setEnlarged((e) => !e)} className="metric-time-chart-btn">
            {enlarged ? 'Shrink' : 'Enlarge'}
          </button>
          <button type="button" onClick={download} className="metric-time-chart-btn">
            Download
          </button>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={enlarged ? 400 : 260}>
        <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 10 }}
            axisLine={{ stroke: 'rgba(255,255,255,0.12)' }}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={50}
            tickFormatter={(v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : v)}
          />
          <Tooltip
            contentStyle={{
              background: 'rgba(15,15,35,0.95)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 8,
              color: '#e2e8f0',
              fontSize: 12,
            }}
            formatter={(value) => [value?.toLocale?.() ?? value, metricKey]}
            labelFormatter={(label) => label}
          />
          <Line type="monotone" dataKey="value" stroke="#818cf8" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </>
  );

  return (
    <div className={`metric-time-chart-wrap ${enlarged ? 'enlarged' : ''}`}>
      {enlarged ? (
        <div className="metric-time-chart-lightbox" onClick={() => setEnlarged(false)}>
          <div className="metric-time-chart-lightbox-inner" onClick={(e) => e.stopPropagation()}>
            {content}
          </div>
        </div>
      ) : (
        <div className="metric-time-chart-inner">{content}</div>
      )}
    </div>
  );
}
