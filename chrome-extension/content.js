/* eslint-disable no-undef */
// LeadCRM Store Extractor — content script (v1.8.1)
// IIFE: safe to reinject (avoids "Identifier has already been declared").
(function () {
const isPlayStore = () => window.location.hostname.includes('play.google.com')
const isAppStore = () => window.location.hostname.includes('apps.apple.com')

function clean(text) {
  return (text || '').replace(/\s+/g, ' ').trim()
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
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
  const cleaned = String(str).replace(/,/g, '').trim()
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

/** "15 Aug 2026" | "Aug 15, 2026" → YYYY-MM-DD */
function normalizePlayDate(raw) {
  if (!raw) return null
  const s = clean(raw)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)

  const months = {
    jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
    may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
    sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10,
    dec: 11, december: 11,
  }

  let m = s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/)
  if (m) {
    const mon = months[m[2].toLowerCase()]
    if (mon != null) {
      return new Date(Date.UTC(+m[3], mon, +m[1])).toISOString().slice(0, 10)
    }
  }
  m = s.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/)
  if (m) {
    const mon = months[m[1].toLowerCase()]
    if (mon != null) {
      return new Date(Date.UTC(+m[3], mon, +m[2])).toISOString().slice(0, 10)
    }
  }
  return s
}

function parseAllJsonLd() {
  const scripts = [...document.querySelectorAll('script[type="application/ld+json"]')]
  const blocks = []
  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent)
      if (Array.isArray(data)) blocks.push(...data)
      else if (data?.['@graph']) blocks.push(...data['@graph'])
      else if (data) blocks.push(data)
    } catch (_) { /* ignore */ }
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

function findMailtoEmails(root = document, { visibleOnly = true } = {}) {
  let links = [...root.querySelectorAll('a[href^="mailto:"]')]
  if (visibleOnly) links = links.filter(isElementVisible)
  return links
    .map((a) => clean((a.getAttribute('href') || '').replace(/^mailto:/i, '').split('?')[0]))
    .filter((e) => e && e.includes('@'))
}

function findHttpLinks(root = document, { visibleOnly = true } = {}) {
  let links = [...root.querySelectorAll('a[href^="http"]')]
  if (visibleOnly) links = links.filter(isElementVisible)
  return links
    .map((a) => ({ href: a.href, label: clean(a.textContent) }))
    .filter((x) => x.href && !/play\.google|apps\.apple|gstatic|google\.com\/store|accounts\.google|support\.google|policies\.google/i.test(x.href))
}

/** Visible "App support" / developer-contacts block for the CURRENT app (not SPA leftovers). */
function findCurrentDeveloperContactsRoot() {
  const h1 = [...document.querySelectorAll('h1')].find(isElementVisible) || document.querySelector('h1')

  // Prefer expanded panel that is visible and closest to title
  const panels = [...document.querySelectorAll('#developer-contacts, [id="developer-contacts"]')]
    .filter(isElementVisible)
  if (panels.length && h1) {
    const hr = h1.getBoundingClientRect()
    panels.sort((a, b) => rectDistance(a.getBoundingClientRect(), hr) - rectDistance(b.getBoundingClientRect(), hr))
    return panels[0]
  }
  if (panels.length) return panels[panels.length - 1]

  // Visible App support section
  const supportHeadings = [...document.querySelectorAll('h2, h3, div, span')].filter((el) => {
    if (!isElementVisible(el)) return false
    const t = clean(el.textContent)
    return /^(App support|Support)$/i.test(t) && t.length < 24
  })
  if (supportHeadings.length && h1) {
    const hr = h1.getBoundingClientRect()
    supportHeadings.sort((a, b) => rectDistance(a.getBoundingClientRect(), hr) - rectDistance(b.getBoundingClientRect(), hr))
    const section = supportHeadings[0].closest('section, c-wiz, div') || supportHeadings[0].parentElement
    return section
  }

  return null
}

function findAppSupportExpandButton() {
  const h1 = [...document.querySelectorAll('h1')].find(isElementVisible) || document.querySelector('h1')
  const buttons = [...document.querySelectorAll(
    'button[aria-controls="developer-contacts"], #developer-contacts-heading button, button[aria-controls*="developer"]',
  )].filter(isElementVisible)

  if (buttons.length && h1) {
    const hr = h1.getBoundingClientRect()
    buttons.sort((a, b) => rectDistance(a.getBoundingClientRect(), hr) - rectDistance(b.getBoundingClientRect(), hr))
    return buttons[0]
  }
  return buttons[0] || null
}

