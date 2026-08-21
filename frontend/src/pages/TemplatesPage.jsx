import { useEffect, useState } from 'react'
import api from '../api/client'
import { Card } from '../components/ui'

function TemplatesPage() {
  const [templates, setTemplates] = useState([])
  const [form, setForm] = useState({ name: '', type: 'cold', subject: '', body: '' })
  const [saving, setSaving] = useState(false)

  const fetchTemplates = () => {
    api.get('/templates').then((res) => setTemplates(res.data.templates))
  }
  useEffect(() => { fetchTemplates() }, [])

  const save = async () => {
    setSaving(true)
    try {
      await api.post('/templates', form)
      setForm({ name: '', type: 'cold', subject: '', body: '' })
      fetchTemplates()
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id) => {
    await api.delete(`/templates/${id}`)
    fetchTemplates()
  }

  const input = 'w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500'

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Email Templates</h1>

      <Card title="Create Template">
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Template name" className={input} />
            <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} className={input}>
              {['cold', 'followup', 'linkedin', 'meeting'].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <input value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} placeholder="Subject" className={input} />
          </div>
          <textarea value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} rows={5} placeholder="Message body. Use {{contact_name}}, {{company_name}}, {{app_name}}, {{your_name}}" className={input} />
          <button onClick={save} disabled={saving || !form.name} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Template'}
          </button>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {templates.map((t) => (
          <Card key={t.id} title={t.name} subtitle={t.type} action={
            <button onClick={() => remove(t.id)} className="text-xs text-red-600 hover:underline">Delete</button>
          }>
            <p className="text-sm font-medium text-gray-600">{t.subject}</p>
            <p className="text-xs text-gray-500 mt-2 whitespace-pre-line line-clamp-3">{t.body}</p>
          </Card>
        ))}
      </div>
    </div>
  )
}

export default TemplatesPage