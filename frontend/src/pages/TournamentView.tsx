import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BattleAnimation, type BattleEvent, type BattleMeta } from '../components/BattleAnimation';
import { showToast } from '../components/toast';
import './Register.css';

interface TournamentData {
  id: number;
  name: string;
  description: string;
  status: number;
  prize_money: number;
  entry_fee: number;
  format?: number;
  heal_between?: number;
}

interface ParticipantData {
  character_id: string;
  handle_name: string;
  chara_name: string;
  level: number;
  unit_name: string;
  status: number; // 0: alive, 1: defeated
}

interface MatchData {
  id: number;
  round_num: number;
  match_index: number;
  fighter1_id: string;
  fighter2_id: string;
  fighter1_name: string;
  fighter2_name: string;
  fighter1_unit: string;
  fighter2_unit: string;
  winner_id: string;
  log_text: string;
}

interface CommentData {
  id: number;
  character_id: string;
  chara_name: string;
  comment: string;
  created_at: string;
}

const BracketNode = ({ match, allMatches, handlePlayReplay }: any) => {
  if (!match) {
    return (
      <div style={{
        width: '200px',
        padding: '0.8rem',
        background: 'rgba(0,0,0,0.2)',
        border: '1px dashed var(--border-color)',
        borderRadius: 'var(--radius)',
        textAlign: 'center',
        color: 'var(--text-secondary)',
        fontSize: '0.8rem'
      }}>
        シード / 不戦勝
      </div>
    );
  }

  // 直前の回戦（round_num - 1）で、この試合の各選手が勝者だった試合を子ノードにする。
  // ※ round_num < ... だと複数回勝った選手で中間の回戦を飛ばしてしまうため厳密に -1 で辿る。
  const child1 = allMatches.find((m: any) => m.round_num === match.round_num - 1 && m.winner_id === match.fighter1_id);
  const child2 = allMatches.find((m: any) => m.round_num === match.round_num - 1 && m.winner_id === match.fighter2_id);

  const isLeaf = match.round_num === 1;

  const nameStyle = (isWinner: boolean, decided: boolean): React.CSSProperties => ({
    color: isWinner ? 'var(--accent-color)' : (decided ? 'var(--text-secondary)' : 'var(--text-primary)'),
    fontWeight: isWinner ? 'bold' : 'normal',
    fontSize: '0.9rem',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '120px'
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {!isLeaf && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginRight: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
              <BracketNode match={child1} allMatches={allMatches} handlePlayReplay={handlePlayReplay} />
              <div style={{
                position: 'absolute', right: '-1rem', top: '50%',
                width: '1rem', height: 'calc(50% + 0.5rem)',
                borderTop: '2px solid var(--border-color)', borderRight: '2px solid var(--border-color)',
                borderTopRightRadius: 'var(--radius)',
                boxSizing: 'border-box'
              }}></div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
              <BracketNode match={child2} allMatches={allMatches} handlePlayReplay={handlePlayReplay} />
              <div style={{
                position: 'absolute', right: '-1rem', bottom: '50%',
                width: '1rem', height: 'calc(50% + 0.5rem)',
                borderBottom: '2px solid var(--border-color)', borderRight: '2px solid var(--border-color)',
                borderBottomRightRadius: 'var(--radius)',
                boxSizing: 'border-box'
              }}></div>
            </div>
          </div>
          <div style={{ width: '1rem', height: '2px', background: 'var(--border-color)', marginRight: '0.5rem' }}></div>
        </>
      )}

      <div style={{
        width: '200px',
        background: 'var(--panel-bg)',
        padding: '0.8rem',
        borderRadius: 'var(--radius)',
        border: '1px solid var(--border-color)',
        zIndex: 1
      }}>
        <div style={{ textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>ROUND {match.round_num}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={nameStyle(match.winner_id === match.fighter1_id, !!match.winner_id)}>
              {match.fighter1_name || '---'}
            </span>
            {match.winner_id === match.fighter1_id && <span style={{ fontSize: '0.6rem', color: 'var(--accent-color)', border: '1px solid var(--accent-color)', padding: '1px 3px', borderRadius: 'var(--radius)' }}>WIN</span>}
          </div>
          <div style={{ height: '1px', background: 'var(--border-color)' }}></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={nameStyle(match.winner_id === match.fighter2_id, !!match.winner_id)}>
              {match.fighter2_name || (match.fighter2_id === null && match.winner_id ? '(不戦勝)' : '---')}
            </span>
            {match.winner_id === match.fighter2_id && <span style={{ fontSize: '0.6rem', color: 'var(--accent-color)', border: '1px solid var(--accent-color)', padding: '1px 3px', borderRadius: 'var(--radius)' }}>WIN</span>}
          </div>
        </div>

        {match.log_text && match.log_text !== '[]' && (
          <div style={{ marginTop: '0.6rem', textAlign: 'center' }}>
            <button
              onClick={() => handlePlayReplay(match)}
              className="text-btn"
              style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', border: '1px solid var(--border-color)', color: 'var(--accent-color)' }}
            >
              ▶ REPLAY
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export const TournamentView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tournament, setTournament] = useState<TournamentData | null>(null);
  const [participants, setParticipants] = useState<ParticipantData[]>([]);
  const [matches, setMatches] = useState<MatchData[]>([]);
  const [comments, setComments] = useState<CommentData[]>([]);
  const [commentText, setCommentText] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');

  const token = localStorage.getItem('gtactics_token');

  // Replay State
  const [replayData, setReplayData] = useState<{ events: BattleEvent[], meta: BattleMeta } | null>(null);

  useEffect(() => {
    fetchTournamentDetail();
  }, [id]);

  const fetchTournamentDetail = async () => {
    try {
      const response = await fetch(`/api/tournaments/${id}`);
      const data = (await response.json()) as any;
      if (data.success) {
        setTournament(data.tournament);
        setParticipants(data.participants || []);
        setMatches(data.matches || []);
        setComments(data.comments || []);
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('大会詳細データの取得に失敗しました');
    }
  };

  const handlePostComment = async () => {
    if (!token) { showToast('ログインが必要です', 'error'); return; }
    if (commentText.replace(/[ 　]/g, '').length === 0) { showToast('コメントが未入力です', 'error'); return; }
    setPosting(true);
    try {
      const response = await fetch(`/api/tournaments/${id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ comment: commentText })
      });
      const data = (await response.json()) as any;
      if (data.success) {
        setCommentText('');
        showToast('コメントを投稿しました', 'success');
        fetchTournamentDetail();
      } else {
        showToast(data.message || '投稿に失敗しました', 'error');
      }
    } catch (err) {
      showToast('投稿に失敗しました', 'error');
    } finally {
      setPosting(false);
    }
  };

  const handlePlayReplay = (match: MatchData) => {
    try {
      const parsedLog = JSON.parse(match.log_text);
      if (parsedLog && parsedLog.events && parsedLog.meta) {
        setReplayData({
          events: parsedLog.events,
          meta: parsedLog.meta
        });
      }
    } catch (e) {
      setError('リプレイデータの読み込みに失敗しました');
    }
  };

  if (error) return <div className="register-container"><div className="error-message">{error}</div><button onClick={() => navigate('/tournament')} className="text-btn">BACK</button></div>;
  if (!tournament) return <div className="register-container"><div style={{ color: 'var(--accent-color)' }}>LOADING...</div></div>;

  return (
    <div className="register-container" style={{ padding: '2rem 1rem' }}>
      <div className="glass-panel" style={{ maxWidth: '1000px', width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <h1 className="cyber-title" style={{ fontSize: '1.5rem', marginBottom: 0 }}>{tournament.name} - DETAILS</h1>
          <button onClick={() => navigate('/tournament')} className="text-btn">BACK</button>
        </div>

        <div style={{ marginBottom: '2rem', background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: 'var(--radius)', border: '1px solid var(--border-color)' }}>
          <div style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>{tournament.description}</div>
          <div style={{ display: 'flex', gap: '2rem', color: 'var(--text-primary)', flexWrap: 'wrap' }}>
            <div><span style={{ color: 'var(--text-secondary)' }}>状態:</span> {tournament.status === 2 ? '終了' : (tournament.status === 1 ? '進行中' : '受付中')}</div>
            <div><span style={{ color: 'var(--text-secondary)' }}>優勝賞金:</span> <span style={{ color: 'var(--accent-color)' }}>{tournament.prize_money} G</span></div>
            <div><span style={{ color: 'var(--text-secondary)' }}>参加人数:</span> {participants.length} 人</div>
          </div>
        </div>

        {/* 参加者リスト */}
        <div className="stats-allocation" style={{ marginTop: 0, marginBottom: '2rem' }}>
          <h3>ENTRY LIST</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' }}>
            {participants.map((p, i) => (
              <div key={i} style={{
                background: 'var(--panel-bg)',
                padding: '1rem',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--border-color)',
                borderLeft: `3px solid ${p.status === 0 ? 'var(--accent-color)' : 'var(--border-color)'}`,
                opacity: p.status === 1 ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '1rem'
              }}>
                <div style={{
                  width: '40px', height: '40px',
                  borderRadius: '50%',
                  background: 'rgba(0,0,0,0.2)',
                  border: '1px solid var(--border-color)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--text-secondary)'
                }}>
                  {(p.handle_name || '?').charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontWeight: 'bold', color: 'var(--text-primary)', fontSize: '1.05rem' }}>{p.handle_name}</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{p.unit_name || '無人機'} (Lv.{p.level}){p.status === 1 && ' ・敗退'}</div>
                </div>
              </div>
            ))}
            {participants.length === 0 && <div style={{ color: 'var(--text-secondary)' }}>まだエントリーがいません</div>}
          </div>
        </div>

        {/* トーナメントブラケット（ツリー形式）。P33/P39: ロイヤル(1)/団体総力戦(3)はツリーにならないため時系列リスト表示 */}
        {matches.length > 0 && ([1, 3].includes(Number(tournament?.format)) ? (
          <div className="stats-allocation" style={{ marginTop: 0 }}>
            <h3>{Number(tournament?.format) === 1 ? 'BATTLE ROYAL RESULTS（撃破順）' : 'TEAM WAR RESULT'}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', padding: '1rem' }}>
              {matches.map((m, idx) => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'rgba(255,255,255,0.04)', borderRadius: '6px', padding: '0.6rem 1rem' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>#{idx + 1}</span>
                  <span style={{ fontWeight: 'bold' }}>{m.fighter1_name}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>が</span>
                  <span>{m.fighter2_name}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{Number(tournament?.format) === 1 ? 'を撃破' : '陣営に勝利'}</span>
                  <button onClick={() => handlePlayReplay(m)} className="text-btn" style={{ marginLeft: 'auto' }}>リプレイ</button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="stats-allocation" style={{ marginTop: 0 }}>
            <h3>TOURNAMENT BRACKET</h3>
            <div style={{
              display: 'flex',
              overflowX: 'auto',
              padding: '2rem 1rem',
              minHeight: '300px'
            }}>
              {(() => {
                const finalRoundNum = Math.max(...matches.map(m => m.round_num));
                const finalMatches = matches.filter(m => m.round_num === finalRoundNum);
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem' }}>
                    {finalMatches.map(m => (
                      <BracketNode key={m.id} match={m} allMatches={matches} handlePlayReplay={handlePlayReplay} />
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        ))}

        {/* 大会へのコメント（原作 tornament.cgi trmt_syosai）。ログイン中キャラなら誰でも投稿可・古い順表示 */}
        <div className="stats-allocation" style={{ marginTop: '2rem' }}>
          <h3>大会へのコメント</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '1rem' }}>
            {comments.map((cm) => (
              <div key={cm.id} style={{ display: 'flex', gap: '1rem', alignItems: 'baseline', background: 'rgba(255,255,255,0.04)', borderRadius: '6px', padding: '0.5rem 0.9rem' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', whiteSpace: 'nowrap', minWidth: '6rem' }}>{cm.chara_name}</span>
                <span style={{ color: 'var(--accent-color)', wordBreak: 'break-word' }}>{cm.comment}</span>
              </div>
            ))}
            {comments.length === 0 && <div style={{ color: 'var(--text-secondary)' }}>まだコメントはありません</div>}
          </div>
          {token ? (
            <div style={{ display: 'flex', gap: '0.5rem', padding: '0 1rem 1rem', alignItems: 'center' }}>
              <input
                type="text"
                className="cyber-input"
                value={commentText}
                maxLength={200}
                onChange={e => setCommentText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !posting) handlePostComment(); }}
                placeholder="大会へのコメント（200文字まで）"
                style={{ flex: 1 }}
              />
              <button onClick={handlePostComment} disabled={posting} className="submit-btn" style={{ padding: '0.5rem 1.2rem', margin: 0, whiteSpace: 'nowrap' }}>
                コメント
              </button>
            </div>
          ) : (
            <div style={{ color: 'var(--text-secondary)', padding: '0 1rem 1rem', fontSize: '0.85rem' }}>コメントするにはログインが必要です</div>
          )}
        </div>

      </div>

      {/* Battle Animation Fullscreen Overlay */}
      {replayData && (
        <BattleAnimation
          events={replayData.events}
          meta={replayData.meta}
          onClose={() => setReplayData(null)}
        />
      )}
    </div>
  );
};
