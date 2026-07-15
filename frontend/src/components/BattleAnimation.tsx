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
}

interface BattleAnimationProps {
  events: BattleEvent[];
  meta: BattleMeta;
  onClose: () => void;
}

export const BattleAnimation: React.FC<BattleAnimationProps> = ({ events = [], meta, onClose }) => {
  const m = meta as any;
  const attackerImage: string | null = m?.attackerImage || m?.attacker?.image || null;
  const defenderImage: string | null = m?.defenderImage || m?.defender?.image || null;

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
      <div className="battle-animation-glass">
        
        <div className="battle-header">
          <h2 className="cyber-title">COMBAT SIMULATION</h2>
          <div className="controls">
            {!isFinished && (
              <>
                <button className="control-btn" onClick={handleNextEvent}>⏭ NEXT</button>
                <button className="control-btn skip-all" onClick={handleFullSkip}>⏩ SKIP ALL</button>
              </>
            )}
          </div>
        </div>

        {/* Distance Indicator */}
        <div className="distance-indicator">
          <div className="distance-label">ENGAGEMENT DISTANCE</div>
          <div className={`dist-val dist-${hani}`}>{getDistanceVisual()}</div>
        </div>

        <div className="combatants-wrapper">
          {/* Attacker (Left) */}
          <div className="combatant-panel attacker">
            {attackerImage && (
              <div className={`unit-portrait ${currentEvent?.attacker?.hit ? 'portrait-hit' : ''}`}>
                <UnitImage file={attackerImage} alt="" />
              </div>
            )}
            <div className="pilot-name">{currentEvent?.attackerName || meta?.attackerName || 'UNKNOWN'}</div>
            <div className="unit-name">{currentEvent?.attackerUnit || meta?.attackerUnit || 'UNKNOWN'}</div>
            
            <div className="resource-readout">HP: {Math.max(0, attackerHp)} / {initialAttackerHp}</div>
            <div className="hp-bar-track">
              <div className="hp-bar-fill attacker-hp" style={{ width: `${attackerHpPercent}%` }}></div>
            </div>
            
            <div className="resource-readout mt-1">EN: {Math.max(0, attackerEn)} / {initialAttackerEn}</div>
            <div className="hp-bar-track">
              <div className="hp-bar-fill en-bar" style={{ width: `${attackerEnPercent}%` }}></div>
            </div>
            
            <div className="resource-readout mt-1">AMMO: {attackerAmmo}</div>

            {currentEvent?.attacker?.dmgDealt ? currentEvent.attacker.dmgDealt > 0 && (
              <div className="damage-flash hit">
                -{currentEvent.attacker.dmgDealt}
                {currentEvent.attacker.hitCount > 1 ? ` (${currentEvent.attacker.hitCount} Hits!)` : ''}
              </div>
            ) : null}
          </div>

          <div className="vs-emblem">VS</div>

          {/* Defender (Right) */}
          <div className="combatant-panel defender">
            {defenderImage && (
              <div className={`unit-portrait portrait-right ${currentEvent?.defender?.hit ? 'portrait-hit' : ''}`}>
                <UnitImage file={defenderImage} alt="" />
              </div>
            )}
            <div className="pilot-name">{currentEvent?.defenderName || meta?.defenderName || 'UNKNOWN'}</div>
            <div className="unit-name">{currentEvent?.defenderUnit || meta?.defenderUnit || 'UNKNOWN'}</div>
            
            <div className="resource-readout" style={{ textAlign: 'right' }}>HP: {Math.max(0, defenderHp)} / {initialDefenderHp}</div>
            <div className="hp-bar-track">
              <div className="hp-bar-fill defender-hp" style={{ width: `${defenderHpPercent}%` }}></div>
            </div>
            
            <div className="resource-readout mt-1" style={{ textAlign: 'right' }}>EN: {Math.max(0, defenderEn)} / {initialDefenderEn}</div>
            <div className="hp-bar-track">
              <div className="hp-bar-fill en-bar" style={{ width: `${defenderEnPercent}%` }}></div>
            </div>
            
            <div className="resource-readout mt-1" style={{ textAlign: 'right' }}>AMMO: {defenderAmmo}</div>

            {currentEvent?.defender?.dmgDealt ? currentEvent.defender.dmgDealt > 0 && (
              <div className="damage-flash hit">
                -{currentEvent.defender.dmgDealt}
                {currentEvent.defender.hitCount > 1 ? ` (${currentEvent.defender.hitCount} Hits!)` : ''}
              </div>
            ) : null}
          </div>
        </div>

        {/* Message Log */}
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
    </div>
  );
};
