import { calcCost } from './battleEngine'

export const parseTraitsObj = (t: any) => {
  try {
    return typeof t === 'string' && t.startsWith('{') ? JSON.parse(t) : (t || {})
  } catch(e) {
    return {}
  }
}

export const charCost = (ch: any) => {
  const rankScore = (ch.status_intuition || 0) + 
                    (ch.status_piloting || 0) + 
                    (ch.status_short_range || 0) + 
                    (ch.status_mid_range || 0) + 
                    (ch.status_long_range || 0) + 
                    (ch.level || 1) * 25 + 
                    Math.abs(ch.nt_level || 0) * 100

  const unitLevel = ch.unit_lv && ch.unit_lv > 0 ? ch.unit_lv : 1
  const lp = ch.unit_custom_lp || 0
  const traits = parseTraitsObj(ch.traits)

  return calcCost(rankScore, unitLevel, lp, traits)
}