/** Header chips: 10+ / Downloads, 4.5★ / reviews, etc. */
function scrapePlayHeaderStats() {
  const out = {}
  document.querySelectorAll('.wVqUob').forEach((el) => {
    if (!isElementVisible(el)) return
    const valueEl = el.querySelector?.('.ClM7O')
    const labelEl = el.querySelector?.('.g1rdde')
    if (!valueEl || !labelEl) return
    const value = clean(valueEl.textContent)
    const label = clean(labelEl.textContent).toLowerCase()
    if (!value || !label) return
    if (label.includes('download')) {
      out.android_downloads = parseDownloadCount(value)
      out.downloads_raw = value
    } else if (label.includes('review') || label.includes('rating')) {
      if (/[\d.]+/.test(value) && /\★|star/i.test(value)) {
        out.rating = parseNumber(value)
      } else if (/review/i.test(label)) {
        out.review_count = parseDownloadCount(value) || parseCount(value)
      }
    }
  })

  // Star rating aria-labels near the visible title
  const star = [...document.querySelectorAll('[aria-label]')]
    .filter(isElementVisible)
    .map((el) => el.getAttribute('aria-label') || '')
    .find((l) => /rated\s+[\d.]+\s+star/i.test(l) || /[\d.]+\s+star/i.test(l))
  if (star) {
    const m = star.match(/([\d.]+)\s*star/i)
    if (m) out.rating = parseNumber(m[1])
  }

  return out
}

/** In-page About preview rows: .lXlx5 label + .xg1aie value */
function scrapePlayInlineAboutRows() {
  const out = {}
  document.querySelectorAll('.TKjAsc > div, .TKjAsc div').forEach((row) => {
    const label = clean(row.querySelector('.lXlx5')?.textContent)
    const value = clean(row.querySelector('.xg1aie')?.textContent)
    if (!label || !value) return
    if (/^updated on$/i.test(label)) {
      out.last_updated_raw = value
      out.last_updated = normalizePlayDate(value)
    }
  })
  return out
}

/**
 * Parse version / Android requirement / updated date from AF_initDataCallback blobs.
 * Observed shapes:
 *   "141":[[["1.0.1"]],[[[36]],[[[26,"8.0"]]]]]
 *   "146":[["Aug 15, 2026",[...]]]
 */
