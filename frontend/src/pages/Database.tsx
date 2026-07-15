import React, { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { SYURUI_LEGEND, SYURUI_GROUPS, unitHasSyurui, syuruiNames } from '../utils/unitSyurui'
import './Database.css'

interface Unit {
  id: number
  name: string
  hp: number
  en: number
  armor: number
  mobility: number
  sensor: number
  max_weight: number
  req_intuition: number
  req_piloting: number
  req_short_range: number
  req_mid_range: number
  req_long_range: number
  req_nt_level: number
  req_fame: number
  terrain_ground: number
  terrain_water: number
  terrain_space: number
  terrain_air: number
  price: number
  unit_lv: number
  special_flags: string
  syurui: string
  image: string
}

interface CharStats {
  status_intuition: number;
  status_piloting: number;
  status_short_range: number;
  status_mid_range: number;
  status_long_range: number;
  nt_level: number;
  fame: number;
}

type SortKey = keyof Unit
type SortOrder = 'asc' | 'desc'

export const Database: React.FC = () => {
  const [units, setUnits] = useState<Unit[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('id')
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc')
  const [charStats, setCharStats] = useState<CharStats | null>(null)
  // クラス絞り込み（原作 unitinfo の cclv セレクト。req_nt_level の符号で判定）
  const [classFilter, setClassFilter] = useState<'' | 'uns' | 'nt' | 'kyoka'>('')
  // 機体種類絞り込み（原作 unitinfo の ctgr セレクト。syurui コードの membership 判定）
  const [syuruiFilter, setSyuruiFilter] = useState<string>('')

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = localStorage.getItem('gtactics_token');
        if (token) {
            const meRes = await fetch('/api/me', { headers: { 'Authorization': 'Bearer ' + token } });
            const meData = await meRes.json() as any;
            if (meData.success && meData.user) {
                setCharStats({
                    status_intuition: meData.user.status_intuition || 0,
                    status_piloting: meData.user.status_piloting || 0,
                    status_short_range: meData.user.status_short_range || 0,
                    status_mid_range: meData.user.status_mid_range || 0,
                    status_long_range: meData.user.status_long_range || 0,
                    nt_level: meData.user.nt_level || 0,
                    fame: meData.user.fame || 0,
                });
            }
        }

        const res = await fetch('/api/database/units')
        const data = (await res.json()) as any
        if (data.success) {
          setUnits(data.units)
        } else {
          setError(data.message || 'データ取得に失敗しました')
        }
      } catch (err: any) {
        setError('ネットワークエラー')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortOrder('asc')
    }
  }

  const sortedUnits = useMemo(() => {
    const filtered = units.filter(u => {
      if (classFilter === 'uns' && u.req_nt_level !== 0) return false
      if (classFilter === 'nt' && u.req_nt_level <= 0) return false
      if (classFilter === 'kyoka' && u.req_nt_level >= 0) return false
      if (syuruiFilter && !unitHasSyurui(u.syurui, syuruiFilter)) return false
      return true
    })
    const sorted = filtered.sort((a, b) => {
      const valA = a[sortKey]
      const valB = b[sortKey]
      if (valA < valB) return sortOrder === 'asc' ? -1 : 1
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1
      return 0
    })
    return sorted
  }, [units, sortKey, sortOrder, classFilter, syuruiFilter])

  const renderSortIcon = (key: SortKey) => {
    if (sortKey !== key) return ' ↕'
    return sortOrder === 'asc' ? ' ↑' : ' ↓'
  }

  const displayReq = (reqValue: number, charValue: number | undefined) => {
      if (reqValue === 0) return '0';
      if (charValue === undefined) return <span style={{color: '#888'}}>?</span>;
      if (charValue >= reqValue * 0.8) return reqValue;
      return <span style={{color: '#888'}}>?</span>;
  }

  if (loading) return <div className="glass-panel" style={{margin: '2rem'}}>機体データベース読み込み中...</div>
  if (error) return <div className="glass-panel" style={{margin: '2rem', color: 'red'}}>{error}</div>

  return (
    <div className="database-container glass-panel">
      <h1>機体データベース</h1>
      <p className="lead-text">シミュレーターに登録されている機体のデータベースです。</p>

      <div className="db-filters" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '1rem' }}>
        <label htmlFor="classFilter">クラス:</label>
        <select
          id="classFilter"
          value={classFilter}
          onChange={e => setClassFilter(e.target.value as '' | 'uns' | 'nt' | 'kyoka')}
          style={{ background: '#111', color: '#fff', border: '1px solid #555', padding: '0.3rem 0.5rem' }}
        >
          <option value="">指定なし</option>
          <option value="uns">無属性</option>
          <option value="nt">NT</option>
          <option value="kyoka">強化人間</option>
        </select>

        <label htmlFor="syuruiFilter" style={{ marginLeft: '0.5rem' }}>機体種類:</label>
        <select
          id="syuruiFilter"
          value={syuruiFilter}
          onChange={e => setSyuruiFilter(e.target.value)}
          style={{ background: '#111', color: '#fff', border: '1px solid #555', padding: '0.3rem 0.5rem' }}
        >
          <option value="">指定なし</option>
          {SYURUI_GROUPS.map(g => (
            <optgroup key={g.label} label={g.label}>
              {g.chars.map(ch => (
                <option key={ch} value={ch}>{SYURUI_LEGEND[ch]}</option>
              ))}
            </optgroup>
          ))}
        </select>

        <span style={{ color: '#888', fontSize: '0.85rem' }}>{sortedUnits.length}機</span>
      </div>

      <div className="table-responsive">
        <table className="db-table">
          <thead>
            <tr>
              <th onClick={() => handleSort('id')}>FINo{renderSortIcon('id')}</th>
              <th onClick={() => handleSort('name')}>機体名{renderSortIcon('name')}</th>
              <th onClick={() => handleSort('hp')}>耐久{renderSortIcon('hp')}</th>
              <th onClick={() => handleSort('armor')}>装甲{renderSortIcon('armor')}</th>
              <th onClick={() => handleSort('mobility')}>運動{renderSortIcon('mobility')}</th>
              <th onClick={() => handleSort('sensor')}>索敵{renderSortIcon('sensor')}</th>
              <th onClick={() => handleSort('en')}>EN{renderSortIcon('en')}</th>
              <th onClick={() => handleSort('max_weight')}>重量{renderSortIcon('max_weight')}</th>
              <th onClick={() => handleSort('req_intuition')}>直感{renderSortIcon('req_intuition')}</th>
              <th onClick={() => handleSort('req_piloting')}>操縦{renderSortIcon('req_piloting')}</th>
              <th onClick={() => handleSort('req_short_range')}>近{renderSortIcon('req_short_range')}</th>
              <th onClick={() => handleSort('req_mid_range')}>中{renderSortIcon('req_mid_range')}</th>
              <th onClick={() => handleSort('req_long_range')}>遠{renderSortIcon('req_long_range')}</th>
              <th onClick={() => handleSort('req_fame')}>名声{renderSortIcon('req_fame')}</th>
              <th onClick={() => handleSort('req_nt_level')}>NT{renderSortIcon('req_nt_level')}</th>
              <th onClick={() => handleSort('price')}>カスタム費{renderSortIcon('price')}</th>
              <th onClick={() => handleSort('terrain_ground')}>地{renderSortIcon('terrain_ground')}</th>
              <th onClick={() => handleSort('terrain_water')}>水{renderSortIcon('terrain_water')}</th>
              <th onClick={() => handleSort('terrain_space')}>宇{renderSortIcon('terrain_space')}</th>
              <th onClick={() => handleSort('terrain_air')}>空{renderSortIcon('terrain_air')}</th>
              <th onClick={() => handleSort('unit_lv')}>Lv{renderSortIcon('unit_lv')}</th>
              <th>機体種類</th>
            </tr>
          </thead>
          <tbody>
            {sortedUnits.map(unit => (
              <tr key={unit.id} className="clickable-row">
                <td className="center">{unit.id}</td>
                <td className="strong">
                  {unit.req_fame > (charStats?.fame ?? 0) * 2 ? '特殊条件機体' : unit.name}
                </td>
                <td className="center">{unit.hp}</td>
                <td className="center">{unit.armor}</td>
                <td className="center">{unit.mobility}</td>
                <td className="center">{unit.sensor}</td>
                <td className="center">{unit.en}</td>
                <td className="center">{unit.max_weight}</td>
                <td className="center">{displayReq(unit.req_intuition, charStats?.status_intuition)}</td>
                <td className="center">{displayReq(unit.req_piloting, charStats?.status_piloting)}</td>
                <td className="center">{displayReq(unit.req_short_range, charStats?.status_short_range)}</td>
                <td className="center">{displayReq(unit.req_mid_range, charStats?.status_mid_range)}</td>
                <td className="center">{displayReq(unit.req_long_range, charStats?.status_long_range)}</td>
                <td className="center">{displayReq(unit.req_fame, charStats?.fame)}</td>
                <td className="center">
                  {unit.req_nt_level > 0 ? (
                    <span className="req-nt">NT({displayReq(unit.req_nt_level, charStats?.nt_level)})</span>
                  ) : unit.req_nt_level < 0 ? (
                    <span className="req-nt" style={{ color: '#e53e3e' }}>強化({Math.abs(unit.req_nt_level)})</span>
                  ) : (
                    <span className="req-normal">UNS</span>
                  )}
                </td>
                <td className="center">{unit.price}</td>
                <td className="center">{unit.terrain_ground}</td>
                <td className="center">{unit.terrain_water}</td>
                <td className="center">{unit.terrain_space}</td>
                <td className="center">{unit.terrain_air}</td>
                <td className="center">{unit.unit_lv}</td>
                <td style={{ fontSize: '0.8rem', color: '#aaa', whiteSpace: 'nowrap' }}>
                  {syuruiNames(unit.syurui).join(' / ') || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      <div className="actions" style={{marginTop: '2rem'}}>
        <Link to="/mypage" className="btn btn-secondary">マイページに戻る</Link>
      </div>
    </div>
  )
}
