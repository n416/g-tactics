ALTER TABLE tournaments ADD COLUMN participant_mask INTEGER DEFAULT 0;
ALTER TABLE team_members ADD COLUMN team_kaisyo INTEGER DEFAULT 0;
ALTER TABLE team_members ADD COLUMN kaisyo_cap INTEGER DEFAULT 0;
