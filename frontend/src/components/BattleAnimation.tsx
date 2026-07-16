import React, { useEffect, useState, useRef } from 'react';
import './BattleAnimation.css';
import { UnitImage } from './UnitImage';

export interface LSideSnap {
  hp: number; maxHp: number; en: number; maxEn: number; ammo: number;
  dmgDealt: number; hit: boolean; hitCount: number;
}

export interface BattleEvent {
  turn: number;
  kyori: number;
  hani: 1 | 2 | 3;
  messages: string[];
  attacker: LSideSnap;
  defender: LSideSnap;
  attackerName?: string;
  defenderName?: string;
  attackerUnit?: string;
  defenderUnit?: string;
}

export interface BattleMeta {
  attackerName: string;
  defenderName: string;
  attackerUnit: string;
  defenderUnit: string;
  rewardMoney: number;
  rewardExp: number;
  isSuccess: boolean;
  attackerImage?: string | null;
  defenderImage?: string | null;
  /** 戦場地形 1:地上 2:水中 3:宇宙 4:空中 5:仮想空間。過去のリプレイには無いので optional */
  terrain?: number;
}

interface BattleAnimationProps {
  events: BattleEvent[];
  meta: BattleMeta;
  onClose: () => void;
}

// ============================================================
// 地形背景（スパロボ風パララックス）
// 各レイヤーは [原画][左右反転][原画][左右反転] と鏡像で連結し
// translateX(-50%) でループさせる。端の画素が鏡合わせで一致するため
// 継ぎ目は構造的に発生しない。
// 素材: ChatGPT で生成したレイヤーシートを tmp-terrain-test/slice-sheet.mjs で
// スライスしたもの（frontend/public/images/terrain/）。
// ============================================================

type BgLayer = {
  /** 画像レイヤー。css と排他 */
  src?: string;
  /** CSS background で描くレイヤー（仮想空間の格子床など）。src と排他 */
  css?: string;
  /** ステージ高さに対する % */
  h: number;
  /** true なら上端アンカー（空など）。既定は下端 */
  top?: boolean;
  /** 下端アンカー時の底上げ % （宇宙の星雲帯など中空に浮かせる用） */
  b?: number;
  /** ドリフト1周の秒数。小さいほど手前・速い */
  dur: number;
};

type TerrainBg = {
  /** レイヤーの隙間から見える下地 */
  bg: string;
  layers: BgLayer[];
  /** ユニットの接地位置（ステージ下端からの %）。宇宙・空中は浮かせる */
  unitBottom: number;
};

