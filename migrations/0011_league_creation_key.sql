ALTER TABLE rooms ADD COLUMN creation_key UUID;
CREATE UNIQUE INDEX room_creation_key ON rooms (owner_id, creation_key) WHERE creation_key IS NOT NULL;
