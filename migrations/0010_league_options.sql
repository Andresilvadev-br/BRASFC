ALTER TABLE rooms ADD COLUMN league_options JSONB CHECK (
  league_options IS NULL OR jsonb_typeof(league_options) = 'object'
);

-- Keep an administrative receipt without retaining the league's contents.
CREATE TABLE room_deletion_audit (
  room_id UUID PRIMARY KEY,
  actor UUID NOT NULL REFERENCES profiles(id),
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
