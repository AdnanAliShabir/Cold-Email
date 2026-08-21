import { useState } from 'react'
import api from '../api/client'

function LeadFormModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    company: { name: '', website: '', industry: '', country: '', size: '', revenue: '' },
    contact: { name: '', position: '', email: '', phone: '', linkedin: '' },
    app: { name: '', google_play_url: '', app_store_url: '', android_downloads: '', rating: '', review_count: '', current_version: '' },
    source: 'Play Store Search',
    priority: 'medium',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (section, field, value) => {
    setForm((f) => ({ ...f, [section]: { ...f[section], [field]: value } }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const payload = {
        ...form,
        company: Object.fromEntries(Object.entries(form.company).filter(([, v]) => v !== '')),
        contact: Object.fromEntries(Object.entries(form.contact).filter(([, v]) => v !== '')),
        app: Object.fromEntries(Object.entries(form.app).filter(([, v]) => v !== '')),
        estimated_budget: form.app.android_downloads
          ? Math.max(8000, Math.min(50000, Math.round(form.app.android_downloads * 0.02)))
          : null,
      }
      await api.post('/leads', payload)
      onCreated()
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create lead')
    } finally {
      setSaving(false)
    }
  }

  const input = 'w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500'
  const sectionLabel = 'block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2'

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold">Add New Lead</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}

          <div>
            <h3 className={section}>Company</h3>
            <div className="grid grid-cols-2 gap-3">
              <input value={form.company.name} onChange={(e) => set('company', 'name', e.target.value)} placeholder="Company name*" className={input} required />
              <input value={form.company.website} onChange={(e) => set('company', 'website', e.target.value)} placeholder="Website" className={input} />
              <input value={form.company.industry} onChange={(e) => set('company', 'industry', e.target.value)} placeholder="Industry" className={input} />
              <input value={form.company.country} onChange={(e) => set('company', 'country', e.target.value)} placeholder="Country" className={input} />
              <input value={form.company.size} onChange={(e) => set('company', 'size', e.target.value)} placeholder="Size (e.g. 11-50)" className={input} />
              <input value={form.company.revenue} onChange={(e) => set('company', 'revenue', e.target.value)} placeholder="Revenue" className={input} />
            </div>
          </div>

          <div>
            <h3 className={section}>Contact</h3>
            <div className="grid grid-cols-2 gap-3">
              <input value={form.contact.name} onChange={(e) => set('contact', 'name', e.target.value)} placeholder="Contact name" className={input} required />
              <input value={form.contact.position} onChange={(e) => set('contact', 'position', e.target.value)} placeholder="Position" className={input} />
              <input value={form.contact.email} onChange={(e) => set('contact', 'email', e.target.value)} placeholder="Email" className={input} />
              <input value={form.contact.phone} onChange={(e) => set('contact', 'phone', e.target.value)} placeholder="Phone" className={input} />
              <input value={form.contact.linkedin} onChange={(e) => set('contact', 'linkedin', e.target.value)} placeholder="LinkedIn URL" className={`${input} col-span-2`} />
            </div>
          </div>

          <div>
            <h3 className={section}>App</h3>
            <div className="grid grid-cols-2 gap-3">
              <input value={form.app.name} onChange={(e) => set('app', 'name', e.target.value)} placeholder="App name" className={input} />
              <input value={form.app.current_version} onChange={(e) => set('app', 'current_version', e.target.value)} placeholder="Current version" className={input} />
              <input value={form.app.google_play_url} onChange={(e) => set('app', 'google_play_url', e.target.value)} placeholder="Google Play URL" className={`${input} col-span-2`} />
              <input value={form.app.app_store_url} onChange={(e) => set('app', 'app_store_url', e.target.value)} placeholder="App Store URL" className={`${input} col-span-2`} />
              <input value={form.app.android_downloads} onChange={(e) => set('app', 'android_downloads', e.target.value)} placeholder="Android downloads" className={input} />
              <input value={form.app.rating} onChange={(e) => set('app', 'rating', e.target.value)} placeholder="Rating (0-5)" className={input} />
              <input value={form.app.review_count} onChange={(e) => set('app', 'review_count', e.target.value)} placeholder="Review count" className={input} />
            </div>
          </div>

          <div>
            <h3 className={section}>Business</h3>
            <div className="grid grid-cols-2 gap-3">
              <select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))} className={input}>
                <option value="low">Low priority</option>
                <option value="medium">Medium priority</option>
                <option value="high">High priority</option>
              </select>
              <select value={form.source} onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))} className={input}>
                {['Play Store Search','App Store Search','Website Discovery','LinkedIn','Referral','Cold Email'].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default LeadFormModal