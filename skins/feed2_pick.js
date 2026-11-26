'use strict'
// Fork dl59 installed tab of the in-game picker page (feed2.html; skins_pick.ts, skins_library_side.ts): the same picks
// and groups as the launcher's library. Cards are picked by GameBanana mod; the page maps each to store ids:
//   wear / group: one skin per hero of the mod (the worn one, else the first) and every mod row of it;
//   delete: every installed skin and mod row of it.
// Commands: pickwear~<mods>, picktakeoff~<mods>, pickremove~<mods>, groupsave~<name>~<mods> (empty = what is worn now), groupdel~<i>.
// Launcher routes: /pick/apply, /pick/takeoff, /pick/remove, /group/save, /group/delete (skins_server.rs).

const PICK = Number(new URLSearchParams(location.search).get('v')) >= 3

const PICK_TEXT = {
  ru: {
    window: {
      noGroups: 'Групп нет: отметьте или наденьте скины, введите имя и сохраните',
      picked: 'Выбрано: %s', pickHint: 'Отметьте карточки квадратом в углу', pickWear: 'Надеть выбранные', pickTakeOff: 'Снять выбранные',
      pickRemove: 'Удалить выбранные', pickClear: 'Сбросить', pickRemoveAsk: 'Удалить с диска выбранное: %s?',
      groupName: 'Имя группы', groupPicked: 'Группа из выбранных', groupWorn: 'Группа из надетого',
      groupDeleteAsk: 'Удалить группу «%s»?',
    },
    worn: 'Надето: %s', takenOff: 'Снято: %s', removed: 'Удалено: %s', saved: 'Группа «%s» сохранена', deleted: 'Группа «%s» удалена',
  },
  en: {
    window: {
      noGroups: 'No groups yet: pick or wear skins, type a name and save',
      picked: 'Picked: %s', pickHint: 'Tick cards with the square in their corner', pickWear: 'Wear picked', pickTakeOff: 'Take off picked',
      pickRemove: 'Delete picked', pickClear: 'Clear', pickRemoveAsk: 'Delete the picked items from disk: %s?',
      groupName: 'Group name', groupPicked: 'Group from picked', groupWorn: 'Group from worn',
      groupDeleteAsk: 'Delete group "%s"?',
    },
    worn: 'Worn: %s', takenOff: 'Taken off: %s', removed: 'Deleted: %s', saved: 'Group "%s" saved', deleted: 'Group "%s" deleted',
  },
}
const PK = () => (L === T.en ? PICK_TEXT.en : PICK_TEXT.ru)

/** pickMods reads "101,102" into GameBanana mod numbers. */
const pickMods = (arg) => (arg || '').split(',').map(Number).filter((m) => m > 0)

/** wearIds are the store ids that put mods on: one skin per hero (worn first) and every mod row. */
function wearIds(mods) {
  const ids = []
  for (const mod of mods) {
    const skins = state.installed.filter((s) => s.gbMod === mod)
    const heroes = new Set()
    for (const s of [...skins.filter((x) => state.selected[x.hero] === x.id), ...skins]) {
      if (heroes.has(s.hero)) continue
      heroes.add(s.hero)
      ids.push(s.id)
    }
    if (HAS_MORE) for (const m of modRows(mod)) ids.push(m.id)
  }
  return ids
}

/** allIds are every installed row of the mods (deletion). */
const allIds = (mods) => mods.flatMap((mod) =>
  state.installed.filter((s) => s.gbMod === mod).map((s) => s.id).concat(HAS_MORE ? modRows(mod).map((m) => m.id) : []))

const idArg = (list) => encodeURIComponent(list.join(','))

const PICK_CMDS = {
  async pickwear(args) {
    await loadState()
    const list = wearIds(pickMods(args[0]))
    if (!list.length) return
    status(L.applying)
    await local('/pick/apply?ids=' + idArg(list))
    await afterChange()
    status(PK().worn.replace('%s', list.length))
  },
  // Every row of the mods goes to the launcher; it takes off only those worn or on (skins_pick.rs takeoff_ids).
  async picktakeoff(args) {
    await loadState()
    const list = allIds(pickMods(args[0]))
    if (!list.length) return
    status(L.applying)
    const r = await local('/pick/takeoff?ids=' + idArg(list))
    await afterChange()
    status(PK().takenOff.replace('%s', r.off))
  },
  async pickremove(args) {
    await loadState()
    const list = allIds(pickMods(args[0]))
    if (!list.length) return
    status(L.removing)
    await local('/pick/remove?ids=' + idArg(list))
    await afterChange()
    status(PK().removed.replace('%s', list.length))
  },
  async groupsave(args) {
    const name = (args[0] || '').trim()
    if (!name) return
    await loadState()
    const mods = pickMods(args[1])
    const list = mods.length ? wearIds(mods) : []
    if (mods.length && !list.length) return
    await local('/group/save?name=' + encodeURIComponent(name) + (list.length ? '&ids=' + idArg(list) : ''))
    await afterChange()
    status(PK().saved.replace('%s', name))
  },
  async groupdel(args) {
    await loadState()
    const g = (state.profiles || [])[Number(args[0])]
    if (!g) return sendGroups()
    await local('/group/delete?i=' + Number(args[0]))
    await afterChange()
    status(PK().deleted.replace('%s', g.name))
  },
}
