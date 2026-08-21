import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client'
import { Card, Badge, Spinner } from '../components/ui'

function FollowUpsPage() {
  const [due, setDue] = useState(null)
  const [upcoming, setUpcoming] = useState(null)
  const [tab, setTab] = useState('due')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(null)

  const load = async () => {
    try {
      const [d, u] = await Promise.all([
        api.get('/followups/due'),
        api.get('/followups/upcoming'),
      ])
      setDue(d.data.followups || d.data || [])
      setUpcoming(u.data.followups || u.data || [])
    } catch {
      setError('Failed to load follow-ups')
    }
  }

  useEffect(() => { load() }, [])

  const complete = async (id) => {
    setBusy(id)
    try {
      await api.post(`/followups/${id}/complete`)
      await load()
    } finally {
      setBusy(null)
    }
  }

  if (error) return <div className="p-4 bg-red-50 text-red-700 rounded-lg">{error}</div>
  if (!due || !upcoming) return <Spinner label="Loading follow-ups..." />

  const list = tab === 'due' ? due : upcoming

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Follow-ups</h1>
        <p className="text-sm text-slate-500 mt-1">
          Auto-scheduled Day 4 / 9 / 16 after a lead is marked Contacted. Complete after you send.
        </p>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setTab('due')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === 'due' ? 'bg-emerald-600 text-white' : 'bg-white border text-slate-600'}`}
        >
          Due / Overdue ({due.length})
        </button>
        <button
          onClick={() => setTab('upcoming')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === 'upcoming' ? 'bg-emerald-600 text-white' : 'bg-white border text-slate-600'}`}
        >
          Upcoming ({upcoming.length})
        </button>
      </div>

      <Card>
        {list.length === 0 && (
          <p className="text-sm text-slate-400 py-6 text-center">
            Nothing here. Move a lead to <strong>Contacted</strong> to generate the sequence.
          </p>
        )}
        <div className="space-y-3">
          {list.map((f) => {
            const overdue = !f.is_completed && f.due_date && new Date(f.due_date) < new Date(new Date().toDateString())
            return (
              <div key={f.id} className="flex flex-wrap items-center justify-between gap-3 border border-slate-200 rounded-xl p-4 bg-slate-50/50">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link to={`/leads/${f.lead_id || f.lead?.id}`} className="font-semibold text-slate-900 hover:text-emerald-600 truncate">
                      {typeof f.lead?.company === 'string'
                        ? f.lead.company
                        : (f.lead?.company?.name || `Lead #${f.lead_id}`)}
                    </Link>
                    <Badge color={overdue ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}>
                      #{f.sequence_number}
                    </Badge>
                    {overdue && <Badge color="bg-red-100 text-red-700">Overdue</Badge>}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Due {f.due_date} · {typeof f.lead?.contact === 'string' ? f.lead.contact : (f.lead?.contact?.name || f.lead?.contact?.email || 'no contact')}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Link
                    to={`/leads/${f.lead_id || f.lead?.id}`}
                    className="px-3 py-1.5 text-sm border rounded-lg hover:bg-white"
                  >
                    Open & draft
                  </Link>
                  {!f.is_completed && (
                    <button
                      onClick={() => complete(f.id)}
                      disabled={busy === f.id}
                      className="px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {busy === f.id ? '...' : 'Mark done'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}

export default FollowUpsPage