const TERRAIN_BG: Record<number, TerrainBg> = {
  // 1: 地上（夕焼けの草原）
  1: {
    bg: 'linear-gradient(#c9a0c8 0%, #f5d9c4 55%, #f2e3d5 100%)',
    layers: [
      { src: '/images/terrain/t1b-strip1.png', top: true, h: 72, dur: 300 },
      { src: '/images/terrain/t1b-far2.png', h: 52, dur: 120 },
      { src: '/images/terrain/t1b-strip3.png', h: 30, dur: 55 },
      { src: '/images/terrain/t1b-strip4.png', h: 24, dur: 22 },
      { src: '/images/terrain/t1b-strip5.png', h: 18, dur: 9 },
    ],
    unitBottom: 6,
  },
  // 2: 水中
  2: {
    bg: 'linear-gradient(#0a4a74 0%, #052a47 100%)',
    layers: [
      { src: '/images/terrain/t2-strip1.png', top: true, h: 100, dur: 240 },
      { src: '/images/terrain/t2-far.png', h: 55, dur: 110 },
      { src: '/images/terrain/t2-mid.png', h: 40, dur: 40 },
      { src: '/images/terrain/t2-fore.png', h: 26, dur: 16 },
    ],
    unitBottom: 9,
  },
  // 3: 宇宙
  3: {
    bg: '#02030a',
    layers: [
      { src: '/images/terrain/t3-strip1.png', top: true, h: 100, dur: 360 },
      { src: '/images/terrain/t3-strip2.png', h: 42, b: 30, dur: 130 },
      { src: '/images/terrain/t3-strip3.png', h: 24, b: 14, dur: 60 },
      { src: '/images/terrain/t3-strip4.png', h: 20, b: 4, dur: 26 },
      { src: '/images/terrain/t3-strip5.png', h: 16, dur: 11 },
    ],
    unitBottom: 20,
  },
  // 4: 空中
  4: {
    bg: 'linear-gradient(#5ca4e0 0%, #cfe8f9 100%)',
    layers: [
      { src: '/images/terrain/t4-strip1.png', top: true, h: 85, dur: 300 },
      { src: '/images/terrain/t4-strip2.png', h: 36, dur: 120 },
      { src: '/images/terrain/t4-strip3.png', h: 30, b: 16, dur: 50 },
      { src: '/images/terrain/t4-strip4.png', h: 26, b: 4, dur: 20 },
      { src: '/images/terrain/t4-strip5.png', h: 20, dur: 9 },
    ],
    unitBottom: 18,
  },
  // 5: 仮想空間（床はシートの遠近付き格子が使えないため CSS 格子で描く）
  5: {
    bg: 'linear-gradient(#0b1030 0%, #071022 60%, #030614 100%)',
    layers: [
      { src: '/images/terrain/t5-strip1.png', h: 42, b: 10, dur: 130 },
      { src: '/images/terrain/t5-strip2.png', h: 30, b: 22, dur: 55 },
      { src: '/images/terrain/t5-strip3.png', h: 24, b: 10, dur: 24 },
      {
        css: [
          'linear-gradient(rgba(0,242,254,0.55) 1px, transparent 1px) 0 0 / 100% 24px',
          'linear-gradient(90deg, rgba(0,242,254,0.35) 2px, transparent 2px) 0 0 / 48px 100%',
          'linear-gradient(rgba(0,242,254,0.12), rgba(3,6,20,0.9))',
        ].join(', '),
        h: 12,
        dur: 10,
      },
    ],
    unitBottom: 12,
  },
};

const MIRROR_COPIES = [0, 1, 2, 3];

const TerrainBackdrop: React.FC<{ terrain: number }> = ({ terrain }) => {
  const t = TERRAIN_BG[terrain] || TERRAIN_BG[1];
  return (
    <>
      <div className="battle-stage-bg" style={{ background: t.bg }} />
      {t.layers.map((l, i) => {
        const anchor = l.top ? { top: 0 } : { bottom: `${l.b || 0}%` };
        if (l.css) {
          // CSS 描画レイヤー: 幅 200% を -50% ドリフト（背景自体が繰り返しなので継ぎ目なし）
          return (
            <div
              key={i}
              className="battle-bg-band band-css"
              style={{ ...anchor, height: `${l.h}%`, background: l.css, animationDuration: `${l.dur}s` }}
            />
          );
        }
        return (
          <div
            key={i}
            className="battle-bg-band"
            style={{ ...anchor, height: `${l.h}%`, animationDuration: `${l.dur}s` }}
          >
            {MIRROR_COPIES.map(k => (
              <img key={k} src={l.src} alt="" className={k % 2 ? 'band-mirror' : ''} draggable={false} />
            ))}
          </div>
        );
      })}
    </>
  );
};

