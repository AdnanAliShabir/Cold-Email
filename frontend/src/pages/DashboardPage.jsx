import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import api from '../api/client'
import { Card, Badge, Spinner } from '../components/ui'
import { formatCurrency, priorityColor } from '../utils/format'

function KPI({ label, value, icon, accent }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className={`text-2xl font-bold mt-1 ${accent || 'text-gray-900'}`}>{value}</p>
        </div>
        <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center text-xl">{icon}</div>
      </div>
    </div>
  )
}

function DashboardPage() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/dashboard')
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.message || 'Failed to load dashboard'))
  }, [])

  if (error) return <div className="p-4 bg-red-50 text-red-700 rounded-lg">{error}</div>
  if (!data) return <Spinner label="Loading dashboard..." />

  const { kpis, funnel, recent_activities, followups_due_today, upcoming_meetings, email_performance, revenue_by_month } = data

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <Link to="/leads" className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700">
          + New Lead
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI label="Total Leads" value={kpis.total_leads} icon="👥" />
        <KPI label="Follow-ups Due" value={kpis.followups_due_today} icon="⏰" accent={kpis.followups_due_today > 0 ? 'text-red-600' : ''} />
        <KPI label="Meetings Scheduled" value={kpis.meetings_scheduled} icon="📅" />
        <KPI label="Revenue" value={formatCurrency(kpis.revenue)} icon="💰" accent="text-emerald-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card title="Revenue by Month" subtitle={`Pipeline value: ${formatCurrency(kpis.pipeline_value)}`}>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={revenue_by_month}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => formatCurrency(v)} />
                <Bar dataKey="revenue" fill="#059669" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card title="Pipeline Funnel" subtitle="Lead stages overview">
            <div className="space-y-2">
              {funnel.map((stage) => (
                <div key={stage.stage}>
                  <div className="flex justify-between text-sm mb-1">
                    <span>{stage.label}</span>
                    <span className="font-medium">{stage.count}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className="bg-emerald-500 h-2 rounded-full transition-all"
                      style={{ width: `${kpis.total_leads ? (stage.count / kpis.total_leads) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Email Performance" subtitle="Outreach stats">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-2xl font-bold text-gray-900">{email_performance.total}</p>
                <p className="text-xs text-gray-500">Sent</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{email_performance.open_rate}%</p>
                <p className="text-xs text-gray-500">Open rate</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{email_performance.reply_rate}%</p>
                <p className="text-xs text-gray-500">Reply rate</p>
              </div>
            </div>
          </Card>

          <Card title="Follow-ups Due" subtitle={followups_due_today.length ? `${followups_due_today.length} overdue or due today` : 'Nothing overdue'}>
            <div className="space-y-3">
              {followups_due_today.length === 0 && <p className="text-sm text-gray-400">All caught up!</p>}
              {followups_due_today.slice(0, 5).map((f) => (
                <div key={f.id} className="flex items-center justify-between border-b border-gray-100 pb-2">
                  <div>
                    <p className="text-sm font-medium">{f.lead?.company || 'Unknown'}</p>
                    <p className="text-xs text-gray-500">Follow-up #{f.sequence_number} · {f.due_date}</p>
                  </div>
                  {f.overdue_days > 0 && <Badge color="bg-red-100 text-red-700">{f.overdue_days}d overdue</Badge>}
                </div>
              ))}
            </div>
          </Card>

          <Card title="Upcoming Meetings">
            <div className="space-y-3">
              {upcoming_meetings.length === 0 && <p className="text-sm text-gray-400">No upcoming meetings</p>}
              {upcoming_meetings.slice(0, 4).map((m) => (
                <div key={m.id} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{m.title}</p>
                    <p className="text-xs text-gray-500">{m.company || '—'}</p>
                  </div>
                  <span className="text-xs text-gray-400">{new Date(m.starts_at).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Recent Activity">
            <div className="space-y-3">
              {recent_activities.slice(0, 6).map((a) => (
                <div key={a.id} className="text-sm">
                  <p>{a.description}</p>
                  <p className="text-xs text-gray-400">
                    {a.lead || 'Lead'} · {new Date(a.created_at).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default DashboardPage