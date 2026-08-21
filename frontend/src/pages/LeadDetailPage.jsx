import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import api from '../api/client'
import { Card, Badge, Spinner } from '../components/ui'
import { priorityColor, stageColor, severityColor, formatCurrency, scoreColor } from '../utils/format'

const tabs = ['Overview', 'Outreach', 'Notes', 'Audit', 'Follow-ups']

function LeadDetailPage() {
  const { id } = useParams()
  const [lead, setLead] = useState(null)
  const [tab, setTab] = useState('Overview')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  const fetchLead = () => {
    api.get(`/leads/${id}`).then((res) => setLead(res.data.lead)).catch(() => setError('Failed to load lead'))
  }
  useEffect(() => { fetchLead() }, [id])

  const addNote = async () => {
    if (!note.trim()) return
    await api.post('/notes', { lead_id: id, content: note })
    setNote('')
    fetchLead()
  }

  const moveStage = async (stage) => {
    await api.put(`/pipeline/${id}/stage`, { stage })
    fetchLead()
  }

  if (error) return <div className="p-4 bg-red-50 text-red-700 rounded-lg">{error}</div>
  if (!lead) return <Spinner label="Loading lead..." />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/leads" className="text-sm text-emerald-600 hover:underline">← Back to leads</Link>
          <h1 className="text-2xl font-bold mt-1">{lead.company?.name}</h1>
          <p className="text-gray-500">{lead.company?.industry} · {lead.company?.country}</p>
        </div>
        <div className="flex gap-2">
          <Badge color={priorityColor(lead.priority)}>Priority: {lead.priority}</Badge>
          {lead.lead_score != null && <Badge color={scoreColor(lead.lead_score)}>Score: {lead.lead_score}</Badge>}
          <Badge color={stageColor(lead.stage)}>{lead.stage.replace(/_/g, ' ')}</Badge>
        </div>
      </div>

      <div className="flex gap-2">
        <select
          value={lead.stage}
          onChange={(e) => moveStage(e.target.value)}
          className="px-3 py-2 border rounded-lg bg-white text-sm"
        >
          {['new_lead','researching','audit_ready','contacted','followup_1','followup_2','meeting','proposal_sent','negotiation','won','lost'].map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
          ))}
        </select>
      </div>

      <div className="flex gap-1 border-b">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium ${tab === t ? 'border-b-2 border-emerald-600 text-emerald-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Overview' && <Overview lead={lead} />}
      {tab === 'Outreach' && <Outreach lead={lead} onUpdate={fetchLead} />}
      {tab === 'Notes' && (
        <NotesSection lead={lead} note={note} setNote={setNote} onAdd={addNote} />
      )}
      {tab === 'Audit' && <AuditSection lead={lead} />}
      {tab === 'Follow-ups' && <FollowSection lead={lead} onUpdate={fetchLead} />}
    </div>
  )
}

