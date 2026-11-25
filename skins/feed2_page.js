'use strict'
// Fork dl52 mod page of the in-game picker (feed2.html; panorama/src/skins_page.ts). Owner 2026-11-25: "сделать также
// переход как в приложении на страницу мода внутри игры, плюс сейчас скачать можно только одну версию мода внутри
// игры, остальные теряются". A card's preview opens the page: facts, description and every file of the mod, each
// with its own get / delete and a row per installed variant (wear / take off a skin, on / off a mod).
// Loaded after feed2_more.js and before feed2.html's own script: it only defines; the page calls it.
//   Commands: page~<mod> (0 = closed) | fget~<mod>~<file> | fwear~<id> | foff~<id> | fmod~<id>~<0|1> |
//             fremove~<mod>~<file>.
//   Message: page {page:{mod,name,image,kind,facts,tag,text,busy,files:[{file,name,info,busy,variants:[
//            {id,name,kind,worn,on}]}]}} (skins_feed.ts FeedPage). Card fields author, views.

const PAGE_TEXT = {
  ru: {
    window: { back: 'Назад', files: 'Файлы', later: 'Выбор сохранён: наденется в хайдауте', installed: 'Установлен',
      views: 'Просмотры' },
    author: 'Автор: ', downloads: 'Скачивания', updated: 'Обновлён ', fileGone: 'файла больше нет на GameBanana',
    removeFileAsk: 'Удалить файл «%s»?',
  },
  en: {
    window: { back: 'Back', files: 'Files', later: 'Choice saved: it goes on in the hideout', installed: 'Installed',
      views: 'Views' },
    author: 'Author: ', downloads: 'Downloads', updated: 'Updated ', fileGone: 'file no longer on GameBanana',
    removeFileAsk: 'Delete the file "%s"?',
  },
}
for (const k of ['ru', 'en']) Object.assign(MORE_TEXT[k].window, PAGE_TEXT[k].window)
const P = () => (L === T.en ? PAGE_TEXT.en : PAGE_TEXT.ru)

let pageMod = 0          // mod of the open page, 0 = none
const pageBusy = {}      // file -> true while its command runs (its line shows the mod's busy text)
const profs = {}         // mod -> ProfilePage read fresh once this session (description, files)

async function profOf(mod) {
  if (!profs[mod]) profs[mod] = await gb('/Mod/' + mod + '/ProfilePage', 0)
  return profs[mod]
}

