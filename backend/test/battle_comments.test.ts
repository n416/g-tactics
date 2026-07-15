import { describe, it, expect } from 'vitest'
import { fireBattleComment, parseTraitsAndSkills, simulateBattleRound } from '../src/utils/battleEngine'

describe('Battle Comments', () => {
  it('should format battle comment correctly', () => {
    const fighter = {
      handle_name: 'Amuro',
      battle_comments: JSON.stringify({
        start: 'いきまーす！',
        critical: 'そこだっ！',
        win: 'やったぜ！',
        lose: 'たかが石ころ一つ！',
        evade: '当たらなければ！'
      })
    }
    parseTraitsAndSkills(fighter)

    expect(fireBattleComment(fighter, 'start')).toBe('『【Amuro】「いきまーす！」』')
    expect(fireBattleComment(fighter, 'critical')).toBe('『【Amuro】「そこだっ！」』')
    expect(fireBattleComment(fighter, 'win')).toBe('『【Amuro】「やったぜ！」』')
    expect(fireBattleComment(fighter, 'lose')).toBe('『【Amuro】「たかが石ころ一つ！」』')
    expect(fireBattleComment(fighter, 'evade')).toBe('『【Amuro】「当たらなければ！」』')
    expect(fireBattleComment(fighter, 'unknown')).toBe(null)
  })

  it('should inject start comments into battle logs', () => {
    const aFighter = {
      id: 'a',
      handle_name: 'Attacker',
      hp: 100,
      maxHp: 100,
      en: 100,
      maxEn: 100,
      battle_comments: JSON.stringify({ start: '攻撃開始' }),
      unit_base_hp: 100,
      unit_base_en: 100,
      status_piloting: 10
    }
    const dFighter = {
      id: 'd',
      handle_name: 'Defender',
      hp: 100,
      maxHp: 100,
      en: 100,
      maxEn: 100,
      battle_comments: JSON.stringify({ start: '防御開始' }),
      unit_base_hp: 100,
      unit_base_en: 100,
      status_piloting: 10
    }

    const { logs } = simulateBattleRound(aFighter, dFighter, 1, 0, undefined, undefined, 1, [], [], 1)
    
    expect(logs.some(l => l.includes('『【Attacker】「攻撃開始」』'))).toBe(true)
    expect(logs.some(l => l.includes('『【Defender】「防御開始」』'))).toBe(true)
  })
})
