import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client'
import { Card } from '../components/ui'

export default function SettingsPage() {
  const [form, setForm] = useState({
    sender_name: '',
    company_name: '',
    from_email: '',
  })
  const [defaults, setDefaults] = useState({ from_email: '', from_name: '' })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    api.get('/settings').then((res) => {
      setForm({
        sender_name: res.data.settings?.sender_name || '',
        company_name: res.data.settings?.company_name || '',
        from_email: res.data.settings?.from_email || res.data.defaults?.from_email || '',
      })
      setDefaults(res.data.defaults || {})
    })
  }, [])

  const save = async () => {
    setSaving(true)
    setMsg('')
    try {
      await api.put('/settings', { settings: form })
      setMsg('Saved — used as From name on outreach emails')
    } catch (err) {
      setMsg(err?.response?.data?.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const input = 'w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500'

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Sender identity for cold outreach emails</p>
      </div>

      <Card title="Email identity" subtitle="Shown in the From field when you send from Outreach">
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="text-gray-600">Your name</span>
            <input
              className={input + ' mt-1'}
              value={form.sender_name}
              onChange={(e) => setForm((f) => ({ ...f, sender_name: e.target.value }))}
              placeholder="Adnan Ali"
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">Company name</span>
            <input
              className={input + ' mt-1'}
              value={form.company_name}
              onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
              placeholder="TyroSoft"
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">From email</span>
            <input
              className={input + ' mt-1'}
              type="email"
              value={form.from_email}
              onChange={(e) => setForm((f) => ({ ...f, from_email: e.target.value }))}
              placeholder={defaults.from_email || 'you@tyrosoft.com'}
            />
            <span className="text-xs text-gray-400 mt-1 block">
              Must be on your Resend-verified domain (e.g. @tyrosoft.com). Env default: {defaults.from_email || '—'}
            </span>
          </label>

          {form.sender_name && form.from_email && (
            <p className="text-xs text-gray-500 bg-slate-50 border rounded-lg px-3 py-2">
              Preview: <strong>{form.sender_name}{form.company_name ? ` · ${form.company_name}` : ''}</strong>
              {' <'}{form.from_email}{'>'}
            </p>
          )}

          <button
            onClick={save}
            disabled={saving}
            className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save settings'}
          </button>
          {msg && <p className="text-sm text-gray-600">{msg}</p>}
        </div>
      </Card>

      <p className="text-xs text-gray-400">
        These values are used when you send from a lead’s <Link className="text-emerald-700 underline" to="/leads">Outreach</Link> tab.
      </p>
    </div>
  )
}
