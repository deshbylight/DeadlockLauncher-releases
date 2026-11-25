'use strict'
// Fork dl58 library additions of the in-game picker page (feed2.html; skins_grid.ts, skins_side.ts). Only for a
// renderer that asks with `&v=2` in the page URL: an older one draws an unknown card (mod 0) as a stock card.
//   Hero rows carry `icon` (the game's hero image name, file://{images}/heroes/<icon>_sm.psd).
//   Library cards carry `group` (hero name, or the mods group); after them, the addons files not in the library
//   (launcher /found) as cards with `file` in the group "on this PC", each with an import button.
//   Command: found~<file> (copy an addons file into the library, launcher /found/import).

// Read from the URL here: feed2.html's own `q` is declared after this file runs.
const LIB = Number(new URLSearchParams(location.search).get('v')) >= 2

const LIB_TEXT = {
  ru: { window: { onPc: 'На этом ПК (addons)', importFile: 'В библиотеку', allHeroes: 'Все герои' }, mods: 'Моды', importing: 'Копирую…' },
  en: { window: { onPc: 'On this PC (addons)', importFile: 'To library', allHeroes: 'All heroes' }, mods: 'Mods', importing: 'Copying…' },
}
const B = () => (L === T.en ? LIB_TEXT.en : LIB_TEXT.ru)

// Hero codes whose image name differs (scripts/heroes.vdata m_strIconImageSmall, game 6868).
const HERO_ICONS = { atlas: 'bull', dynamo: 'sumo', forge: 'engineer', ghost: 'spectre', krill: 'digger',
  orion: 'archer', viper: 'kali' }
const heroIcon = (code) => (code ? HERO_ICONS[code] || code : '')

const fileBusy = {} // addons file -> line of the running import
let found = []      // launcher /found rows not in the library

/** The library's cards with their group, then the addons files not in it. */
async function libraryFound(skins) {
  for (const c of skins) c.group = c.kind === 'mod' && !c.hero ? B().mods : c.hero
  try {
    const res = await local('/found')
    const mine = installedMods()
    found = (res.mods || []).filter((m) => !m.imported && !(m.gbMod && mine.includes(m.gbMod)))
  } catch (e) { found = [] }
  await Promise.all(found.filter((m) => m.gbMod && !info[m.gbMod]).map(async (m) => {
    try {
      const p = await gb('/Mod/' + m.gbMod + '/ProfilePage')
      info[m.gbMod] = { name: p._sName, image: thumb(p), cat: p._aCategory && p._aCategory._idRow }
    } catch (e) { /* the card keeps the file name, no preview */ }
  }))
  return skins.concat(found.map(foundCard))
}

/** An addons file's card: its GameBanana name and preview when the file name carries the mod id. */
function foundCard(m) {
  const i = (m.gbMod && info[m.gbMod]) || {}
  const hero = m.error ? L.failed + m.error : m.hero ? (state.names[m.hero] || m.hero) : ''
  return { mod: 0, cat: 0, file: m.file, group: B().window.onPc, name: i.name || m.file, image: i.image || '',
    hero, worn: false, mine: false, busy: fileBusy[m.file] || '' }
}

const sendFound = (file) => {
  const m = found.find((x) => x.file === file)
  if (m) post({ kind: 'card', skin: foundCard(m) })
}

const LIB_CMDS = {
  async found(args) {
    const file = args[0] || ''
    if (!found.some((m) => m.file === file) || fileBusy[file]) return
    fileBusy[file] = B().importing
    sendFound(file)
    try {
      await local('/found/import?file=' + encodeURIComponent(file))
    } finally {
      delete fileBusy[file]
      sendFound(file)
    }
    await loadState()
    sendCount()
    if (view === 'library') await library()
  },
}
