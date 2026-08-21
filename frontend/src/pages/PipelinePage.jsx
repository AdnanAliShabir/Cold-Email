import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client'
import { Spinner, Badge } from '../components/ui'
import { formatCurrency, priorityColor } from '../utils/format'

const STAGE_ORDER = [
  'new_lead', 'researching', 'audit_ready', 'contacted', 'followup_1',
  'followup_2', 'meeting', 'proposal_sent', 'negotiation', 'won', 'lost',
]

const PHASES = [
  { id: 'prospect', label: 'Prospect', stages: ['new_lead', 'researching', 'audit_ready'] },
  { id: 'outreach', label: 'Outreach', stages: ['contacted', 'followup_1', 'followup_2'] },
  { id: 'close', label: 'Close', stages: ['meeting', 'proposal_sent', 'negotiation', 'won', 'lost'] },
]

const stageAccent = {
  new_lead: 'bg-blue-500',
  researching: 'bg-cyan-500',
  audit_ready: 'bg-indigo-500',
  contacted: 'bg-violet-500',
  followup_1: 'bg-purple-500',
  followup_2: 'bg-purple-600',
  meeting: 'bg-fuchsia-500',
  proposal_sent: 'bg-orange-500',
  negotiation: 'bg-amber-500',
  won: 'bg-emerald-500',
  lost: 'bg-red-500',
}

