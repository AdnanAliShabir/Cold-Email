/* eslint-disable no-undef */
// LeadCRM Store Extractor — content script (v2)
// Extracts app metadata from Google Play and Apple App Store pages.
//
// Strategy:
//  - Both stores expose schema.org JSON-LD (application/ld+json) -> name,
//    rating, review count, developer, icon, url. This is the most reliable source.
//  - Google Play: additionally scrape the rendered DOM for downloads + text
//    ("5B+ Downloads", "Updated on Aug 3, 2026", version).
//  - App Store: augment with the iTunes Lookup API (https://itunes.apple.com/lookup)
//    using the app id in the URL for version, rating and downloads.

const isPlayStore = () => window.location.hostname.includes('play.google.com')
const isAppStore = () => window.location.hostname.includes('apps.apple.com')

function clean(text) {
  return (text || '').replace(/\s+/g, ' ').trim()
}

function firstText(...selectors) {
  for (const sel of selectors) {
    const el = document.querySelector(sel)
    if (el && clean(el.textContent)) return clean(el.textContent)
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
  const match = cleaned.match(/([\d.]+)\s*([KMB])?/i)
  if (!match) return null
  const value = parseFloat(match[1])
  const suffix = (match[2] || '').toUpperCase()
  const mult = suffix === 'K' ? 1e3 : suffix === 'M' ? 1e6 : suffix === 'B' ? 1e9 : 1
  return Math.round(value * mult)
}

// Parse the schema.org SoftwareApplication JSON-LD block present on both stores.
function parseJsonLd() {
  const script = document.querySelector('script[type="application/ld+json"]')
  if (!script) return null
  try {
    const data = JSON.parse(script.textContent)
    let d = data
    if (Array.isArray(data)) d = data.find((x) => x && x['@type'] === 'SoftwareApplication') || data[0]

    const author = d.author || d.publisher
    const agg = d.aggregateRating || {}

    return {
      name: clean(d.name),
      developer: author ? clean(author.name) : null,
      rating: parseNumberToRating(agg.ratingValue),
      review_count: parseCount(agg.ratingCount ?? agg.reviewCount),
      icon: d.image || null,
      description: clean(d.description),
      category: clean(d.applicationCategory),
      url: d.url || null,
    }
  } catch (e) {
    return null
  }
}

function parseNumberToRating(v) {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : null
}

function parseCount(v) {
  if (v == null) return null
  // Play Store review counts come as strings like "168714698" or "169M"
  if (typeof v === 'string' && /[KMB]/i.test(v)) return parseDownloadCount(v)
  return parseNumber(v)
}

// --- Google Play specific DOM scraping ---
function scrapePlayDom(base) {
  // Downloads: rendered as a value div followed by a "Downloads" label.
  let downloads = null
  document.querySelectorAll('div').forEach((el) => {
    if (el.children.length >= 2 && /downloads/i.test(clean(el.children[el.children.length - 1].textContent || ''))) {
      const val = parseDownloadCount(clean(el.children[0].textContent))
      if (val) { downloads = val; return }
    }
  })

  // Updated-on: text pattern "Updated on Aug 3, 2026"
  let lastUpdated = null
  const bodyText = document.body.innerText
  const m = bodyText.match(/Updated\s+on\s+([A-Z][a-z]{2}\s+\d{1,2},\s+\d{4})/)
  if (m) lastUpdated = m[1]

  // Version: "Current version" label next to value, or "Version"
  let version = null
  const vm = bodyText.match(/(?:Current version|Version)\s*[: ]?\s*([\d.]+(?:[a-zA-Z0-9.]*))/)
  if (vm) version = vm[1]

  const dev = scrapePlayDeveloper()

  return {
    ...base,
    android_downloads: downloads,
    last_updated: lastUpdated,
    current_version: version,
    company: dev.company,
    developer_contact: dev.contact,
  }
}

// Extract "App support" + "About the developer" contact info from the Play DOM.
function scrapePlayDeveloper() {
  const contact = {
    name: null,
    email: null,
    phone: null,
    website: null,
    support_email: null,
    privacy_policy: null,
    address: null,
    country: null,
  }
  const container = document.querySelector('#developer-contacts')
  if (container) {
    container.querySelectorAll('a.Si6a0c').forEach((a) => {
      const label = clean(a.querySelector('.xFVDSb')?.textContent)
      if (!label) return
      const href = a.getAttribute('href') || ''
      if (/website/i.test(label)) contact.website = href
      else if (/support email/i.test(label)) {
        contact.support_email = href.replace(/^mailto:/i, '') || clean(a.textContent)
      } else if (/privacy policy/i.test(label)) {
        contact.privacy_policy = href
      }
    })
  }

  const devTitle = [...document.querySelectorAll('div')].find((el) => /^About the developer$/i.test(clean(el.textContent)))
  if (devTitle) {
    const devBlock = devTitle.parentElement && devTitle.parentElement.querySelector('.HhKIQc')
    if (devBlock) {
      const divs = [...devBlock.children].map((d) => clean(d.textContent)).filter(Boolean)
      contact.name = divs[0] || null
      for (const d of divs.slice(1)) {
        if (/@/.test(d)) { if (!contact.email) contact.email = d; continue }
        if (/^[+()\d\s.,-]{6,}$/.test(d)) { contact.phone = d; continue }
        if (/[A-Za-z]/.test(d)) contact.address = d
      }
    }
    // Country is the last token of the address line.
    if (contact.address) {
      const parts = contact.address.split(/[,;]|(?:\b(?:Street|Road|Ave|Avenue|Blvd|Way|Lane|Dr|Drive|PK|Park)\b.*)/).map((s) => s.trim()).filter(Boolean)
      contact.country = parts[parts.length - 1] || null
    }
    contact.privacy_policy = contact.privacy_policy || null
    contact.website = contact.website || null
  }

  // Support email is a good outreach fallback when no developer email is shown.
  const email = contact.email || contact.support_email
  const company = {
    name: contact.name || null,
    website: contact.website || null,
    country: contact.country || null,
  }
  const c = { name: contact.name, email }
  return { company, contact: c, raw: contact }
}

// --- App Store enrichment via iTunes Lookup API ---
async function enrichAppStore(base) {
  const appId = window.location.pathname.match(/\/(?:id)?(\d{6,})/)?.[1]
  if (!appId) return base
  try {
    const res = await fetch(`https://itunes.apple.com/lookup?id=${appId}`, { mode: 'cors' })
    const json = await res.json()
    const r = json.results?.[0]
    if (!r) return base
    const downloads = r.fileSizeBytes || null
    return {
      name: r.trackName || base.name,
      developer: r.artistName || base.developer || undefined,
      rating: r.averageUserRating != null ? r.averageUserRating : base.rating,
      review_count: (r.userRatingCount != null ? r.userRatingCount : null) || base.review_count,
      current_version: r.version || undefined,
      last_updated: r.releaseDate ? r.releaseDate.slice(0, 10) : undefined,
      url: r.trackViewUrl || base.url || undefined,
      app_id: appId,
      icon: r.artworkUrl100 || base.icon,
      size: downloads ? Math.round(downloads / (1024 * 1024)) : null,
    }
  } catch (e) {
    return base
  }
}

async function extract() {
  let base = parseJsonLd() || {
    name: firstText('h1', 'meta[property="og:title"]'),
    developer: null,
    rating: null,
    review_count: null,
    icon: null,
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

  // Normalise undefined -> null and drop empty strings.
  result = Object.fromEntries(
    Object.entries(result).map(([k, v]) => [
      k,
      v === undefined || v === '' ? null : v,
    ])
  )

  chrome.storage.local.set({ lastExtracted: result })
  return result
}

// Auto-extract on page load.
;(async () => {
  const data = await extract()
  if (data) chrome.runtime.sendMessage({ type: 'EXTRACTED', data }, () => {})
})()

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === 'EXTRACT_NOW') {
    extract().then((data) => sendResponse({ data }))
    return true // async response
  }
})