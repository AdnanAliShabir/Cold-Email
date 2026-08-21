/* eslint-disable no-undef */
const DEFAULT_API = 'https://cold-outreach-api-ijrk.onrender.com/api'
let current = null
let apiToken = ''
let apiBase = DEFAULT_API
let apiUser = null

const $ = (id) => document.getElementById(id)

function setStatus(msg, kind = '') {
  const el = $('status')
  el.textContent = msg
  el.className = 'status' + (kind ? ' ' + kind : '')
}

function syncAuthUi() {
  const loggedIn = !!(apiToken && apiUser)
  $('authLoggedIn').classList.toggle('hidden', !loggedIn)
  $('authLoggedOut').classList.toggle('hidden', loggedIn)
  if (loggedIn) {
    $('authUser').textContent = apiUser.email || apiUser.name || 'Signed in'
  }
}

function getApiBase() {
  return ($('apiBase').value.trim() || DEFAULT_API).replace(/\/$/, '')
}

async function apiFetch(path, options = {}) {
  const headers = {
    Accept: 'application/json',
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {}),
  }
  if (apiToken) headers.Authorization = 'Bearer ' + apiToken.replace(/^Bearer\s+/i, '')

  const res = await fetch(getApiBase() + path, { ...options, headers })
  let data = null
  try { data = await res.json() } catch (_) { data = null }
  return { res, data }
}

async function verifyToken() {
  if (!apiToken) return false
  const { res, data } = await apiFetch('/me')
  if (!res.ok) {
    apiToken = ''
    apiUser = null
    chrome.storage.local.remove(['apiToken', 'apiUser'])
    syncAuthUi()
    return false
  }
  apiUser = data.user || data
  chrome.storage.local.set({ apiUser })
  syncAuthUi()
  return true
}

chrome.storage.local.get(['apiToken', 'apiBase', 'apiUser', 'loginEmail', 'theme'], (res) => {
  applyTheme(res.theme === 'dark' ? 'dark' : 'light')

  apiToken = (res.apiToken || '').replace(/^Bearer\s+/i, '')
  apiBase = (res.apiBase || DEFAULT_API).replace(/\/$/, '')
  apiUser = res.apiUser || null
  $('apiBase').value = apiBase
  if (res.loginEmail) $('loginEmail').value = res.loginEmail
  syncAuthUi()

  // Instant UI — never block on network
  if (apiToken && apiUser) setStatus('Signed in')
  else if (apiToken) setStatus('Signed in')
  else setStatus('')

  // Wipe any leftover extract from a previous popup session
  chrome.storage.local.remove(['lastExtracted', 'lastExtractedUrl'])

  // Always extract current tab immediately (don't stick on previous app)
  ensureFresh({ preferCache: false })

  // Session check in background only
  if (apiToken) {
    verifyToken().then((ok) => {
      if (!ok) setStatus('Session expired — sign in again', 'err')
    }).catch(() => {})
  }
})

function applyTheme(theme) {
  const next = theme === 'dark' ? 'dark' : 'light'
  document.documentElement.setAttribute('data-theme', next)
  const icon = $('themeIcon')
  if (icon) icon.textContent = next === 'dark' ? '☀' : '☾'
  const btn = $('themeToggle')
  if (btn) btn.title = next === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
  const next = currentTheme === 'dark' ? 'light' : 'dark'
  applyTheme(next)
  chrome.storage.local.set({ theme: next })
}

