'use strict'
// Fork dl27 additions of the in-game picker page (feed2.html; owner 2026-11-24: "там нет того же функционала что и в
// приложении"): the app's mods catalog (HUD / Models / Animations and their subcategories), GameBanana search, mods
// in the library with an on/off switch, groups, update of an installed mod, likes and subcategory tags on cards.
// Loaded before feed2.html's own script: it only defines; the page calls it. Older renderers ignore the new message
// kinds and card fields (skins_feed.ts drops unknown kinds, reads known fields only).
//   Commands: cats | mods~<cat>~<page>~<sort>~<query> | shop~<cat>~<page>~<sort>~<query> (query: search) |
//             modon~<mod>~<0|1> | group~<index in /state profiles> | update~<mod> | groups.
//   Messages: cats {cats:[{cat,name,sub,count}]}, groups {groups:[{i,name,skins,mods}]}, skins view 'mods' + query,
//             card fields kind ('skin'|'mod'), on, update, likes, tag.

/** Cosmetic non-hero categories, as the app's MOD_CATS (skins_gb.ts). */
const MOD_CATS = [{ cat: 31713, key: 'hud' }, { cat: 33154, key: 'models' }, { cat: 47611, key: 'anims' }]
const MORE_SORTS = { updated: 'Generic_LatestUpdated' }
const SEARCH_PAGE = 15

const MORE_TEXT = {
  ru: {
    window: { shopSkins: 'Скины', mods: 'Моды', sortUpdated: 'Обновлённые', search: 'Поиск на GameBanana',
      searchGo: 'Найти', searchClear: 'Сброс', on: 'Включить', offMod: 'Выключить', enabled: 'Включён',
      update: 'Обновить', hasUpdate: 'Есть обновление', groups: 'Группы', noGroups: 'Групп нет: соберите их в лаунчере',
      apply: 'Применить', likes: 'Лайки', gfx: 'Графика', categories: 'Категории', found: 'Поиск: «%s»',
      groupInfo: 'скинов %s · модов %m' },
    switching: 'Переключаю…', updating: 'Обновляю…', groupApplying: 'Применяю группу…',
    groupApplied: 'Группа «%s» применена', groupMissing: ': %n нет на диске', conflicts: 'Конфликт файлов с: ',
    turnedOff: 'Выключено (тот же герой): ',
    hud: 'HUD', models: 'Модели', anims: 'Анимации',
  },
  en: {
    window: { shopSkins: 'Skins', mods: 'Mods', sortUpdated: 'Updated', search: 'Search GameBanana',
      searchGo: 'Search', searchClear: 'Clear', on: 'Turn on', offMod: 'Turn off', enabled: 'On',
      update: 'Update', hasUpdate: 'Update available', groups: 'Groups', noGroups: 'No groups: make them in the launcher',
      apply: 'Apply', likes: 'Likes', gfx: 'Graphics', categories: 'Categories', found: 'Search: "%s"',
      groupInfo: 'skins %s · mods %m' },
    switching: 'Switching…', updating: 'Updating…', groupApplying: 'Applying the group…',
    groupApplied: 'Group "%s" applied', groupMissing: ': %n missing on disk', conflicts: 'File conflict with: ',
    turnedOff: 'Turned off (same hero): ',
    hud: 'HUD', models: 'Models', anims: 'Animations',
  },
}

/** Text of the current language: the page's L plus these keys. */
const M = () => (L === T.en ? MORE_TEXT.en : MORE_TEXT.ru)

// ---- installed mods (launcher /state "mods", "modsOn") ----
const modRows = (mod) => ((state && state.mods) || []).filter((m) => m.gbMod === mod)
const modsMine = () => ((state && state.mods) || []).map((m) => m.gbMod).filter((m) => m)
const fileOfId = (id) => { const m = /^gb\d+_(\d+)_\d+$/.exec(id); return m ? Number(m[1]) : 0 }
const usable = (files) => (files || []).filter((f) => /\.(zip|rar|7z|vpk)$/i.test(f._sFile) && f._sAvResult === 'clean' && f._sAnalysisResult === 'ok')
/** gbMod -> [{file, old}]: each installed variant file and its newer file (the app's skins_update.ts `plans`; a variant
 *  uploaded with the installed one is no update, 2026-11-25). A variant whose successor is unclear is left to the app. */
const updates = {}

const verParts = (v) => { const p = (v || '').match(/\d+/g); return p ? p.map(Number) : null }
function isNewer(f, old, rec) {
  if (!rec) return f._idRow > old
  const x = verParts(f._sVersion), y = verParts(rec._sVersion)
  if (x && y) {
    for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0)
    return false
  }
  if (f._tsDateAdded && rec._tsDateAdded) return f._tsDateAdded > rec._tsDateAdded + 3600
  return f._idRow > old
}
const variantKey = (f) => {
  const norm = (s) => s.toLowerCase().replace(/v?\d+([._]\d+)+|v\d+/g, '').replace(/[^\p{L}\p{N}]+/gu, '')
  return norm(f._sDescription || '') || norm(f._sFile.replace(/\.[^.]+$/, ''))
}

