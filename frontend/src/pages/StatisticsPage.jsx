import { useEffect, useState } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend,
} from 'recharts'
import api from '../api/client'
import { Card, Spinner } from '../components/ui'
import { formatCurrency } from '../utils/format'

const COLORS = ['#059669', '#0ea5e9', '#6366f1', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#ec4899', '#f97316', '#84cc16']

function StatisticsPage() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/statistics').then((res) => setData(res.data)).catch((err) => setError(err.response?.data?.message || 'Failed'))
  }, [])

  if (error) return <div className="p-4 bg-red-50 text-red-700 rounded-lg">{error}</div>
  if (!data) return <Spinner label="Loading statistics..." />

  const { metrics, monthly_revenue, pipeline, lead_source, industry_performance } = data

  const statCards = [
    ['Total Leads', metrics.total_leads],
    ['Emails Sent', metrics.emails_sent],
    ['Open Rate', `${metrics.open_rate}%`],
    ['Reply Rate', `${metrics.reply_rate}%`],
    ['Meetings', metrics.meetings],
    ['Proposals', metrics.proposals],
    ['Wins', metrics.wins],
    ['Losses', metrics.losses],
    ['Win Rate', `${metrics.win_rate}%`],
    ['Avg Deal', formatCurrency(metrics.average_deal_size)],
  ]

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Statistics</h1>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {statCards.map(([label, value]) => (
          <div key={label} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <p className="text-xs text-gray-500">{label}</p>
            <p className="text-xl font-bold mt-1">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Monthly Revenue" subtitle={`Total: ${formatCurrency(metrics.revenue)}`}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={monthly_revenue}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => formatCurrency(v)} />
              <Bar dataKey="revenue" fill="#059669" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Pipeline Value by Stage">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={pipeline} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="label" width={100} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => formatCurrency(v)} />
              <Bar dataKey="value" fill="#6366f1" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Lead Sources">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={lead_source} dataKey="count" nameKey="source" cx="50%" cy="50%" outerRadius={90} label>
                {lead_source.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Industry Performance">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs uppercase text-gray-500 border-b">
                <th className="pb-2">Industry</th>
                <th className="pb-2">Leads</th>
                <th className="pb-2">Wins</th>
              </tr>
            </thead>
            <tbody>
              {industry_performance.map((row) => (
                <tr key={row.industry} className="border-b last:border-0">
                  <td className="py-2 text-sm">{row.industry}</td>
                  <td className="py-2 text-sm">{row.leads}</td>
                  <td className="py-2 text-sm text-emerald-600">{row.wins}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  )
}

export default StatisticsPage