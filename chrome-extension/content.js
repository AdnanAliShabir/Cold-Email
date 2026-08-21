/* eslint-disable no-undef */
// LeadCRM Store Extractor — content script (v3)
// Prefer JSON-LD + iTunes Lookup + resilient text/DOM heuristics (no brittle class hashes).

const isPlayStore = () => window.location.hostname.includes('play.google.com')
const isAppStore = () => window.location.hostname.includes('apps.apple.com')

function clean(text) {
  return (text || '').replace(/\s+/g, ' ').trim()
}

function firstText(...selectors) {
  for (const sel of selectors) {
    const el = document.querySelector(sel)
    if (!el) continue
    const val = el.getAttribute?.('content') || el.textContent
    if (clean(val)) return clean(val)
  }
  return null
}

function parseNumber(str) {
  if (str == null) return null
  const num = parseFloat(String(str).replace(/[^0-9.]/g, ''))
  return Number.isFinite(num) ? num : null
}

function parseDownloadCount(str) {
  if (str == null) return null
  const cleaned = String(str).replace(/[,\s]/g, '')
  const match = cleaned.match(/([\d.]+)\s*([KMB])?\+?/i)
  if (!match) return null
  const value = parseFloat(match[1])
  const suffix = (match[2] || '').toUpperCase()
  const mult = suffix === 'K' ? 1e3 : suffix === 'M' ? 1e6 : suffix === 'B' ? 1e9 : 1
  return Math.round(value * mult)
}

function parseCount(v) {
  if (v == null) return null
  if (typeof v === 'string' && /[KMB]/i.test(v)) return parseDownloadCount(v)
  return parseNumber(v)
}

function parseAllJsonLd() {
  const scripts = [...document.querySelectorAll('script[type="application/ld+json"]')]
  const blocks = []
  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent)
      if (Array.isArray(data)) blocks.push(...data)
      else if (data && Array.isArray(data['@graph'])) blocks.push(...data['@graph'])
      else if (data) blocks.push(data)
    } catch (_) { /* ignore bad blocks */ }
  }
  const app = blocks.find((x) => {
    const t = x?.['@type']
    return t === 'SoftwareApplication' || (Array.isArray(t) && t.includes('SoftwareApplication'))
  }) || blocks.find((x) => x?.name && (x.aggregateRating || x.author || x.publisher))
  if (!app) return null

  const author = app.author || app.publisher || {}
  const agg = app.aggregateRating || {}
  return {
    name: clean(app.name),
    developer: author?.name ? clean(author.name) : null,
    rating: parseNumber(agg.ratingValue),
    review_count: parseCount(agg.ratingCount ?? agg.reviewCount),
    icon: typeof app.image === 'string' ? app.image : app.image?.url || null,
    description: clean(app.description),
    category: clean(app.applicationCategory),
    url: app.url || null,
  }
}

function findMailtoEmails() {
  return [...document.querySelectorAll('a[href^="mailto:"]')]
    .map((a) => clean((a.getAttribute('href') || '').replace(/^mailto:/i, '').split('?')[0]))
    .filter((e) => e && e.includes('@'))
}

function findHttpLinks() {
  return [...document.querySelectorAll('a[href^="http"]')]
    .map((a) => ({ href: a.href, label: clean(a.textContent) }))
    .filter((x) => x.href && !/play\.google|apps\.apple|gstatic|google\.com\/store/i.test(x.href))
}

function scrapePlayDownloads(bodyText) {
  // Common patterns: "10M+", "1,000,000+", "Downloads" adjacent value
  const patterns = [
    /([\d.,]+[KMB]?\+?)\s*\n?\s*Downloads/i,
    /Downloads\s*\n?\s*([\d.,]+[KMB]?\+?)/i,
  ]
  for (const re of patterns) {
    const m = bodyText.match(re)
    if (m) {
      const n = parseDownloadCount(m[1])
      if (n) return n
    }
  }
  // Walk short text nodes near "Downloads"
  let found = null
  document.querySelectorAll('div, span').forEach((el) => {
    if (found) return
    if (el.children.length > 4) return
    const t = clean(el.textContent)
    if (!t || t.length > 40) return
    if (/^downloads$/i.test(t)) {
      const prev = el.previousElementSibling || el.parentElement?.children?.[0]
      const n = parseDownloadCount(prev && clean(prev.textContent))
      if (n) found = n
    }
  })
  return found
}

function scrapePlayMeta(bodyText) {
  let lastUpdated = null
  const um = bodyText.match(/Updated\s+on\s+([A-Z][a-z]{2}\s+\d{1,2},\s+\d{4})/i)
  if (um) lastUpdated = um[1]

  let version = null
  const vm = bodyText.match(/(?:Current version|Version)\s*[:\s]+([0-9][0-9A-Za-z._-]*)/)
  if (vm) version = vm[1]

  return { last_updated: lastUpdated, current_version: version }
}

