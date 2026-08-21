/* eslint-disable no-undef */
const API_BASE = 'http://127.0.0.1:8000/api'
let current = null
let apiToken = ''

const $ = (id) => document.getElementById(id)

chrome.storage.local.get(['apiToken', 'lastExtracted'], (res) => {
  apiToken = res.apiToken || ''
  $('apiToken').value = apiToken
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
  const reviews = data.review_count ? data.review_count.toLocaleString() : 'n/a'
  const downloads = data.android_downloads ? data.android_downloads.toLocaleString() : 'n/a'
  $('appMeta').textContent = [
    data.rating ? data.rating + '★' : null,
    reviews + ' reviews',
    'downloads: ' + downloads,
  ].filter(Boolean).join(' · ')

  $('fName').value = data.name || ''
  $('fCompany').value = (data.company && data.company.name) || data.developer || ''
  $('fUrl').value = data.url || ''
  $('fRating').value = data.rating ?? ''
  $('fReviews').value = data.review_count ?? ''
  $('fDownloads').value = data.android_downloads ?? data.ios_downloads ?? ''
  $('fVersion').value = data.current_version || ''
  $('fUpdated').value = data.last_updated || ''
  const devContact = data.developer_contact || {}
  $('fContact').value = devContact.name || ''
  $('fEmail').value = devContact.email || ''
}

function ensureFresh() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0]
    if (!tab || !tab.id) return
    chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_NOW' }, (res) => {
      if (chrome.runtime.lastError) {
        // content script not present on this page
        $('form').classList.add('hidden')
        $('emptyState').classList.remove('hidden')
        return
      }
      if (res && res.data) {
        render(res.data)
      } else {
        $('form').classList.add('hidden')
        $('emptyState').classList.remove('hidden')
      }
    })
  })
}

function buildPayload() {
  const num = (v, fallback = 0) => {
    const n = Number(v)
    return Number.isFinite(n) && n !== 0 ? n : fallback
  }
  // Ensure numeric fields always post a value (apps.review_count is NOT NULL
  // and rated 0..5). Null/empty input falls back to the given default.
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
  return {
    company: {
      name: $('fCompany').value || $('fName').value,
      website: scrapedCompany.website || '',
      industry: '',
      country: scrapedCompany.country || '',
    },
    contact: {
      name: $('fContact').value,
      position: '',
      email: $('fEmail').value,
    },
    app,
    source: $('fSource').value,
    priority: $('fPriority').value,
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
    const res = await fetch(API_BASE + '/leads', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': 'Bearer ' + apiToken,
      },
      body: JSON.stringify(buildPayload()),
    })
    const data = await res.json()
    if (!res.ok) {
      const detail = data.error || data.message || ('HTTP ' + res.status)
      setStatus('Error: ' + detail, 'err')
      return
    }
    const id = data.lead ? data.lead.id : '?'
    setStatus('Lead #' + id + ' created successfully.', 'ok')
    chrome.storage.local.remove('lastExtracted')
  } catch (err) {
    setStatus('Network error — is the backend running on :8000?', 'err')
  } finally {
    btn.disabled = false
  }
}

$('sendToCrm').addEventListener('click', sendToCrm)
$('reextract').addEventListener('click', ensureFresh)

$('saveToken').addEventListener('click', () => {
  apiToken = $('apiToken').value.trim()
  chrome.storage.local.set({ apiToken }, () => setStatus('API token saved', 'ok'))
})