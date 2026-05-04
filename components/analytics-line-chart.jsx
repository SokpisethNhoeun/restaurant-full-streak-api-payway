import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export default function AnalyticsLineChart({ data, xKey, yKey, label, color }) {
  const axisColor = 'hsl(var(--muted-foreground))';
  const gridColor = 'hsl(var(--border))';
  const tooltipStyle = {
    backgroundColor: 'hsl(var(--card))',
    border: '1px solid hsl(var(--border))',
    borderRadius: '8px',
    color: 'hsl(var(--card-foreground))',
  };

  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={data} margin={{ top: 16, right: 24, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
        <XAxis dataKey={xKey} tick={{ fill: axisColor }} tickLine={{ stroke: axisColor }} axisLine={{ stroke: gridColor }} />
        <YAxis tick={{ fill: axisColor }} tickLine={{ stroke: axisColor }} axisLine={{ stroke: gridColor }} />
        <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: 'hsl(var(--foreground))' }} />
        <Legend wrapperStyle={{ color: axisColor }} />
        <Line type="monotone" dataKey={yKey} stroke={color || "#2563eb"} name={label} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