$('themeToggle')?.addEventListener('click', toggleTheme)

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

  // Force icon/title refresh (browser may keep previous img if we only tweak attrs)
  const iconEl = $('appIcon')
  if (iconEl) {
    iconEl.removeAttribute('src')
    iconEl.src = ''
    if (data.icon) {
      // Cache-bust so SPA-stale identical-looking URLs still reload when needed
      const sep = data.icon.includes('?') ? '&' : '?'
      iconEl.src = data.icon + sep + 'leadcrm=' + (data.extracted_at || Date.now())
    }
  }
  $('appName').textContent = data.name || data.app_id || 'Unknown app'
  const reviews = data.review_count ? Number(data.review_count).toLocaleString() : 'n/a'
  const downloads = data.android_downloads || data.ios_downloads
  $('appMeta').textContent = [
    data.rating != null ? data.rating + '★' : null,
    reviews + ' reviews',
    downloads ? ('downloads: ' + Number(downloads).toLocaleString()) : null,
  ].filter(Boolean).join(' · ')

  // Overwrite every field — never leave previous app values
  $('fName').value = data.name || ''
  $('fCompany').value = (data.company && data.company.name) || data.developer || ''
  $('fWebsite').value =
    (data.company && data.company.website) ||
    (data.developer_contact && data.developer_contact.website) ||
    ''
  $('fUrl').value = data.url || data.page_url || ''
  $('fRating').value = data.rating != null ? data.rating : ''
  $('fReviews').value = data.review_count != null ? data.review_count : ''
  $('fDownloads').value = data.android_downloads != null ? data.android_downloads : (data.ios_downloads != null ? data.ios_downloads : '')
  $('fVersion').value = data.current_version || ''
  $('fUpdated').value = data.last_updated_raw || data.last_updated || ''
  const devContact = data.developer_contact || {}
  $('fContact').value = devContact.name || data.developer || ''
  $('fEmail').value = (devContact.support_email || devContact.email) || ''
  if ($('fRequires')) $('fRequires').value = data.requires_android || ''
  if ($('fReleased')) $('fReleased').value = data.released_on_raw || data.released_on || ''
  if ($('fSize')) $('fSize').value = data.download_size || ''
  if ($('fCountry')) {
    let country = (data.company && data.company.country) || devContact.country || ''
    const address = (data.company && data.company.address) || devContact.address || ''
    if (!country && address) {
      const m = address.match(/\b(United States|United Kingdom|Canada|Australia|Germany|France|India|Pakistan|Netherlands|Singapore|Japan|Brazil|Mexico|Spain|Italy|Poland|Ireland|USA|UK)\b\s*$/i)
      if (m) country = m[1] === 'USA' ? 'United States' : m[1] === 'UK' ? 'United Kingdom' : m[1]
      else if (/\b[A-Z]{2}\s+\d{5}(-\d{4})?\b/.test(address)) country = 'United States'
    }
    $('fCountry').value = country
  }
  if ($('fAddress')) {
    $('fAddress').value = (data.company && data.company.address) || devContact.address || ''
  }
  if ($('fPhone')) $('fPhone').value = devContact.phone || ''
  if ($('fSourceHint')) {
    $('fSourceHint').textContent = data.about_source === 'play_about_sheet'
      ? 'From Play About sheet'
      : (data.about_source === 'dom_embedded' ? 'From page + Play data' : (data.about_source || ''))
  }

  const fmt = (v) => (v == null || v === '' ? '—' : (typeof v === 'number' ? v.toLocaleString() : String(v)))
  if ($('statRating')) $('statRating').textContent = data.rating != null ? data.rating + '★' : '—'
  if ($('statReviews')) $('statReviews').textContent = fmt(data.review_count)
  if ($('statDownloads')) {
    $('statDownloads').textContent = data.downloads_raw || fmt(data.android_downloads || data.ios_downloads)
  }
  if ($('statVersion')) $('statVersion').textContent = data.current_version || '—'

  const hasLi = !!(data.linkedin_people_search || data.linkedin_company_search)
  $('liActions').classList.toggle('hidden', !hasLi)
}

function clearFormVisual() {
  current = null
  ;['fName','fCompany','fWebsite','fUrl','fRating','fReviews','fDownloads','fVersion','fUpdated','fRequires','fSize','fReleased','fContact','fEmail','fCountry','fAddress','fPhone'].forEach((id) => {
    if ($(id)) $(id).value = ''
  })
  if ($('appName')) $('appName').textContent = 'Extracting…'
  if ($('appMeta')) $('appMeta').textContent = ''
  if ($('fSourceHint')) $('fSourceHint').textContent = ''
  ;['statRating','statReviews','statDownloads','statVersion'].forEach((id) => {
    if ($(id)) $(id).textContent = '—'
  })
  if ($('appIcon')) {
    $('appIcon').removeAttribute('src')
    $('appIcon').src = ''
  }
}

