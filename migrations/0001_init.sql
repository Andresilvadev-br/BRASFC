-- BRASFC — esquema inicial (Dev 0.1)

CREATE TABLE profiles (
	id UUID PRIMARY KEY,
	display_name TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 32),
	token_hash TEXT NOT NULL UNIQUE,
	created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE careers (
	id UUID PRIMARY KEY,
	profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
	mode TEXT NOT NULL CHECK (mode IN ('coach', 'player')),
	person_name TEXT NOT NULL CHECK (char_length(person_name) BETWEEN 2 AND 40),
	club_id TEXT NOT NULL,
	seed BIGINT NOT NULL,
	season INTEGER NOT NULL,
	game_date DATE NOT NULL,
	data JSONB NOT NULL DEFAULT '{}'::jsonb,
	version INTEGER NOT NULL DEFAULT 1,
	created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX careers_profile_idx ON careers (profile_id, updated_at DESC);

CREATE TABLE career_messages (
	id UUID PRIMARY KEY,
	career_id UUID NOT NULL REFERENCES careers(id) ON DELETE CASCADE,
	kind TEXT NOT NULL CHECK (kind IN ('important', 'normal')),
	sender TEXT NOT NULL,
	subject TEXT NOT NULL,
	body TEXT NOT NULL,
	game_date DATE NOT NULL,
	seq INTEGER NOT NULL,
	read_at TIMESTAMPTZ,
	created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX career_messages_career_idx ON career_messages (career_id, seq);

CREATE TABLE rooms (
	id UUID PRIMARY KEY,
	code TEXT NOT NULL UNIQUE,
	name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 40),
	owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
	status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
	max_members INTEGER NOT NULL DEFAULT 8 CHECK (max_members BETWEEN 2 AND 16),
	created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	closed_at TIMESTAMPTZ
);

CREATE TABLE room_members (
	room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
	profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
	role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
	joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	PRIMARY KEY (room_id, profile_id)
);
CREATE INDEX room_members_profile_idx ON room_members (profile_id);
