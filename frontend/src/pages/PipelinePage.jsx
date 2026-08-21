import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client'
import { Spinner, Badge } from '../components/ui'
import { scoreColor, formatCurrency } from '../utils/format'

const stageOrder = ['new_lead','researching','audit_ready','contacted','followup_1','followup_2','meeting','proposal_sent','negotiation','won','lost']

const stageStyles = {
  new_lead: 'border-t-blue-400',
  researching: 'border-t-cyan-400',
  audit_ready: 'border-t-indigo-400',
  contacted: 'border-t-violet-400',
  followup_1: 'border-t-purple-400',
  followup_2: 'border-t-purple-400',
  meeting: 'border-t-fuchsia-400',
  proposal_sent: 'border-t-orange-400',
  negotiation: 'border-t-amber-400',
  won: 'border-t-emerald-400',
  lost: 'border-t-red-400',
}

function PipelinePage() {
  const [pipeline, setPipeline] = useState(null)
  const [dragging, setDragging] = useState(null)
  const [over, setOver] = useState(null)

  const fetchPipeline = () => {
    api.get('/pipeline').then((res) => setPipeline(res.data.pipeline))
  }
  useEffect(() => { fetchPipeline() }, [])

  const moveLead = async (leadId, toStage) => {
    await api.put(`/pipeline/${leadId}/stage`, { stage: toStage })
    fetchPipeline()
  }

  const onDrop = (e, stage) => {
    e.preventDefault()
    if (dragging) {
      moveLead(dragging, stage)
    }
    setDragging(null)
    setOver(null)
  }

  if (!pipeline) return <Spinner label="Loading pipeline..." />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Pipeline</h1>
        <p className="text-sm text-gray-500">Drag leads between stages to update</p>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {stageOrder.map((key) => {
          const column = pipeline[key]
          if (!column) return null
          return (
            <div
              key={key}
              onDragOver={(e) => { e.preventDefault(); setOver(key) }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => onDrop(e, key)}
              className={`w-72 shrink-0 bg-white rounded-xl border-t-4 ${stageStyles[key]} shadow-sm ${over === key ? 'ring-2 ring-emerald-400' : 'border border-gray-200'}`}
            >
              <div className="px-4 py-3 border-b border-gray-100">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900">{column.label}</h3>
                  <Badge color="bg-gray-100 text-gray-600">{column.leads.length}</Badge>
                </div>
              </div>
              <div className="p-2 space-y-2 min-h-[100px]">
                {column.leads.map((lead) => (
                  <div
                    key={lead.id}
                    draggable
                    onDragStart={() => setDragging(lead.id)}
                    onDragEnd={() => { setDragging(null); setOver(null) }}
                    className="bg-white border border-gray-200 rounded-lg p-3 cursor-grab active:cursor-grabbing hover:shadow"
                  >
                    <Link to={`/leads/${lead.id}`}>
                      <p className="font-medium text-sm text-gray-900 hover:text-emerald-600">{lead.company?.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{lead.contact?.name}</p>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-gray-500">{formatCurrency(lead.estimated_budget)}</span>
                        {lead.lead_score != null && (
                          <Badge color={lead.lead_score >= 70 ? 'bg-emerald-100 text-emerald-700' : lead.lead_score >= 40 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}>
                            {lead.lead_score}
                          </Badge>
                        )}
                      </div>
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default PipelinePage