/** Prefer newest script that mentions this app id — SPA leaves old AF_initData in the page. */
function playDataBlob(appId) {
  const scripts = [...document.querySelectorAll('script')]
    .map((s) => s.textContent || '')
    .filter((t) => t.length > 200 && (/AF_initDataCallback|"ds:|"141"\s*:/.test(t)))

  if (appId) {
    const matching = scripts.filter((t) => t.includes(appId))
    if (matching.length) return matching[matching.length - 1]
  }
  return scripts[scripts.length - 1] || ''
}

function scrapePlayEmbeddedData(appId) {
  const html = playDataBlob(appId)
  const out = {}
  if (!html) return out

  const ver = html.match(/"141"\s*:\s*\[\s*\[\s*\[\s*"([^"]+)"\s*\]/)
  if (ver) out.current_version = ver[1]

  const android = html.match(/"141"\s*:\s*\[[\s\S]{0,120}?\[\s*\[\s*\[\s*26\s*,\s*"([^"]+)"\s*\]/)
    || html.match(/\[\s*\[\s*\[\s*26\s*,\s*"([\d.]+)"\s*\]\s*\]\s*\]/)
  if (android) out.requires_android = `${android[1]} and up`

  const updated = html.match(/"146"\s*:\s*\[\s*\[\s*"([^"]+)"\s*,/)
  if (updated) {
    out.last_updated_raw = updated[1]
    out.last_updated = normalizePlayDate(updated[1])
  }

  const released = html.match(/Released on<\/[^>]+>\s*<[^>]+>([^<]+)</i)
  if (released) {
    const raw = clean(released[1])
    out.released_on = normalizePlayDate(raw)
    out.released_on_raw = raw
  }

  if (!out.released_on) {
    const m = (document.body?.innerText || '').match(/Released on\s+([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})/i)
    if (m) {
      out.released_on_raw = clean(m[1])
      out.released_on = normalizePlayDate(m[1])
    }
  }

  return out
}

function currentPlayAppTitle() {
  const h1 = [...document.querySelectorAll('h1')].find(isElementVisible) || document.querySelector('h1')
  return clean(h1?.textContent || '')
}

/** Live identity from the VISIBLE details page — never og:image / JSON-LD (stale on SPA). */
function scrapePlayLiveIdentity(appId) {
  const h1 = [...document.querySelectorAll('h1')].find(isElementVisible) || document.querySelector('h1')
  const name = clean(h1?.textContent || '') || null

  const scope =
    h1?.closest('c-wiz, main, [role="main"], section') ||
    h1?.parentElement?.parentElement?.parentElement ||
    document.body

  const imgs = [...scope.querySelectorAll('img')]
    .filter(isElementVisible)
    .filter((img) => {
      const src = img.currentSrc || img.src || ''
      if (!src || /sprite|icon-|^data:image\/svg/i.test(src)) return false
      const r = img.getBoundingClientRect()
      return r.width >= 40 && r.height >= 40 && r.width <= 320
    })

  let icon = null
  if (name && imgs.length) {
    const needle = name.slice(0, Math.min(20, name.length)).toLowerCase()
    const byAlt = imgs.find((img) => clean(img.alt || '').toLowerCase().includes(needle))
    if (byAlt) icon = byAlt.currentSrc || byAlt.src
  }
  if (!icon && imgs.length) {
    // Largest square-ish image near the title (app icon)
    const ranked = imgs
      .map((img) => {
        const r = img.getBoundingClientRect()
        const h1r = h1?.getBoundingClientRect()
        const dist = h1r ? Math.hypot(r.left - h1r.left, r.top - h1r.top) : 0
        return { img, area: r.width * r.height, dist }
      })
      .sort((a, b) => a.dist - b.dist || b.area - a.area)
    const best = ranked[0]?.img
    if (best) icon = best.currentSrc || best.src
  }

  const devLink = [...document.querySelectorAll('a[href*="/store/apps/dev"], a[href*="developer?id="], a[href*="/store/apps/developer"]')]
    .filter(isElementVisible)
    .sort((a, b) => {
      if (!h1) return 0
      const hr = h1.getBoundingClientRect()
      return rectDistance(a.getBoundingClientRect(), hr) - rectDistance(b.getBoundingClientRect(), hr)
    })[0]
  const developer = clean(devLink?.textContent || '') || null

  return {
    name,
    icon: icon || null,
    developer,
    app_id: appId || null,
    url: window.location.href,
    category: null,
    description: null,
    rating: null,
    review_count: null,
  }
}

function isElementVisible(el) {
  if (!el) return false
  if (typeof el.checkVisibility === 'function') {
    try { return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) } catch (_) { /* fall through */ }
  }
  const style = window.getComputedStyle(el)
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0
}

function parseLabeledFields(text) {
  const lines = String(text || '').split(/\n+/).map(clean).filter(Boolean)
  const out = {}
  const labels = [
    'Version', 'Updated on', 'Requires Android', 'Downloads', 'In-app purchases',
    'Content rating', 'Permissions', 'Released on', 'Offered by', 'Download size', 'Requires',
  ]
  for (let i = 0; i < lines.length; i++) {
    const matched = labels.find((l) => lines[i].toLowerCase() === l.toLowerCase())
    if (matched && lines[i + 1] && !labels.some((l) => lines[i + 1].toLowerCase() === l.toLowerCase())) {
      // Skip content-rating essay paragraphs
      if (matched === 'Content rating' && lines[i + 1].length > 80) continue
      out[matched] = lines[i + 1]
    }
  }
  return out
}

function dialogLooksLikeAbout(el) {
  const t = el?.innerText || ''
  const isAbout = /Updated\s+on/i.test(t) && (/Version/i.test(t) || /Offered by/i.test(t) || /Requires Android/i.test(t))
  const isRatingOnly = /Suitable for all age groups|content rating/i.test(t) && !/Updated\s+on/i.test(t)
  return isAbout && !isRatingOnly && t.length < 25000
}

function dialogMatchesCurrentApp(el) {
  const appName = currentPlayAppTitle()
  if (!appName || appName.length < 2) return true
  const t = (el?.innerText || '').toLowerCase()
  // Try progressively shorter needles — Play sheet often shows the title
  for (const n of [28, 18, 12, 8]) {
    if (appName.length < Math.min(n, 3)) continue
    const needle = appName.slice(0, Math.min(n, appName.length)).toLowerCase()
    if (t.includes(needle)) return true
  }
  return false
}

function findAboutDialog() {
  const candidates = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"]')]
  const matches = []
  for (const d of candidates) {
    if (!isElementVisible(d)) continue
    if (!dialogLooksLikeAbout(d)) continue
    if (!dialogMatchesCurrentApp(d)) continue
    matches.push(d)
  }
  return matches[matches.length - 1] || null
}

/** Close leftover About / modal sheets from a previous app (Play SPA). */
async function dismissStaleDialogs() {
  for (let n = 0; n < 6; n++) {
    const open = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"]')].filter(isElementVisible)
    if (!open.length) return true
    // Close wrong-app sheets first, then anything else visible
    open.forEach((d) => closeAboutDialog(d))
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await sleep(150)
  }
  return ![...document.querySelectorAll('[role="dialog"], [aria-modal="true"]')].some(isElementVisible)
}

function rectDistance(a, b) {
  const cx = a.left + a.width / 2
  const cy = a.top + a.height / 2
  const dx = cx - (b.left + b.width / 2)
  const dy = cy - (b.top + b.height / 2)
  return Math.hypot(dx, dy)
}

/**
 * ONLY the visible "About this app" control for the CURRENT app.
 * Play SPA leaves old About buttons in the DOM — never pick the first match.
 */
function findAboutOpenButton() {
  const h1 = [...document.querySelectorAll('h1')].find(isElementVisible) || document.querySelector('h1')

  const aboutButtons = [...document.querySelectorAll('button, a, [role="button"]')]
    .filter(isElementVisible)
    .filter((el) => {
      const aria = (el.getAttribute('aria-label') || '').toLowerCase()
      return aria.includes('about this app') && !aria.includes('content rating')
    })

  if (aboutButtons.length && h1) {
    const h1Rect = h1.getBoundingClientRect()
    aboutButtons.sort((a, b) => rectDistance(a.getBoundingClientRect(), h1Rect) - rectDistance(b.getBoundingClientRect(), h1Rect))
    return aboutButtons[0]
  }
  if (aboutButtons.length) return aboutButtons[aboutButtons.length - 1]

  // Heading "About this app" next to a button — must be visible
  const headings = [...document.querySelectorAll('h2, h3, div')].filter((el) => {
    if (!isElementVisible(el)) return false
    return /^About this app$/i.test(clean(el.textContent)) && clean(el.textContent).length < 20
  })

  // Prefer heading closest to current h1
  let heading = headings[0] || null
  if (headings.length && h1) {
    const h1Rect = h1.getBoundingClientRect()
    headings.sort((a, b) => rectDistance(a.getBoundingClientRect(), h1Rect) - rectDistance(b.getBoundingClientRect(), h1Rect))
    heading = headings[0]
  }

  if (heading) {
    const header = heading.closest('header, .cswwxf, .VMq4uf, section') || heading.parentElement?.parentElement
    const btn = [...(header?.querySelectorAll('button, [role="button"]') || [])]
      .filter(isElementVisible)
      .find((el) => {
        const aria = (el.getAttribute('aria-label') || '').toLowerCase()
        return !aria.includes('content rating')
      })
    if (btn) return btn
  }

  return null
}

function closeAboutDialog(dialog) {
  if (!dialog) return
  const closeIcon = [...dialog.querySelectorAll('i, button, [role="button"], [aria-label]')]
    .find((el) => {
      const t = clean(el.textContent)
      const aria = (el.getAttribute('aria-label') || '').toLowerCase()
      return t === 'close' || t === 'clear' || aria.includes('close') || aria.includes('dismiss')
    })
  const target = closeIcon?.closest('button, [role="button"]') || closeIcon
  if (target) target.click()
  else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
}

/**
 * Open the About sheet for the CURRENT app only.
 * Never reuse a leftover dialog from a previous Play SPA navigation.
 */
async function openPlayAboutSheet() {
  await dismissStaleDialogs()

  const btn = findAboutOpenButton()
  if (!btn) return null

  // Snapshot every dialog node — we will ONLY accept sheets that appear AFTER our click
  const snapshot = new Set(document.querySelectorAll('[role="dialog"], [aria-modal="true"]'))

  btn.click()

  for (let i = 0; i < 30; i++) {
    await sleep(100)

    const visible = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"]')].filter(isElementVisible)

    // Kill any pre-existing (stale) about sheets that are still showing last app
    for (const d of visible) {
      if (snapshot.has(d) && dialogLooksLikeAbout(d)) {
        closeAboutDialog(d)
      }
    }

    const brandNew = visible.filter((d) => !snapshot.has(d) && dialogLooksLikeAbout(d))
    if (!brandNew.length) continue

    // Prefer sheet that mentions current title; otherwise the new sheet from our click
    const matched = brandNew.find(dialogMatchesCurrentApp)
    return matched || brandNew[brandNew.length - 1]
  }

  await dismissStaleDialogs()
  return null
}

function scrapeFromAboutText(text) {
  const fields = parseLabeledFields(text)
  let website = null
  for (const line of text.split(/\n+/).map(clean).filter(Boolean)) {
    if (/^(https?:\/\/)?[a-z0-9][a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(line)
      && !/google|gstatic|play\.google/i.test(line)
      && line.length < 80) {
      website = /^https?:\/\//i.test(line) ? line : `https://${line}`
      break
    }
  }

  return {
    current_version: fields.Version || null,
    last_updated: normalizePlayDate(fields['Updated on']) || null,
    last_updated_raw: fields['Updated on'] || null,
    android_downloads: parseDownloadCount(fields.Downloads),
    downloads_raw: fields.Downloads || null,
    requires_android: fields['Requires Android'] || fields.Requires || null,
    released_on: normalizePlayDate(fields['Released on']) || null,
    released_on_raw: fields['Released on'] || null,
    offered_by: fields['Offered by'] || null,
    content_rating: fields['Content rating'] || null,
    in_app_purchases: fields['In-app purchases'] || null,
    download_size: fields['Download size'] || null,
    website,
  }
}

async function expandAppSupport() {
  const btn = findAppSupportExpandButton()
  if (btn && btn.getAttribute('aria-expanded') === 'false') {
    btn.click()
    for (let i = 0; i < 20; i++) {
      await sleep(100)
      if (btn.getAttribute('aria-expanded') === 'true') break
      const panel = findCurrentDeveloperContactsRoot()
      if (panel && (panel.innerText || '').length > 10) break
    }
    await sleep(200)
  }
  return findCurrentDeveloperContactsRoot()
}

function parseAddressBlock(text) {
  const raw = String(text || '').replace(/\r/g, ' ')
  const lines = raw.split(/\n+/).map(clean).filter(Boolean)
  if (!lines.length) return { address: null, country: null }

  const address = lines.join(', ')
  const knownCountry =
    /\b(United States|United Kingdom|United Arab Emirates|Czech Republic|New Zealand|South Korea|South Africa|Hong Kong|Saudi Arabia|Canada|Australia|Germany|France|India|Pakistan|Netherlands|Singapore|Japan|Brazil|Mexico|Spain|Italy|Poland|Sweden|Norway|Denmark|Finland|Ireland|Switzerland|Austria|Belgium|Portugal|Israel|China|Taiwan|Philippines|Indonesia|Malaysia|Thailand|Vietnam|Nigeria|Egypt|Turkey|Russia|Ukraine|Romania|Hungary|Greece|Argentina|Chile|Colombia|Bangladesh|Sri Lanka|Nepal|Kenya|Ghana|USA|UK|UAE)\b\s*$/i

  let country = null

  const last = lines[lines.length - 1]
  if (last) {
    const mLast = last.match(knownCountry)
    if (mLast) country = mLast[1]
    else if (/^[A-Za-z][A-Za-z .'-]{1,40}$/.test(last) && !/\d/.test(last)) country = last
  }

  if (!country) {
    const m = address.match(knownCountry)
    if (m) country = m[1]
  }

  if (country) {
    const map = { USA: 'United States', UK: 'United Kingdom', UAE: 'United Arab Emirates' }
    country = map[country.toUpperCase()] || country
  }

  if (!country && /\b[A-Z]{2}\s+\d{5}(-\d{4})?\b/.test(address)) {
    country = 'United States'
  }

  return { address, country }
}

function scrapeDeveloperContactsPanel(root) {
  const out = {
    website: null,
    support_email: null,
    privacy_policy: null,
    phone: null,
  }
  if (!root) return out

  // Only links that are visible inside this panel (ignore hidden SPA clones)
  const anchors = [...root.querySelectorAll('a')].filter((a) => {
    // Panel itself may be in a collapsible; prefer visible, else allow if panel has content
    return isElementVisible(a) || isElementVisible(root)
  })

  anchors.forEach((a) => {
    if (!isElementVisible(a) && !isElementVisible(root)) return
    // Skip anchors that are clearly in a different off-screen clone
    const r = a.getBoundingClientRect()
    if (r.width === 0 && r.height === 0 && !isElementVisible(root)) return

    const href = a.getAttribute('href') || ''
    const label = clean(a.querySelector('.xFVDSb')?.textContent || a.getAttribute('aria-label') || '')
    const detail = clean(a.querySelector('.pSEeg')?.textContent || '')

    if (/^mailto:/i.test(href) || /support email/i.test(label)) {
      out.support_email = href.replace(/^mailto:/i, '').split('?')[0] || detail || out.support_email
    } else if (/^tel:/i.test(href) || /^phone$/i.test(label)) {
      out.phone = href.replace(/^tel:/i, '') || detail || out.phone
    } else if (/privacy/i.test(label) || /privacy/i.test(href)) {
      out.privacy_policy = href || out.privacy_policy
    } else if (/website/i.test(label)) {
      out.website = href || out.website
    } else if (/^https?:/i.test(href) && !/play\.google|policies\.google|support\.google/i.test(href) && !out.website) {
      out.website = href
    }
  })

  if (!out.support_email) {
    const m = findMailtoEmails(root, { visibleOnly: false })
    // Still require the mailto node to be inside root; prefer ones that are visible
    const visible = findMailtoEmails(root, { visibleOnly: true })
    out.support_email = visible[0] || m[0] || null
  }
  return out
}

function scrapeAboutDeveloper() {
  const out = { name: null, email: null, address: null, country: null }
  const h1 = [...document.querySelectorAll('h1')].find(isElementVisible) || document.querySelector('h1')

  // Address nodes near the current app title only
  let addrCandidates = [...document.querySelectorAll('.HhKIQc .mHsyY, .mHsyY')].filter(isElementVisible)
  if (h1 && addrCandidates.length > 1) {
    const hr = h1.getBoundingClientRect()
    addrCandidates = addrCandidates
      .slice()
      .sort((a, b) => rectDistance(a.getBoundingClientRect(), hr) - rectDistance(b.getBoundingClientRect(), hr))
  }
  const addrEl = addrCandidates[0] || null
  if (addrEl) {
    const raw = (addrEl.innerText || addrEl.textContent || '').replace(/\r/g, '')
    const parsed = parseAddressBlock(raw)
    out.address = parsed.address
    out.country = parsed.country
  }

  const headings = [...document.querySelectorAll('div, h2, span')].filter((el) => {
    if (!isElementVisible(el)) return false
    return /^About the developer$/i.test(clean(el.textContent)) && clean(el.textContent).length < 28
  })
  let heading = headings[0] || null
  if (h1 && headings.length > 1) {
    const hr = h1.getBoundingClientRect()
    headings.sort((a, b) => rectDistance(a.getBoundingClientRect(), hr) - rectDistance(b.getBoundingClientRect(), hr))
    heading = headings[0]
  }

  const block = heading
    ? (heading.parentElement?.querySelector('.HhKIQc') ||
      heading.closest('section')?.querySelector('.HhKIQc') ||
      heading.parentElement?.parentElement?.querySelector('.HhKIQc') ||
      heading.parentElement)
    : null

  if (!block) return out

  const hh = block.classList?.contains('HhKIQc') ? block : block.querySelector('.HhKIQc') || block
  const kids = [...(hh.children || [])]

  for (const el of kids) {
    if (el.classList?.contains('mHsyY')) continue
    const raw = (el.innerText || el.textContent || '').replace(/\r/g, '')
    const t = clean(raw)
    if (!t) continue

    if (!out.name && !/@/.test(t) && !/^\+?\d/.test(t) && t.length < 80 && !/\d{5}/.test(t) && !/\n/.test(raw.trim())) {
      out.name = t
      continue
    }
    if (!out.email && /@/.test(t)) {
      out.email = t.match(/[\w.+-]+@[\w.-]+\.\w+/)?.[0] || t
      continue
    }
    if (!out.address && (/,/.test(t) || /\d/.test(t)) && t.length > 8) {
      const parsed = parseAddressBlock(raw.includes('\n') ? raw : t)
      out.address = parsed.address
      out.country = parsed.country || out.country
    }
  }

  if (out.address && !out.country) {
    out.country = parseAddressBlock(out.address).country
  }

  return out
}

async function scrapePlayContacts(offeredBy, websiteHint) {
  const panel = await expandAppSupport()
  const support = scrapeDeveloperContactsPanel(panel)
  const aboutDev = scrapeAboutDeveloper()

  // NEVER scan the whole document — SPA leaves previous apps' mailto/website links in the DOM
  const scopedEmails = [
    support.support_email,
    aboutDev.email,
    ...(panel ? findMailtoEmails(panel, { visibleOnly: true }) : []),
    ...(panel ? findMailtoEmails(panel, { visibleOnly: false }) : []),
  ].filter(Boolean)

  // Dedupe preserve order
  const emails = [...new Set(scopedEmails)]

  const email =
    emails.find((e) => /support|hello|info|contact|purpose|ydiop/i.test(e)) ||
    emails[0] ||
    null

  let website = support.website || null
  // About-sheet website only if we just opened the CURRENT app's sheet
  if (!website && websiteHint) website = websiteHint
  if (!website && panel) {
    website = findHttpLinks(panel, { visibleOnly: true })
      .find((l) => !/privacy|facebook|twitter|instagram|youtube|linkedin/i.test(l.href))?.href || null
  }
  if (!website && panel) {
    website = findHttpLinks(panel, { visibleOnly: false })
      .find((l) => !/privacy|facebook|twitter|instagram|youtube|linkedin/i.test(l.href))?.href || null
  }

  const developerName =
    aboutDev.name ||
    offeredBy ||
    (() => {
      const h1 = [...document.querySelectorAll('h1')].find(isElementVisible)
      const links = [...document.querySelectorAll('a[href*="/store/apps/dev"], a[href*="developer?id="], a[href*="/store/apps/developer"]')]
        .filter(isElementVisible)
      if (h1 && links.length) {
        const hr = h1.getBoundingClientRect()
        links.sort((a, b) => rectDistance(a.getBoundingClientRect(), hr) - rectDistance(b.getBoundingClientRect(), hr))
      }
      return clean(links[0]?.textContent || '') || null
    })() ||
    null

  return {
    company: {
      name: offeredBy || developerName,
      website: website || null,
      country: aboutDev.country || null,
      address: aboutDev.address || null,
    },
    developer_contact: {
      name: developerName,
      email: email || null,
      support_email: email || null,
      website: website || null,
      phone: support.phone || null,
      privacy_policy: support.privacy_policy || null,
      address: aboutDev.address || null,
      country: aboutDev.country || null,
    },
  }
}

function pick(...vals) {
  for (const v of vals) {
    if (v !== undefined && v !== null && v !== '') return v
  }
  return null
}

async function scrapePlayDom(base) {
  const appId = base.app_id || new URL(window.location.href).searchParams.get('id')
  // Identity ALWAYS from visible page — ignore JSON-LD / og tags (SPA-stale)
  const live = scrapePlayLiveIdentity(appId)
  const header = scrapePlayHeaderStats()
  const inline = scrapePlayInlineAboutRows()
  const embedded = scrapePlayEmbeddedData(appId)

  let about = {}
  const dialog = await openPlayAboutSheet()
  if (dialog) {
    about = scrapeFromAboutText(dialog.innerText || '')
    await sleep(80)
    closeAboutDialog(dialog)
  }

  const merged = {
    android_downloads: pick(about.android_downloads, header.android_downloads),
    downloads_raw: pick(about.downloads_raw, header.downloads_raw),
    last_updated: pick(about.last_updated, inline.last_updated, embedded.last_updated),
    last_updated_raw: pick(about.last_updated_raw, inline.last_updated_raw, embedded.last_updated_raw),
    current_version: pick(about.current_version, embedded.current_version),
    requires_android: pick(about.requires_android, embedded.requires_android),
    released_on: pick(about.released_on, embedded.released_on),
    released_on_raw: pick(about.released_on_raw, embedded.released_on_raw),
    download_size: about.download_size || null,
    content_rating: about.content_rating || null,
    in_app_purchases: about.in_app_purchases || null,
    offered_by: about.offered_by || null,
    // Stats: visible header first — never fall back to stale JSON-LD base
    rating: header.rating ?? null,
    review_count: header.review_count ?? null,
    about_source: dialog ? 'play_about_sheet' : 'dom_embedded',
  }

  const contacts = await scrapePlayContacts(merged.offered_by || live.developer, about.website)

  // Explicit fresh contact fields — never inherit from a previous extract object
  const website = contacts.company?.website || about.website || null
  const email = contacts.developer_contact?.support_email || contacts.developer_contact?.email || null

  return {
    platform: 'google_play',
    platform_label: 'Google Play',
    ios_downloads: null,
    ...merged,
    name: live.name,
    icon: live.icon,
    developer: pick(contacts.developer_contact?.name, merged.offered_by, live.developer),
    app_id: appId,
    url: window.location.href,
    page_url: window.location.href,
    company: {
      name: pick(merged.offered_by, contacts.company?.name, live.developer),
      website,
      country: contacts.company?.country || null,
      address: contacts.company?.address || null,
    },
    developer_contact: {
      name: pick(contacts.developer_contact?.name, merged.offered_by, live.developer),
      email,
      support_email: email,
      website,
      phone: contacts.developer_contact?.phone || null,
      privacy_policy: contacts.developer_contact?.privacy_policy || null,
      address: contacts.company?.address || null,
      country: contacts.company?.country || null,
    },
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
    const emails = findMailtoEmails(document, { visibleOnly: true })
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
      company: { name: developer, website: sellerUrl, country: r.country || null },
      developer_contact: { name: developer, email: emails[0] || null, website: sellerUrl },
      ios_downloads: null,
    }
  } catch (_) {
    return { ...base, app_id: appId }
  }
}

async function extract() {
  const pageUrl = window.location.href

  let result
  if (isPlayStore()) {
    const appId = new URL(pageUrl).searchParams.get('id')
    // Do NOT seed from JSON-LD / og:* — those stay on the previous app after SPA nav
    result = await scrapePlayDom({
      platform: 'google_play',
      platform_label: 'Google Play',
      app_id: appId,
      url: pageUrl,
      ios_downloads: null,
    })
  } else if (isAppStore()) {
    const liveName = clean(document.querySelector('h1')?.textContent || '')
    const liveIcon = [...document.querySelectorAll('img')].filter(isElementVisible).find((img) => {
      const r = img.getBoundingClientRect()
      return r.width >= 60 && /mzstatic|apple/i.test(img.src || '')
    })
    result = await enrichAppStore({
      name: liveName || firstText('h1', 'meta[property="og:title"]'),
      icon: (liveIcon && (liveIcon.currentSrc || liveIcon.src)) || firstText('meta[property="og:image"]'),
      developer: null,
      rating: null,
      review_count: null,
      platform: 'app_store',
      platform_label: 'App Store',
      url: pageUrl,
      android_downloads: null,
    })
  } else {
    return null
  }

  const companyName = result.company?.name || result.developer || result.name
  result.linkedin_people_search = companyName
    ? `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`Founder OR CEO ${companyName}`)}`
    : null
  result.linkedin_company_search = companyName
    ? `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(companyName)}`
    : null

  result.page_url = pageUrl
  result.url = pageUrl
  result.extracted_at = Date.now()

  result = Object.fromEntries(
    Object.entries(result).map(([k, v]) => [k, v === undefined || v === '' ? null : v]),
  )

  chrome.storage.local.remove(['lastExtracted', 'lastExtractedUrl'])
  return result
}

  window.__leadcrmExtract = extract
  window.__leadcrmExtractorVersion = 184

  if (!window.__leadcrmExtractorBound) {
    window.__leadcrmExtractorBound = true
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === 'EXTRACT_NOW') {
        const fn = window.__leadcrmExtract
        Promise.resolve(typeof fn === 'function' ? fn() : null)
          .then((data) => sendResponse({ data }))
          .catch((err) => sendResponse({ data: null, error: String(err && err.message || err) }))
        return true
      }
    })
  }
})()