function ensureFresh(opts = {}) {
  const { silent = false } = opts
  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    const tab = tabs[0]
    if (!tab?.id) return

    const tabUrl = tab.url || ''
    if (!/play\.google\.com\/store\/apps\/details|apps\.apple\.com\/.*\/app\//i.test(tabUrl)) {
      $('form').classList.add('hidden')
      $('emptyState').classList.remove('hidden')
      setStatus('Open a Play Store or App Store app page')
      return
    }

    if (!silent) {
      $('form').classList.remove('hidden')
      $('emptyState').classList.add('hidden')
      clearFormVisual()
      setStatus('Extracting…')
    }

    chrome.storage.local.remove(['lastExtracted', 'lastExtractedUrl'])

    const tabAppId = (() => {
      try { return new URL(tabUrl).searchParams.get('id') } catch { return null }
    })()

    let liveTitle = null
    let liveIcon = null
    try {
      const inj = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const h1 = [...document.querySelectorAll('h1')].find((el) => {
            const r = el.getBoundingClientRect()
            return r.width > 0 && r.height > 0
          }) || document.querySelector('h1')
          const name = (h1?.textContent || '').replace(/\s+/g, ' ').trim()
          const scope = h1?.closest('c-wiz, main, [role="main"]') || document.body
          const imgs = [...scope.querySelectorAll('img')].filter((img) => {
            const r = img.getBoundingClientRect()
            return r.width >= 40 && r.height >= 40 && r.width <= 320
          })
          let icon = null
          if (name) {
            const needle = name.slice(0, 16).toLowerCase()
            const byAlt = imgs.find((img) => (img.alt || '').toLowerCase().includes(needle))
            if (byAlt) icon = byAlt.currentSrc || byAlt.src
          }
          if (!icon && imgs[0]) icon = imgs[0].currentSrc || imgs[0].src
          return { name, icon }
        },
      })
      liveTitle = inj?.[0]?.result?.name || null
      liveIcon = inj?.[0]?.result?.icon || null
      if (liveTitle && $('appName')) $('appName').textContent = 'Extracting: ' + liveTitle
      if (liveIcon && $('appIcon')) $('appIcon').src = liveIcon
    } catch (err) {
      setStatus('Cannot access tab: ' + (err.message || err), 'err')
      return
    }

    // Inject extractor (IIFE-safe). Then run extract in-page — no sendMessage race.
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] })
    } catch (err) {
      setStatus('Inject failed: ' + (err.message || err) + ' — reload the Play page', 'err')
      return
    }

    let payload = null
    try {
      const run = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: async () => {
          try {
            const fn = window.__leadcrmExtract
            if (typeof fn !== 'function') {
              return { data: null, error: 'Extractor not loaded (v' + (window.__leadcrmExtractorVersion || '?') + ')' }
            }
            const data = await fn()
            return { data, error: null, version: window.__leadcrmExtractorVersion || null }
          } catch (e) {
            return { data: null, error: String(e && e.message ? e.message : e) }
          }
        },
      })
      payload = run?.[0]?.result || null
    } catch (err) {
      setStatus('Extract failed: ' + (err.message || err), 'err')
      return
    }

    if (payload?.error && !payload?.data) {
      setStatus('Extract error: ' + payload.error, 'err')
      return
    }

    if (payload?.data) {
      const data = payload.data
      if (tabAppId && data.app_id && data.app_id !== tabAppId) {
        clearFormVisual()
        setStatus('Wrong app id — reload Play page, then Re-extract', 'err')
        return
      }
      // Live DOM always wins for identity (About sheet may be right while meta was stale)
      if (liveTitle) data.name = liveTitle
      if (liveIcon) data.icon = liveIcon
      data.url = tabUrl
      data.page_url = tabUrl
      if (tabAppId) data.app_id = tabAppId
      data.extracted_at = Date.now()
      clearFormVisual()
      render(data)
      setStatus(apiToken ? 'Signed in · ' + (data.name || 'ok') : 'Extracted — sign in to send')
    } else {
      $('form').classList.add('hidden')
      $('emptyState').classList.remove('hidden')
      setStatus('Could not extract — hard-refresh the Play tab (Cmd+Shift+R)', 'err')
    }
  })
}