function Overview({ lead }) {
  const company = lead.company?.name || lead.app?.name || ''
  const contactName = lead.contact?.name || ''
  const peopleQuery = encodeURIComponent(
    [contactName, 'Founder OR CEO OR "Product Manager"', company].filter(Boolean).join(' '),
  )
  const companyQuery = encodeURIComponent(company)
  const linkedInPeople = `https://www.linkedin.com/search/results/people/?keywords=${peopleQuery}`
  const linkedInCompany = `https://www.linkedin.com/search/results/companies/?keywords=${companyQuery}`

  return (
    <div className="space-y-6">
      <Card title="Hunt shortcuts">
        <p className="text-sm text-slate-500 mb-3">
          LinkedIn does not allow scraping — open these searches, copy the profile URL into Contact, then draft outreach.
        </p>
        <div className="flex flex-wrap gap-2">
          <a href={linkedInPeople} target="_blank" rel="noreferrer" className="px-3 py-2 text-sm bg-sky-600 text-white rounded-lg hover:bg-sky-700">
            Find people on LinkedIn
          </a>
          <a href={linkedInCompany} target="_blank" rel="noreferrer" className="px-3 py-2 text-sm bg-sky-50 text-sky-800 border border-sky-200 rounded-lg hover:bg-sky-100">
            Find company on LinkedIn
          </a>
          {lead.company?.website && (
            <a href={lead.company.website.startsWith('http') ? lead.company.website : `https://${lead.company.website}`} target="_blank" rel="noreferrer" className="px-3 py-2 text-sm border rounded-lg hover:bg-slate-50">
              Open website
            </a>
          )}
          {lead.app?.google_play_url && (
            <a href={lead.app.google_play_url} target="_blank" rel="noreferrer" className="px-3 py-2 text-sm border rounded-lg hover:bg-slate-50">
              Play Store
            </a>
          )}
          {lead.app?.app_store_url && (
            <a href={lead.app.app_store_url} target="_blank" rel="noreferrer" className="px-3 py-2 text-sm border rounded-lg hover:bg-slate-50">
              App Store
            </a>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card title="Company">
        <dl className="space-y-2 text-sm">
          {[
            ['Website', lead.company?.website],
            ['Industry', lead.company?.industry],
            ['Country', lead.company?.country],
            ['Size', lead.company?.size],
            ['Revenue', formatCurrency(lead.company?.revenue)],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between border-b border-gray-100 pb-2">
              <dt className="text-gray-500">{k}</dt>
              <dd className="font-medium">{v || '—'}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <Card title="Contact">
        <dl className="space-y-2 text-sm">
          {[
            ['Name', lead.contact?.name],
            ['Position', lead.contact?.position],
            ['Email', lead.contact?.email],
            ['Phone', lead.contact?.phone],
            ['LinkedIn', lead.contact?.linkedin],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between border-b border-gray-100 pb-2 gap-4">
              <dt className="text-gray-500 shrink-0">{k}</dt>
              <dd className="font-medium text-right break-all">
                {k === 'LinkedIn' && v ? (
                  <a href={v} target="_blank" rel="noreferrer" className="text-emerald-600 hover:underline">{v}</a>
                ) : (v || '—')}
              </dd>
            </div>
          ))}
        </dl>
      </Card>
      <Card title="App">
        <dl className="space-y-2 text-sm">
          {[
            ['Name', lead.app?.name],
            ['Rating', lead.app?.rating ? `${lead.app.rating}★` : '—'],
            ['Android downloads', lead.app?.android_downloads?.toLocaleString()],
            ['Reviews', lead.app?.review_count?.toLocaleString()],
            ['Version', lead.app?.current_version],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between border-b border-gray-100 pb-2">
              <dt className="text-gray-500">{k}</dt>
              <dd className="font-medium">{v || '—'}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <Card title="Business">
        <dl className="space-y-2 text-sm">
          {[
            ['Source', lead.source],
            ['Status', lead.status],
            ['Estimated budget', formatCurrency(lead.estimated_budget)],
            ['Next follow-up', lead.next_followup_at ? new Date(lead.next_followup_at).toLocaleDateString() : '—'],
            ['Last contacted', lead.last_contacted_at ? new Date(lead.last_contacted_at).toLocaleDateString() : '—'],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between border-b border-gray-100 pb-2">
              <dt className="text-gray-500">{k}</dt>
              <dd className="font-medium">{v || '—'}</dd>
            </div>
          ))}
        </dl>
      </Card>
      </div>
    </div>
  )
}

function Outreach({ lead }) {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [aiDraft, setAiDraft] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)

  const send = async () => {
    await api.post('/emails', { lead_id: lead.id, subject, body, send: true })
    alert('Email sent')
    setBody('')
    setSubject('')
  }

  const generateAI = async (type) => {
    setAiLoading(true)
    try {
      const res = await api.post('/ai/outreach', { lead_id: lead.id, type })
      setAiDraft(res.data.draft)
      setSubject(res.data.draft.subject)
      setBody(res.data.draft.body)
    } finally {
      setAiLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card title="Email History">
        {lead.emails?.length === 0 && <p className="text-sm text-gray-400">No emails yet</p>}
        <div className="space-y-3">
          {[].concat(lead.emails || []).reverse().map((email) => (
            <div key={email.id} className="border rounded-lg p-3">
              <div className="flex justify-between">
                <p className="font-medium text-sm">{email.subject}</p>
                <Badge color={email.status === 'replied' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-700'}>{email.status}</Badge>
              </div>
              <p className="text-xs text-gray-500 mt-2 whitespace-pre-line">{email.body}</p>
              <p className="text-xs text-gray-400 mt-1">{new Date(email.created_at).toLocaleString()}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Compose Email">
        <div className="space-y-3">
          <div className="flex gap-2 flex-wrap">
            {['cold', 'followup', 'linkedin', 'meeting'].map((t) => (
              <button key={t} onClick={() => generateAI(t)} disabled={aiLoading} className="px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-sm hover:bg-indigo-100 disabled:opacity-50">
                {aiLoading ? '...' : `AI ${t}`}
              </button>
            ))}
          </div>
          {aiDraft && <p className="text-xs text-gray-500">AI draft ready — edit below</p>}
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="w-full px-3 py-2 border rounded-lg text-sm" />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message" rows={6} className="w-full px-3 py-2 border rounded-lg text-sm" />
          <button onClick={send} disabled={!subject || !body} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
            Send Email
          </button>
        </div>
      </Card>
    </div>
  )
}

function NotesSection({ lead, note, setNote, onAdd }) {
  return (
    <Card title="Notes">
      <div className="flex gap-2 mb-4">
        <input value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onAdd()} placeholder="Add a note..." className="flex-1 px-3 py-2 border rounded-lg text-sm" />
        <button onClick={onAdd} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm">Add</button>
      </div>
      <div className="space-y-3">
        {lead.notes?.length === 0 && <p className="text-sm text-gray-400">No notes yet</p>}
        {[].concat(lead.notes || []).reverse().slice(0, 10).map((n) => (
          <div key={n.id} className="border rounded-lg p-3">
            <p className="text-sm">{n.content}</p>
            <p className="text-xs text-gray-400 mt-1">{new Date(n.created_at).toLocaleString()}</p>
          </div>
        ))}
      </div>
    </Card>
  )
}

function AuditSection({ lead }) {
  const [generating, setGenerating] = useState(false)
  const audits = lead.audits || []

  const generate = async () => {
    setGenerating(true)
    try {
      await api.post('/ai/audit-generator', { lead_id: lead.id })
      window.location.reload()
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card
        title="App Audits"
        action={<button onClick={generate} disabled={generating} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50">{generating ? 'Generating...' : '⚡ Generate AI Audit'}</button>}
      >
        {audits.length === 0 && <p className="text-sm text-gray-400">No audits yet. Generate one with AI.</p>}
        {audits.map((audit) => (
          <div key={audit.id} className="border rounded-lg p-4 mb-4">
            <div className="flex justify-between mb-3">
              <p className="font-semibold">{audit.summary || 'App Audit'} · {audit.total_findings} findings</p>
              <p className="text-sm text-gray-500">{new Date(audit.created_at).toLocaleDateString()}</p>
            </div>
            <div className="grid grid-cols-4 gap-2 text-center mb-3">
              <div><p className="font-bold text-red-600">{audit.critical_count}</p><p className="text-xs text-gray-500">Critical</p></div>
              <div><p className="font-bold text-orange-600">{audit.high_count}</p><p className="text-xs text-gray-500">High</p></div>
              <div><p className="font-bold text-amber-600">{audit.medium_count}</p><p className="text-xs text-gray-500">Medium</p></div>
              <div><p className="font-bold text-gray-500">{audit.low_count}</p><p className="text-xs text-gray-500">Low</p></div>
            </div>
            <div className="space-y-2">
              {audit.items.map((item) => (
                <div key={item.id} className="border border-gray-100 rounded-lg p-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium text-sm">{item.title}</p>
                      <p className="text-sm text-gray-600 mt-1">{item.description}</p>
                      {item.ai_recommendation && (
                        <p className="text-sm bg-indigo-50 text-indigo-800 rounded p-2 mt-2">💡 {item.ai_recommendation}</p>
                      )}
                    </div>
                    <Badge color={severityColor(item.severity)}>{item.severity}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </Card>
    </div>
  )
}

function FollowSection({ lead, onUpdate }) {
  const complete = async (id) => {
    await api.post(`/followups/${id}/complete`)
    onUpdate()
  }
  return (
    <Card title="Follow-ups">
      <div className="space-y-3">
        {lead.followups?.length === 0 && <p className="text-sm text-gray-400">No follow-ups scheduled</p>}
        {(lead.followups || []).map((f) => (
          <div key={f.id} className="flex items-center justify-between border rounded-lg p-3">
            <div>
              <p className="font-medium text-sm">Follow-up #{f.sequence_number}</p>
              <p className="text-xs text-gray-500">Due {f.due_date} · {f.is_completed ? 'Completed' : 'Pending'}</p>
            </div>
            {!f.is_completed && (
              <button onClick={() => complete(f.id)} className="px-3 py-1 bg-emerald-600 text-white rounded-lg text-xs hover:bg-emerald-700">Complete</button>
            )}
          </div>
        ))}
      </div>
    </Card>
  )
}

export default LeadDetailPage