function noteUpdate(mod, prof) {
  const ids = state.installed.filter((s) => s.gbMod === mod).map((s) => s.id).concat(modRows(mod).map((m) => m.id))
  const mine = [...new Set(ids.map(fileOfId))].filter((f) => f)
  const all = prof._aFiles || []
  const fresh = usable(all).filter((f) => !f._bIsArchived && !mine.includes(f._idRow))
  const due = []
  for (const old of mine) {
    const rec = all.find((f) => f._idRow === old)
    const newer = fresh.filter((f) => isNewer(f, old, rec)).sort((a, b) => b._idRow - a._idRow)
    if (!newer.length) continue
    const key = rec ? variantKey(rec) : ''
    const top = newer[0]
    const batch = newer.filter((f) => !f._tsDateAdded || !top._tsDateAdded || top._tsDateAdded - f._tsDateAdded <= 3600)
    const file = (key && newer.find((f) => variantKey(f) === key)) || (batch.length === 1 ? top : null)
    if (!file) continue
    const same = due.find((u) => u.file === file._idRow)
    if (same) same.old.push(old)
    else due.push({ file: file._idRow, old: [old] })
  }
  if (due.length) updates[mod] = due
  else delete updates[mod]
}

/** A catalog record's card info: name, preview, category (hero cat for skins), likes, subcategory tag. */
function recInfo(rec, cat, kind) {
  const sub = rec._aSubCategory || rec._aCategory || {}
  return { name: rec._sName, image: thumb(rec), cat: cat || sub._idRow || 0, kind, likes: rec._nLikeCount || 0,
    tag: kind === 'mod' ? (sub._sName || '') : '', author: (rec._aSubmitter && rec._aSubmitter._sName) || '',
    views: rec._nViewCount || 0 }
}

/** After a reload of /state: the cards of mods switched on or off by it (the launcher keeps one mod or skin per
 *  hero, skins_slot.rs: a wear or a switch can turn another off). */
function modsFlipped(prev) {
  const now = state.modsOn || []
  const ids = prev.filter((x) => !now.includes(x)).concat(now.filter((x) => !prev.includes(x)))
  const mods = new Set(ids.map((id) => ((state.mods || []).find((m) => m.id === id) || {}).gbMod).filter((m) => m))
  for (const m of mods) sendCard(m)
}

/** The status after a mod switch: what the same hero lost, file conflicts. */
function toggleNote(res) {
  const off = (res && Array.isArray(res.off)) ? res.off : []
  const conflicts = (res && Array.isArray(res.conflicts)) ? res.conflicts : []
  const parts = []
  if (off.length) parts.push(M().turnedOff + off.join(', '))
  if (conflicts.length) parts.push(M().conflicts + conflicts.join(', '))
  if (parts.length) status(parts.join(' · '))
}

/** The dl27 card fields of mod: kind, on, update, likes, tag. */
function cardMore(mod) {
  const i = info[mod] || {}
  const rows = modRows(mod)
  const skin = state.installed.some((s) => s.gbMod === mod)
  const kind = (rows.length && !skin) || (!skin && i.kind === 'mod') ? 'mod' : 'skin'
  return { kind, on: rows.some((r) => (state.modsOn || []).includes(r.id)), update: !!updates[mod],
    likes: i.likes || 0, tag: i.tag || '', author: i.author || '', views: i.views || 0 }
}

function sendGroups() {
  post({ kind: 'groups', groups: ((state && state.profiles) || []).map((p, i) => ({ i, name: p.name, skins: p.skins || 0, mods: p.mods || 0 })) })
}

// ---- catalog: mods categories, search ----
let modCats = null
async function loadModCats() {
  if (modCats) return modCats
  const lists = await Promise.all(MOD_CATS.map(async (c) => {
    let subs = []
    try {
      subs = (await gb('/ModCategory/' + c.cat + '/SubCategories')).filter((s) => s._idRow && s._sName)
        .sort((a, b) => (b._nItemCount || 0) - (a._nItemCount || 0))
    } catch (e) { /* the root still lists its whole category */ }
    return [{ cat: c.cat, name: M()[c.key], sub: false, count: 0 }]
      .concat(subs.map((s) => ({ cat: s._idRow, name: s._sName, sub: true, count: s._nItemCount || 0 })))
  }))
  modCats = lists.flat()
  return modCats
}
const rootOf = (rec) => {
  const r = rec._aRootCategory || {}
  if (r._idRow) return r._idRow
  const m = /\/cats\/(\d+)$/.exec(r._sProfileUrl || '')
  return m ? Number(m[1]) : 0
}
/** Search records carry no rating: guarded, each is read from its ProfilePage (unreadable = 18+). */
async function searchShown(recs) {
  if (!guarded()) return recs
  const adult = await Promise.all(recs.map(async (rec) => {
    if (rec._bHasContentRatings === false) return false
    try { return adultOf(await gb('/Mod/' + rec._idRow + '/ProfilePage')) !== false } catch (e) { return true }
  }))
  return recs.filter((_, i) => !adult[i])
}

