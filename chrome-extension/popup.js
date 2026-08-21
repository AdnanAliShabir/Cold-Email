/* eslint-disable no-undef */
const DEFAULT_API = 'https://cold-outreach-api-ijrk.onrender.com/api'
let current = null
let apiToken = ''
let apiBase = DEFAULT_API

const $ = (id) => document.getElementById(id)

chrome.storage.local.get(['apiToken', 'apiBase', 'lastExtracted'], (res) => {
  apiToken = res.apiToken || ''
  apiBase = (res.apiBase || DEFAULT_API).replace(/\/$/, '')
  $('apiToken').value = apiToken
  $('apiBase').value = apiBase
  const last = res.lastExtracted
  if (last) render(last)
  else ensureFresh()
})

function setStatus(msg, kind = '') {
  const el = $('status')
  el.textContent = msg
  el.className = 'hint ' + kind
}

function setPlatformBadge(data) {
  const badge = $('platformBadge')
  if (data && data.platform) {
    badge.textContent = data.platform_label
    badge.className = 'badge ' + data.platform
  } else {
    badge.className = 'badge hidden'
  }
}

function render(data) {
  current = data
  setPlatformBadge(data)

  if (data.platform) {
    $('fSource').value = data.platform === 'google_play' ? 'Play Store Search' : 'App Store Search'
  }

  $('form').classList.remove('hidden')
  $('emptyState').classList.add('hidden')
  $('appIcon').src = data.icon || ''
  $('appName').textContent = data.name || data.app_id || 'Unknown app'
  const reviews = data.review_count ? Number(data.review_count).toLocaleString() : 'n/a'
  const downloads = data.android_downloads || data.ios_downloads
  $('appMeta').textContent = [
    data.rating != null ? data.rating + '★' : null,
    reviews + ' reviews',
    downloads ? ('downloads: ' + Number(downloads).toLocaleString()) : null,
  ].filter(Boolean).join(' · ')

  $('fName').value = data.name || ''
  $('fCompany').value = (data.company && data.company.name) || data.developer || ''
  $('fWebsite').value = (data.company && data.company.website) || (data.developer_contact && data.developer_contact.website) || ''
  $('fUrl').value = data.url || ''
  $('fRating').value = data.rating ?? ''
  $('fReviews').value = data.review_count ?? ''
  $('fDownloads').value = data.android_downloads ?? data.ios_downloads ?? ''
  $('fVersion').value = data.current_version || ''
  $('fUpdated').value = data.last_updated || ''
  const devContact = data.developer_contact || {}
  $('fContact').value = devContact.name || data.developer || ''
  $('fEmail').value = devContact.email || ''

  const hasLi = !!(data.linkedin_people_search || data.linkedin_company_search)
  $('liActions').classList.toggle('hidden', !hasLi)
}

function ensureFresh() {
  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    const tab = tabs[0]
    if (!tab?.id) return

    const tryMessage = () => new Promise((resolve) => {
      chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_NOW' }, (res) => {
        if (chrome.runtime.lastError) resolve(null)
        else resolve(res)
      })
    })

    let res = await tryMessage()
    if (!res) {
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] })
        res = await tryMessage()
      } catch (_) {
        /* not a store page or no permission */
      }
    }

    if (res?.data) render(res.data)
    else {
      $('form').classList.add('hidden')
      $('emptyState').classList.remove('hidden')
    }
  })
}

function buildPayload() {
  const num = (v, fallback = 0) => {
    const n = Number(v)
    return Number.isFinite(n) && n !== 0 ? n : fallback
  }
  const platform = current ? current.platform : 'google_play'
  const isPlay = platform === 'google_play'

  const app = {
    name: $('fName').value || null,
    rating: num($('fRating').value),
    review_count: num($('fReviews').value),
    current_version: $('fVersion').value || 'Unknown version',
    last_updated: $('fUpdated').value || null,
  }
  if (isPlay) {
    app.google_play_url = $('fUrl').value || null
    app.android_downloads = num($('fDownloads').value)
  } else {
    app.app_store_url = $('fUrl').value || null
    app.ios_downloads = num($('fDownloads').value)
  }

  const scrapedCompany = (current && current.company) || {}
  const downloads = num($('fDownloads').value)
  return {
    company: {
      name: $('fCompany').value || $('fName').value,
      website: $('fWebsite').value || scrapedCompany.website || '',
      industry: scrapedCompany.industry || current?.category || '',
      country: scrapedCompany.country || '',
    },
    contact: {
      name: $('fContact').value,
      position: '',
      email: $('fEmail').value,
      linkedin: '',
    },
    app,
    source: $('fSource').value || 'Chrome Extension',
    priority: $('fPriority').value,
    estimated_budget: downloads
      ? Math.max(8000, Math.min(50000, Math.round(downloads * 0.02)))
      : null,
  }
}

async function sendToCrm() {
  if (!apiToken) {
    setStatus('Enter and save your LeadCRM API token first.', 'err')
    return
  }
  const btn = $('sendToCrm')
  btn.disabled = true
  setStatus('Sending...')
  try {
    const res = await fetch(apiBase + '/leads', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: 'Bearer ' + apiToken,
      },
      body: JSON.stringify(buildPayload()),
    })
    let data = {}
    try { data = await res.json() } catch (_) { /* non-json */ }
    if (!res.ok) {
      const detail = data.error || data.message || ('HTTP ' + res.status)
      setStatus('Error: ' + detail, 'err')
      return
    }
    const id = data.lead ? data.lead.id : '?'
    setStatus('Lead #' + id + ' created. Tip: use Find LinkedIn next.', 'ok')
    chrome.storage.local.remove('lastExtracted')
  } catch (err) {
    setStatus('Network error — check API URL (Render may be waking up).', 'err')
  } finally {
    btn.disabled = false
  }
}

$('sendToCrm').addEventListener('click', sendToCrm)
$('reextract').addEventListener('click', ensureFresh)

$('saveToken').addEventListener('click', () => {
  apiToken = $('apiToken').value.trim()
  apiBase = ($('apiBase').value.trim() || DEFAULT_API).replace(/\/$/, '')
  chrome.storage.local.set({ apiToken, apiBase }, () => setStatus('Settings saved', 'ok'))
})

$('openLiPeople').addEventListener('click', () => {
  const url = current?.linkedin_people_search
  if (url) chrome.tabs.create({ url })
})
$('openLiCompany').addEventListener('click', () => {
  const url = current?.linkedin_company_search
  if (url) chrome.tabs.create({ url })
})