export const BattleAnimation: React.FC<BattleAnimationProps> = ({ events = [], meta, onClose }) => {
  const m = meta as any;
  const attackerImage: string | null = m?.attackerImage || m?.attacker?.image || null;
  const defenderImage: string | null = m?.defenderImage || m?.defender?.image || null;
  const terrain: number = m?.terrain || 1;
  const unitBottom = (TERRAIN_BG[terrain] || TERRAIN_BG[1]).unitBottom;

  const [currentEventIndex, setCurrentEventIndex] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [displayedMessages, setDisplayedMessages] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const currentEvent = currentEventIndex > 0 ? events[currentEventIndex - 1] : null;

  const initialAttackerHp = events.length > 0 ? events[0].attacker.maxHp : 100;
  const initialDefenderHp = events.length > 0 ? events[0].defender.maxHp : 100;

  const attackerHp = currentEvent ? currentEvent.attacker.hp : initialAttackerHp;
  const defenderHp = currentEvent ? currentEvent.defender.hp : initialDefenderHp;

  const initialAttackerEn = events.length > 0 ? events[0].attacker.maxEn : 50;
  const initialDefenderEn = events.length > 0 ? events[0].defender.maxEn : 50;

  const attackerEn = currentEvent ? currentEvent.attacker.en : initialAttackerEn;
  const defenderEn = currentEvent ? currentEvent.defender.en : initialDefenderEn;

  const attackerAmmo = currentEvent ? currentEvent.attacker.ammo : (events.length > 0 ? events[0].attacker.ammo : 0);
  const defenderAmmo = currentEvent ? currentEvent.defender.ammo : (events.length > 0 ? events[0].defender.ammo : 0);

  const attackerHpPercent = Math.max(0, (attackerHp / initialAttackerHp) * 100);
  const defenderHpPercent = Math.max(0, (defenderHp / initialDefenderHp) * 100);

  const attackerEnPercent = Math.max(0, (attackerEn / initialAttackerEn) * 100);
  const defenderEnPercent = Math.max(0, (defenderEn / initialDefenderEn) * 100);

  const distance = currentEvent ? currentEvent.kyori : (events.length > 0 ? events[0].kyori : 0);
  const hani = currentEvent ? currentEvent.hani : (events.length > 0 ? events[0].hani : 2);

  useEffect(() => {
    if (isFinished) return;

    if (events.length === 0) {
      setIsFinished(true);
      return;
    }

    if (currentEventIndex < events.length) {
      const timer = setTimeout(() => {
        handleNextEvent();
      }, 2000);
      return () => clearTimeout(timer);
    } else if (events.length > 0) {
      const timer = setTimeout(() => {
        setIsFinished(true);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [currentEventIndex, events, isFinished]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [displayedMessages]);

  const handleReplay = () => {
    setCurrentEventIndex(0);
    setIsFinished(false);
    setDisplayedMessages([]);
  };

  const handleNextEvent = () => {
    if (currentEventIndex < events.length) {
      setDisplayedMessages(prev => [...prev, ...events[currentEventIndex].messages]);
      setCurrentEventIndex(prev => prev + 1);
    } else {
      setIsFinished(true);
    }
  };

  const handleFullSkip = () => {
    setCurrentEventIndex(events.length);
    setDisplayedMessages(events.flatMap(e => e.messages));
    setIsFinished(true);
  };

  const getDistanceVisual = () => {
    if (hani === 1) return `⚔️ CLOSE RANGE (近距離: ${distance})`;
    if (hani === 2) return `🎯 MID RANGE (中距離: ${distance})`;
    return `🔭 LONG RANGE (遠距離: ${distance})`;
  };

  return (
    <div className="battle-animation-overlay">
      <TerrainBackdrop terrain={terrain} />

      {/* 地形の上に立つ機体（スパロボ風）。機体画像は素で左向きなので攻撃側を反転して向かい合わせる */}
      {attackerImage && (
        <div
          className={`stage-unit stage-attacker ${currentEvent?.attacker?.hit ? 'stage-hit' : ''}`}
          style={{ bottom: `${unitBottom}%` }}
        >
          <UnitImage file={attackerImage} alt={meta?.attackerUnit} />
          {currentEvent?.attacker?.dmgDealt ? currentEvent.attacker.dmgDealt > 0 && (
            <div className="damage-flash hit">
              -{currentEvent.attacker.dmgDealt}
              {currentEvent.attacker.hitCount > 1 ? ` (${currentEvent.attacker.hitCount} Hits!)` : ''}
            </div>
          ) : null}
        </div>
      )}
      {defenderImage && (
        <div
          className={`stage-unit stage-defender ${currentEvent?.defender?.hit ? 'stage-hit' : ''}`}
          style={{ bottom: `${unitBottom + 2}%` }}
        >
          <UnitImage file={defenderImage} alt={meta?.defenderUnit} />
          {currentEvent?.defender?.dmgDealt ? currentEvent.defender.dmgDealt > 0 && (
            <div className="damage-flash hit">
              -{currentEvent.defender.dmgDealt}
              {currentEvent.defender.hitCount > 1 ? ` (${currentEvent.defender.hitCount} Hits!)` : ''}
            </div>
          ) : null}
        </div>
      )}

      {/* ステータスプレート（左: 攻撃側 / 右: 防御側） */}
      <div className="status-plate plate-attacker">
        <div className="plate-pilot">{currentEvent?.attackerName || meta?.attackerName || 'UNKNOWN'}</div>
        <div className="plate-unit">{currentEvent?.attackerUnit || meta?.attackerUnit || 'UNKNOWN'}</div>
        <div className="plate-row">HP {Math.max(0, attackerHp)} / {initialAttackerHp}</div>
        <div className="hp-bar-track"><div className="hp-bar-fill attacker-hp" style={{ width: `${attackerHpPercent}%` }}></div></div>
        <div className="plate-row">EN {Math.max(0, attackerEn)} / {initialAttackerEn}</div>
        <div className="hp-bar-track"><div className="hp-bar-fill en-bar" style={{ width: `${attackerEnPercent}%` }}></div></div>
        <div className="plate-row">AMMO {attackerAmmo}</div>
      </div>
      <div className="status-plate plate-defender">
        <div className="plate-pilot">{currentEvent?.defenderName || meta?.defenderName || 'UNKNOWN'}</div>
        <div className="plate-unit">{currentEvent?.defenderUnit || meta?.defenderUnit || 'UNKNOWN'}</div>
        <div className="plate-row">HP {Math.max(0, defenderHp)} / {initialDefenderHp}</div>
        <div className="hp-bar-track"><div className="hp-bar-fill defender-hp" style={{ width: `${defenderHpPercent}%` }}></div></div>
        <div className="plate-row">EN {Math.max(0, defenderEn)} / {initialDefenderEn}</div>
        <div className="hp-bar-track"><div className="hp-bar-fill en-bar" style={{ width: `${defenderEnPercent}%` }}></div></div>
        <div className="plate-row">AMMO {defenderAmmo}</div>
      </div>

      {/* 交戦距離 */}
      <div className="distance-chip">
        <span className="distance-label">ENGAGEMENT</span>
        <span className={`dist-val dist-${hani}`}>{getDistanceVisual()}</span>
      </div>

      {/* メッセージウィンドウ（下部） */}
      <div className="battle-message-window">
        <div className="message-window-header">
          <span className="cyber-title">COMBAT SIMULATION</span>
          <div className="controls">
            {!isFinished && (
              <>
                <button className="control-btn" onClick={handleNextEvent}>⏭ NEXT</button>
                <button className="control-btn skip-all" onClick={handleFullSkip}>⏩ SKIP ALL</button>
              </>
            )}
          </div>
        </div>
        <div className="message-log-container" ref={scrollRef}>
          {displayedMessages.map((msg, idx) => (
            <div key={idx} className="log-entry animation-slide-up">
              {msg.split('\n').map((line, i) => <div key={i}>{line}</div>)}
            </div>
          ))}
          {!isFinished && currentEventIndex < events.length && (
            <div className="log-typing-indicator">Analyzing next maneuver...</div>
          )}
        </div>
      </div>

      {/* Result Overlay */}
      {isFinished && (
        <div className="result-glass-overlay animation-fade-in">
          <div className="result-card">
            <h1 className={meta?.isSuccess ? 'text-victory' : 'text-defeat'}>
              {meta?.isSuccess ? 'MISSION ACCOMPLISHED' : 'MISSION FAILED'}
            </h1>
            <div className="rewards-panel">
              <div className="reward-item">
                <span className="reward-label">REWARD MONEY</span>
                <span className="reward-value">+{meta?.rewardMoney || 0} G</span>
              </div>
              <div className="reward-item">
                <span className="reward-label">GAINED EXP</span>
                <span className="reward-value">+{meta?.rewardExp || 0} EXP</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
              <button className="submit-btn return-btn" onClick={onClose} style={{ flex: 1, margin: 0 }}>
                戦線復帰 (RETURN TO BASE)
              </button>
              <button className="submit-btn" onClick={handleReplay} style={{ flex: 1, margin: 0, background: 'transparent', border: '1px solid var(--accent-color)', color: 'var(--accent-color)' }}>
                リプレイを見る（巻き戻し）
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
