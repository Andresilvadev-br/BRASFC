CREATE TABLE room_worlds (
	room_id UUID PRIMARY KEY REFERENCES rooms(id) ON DELETE CASCADE,
	revision INTEGER NOT NULL DEFAULT 0,
	state JSONB NOT NULL CHECK (jsonb_typeof(state) = 'object')
);
CREATE TABLE room_world_operations (
	room_id UUID NOT NULL REFERENCES room_worlds(room_id) ON DELETE CASCADE,
	profile_id UUID NOT NULL,
	operation_id UUID NOT NULL,
	revision INTEGER NOT NULL,
	PRIMARY KEY (room_id, profile_id, operation_id),
	UNIQUE (room_id, revision)
);
CREATE TABLE room_world_matches (
	room_id UUID NOT NULL REFERENCES room_worlds(room_id) ON DELETE CASCADE,
	season INTEGER NOT NULL,
	step TEXT NOT NULL,
	competition TEXT NOT NULL,
	home TEXT NOT NULL,
	away TEXT NOT NULL,
	result JSONB NOT NULL,
	PRIMARY KEY (room_id, season, competition, step, home, away)
);
CREATE INDEX room_world_matches_calendar ON room_world_matches (room_id, season, step);
