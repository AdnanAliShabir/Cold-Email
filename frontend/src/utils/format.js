export function priorityColor(priority) {
  const map = {
    low: 'bg-gray-100 text-gray-700',
    medium: 'bg-amber-100 text-amber-700',
    high: 'bg-red-100 text-red-700',
  }
  return map[priority] || 'bg-gray-100 text-gray-700'
}

export function scoreColor(score) {
  if (score >= 70) return 'bg-emerald-100 text-emerald-700'
  if (score >= 40) return 'bg-amber-100 text-amber-700'
  return 'bg-gray-100 text-gray-600'
}

export function stageColor(stage) {
  const map = {
    new_lead: 'bg-blue-100 text-blue-700',
    researching: 'bg-cyan-100 text-cyan-700',
    audit_ready: 'bg-indigo-100 text-indigo-700',
    contacted: 'bg-violet-100 text-violet-700',
    followup_1: 'bg-purple-100 text-purple-700',
    followup_2: 'bg-purple-100 text-purple-700',
    meeting: 'bg-fuchsia-100 text-fuchsia-700',
    proposal_sent: 'bg-orange-100 text-orange-700',
    negotiation: 'bg-amber-100 text-amber-700',
    won: 'bg-emerald-100 text-emerald-700',
    lost: 'bg-red-100 text-red-700',
  }
  return map[stage] || 'bg-gray-100 text-gray-700'
}

export function severityColor(severity) {
  const map = {
    critical: 'bg-red-100 text-red-700',
    high: 'bg-orange-100 text-orange-700',
    medium: 'bg-amber-100 text-amber-700',
    low: 'bg-gray-100 text-gray-600',
  }
  return map[severity] || 'bg-gray-100 text-gray-600'
}

export function formatCurrency(value) {
  if (!value) return '$0'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}