function PipelinePage() {
  const [pipeline, setPipeline] = useState(null)
  const [dragging, setDragging] = useState(null)
  const [over, setOver] = useState(null)
  const [hideEmpty, setHideEmpty] = useState(true)
  const [moving, setMoving] = useState(false)

  const fetchPipeline = async () => {
    const res = await api.get('/pipeline')
    setPipeline(res.data.pipeline)
  }

  useEffect(() => { fetchPipeline() }, [])

  const totals = useMemo(() => {
    if (!pipeline) return { leads: 0, value: 0 }
    return STAGE_ORDER.reduce(
      (acc, key) => {
        const leads = pipeline[key]?.leads || []
        acc.leads += leads.length
        acc.value += leads.reduce((s, l) => s + (Number(l.estimated_budget) || 0), 0)
        return acc
      },
      { leads: 0, value: 0 },
    )
  }, [pipeline])

  const moveLead = async (leadId, toStage) => {
    if (moving) return
    setMoving(true)
    try {
      // Optimistic local move
      setPipeline((prev) => {
        if (!prev) return prev
        const next = { ...prev }
        let moved = null
        for (const key of STAGE_ORDER) {
          const idx = (next[key]?.leads || []).findIndex((l) => l.id === leadId)
          if (idx >= 0) {
            moved = { ...next[key].leads[idx], stage: toStage }
            next[key] = { ...next[key], leads: next[key].leads.filter((l) => l.id !== leadId) }
            break
          }
        }
        if (moved && next[toStage]) {
          next[toStage] = { ...next[toStage], leads: [moved, ...next[toStage].leads] }
        }
        return next
      })
      await api.put(`/pipeline/${leadId}/stage`, { stage: toStage })
    } catch {
      await fetchPipeline()
    } finally {
      setMoving(false)
    }
  }

  const onDrop = (e, stage) => {
    e.preventDefault()
    if (dragging && dragging !== stage) moveLead(dragging, stage)
    setDragging(null)
    setOver(null)
  }

  if (!pipeline) return <Spinner label="Loading pipeline..." />

  const visibleStages = STAGE_ORDER.filter((key) => {
    if (!pipeline[key]) return false
    if (!hideEmpty) return true
    return (pipeline[key].leads?.length || 0) > 0 || over === key || dragging
  })

  return (
    <div className="flex flex-col gap-4 -m-8 p-6 h-[calc(100vh)] min-h-0 bg-slate-50/80">
      <div className="flex flex-wrap items-end justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Pipeline</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {totals.leads} leads · {formatCurrency(totals.value)} pipeline value · drag cards to move
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600 bg-white border border-slate-200 rounded-lg px-3 py-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={hideEmpty}
            onChange={(e) => setHideEmpty(e.target.checked)}
            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
          Hide empty stages
        </label>
      </div>

      <div className="flex gap-3 overflow-x-auto overflow-y-hidden flex-1 min-h-0 pb-2">
        {PHASES.map((phase) => {
          const phaseStages = phase.stages.filter((s) => visibleStages.includes(s))
          if (phaseStages.length === 0) return null
          return (
            <div key={phase.id} className="flex flex-col gap-2 shrink-0 min-h-0">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 px-1">
                {phase.label}
              </div>
              <div className="flex gap-3 h-full min-h-0">
                {phaseStages.map((key) => {
                  const column = pipeline[key]
                  const count = column.leads.length
                  return (
                    <div
                      key={key}
                      onDragOver={(e) => { e.preventDefault(); setOver(key) }}
                      onDragLeave={() => setOver((o) => (o === key ? null : o))}
                      onDrop={(e) => onDrop(e, key)}
                      className={`w-[240px] flex flex-col rounded-xl bg-white border shadow-sm min-h-0 h-full transition ${
                        over === key ? 'border-emerald-400 ring-2 ring-emerald-200' : 'border-slate-200'
                      }`}
                    >
                      <div className="px-3 py-2.5 border-b border-slate-100 shrink-0">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${stageAccent[key]}`} />
                          <h3 className="font-semibold text-sm text-slate-800 truncate flex-1">{column.label}</h3>
                          <Badge color="bg-slate-100 text-slate-600">{count}</Badge>
                        </div>
                      </div>
                      <div className="p-2 space-y-2 overflow-y-auto flex-1 min-h-0">
                        {count === 0 && (
                          <p className="text-xs text-slate-400 text-center py-8">Drop leads here</p>
                        )}
                        {column.leads.map((lead) => (
                          <div
                            key={lead.id}
                            draggable
                            onDragStart={() => setDragging(lead.id)}
                            onDragEnd={() => { setDragging(null); setOver(null) }}
                            className={`rounded-lg border border-slate-200 bg-slate-50/80 p-2.5 cursor-grab active:cursor-grabbing hover:border-slate-300 hover:bg-white hover:shadow-sm transition ${
                              dragging === lead.id ? 'opacity-50' : ''
                            }`}
                          >
                            <Link to={`/leads/${lead.id}`} className="block" onClick={(e) => dragging && e.preventDefault()}>
                              <div className="flex items-start justify-between gap-2">
                                <p className="font-medium text-sm text-slate-900 leading-snug line-clamp-2">
                                  {lead.company?.name || lead.app?.name || 'Untitled'}
                                </p>
                                {lead.priority && lead.priority !== 'medium' && (
                                  <Badge color={priorityColor(lead.priority)}>{lead.priority}</Badge>
                                )}
                              </div>
                              <p className="text-xs text-slate-500 mt-1 truncate">
                                {lead.app?.name || lead.contact?.name || '—'}
                              </p>
                              <div className="flex items-center justify-between mt-2 gap-2">
                                <span className="text-[11px] text-slate-500">{formatCurrency(lead.estimated_budget)}</span>
                                <div className="flex items-center gap-1.5">
                                  {lead.app?.rating != null && (
                                    <span className="text-[11px] text-amber-600">{Number(lead.app.rating).toFixed(1)}★</span>
                                  )}
                                  {lead.lead_score != null && (
                                    <Badge
                                      color={
                                        lead.lead_score >= 70
                                          ? 'bg-emerald-100 text-emerald-700'
                                          : lead.lead_score >= 40
                                            ? 'bg-amber-100 text-amber-700'
                                            : 'bg-slate-100 text-slate-600'
                                      }
                                    >
                                      {lead.lead_score}
                                    </Badge>
                                  )}
                                </div>
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
        })}
      </div>
    </div>
  )
}

export default PipelinePage