const sizeOf = (n) => (n >= 1048576 ? (Math.round(n / 104857.6) / 10) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB')
const dateOf = (ts) => (ts ? new Date(ts * 1000).toLocaleDateString(L === T.en ? 'en-GB' : 'ru-RU') : '')

/** The page message of mod from its ProfilePage and the launcher's /state. */
function pageOf(mod) {
  const prof = profs[mod]
  const skins = state.installed.filter((s) => s.gbMod === mod)
  const rows = modRows(mod)
  const i = info[mod] || {}
  const kind = skins.length ? 'skin' : rows.length ? 'mod'
    : i.kind || (MOD_CATS.some((c) => c.cat === rootOf(prof)) ? 'mod' : 'skin')
  const im = prof._aPreviewMedia && prof._aPreviewMedia._aImages && prof._aPreviewMedia._aImages[0]
  const image = im ? im._sBaseUrl + '/' + (im._sFile530 || im._sFile) : ''

  // Each installed variant under the file it came from.
  const variants = (file) => skins.filter((s) => fileOfId(s.id) === file)
    .map((s) => ({ id: s.id, name: s.name, kind: 'skin', worn: state.selected[s.hero] === s.id, on: false }))
    .concat(rows.filter((r) => fileOfId(r.id) === file)
      .map((r) => ({ id: r.id, name: r.name, kind: 'mod', worn: false, on: (state.modsOn || []).includes(r.id) })))
  const line = (file) => (pageBusy[file] ? busy[mod] || L.window.loading : '')
  const listed = usable(prof._aFiles)
  const files = listed.map((f) => ({ file: f._idRow, name: f._sFile, busy: line(f._idRow), variants: variants(f._idRow),
    info: [f._sDescription, sizeOf(f._nFilesize || 0), dateOf(f._tsDateAdded)].filter((x) => x).join(' · ') }))
  // Installed files GameBanana no longer lists still get their rows (delete, wear).
  const gone = [...new Set(skins.map((s) => s.id).concat(rows.map((r) => r.id)).map(fileOfId))]
    .filter((f) => f && !listed.some((x) => x._idRow === f))
  for (const f of gone) files.push({ file: f, name: String(f), info: P().fileGone, busy: line(f), variants: variants(f) })

  // Facts: author, likes, downloads, views, updated; the tag: the hero, or the subcategory.
  const author = prof._aSubmitter && prof._aSubmitter._sName
  const facts = [author ? P().author + author : '', prof._nLikeCount ? M().window.likes + ' ' + prof._nLikeCount : '',
    prof._nDownloadCount ? P().downloads + ' ' + prof._nDownloadCount : '',
    prof._nViewCount ? P().window.views + ' ' + prof._nViewCount : '',
    dateOf(prof._tsDateUpdated || prof._tsDateModified) ? P().updated + dateOf(prof._tsDateUpdated || prof._tsDateModified) : '']
    .filter((x) => x)
  const card = cardOf(mod)
  return { mod, name: prof._sName || card.name, image: /^https:/.test(image) ? image : card.image, kind, facts,
    tag: card.hero || card.tag || '', text: prof._sText || '', busy: busy[mod] || '', files }
}

function sendPage() {
  if (pageMod && profs[pageMod] && state) post({ kind: 'page', page: pageOf(pageMod) })
}

/** openPage reads the mod's ProfilePage and sends its page (a card's preview, or "get" of a mod with several files). */
async function openPage(mod) {
  pageMod = mod
  const prof = await profOf(mod)
  if (!info[mod]) {
    const kind = MOD_CATS.some((c) => c.cat === rootOf(prof)) ? 'mod' : 'skin'
    info[mod] = recInfo(prof, kind === 'skin' ? (prof._aCategory && prof._aCategory._idRow) : 0, kind)
  }
  sendPage()
}

/** fileWork runs one file's command with its line busy, then sends the changed cards and the page. */
async function fileWork(mod, file, line, work) {
  pageBusy[file] = true
  setBusy(mod, line)
  try {
    return await work()
  } finally {
    delete pageBusy[file]
    delete busy[mod]
    await afterChange()
    sendCard(mod)
    sendPage()
  }
}

const skinOf = (id) => state.installed.find((s) => s.id === id)

Object.assign(MORE, {
  async page(args) {
    const mod = Number(args[0]) || 0
    if (!mod) { pageMod = 0; return }
    await openPage(mod)
  },
  async fget(args) {
    const mod = Number(args[0]), file = Number(args[1])
    if (!mod || !file) return
    if (!usable((await profOf(mod))._aFiles).some((f) => f._idRow === file)) throw new Error(P().fileGone)
    await fileWork(mod, file, L.starting, () => withProgress(mod, () => local('/install?mod=' + mod + '&file=' + file)))
  },
  async fwear(args) {
    const s = skinOf(args[0])
    if (!s) return sendPage()
    await fileWork(s.gbMod, fileOfId(s.id), L.applying, () => choose([[s.hero, s.id]]))
  },
  async foff(args) {
    const s = skinOf(args[0])
    if (!s) return sendPage()
    await fileWork(s.gbMod, fileOfId(s.id), L.applying, () => choose([[s.hero, '']]))
  },
  async fmod(args) {
    const r = ((state && state.mods) || []).find((m) => m.id === args[0])
    if (!r) return sendPage()
    const res = await fileWork(r.gbMod, fileOfId(r.id), M().switching,
      () => local('/mod/toggle?id=' + encodeURIComponent(r.id) + '&on=' + (args[1] === '1' ? '1' : '0')))
    toggleNote(res)
  },
  async fremove(args) {
    const mod = Number(args[0]), file = Number(args[1])
    if (!mod || !file) return
    const f = usable((profs[mod] || {})._aFiles).find((x) => x._idRow === file)
    const i = await ask(P().removeFileAsk.replace('%s', f ? f._sFile : String(file)), [L.window.remove])
    if (i === null) return
    await fileWork(mod, file, L.removing, () => local('/remove?mod=' + mod + '&file=' + file))
  },
})