window.addEventListener('pagehide', () => {
  chrome.storage.local.remove(['lastExtracted', 'lastExtractedUrl'])
})
window.addEventListener('unload', () => {
  chrome.storage.local.remove(['lastExtracted', 'lastExtractedUrl'])
})

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
  if (current?.last_updated && /^\d{4}-\d{2}-\d{2}/.test(current.last_updated)) {
    app.last_updated = current.last_updated
  }
  if (isPlay) {
    app.google_play_url = $('fUrl').value || null
    app.android_downloads = num($('fDownloads').value)
  } else {
    app.app_store_url = $('fUrl').value || null
    app.ios_downloads = num($('fDownloads').value)
  }

  const scrapedCompany = (current && current.company) || {}
  const scrapedContact = (current && current.developer_contact) || {}
  const downloads = num($('fDownloads').value)
  return {
    company: {
      name: $('fCompany').value || $('fName').value,
      website: $('fWebsite').value || scrapedCompany.website || '',
      industry: scrapedCompany.industry || current?.category || '',
      country: ($('fCountry') && $('fCountry').value) || scrapedCompany.country || '',
    },
    contact: {
      name: $('fContact').value,
      position: '',
      email: $('fEmail').value,
      phone: ($('fPhone') && $('fPhone').value) || scrapedContact.phone || '',
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

async function login() {
  const email = $('loginEmail').value.trim()
  const password = $('loginPassword').value
  apiBase = getApiBase()
  if (!email || !password) {
    setStatus('Enter email and password', 'err')
    return
  }
  $('loginBtn').disabled = true
  setStatus('Signing in (API may take ~30s to wake)...')
  try {
    chrome.storage.local.set({ apiBase, loginEmail: email })
    // Temporary clear so apiFetch doesn't send a bad token during login
    const prev = apiToken
    apiToken = ''
    const { res, data } = await apiFetch('/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    if (!res.ok || !data?.token) {
      apiToken = prev
      setStatus('Login failed: ' + (data?.message || ('HTTP ' + res.status)), 'err')
      return
    }
    apiToken = String(data.token).replace(/^Bearer\s+/i, '')
    apiUser = data.user || { email }
    chrome.storage.local.set({ apiToken, apiUser, apiBase })
    $('loginPassword').value = ''
    syncAuthUi()
    setStatus('Signed in as ' + (apiUser.email || email), 'ok')
  } catch (err) {
    setStatus('Network error — check API URL / wait for Render wake-up', 'err')
  } finally {
    $('loginBtn').disabled = false
  }
}

function logout() {
  apiToken = ''
  apiUser = null
  chrome.storage.local.remove(['apiToken', 'apiUser'])
  syncAuthUi()
  setStatus('Signed out', 'ok')
}

async function sendToCrm() {
  if (!apiToken) {
    setStatus('Sign in first (email + password above)', 'err')
    return
  }
  const btn = $('sendToCrm')
  btn.disabled = true
  setStatus('Sending...')
  try {
    // Re-verify; if expired, force re-login
    const ok = await verifyToken()
    if (!ok) {
      setStatus('Session expired — sign in again', 'err')
      return
    }

    const { res, data } = await apiFetch('/leads', {
      method: 'POST',
      body: JSON.stringify(buildPayload()),
    })
    if (!res.ok) {
      const detail = data?.message || data?.error || ('HTTP ' + res.status)
      if (res.status === 401) {
        setStatus('Unauthenticated — sign in again', 'err')
        logout()
      } else {
        setStatus('Error: ' + detail, 'err')
      }
      return
    }
    const id = data.lead ? data.lead.id : '?'
    setStatus('Lead #' + id + ' created.', 'ok')
    chrome.storage.local.remove('lastExtracted')
  } catch (err) {
    setStatus('Network error — check API URL (Render may be waking up).', 'err')
  } finally {
    btn.disabled = false
  }
}

$('loginBtn').addEventListener('click', login)
$('logoutBtn').addEventListener('click', logout)
$('sendToCrm').addEventListener('click', sendToCrm)
$('reextract').addEventListener('click', () => ensureFresh({ silent: false }))
$('apiBase').addEventListener('change', () => {
  apiBase = getApiBase()
  chrome.storage.local.set({ apiBase })
})

$('openLiPeople').addEventListener('click', () => {
  const url = current?.linkedin_people_search
  if (url) chrome.tabs.create({ url })
})
$('openLiCompany').addEventListener('click', () => {
  const url = current?.linkedin_company_search
  if (url) chrome.tabs.create({ url })
})
