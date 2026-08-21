import { useEffect, useState } from 'react'
import api from '../api/client'
import { Card, Spinner } from '../components/ui'

function AIToolsPage() {
  const [leads, setLeads] = useState([])
  const [tab, setTab] = useState('outreach')

  useEffect(() => {
    api.get('/leads', { params: { per_page: 100 } }).then((res) => {
      setLeads(res.data.data.map((l) => ({ id: l.id, label: `${l.company?.name || 'Lead'} (${l.company?.industry || '—'})` })))
    })
  }, [])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">AI Tools</h1>
      <div className="grid grid-cols-1 gap-6">
        {leads.length === 0 ? <Spinner label="Loading leads..." /> : (
          <div className="flex gap-1 border-b">
            {[['outreach', 'AI Outreach'], ['audit', 'AI Audit'], ['reviews', 'Review Analysis'], ['score', 'Lead Scoring']].map(([key, label]) => (
              <button key={key} onClick={() => setTab(key)} className={`px-4 py-2 text-sm font-medium ${tab === key ? 'border-b-2 border-emerald-600 text-emerald-600' : 'text-gray-500'}`}>
                {label}
              </button>
            ))}
          </div>
        )}
        {leads.length === 0 ? <p className="text-gray-500">Add leads to use AI tools.</p> : (
          <>
            {tab === 'outreach' && <OutreachTab leads={leads} />}
            {tab === 'audit' && <AuditTab leads={leads} />}
            {tab === 'reviews' && <ReviewsTab leads={leads} />}
            {tab === 'score' && <ScoreTab leads={leads} />}
          </>
        )}
      </div>
    </div>
  )
}

function LeadSelect({ leads, value, onChange }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm bg-white mb-4">
      <option value="">Select a lead...</option>
      {leads.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
    </select>
  )
}

function OutreachTab({ leads }) {
  const [leadId, setLeadId] = useState('')
  const [type, setType] = useState('cold')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const run = async () => {
    if (!leadId) return
    setLoading(true); setError(''); setResult(null)
    try {
      const res = await api.post('/ai/outreach', { lead_id: leadId, type })
      setResult(res.data.draft)
    } catch (e) {
      setError(e.response?.data?.message || 'Failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card title="Generate Outreach" subtitle="Cold emails, follow-ups, LinkedIn messages & meeting requests">
      <LeadSelect leads={leads} value={leadId} onChange={setLeadId} />
      <div className="flex gap-2 mb-4">
        {[['cold', 'Cold Email'], ['followup', 'Follow-up'], ['linkedin', 'LinkedIn'], ['meeting', 'Meeting']].map(([k, label]) => (
          <button key={k} onClick={() => setType(k)} className={`px-3 py-1.5 rounded-lg text-sm ${type === k ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-700'}`}>{label}</button>
        ))}
      </div>
      <button onClick={run} disabled={!leadId || loading} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
        {loading ? 'Generating...' : 'Generate Draft'}
      </button>
      {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
      {result && (
        <div className="mt-4 border rounded-lg p-4 bg-gray-50">
          <h3 className="font-semibold text-gray-900">{result.subject}</h3>
          <p className="whitespace-pre-line text-sm mt-2 text-gray-700">{result.body}</p>
          <button
            onClick={() => navigator.clipboard.writeText(`${result.subject}\n\n${result.body}`)}
            className="mt-3 text-xs text-emerald-600 hover:underline"
          >
            Copy to clipboard
          </button>
        </div>
      )}
    </Card>
  )
}

function AuditTab({ leads }) {
  const [leadId, setLeadId] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  const run = async () => {
    if (!leadId) return
    setLoading(true); setResult(null)
    try {
      const res = await api.post('/ai/audit-generator', { lead_id: leadId })
      setResult(res.data.audit)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card title="AI App Audit Generator" subtitle="Generates technical, UX and business findings">
      <LeadSelect leads={leads} value={leadId} onChange={setLeadId} />
      <button onClick={run} disabled={!leadId || loading} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
        {loading ? 'Analyzing...' : 'Generate Audit'}
      </button>
      {result && (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-gray-600">{result.summary}</p>
          {result.items.map((item) => (
            <div key={item.id} className="border rounded-lg p-3">
              <div className="flex justify-between">
                <p className="font-medium text-sm">{item.title}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full ${item.severity === 'high' ? 'bg-red-100 text-red-700' : item.severity === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>{item.severity}</span>
              </div>
              <p className="text-sm text-gray-600 mt-1">{item.description}</p>
              {item.ai_recommendation && <p className="text-sm bg-indigo-50 text-indigo-800 rounded p-2 mt-2">💡 {item.ai_recommendation}</p>}
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function ReviewsTab({ leads }) {
  const [leadId, setLeadId] = useState('')
  const [platform, setPlatform] = useState('google_play')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  const run = async () => {
    if (!leadId) return
    setLoading(true); setResult(null)
    try {
      const res = await api.post('/ai/review-analysis', { lead_id: leadId, platform })
      setResult(res.data.analysis)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card title="Review Analysis" subtitle="Analyze store reviews for sentiment and opportunities">
      <LeadSelect leads={leads} value={leadId} onChange={setLeadId} />
      <div className="flex gap-2 mb-4">
        {[['google_play', 'Google Play'], ['app_store', 'App Store']].map(([k, label]) => (
          <button key={k} onClick={() => setPlatform(k)} className={`px-3 py-1.5 rounded-lg text-sm ${platform === k ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-700'}`}>{label}</button>
        ))}
      </div>
      <button onClick={run} disabled={!leadId || loading} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
        {loading ? 'Analyzing...' : 'Analyze Reviews'}
      </button>
      {result && (
        <div className="mt-4 space-y-4">
          <div>
            <h3 className="font-semibold text-sm">Sentiment</h3>
            <p className="text-sm text-gray-600">{result.sentiment}</p>
          </div>
          <div>
            <h3 className="font-semibold text-sm mb-2">Common Complaints</h3>
            <ul className="list-disc pl-5 space-y-1 text-sm text-gray-700">
              {result.common_complaints.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-sm mb-2">Opportunities</h3>
            <ul className="list-disc pl-5 space-y-1 text-sm text-gray-700">
              {result.opportunities.map((o, i) => <li key={i}>{o}</li>)}
            </ul>
          </div>
        </div>
      )}
    </Card>
  )
}

function ScoreTab({ leads }) {
  const [leadId, setLeadId] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  const run = async () => {
    if (!leadId) return
    setLoading(true); setResult(null)
    try {
      const res = await api.post(`/ai/lead-score/${leadId}`)
      setResult(res.data.lead_score)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card title="Lead Scoring" subtitle="Score based on rating, downloads, updates, industry & company size">
      <LeadSelect leads={leads} value={leadId} onChange={setLeadId} />
      <button onClick={run} disabled={!leadId || loading} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
        {loading ? 'Scoring...' : 'Calculate Score'}
      </button>
      {result && (
        <div className="mt-4 p-6 bg-gray-50 rounded-lg text-center">
          <p className="text-5xl font-bold text-emerald-600">{result.score}</p>
          <p className="mt-2 text-sm text-gray-500 capitalize">{result.band} lead</p>
        </div>
      )}
    </Card>
  )
}

export default AIToolsPage