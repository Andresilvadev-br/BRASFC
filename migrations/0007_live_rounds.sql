CREATE TABLE room_live_rounds (
	room_id UUID PRIMARY KEY REFERENCES rooms(id) ON DELETE CASCADE,
	session_id UUID NOT NULL UNIQUE,
	fixtures JSONB NOT NULL CHECK (jsonb_typeof(fixtures) = 'array'),
	state JSONB NOT NULL CHECK (jsonb_typeof(state) = 'object')
);