function scrapePlayDeveloper(jsonDeveloper) {
  const emails = findMailtoEmails()
  const links = findHttpLinks()
  const website =
    links.find((l) => /website|visit|official/i.test(l.label))?.href ||
    links.find((l) => !/support|help|privacy|policy|facebook|twitter|instagram|youtube/i.test(l.href))?.href ||
    null
  const privacy = links.find((l) => /privacy/i.test(l.label) || /privacy/i.test(l.href))?.href || null

  // Developer name from header link if present
  let developerName = jsonDeveloper || null
  const devLink = document.querySelector('a[href*="/store/apps/dev"], a[href*="developer"]')
  if (devLink && clean(devLink.textContent)) developerName = clean(devLink.textContent)

  // Address-ish block under "About the developer"
  let address = null
  let country = null
  const about = [...document.querySelectorAll('div, h2, span')].find((el) =>
    /^About the developer$/i.test(clean(el.textContent)) && clean(el.textContent).length < 40,
  )
  if (about) {
    const root = about.closest('section') || about.parentElement?.parentElement || about.parentElement
    const lines = clean(root?.innerText || '')
      .split('\n')
      .map(clean)
      .filter((l) => l && !/^About the developer$/i.test(l) && l.length < 120)
    if (lines[0] && !/@/.test(lines[0]) && !/^http/i.test(lines[0])) developerName = developerName || lines[0]
    address = lines.find((l) => /,/.test(l) && /[A-Za-z]/.test(l)) || null
    if (address) {
      const parts = address.split(',').map((s) => s.trim()).filter(Boolean)
      country = parts[parts.length - 1] || null
    }
  }

  const email = emails[0] || null
  return {
    company: {
      name: developerName,
      website,
      country,
    },
    developer_contact: {
      name: developerName,
      email,
      website,
      privacy_policy: privacy,
      address,
      country,
    },
  }
}

function scrapePlayDom(base) {
  const bodyText = document.body?.innerText || ''
  const downloads = scrapePlayDownloads(bodyText)
  const meta = scrapePlayMeta(bodyText)
  const dev = scrapePlayDeveloper(base.developer)

  return {
    ...base,
    android_downloads: downloads,
    last_updated: meta.last_updated,
    current_version: meta.current_version,
    company: dev.company,
    developer_contact: dev.developer_contact,
    developer: base.developer || dev.company?.name,
  }
}

async function enrichAppStore(base) {
  const appId = window.location.pathname.match(/\/(?:id)?(\d{6,})/)?.[1]
  if (!appId) return base
  try {
    const res = await fetch(`https://itunes.apple.com/lookup?id=${appId}`, { mode: 'cors' })
    const json = await res.json()
    const r = json.results?.[0]
    if (!r) return { ...base, app_id: appId }

    const sellerUrl = r.sellerUrl || null
    const emails = findMailtoEmails()
    const developer = r.artistName || base.developer || null

    return {
      ...base,
      name: r.trackName || base.name,
      developer,
      rating: r.averageUserRating != null ? Number(r.averageUserRating.toFixed?.(1) || r.averageUserRating) : base.rating,
      review_count: r.userRatingCount ?? base.review_count,
      current_version: r.version || base.current_version,
      last_updated: (r.currentVersionReleaseDate || r.releaseDate || '').slice(0, 10) || null,
      url: r.trackViewUrl || base.url,
      app_id: appId,
      icon: r.artworkUrl512 || r.artworkUrl100 || base.icon,
      category: r.primaryGenreName || base.category,
      company: {
        name: developer,
        website: sellerUrl,
        country: r.country || null,
      },
      developer_contact: {
        name: developer,
        email: emails[0] || null,
        website: sellerUrl,
      },
      ios_downloads: null,
    }
  } catch (_) {
    return { ...base, app_id: appId }
  }
}

async function extract() {
  let base = parseAllJsonLd() || {
    name: firstText('h1', 'meta[property="og:title"]', 'meta[name="twitter:title"]'),
    developer: null,
    rating: null,
    review_count: null,
    icon: firstText('meta[property="og:image"]'),
    url: window.location.href,
  }

  let result
  if (isPlayStore()) {
    const appId = new URL(window.location.href).searchParams.get('id')
    result = scrapePlayDom({
      ...base,
      platform: 'google_play',
      platform_label: 'Google Play',
      app_id: appId,
      url: base.url || window.location.href,
      ios_downloads: null,
    })
  } else if (isAppStore()) {
    result = await enrichAppStore({
      ...base,
      platform: 'app_store',
      platform_label: 'App Store',
      url: base.url || window.location.href,
      android_downloads: null,
    })
  } else {
    return null
  }

  // LinkedIn hunt helpers (user-initiated search — no LinkedIn scraping)
  const companyName = result.company?.name || result.developer || result.name
  result.linkedin_people_search = companyName
    ? `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`Founder OR CEO ${companyName}`)}`
    : null
  result.linkedin_company_search = companyName
    ? `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(companyName)}`
    : null

  result = Object.fromEntries(
    Object.entries(result).map(([k, v]) => [k, v === undefined || v === '' ? null : v]),
  )

  chrome.storage.local.set({ lastExtracted: result })
  return result
}

;(async () => {
  try {
    const data = await extract()
    if (data) chrome.runtime.sendMessage({ type: 'EXTRACTED', data }, () => {})
  } catch (_) { /* page may still be hydrating */ }
})()

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'EXTRACT_NOW') {
    extract()
      .then((data) => sendResponse({ data }))
      .catch(() => sendResponse({ data: null }))
    return true
  }
})