/** shop / mods list: an Index page of cat, or a search page of query. */
async function catalog(viewName, cat, page, sort, query) {
  view = viewName
  const kind = viewName === 'mods' ? 'mod' : 'skin'
  const skins = []
  let complete
  if (query) {
    const res = await gb('/Util/Search/Results?_sModelName=Mod&_sOrder=best_match&_idGameRow=20948&_sSearchString=' + encodeURIComponent(query) + '&_nPage=' + page)
    const all = res._aRecords || []
    const keep = all.filter((r) => kind === 'mod' ? MOD_CATS.some((c) => c.cat === rootOf(r)) : rootOf(r) === SKINS_CATEGORY)
    for (const rec of await searchShown(keep)) {
      info[rec._idRow] = recInfo(rec, 0, kind)
      skins.push(cardOf(rec._idRow))
    }
    complete = res._aMetadata && res._aMetadata._bIsComplete !== undefined ? !!res._aMetadata._bIsComplete : all.length < SEARCH_PAGE
  } else {
    const order = SORTS[sort] || MORE_SORTS[sort] || SORTS.downloads
    const res = await gb('/Mod/Index?_nPerpage=24&_nPage=' + page + '&_aFilters%5BGeneric_Category%5D=' + cat + '&_sSort=' + order)
    if (viewName === 'shop' && page === 1) {
      const hero = heroes.find((h) => h.cat === cat)
      if (hero && hero.code) skins.push(stockOf(hero))
    }
    for (const rec of await shownOf(res._aRecords || [])) {
      info[rec._idRow] = recInfo(rec, kind === 'skin' ? cat : 0, kind)
      skins.push(cardOf(rec._idRow))
    }
    complete = !!(res._aMetadata && res._aMetadata._bIsComplete)
  }
  post({ kind: 'skins', view: viewName, cat, sort: sort || 'downloads', query, page, complete, skins })
}

// ---- library actions ----
/** Runs install-like work of mod with the launcher's progress on its card. */
async function withProgress(mod, work) {
  let shown = ''
  const poll = setInterval(async () => {
    try {
      const p = await local('/progress?mod=' + mod)
      const line = p.stage === 'download' ? L.downloading + (p.total ? ' ' + Math.min(100, Math.floor(p.done * 100 / p.total)) + '%' : '…')
        : p.stage === 'unpack' ? L.unpacking : p.stage === 'check' ? L.checking : ''
      if (line && line !== shown && busy[mod]) { shown = line; setBusy(mod, line) }
    } catch (e) { /* the work's own answer reports a dead launcher */ }
  }, 400)
  try { return await work() } finally { clearInterval(poll) }
}

async function afterChange() {
  const before = { ...state.selected }
  await loadState()
  sendCount()
  if (view === 'library') await library()
  sendChoice(before)
  sendGroups()
  await check()
}

const MORE = {
  async cats() { post({ kind: 'cats', cats: await loadModCats() }) },
  async groups() { await loadState(); sendGroups() },
  async mods(args) {
    await catalog('mods', Number(args[0]) || MOD_CATS[0].cat, Math.max(1, Number(args[1]) || 1), args[2] || 'downloads', args[3] || '')
  },
  async modon(args) {
    const mod = Number(args[0])
    const rows = modRows(mod)
    if (!rows.length) return sendCard(mod)
    setBusy(mod, M().switching)
    const all = { off: [], conflicts: [] }
    const before = { ...state.selected }
    try {
      for (const r of rows) {
        const res = await local('/mod/toggle?id=' + encodeURIComponent(r.id) + '&on=' + (args[1] === '1' ? '1' : '0'))
        for (const k of ['off', 'conflicts']) if (res && Array.isArray(res[k])) all[k].push(...res[k])
      }
    } finally {
      delete busy[mod]
      await loadState()
      sendCard(mod)
      // A hero mod switched on takes the hero's worn skin off (skins_slot.rs): its card and the hero's mark.
      sendChoice(before)
    }
    toggleNote(all)
    await check()
  },
  async group(args) {
    const i = Number(args[0])
    const g = ((state && state.profiles) || [])[i]
    if (!g) return
    status(M().groupApplying)
    const res = await local('/group/apply?i=' + i)
    await afterChange()
    const missing = (res && res.missing) || 0
    status(M().groupApplied.replace('%s', g.name) + (missing ? M().groupMissing.replace('%n', missing) : ''))
  },
  async update(args) {
    const mod = Number(args[0])
    const due = updates[mod]
    if (!due) return sendCard(mod)
    setBusy(mod, M().updating)
    try {
      for (const u of due) {
        await withProgress(mod, () => local('/install?mod=' + mod + '&file=' + u.file))
        await local('/replace?mod=' + mod + '&keep=' + u.file + '&old=' + u.old.join(','))
      }
      delete updates[mod]
    } finally {
      delete busy[mod]
      await afterChange()
      sendCard(mod)
    }
  },
}
