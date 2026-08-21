import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client'
import { Card, Badge, Spinner, EmptyState } from '../components/ui'
import { priorityColor, scoreColor, stageColor, formatCurrency } from '../utils/format'
import LeadFormModal from '../components/LeadFormModal'

function LeadsPage() {
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [stage, setStage] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [error, setError] = useState('')

  const fetchLeads = () => {
    setLoading(true)
    api.get('/leads', { params: { page, search, stage, per_page: 15 } })
      .then((res) => {
        setLeads(res.data.data)
        setTotal(res.data.total)
      })
      .catch(() => setError('Failed to load leads'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchLeads() }, [page, search, stage])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Leads</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700"
        >
          + Add Lead
        </button>
      </div>

      <div className="flex gap-4">
        <input
          type="text"
          placeholder="Search company, contact or app..."
          value={search}
          onChange={(e) => { setPage(1); setSearch(e.target.value) }}
          className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <select
          value={stage}
          onChange={(e) => { setPage(1); setStage(e.target.value) }}
          className="px-4 py-2 border rounded-lg bg-white"
        >
          <option value="">All stages</option>
          {['new_lead','researching','audit_ready','contacted','followup_1','followup_2','meeting','proposal_sent','negotiation','won','lost'].map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</option>
          ))}
        </select>
      </div>

      {error && <div className="p-3 bg-red-50 text-red-700 rounded-lg">{error}</div>}
      {loading ? <Spinner /> : leads.length === 0 ? <EmptyState message="No leads found" /> : (
        <Card>
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs uppercase text-gray-500 border-b">
                <th className="pb-3">Company</th>
                <th className="pb-3">Contact</th>
                <th className="pb-3">App Rating</th>
                <th className="pb-3">Stage</th>
                <th className="pb-3">Score</th>
                <th className="pb-3">Budget</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id} className="border-b last:border-0 hover:bg-gray-50 cursor-pointer" onClick={() => window.location = `/leads/${lead.id}`}>
                  <td className="py-3">
                    <Link to={`/leads/${lead.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-gray-900 hover:text-emerald-600">
                      {lead.company?.name}
                    </Link>
                    <p className="text-xs text-gray-500">{lead.company?.industry}</p>
                  </td>
                  <td className="py-3">
                    <p className="text-sm">{lead.contact?.name}</p>
                    <p className="text-xs text-gray-500">{lead.contact?.position}</p>
                  </td>
                  <td className="py-3 text-sm">
                    {lead.app ? <span>{lead.app.rating}★ ({lead.app.review_count?.toLocaleString()})</span> : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="py-3">
                    <Badge color={stageColor(lead.stage)}>{lead.stage.replace(/_/g, ' ')}</Badge>
                  </td>
                  <td className="py-3">
                    {lead.lead_score != null ? <Badge color={scoreColor(lead.lead_score)}>{lead.lead_score}</Badge> : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="py-3 text-sm">{formatCurrency(lead.estimated_budget)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-between items-center mt-4">
            <p className="text-sm text-gray-500">{total} leads</p>
            <div className="flex gap-2">
              <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} className="px-3 py-1 border rounded-lg text-sm disabled:opacity-50">Prev</button>
              <button onClick={() => setPage(page + 1)} disabled={page * 15 >= total} className="px-3 py-1 border rounded-lg text-sm disabled:opacity-50">Next</button>
            </div>
          </div>
        </Card>
      )}

      {showCreate && <LeadFormModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); fetchLeads() }} />}
    </div>
  )
}

export default LeadsPage