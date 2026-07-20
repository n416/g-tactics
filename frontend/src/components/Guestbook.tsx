import React, { useState, useEffect } from 'react';
import { showToast } from './toast';
import { useNavigate } from 'react-router-dom';

interface Note {
  id: number;
  target_user_id: string;
  author_user_id: string;
  author_handle_name: string;
  content: string;
  created_at: string;
}

export const Guestbook: React.FC<{ targetUserId: string; myUserId: string | null }> = ({ targetUserId, myUserId }) => {
  const navigate = useNavigate();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  
  const fetchNotes = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/guestbook/${targetUserId}`);
      const data = await res.json() as any;
      if (data.success) {
        setNotes(data.notes);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotes();
  }, [targetUserId]);

  const handlePost = async () => {
    if (!content.trim()) return;
    setSubmitting(true);
    const token = localStorage.getItem('gtactics_token');
    try {
      const res = await fetch(`/api/guestbook/${targetUserId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ content })
      });
      const data = await res.json() as any;
      if (data.success) {
        showToast(data.message, 'success');
        setContent('');
        fetchNotes();
      } else {
        showToast(data.message, 'error');
      }
    } catch (e) {
      showToast('通信エラー', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (noteId: number) => {
    const token = localStorage.getItem('gtactics_token');
    try {
      const res = await fetch(`/api/guestbook/${noteId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json() as any;
      if (data.success) {
        showToast(data.message, 'success');
        fetchNotes();
      } else {
        showToast(data.message, 'error');
      }
    } catch (e) {
      showToast('通信エラー', 'error');
    }
  };

  return (
    <div className="guestbook" style={{ marginTop: '2rem', background: 'var(--panel-inset)', padding: '1rem', borderRadius: '4px' }}>
      <h3 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '1rem', color: 'var(--text-secondary)' }}>見学者ノート (記帳帳)</h3>
      
      {myUserId && myUserId !== targetUserId && (
        <div style={{ marginBottom: '1.5rem', background: 'var(--bg-raised)', padding: '1rem', borderRadius: '4px' }}>
          <textarea
            placeholder="記帳内容 (最大140文字)"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={140}
            style={{ width: '100%', height: '60px', background: 'var(--bg-color)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '0.5rem', resize: 'vertical' }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem', alignItems: 'center', gap: '1rem' }}>
            <span style={{ fontSize: '0.8rem', color: content.length > 140 ? 'var(--danger)' : 'var(--text-muted)' }}>{content.length}/140</span>
            <button className="museum-btn primary" onClick={handlePost} disabled={submitting || !content.trim()}>記帳する</button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ color: 'var(--text-muted)' }}>読み込み中...</div>
      ) : notes.length === 0 ? (
        <div style={{ color: 'var(--text-muted)' }}>記帳はまだありません。</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {notes.map(note => (
            <div key={note.id} style={{ background: 'var(--bg-color)', padding: '0.8rem', borderRadius: '4px', borderLeft: '3px solid var(--accent-cyan)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.5rem' }}>
                <div>
                  <button className="text-btn" style={{ padding: 0, fontWeight: 'bold', fontSize: '0.9rem' }} onClick={() => navigate(`/profile/${note.author_user_id}`)}>
                    {note.author_handle_name}
                  </button>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '10px' }}>
                    {new Date(note.created_at + 'Z').toLocaleString('ja-JP')}
                  </span>
                </div>
                {(myUserId === note.author_user_id || myUserId === targetUserId) && (
                  <button className="text-btn" style={{ color: 'var(--danger)', fontSize: '0.75rem', padding: 0 }} onClick={() => handleDelete(note.id)}>
                    [削除]
                  </button>
                )}
              </div>
              <div style={{ fontSize: '0.9rem', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{note.content}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
