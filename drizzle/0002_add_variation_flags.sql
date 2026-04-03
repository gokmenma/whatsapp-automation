ALTER TABLE user_settings ADD COLUMN use_greeting_variations INTEGER NOT NULL DEFAULT 1;
ALTER TABLE user_settings ADD COLUMN use_intro_variations INTEGER NOT NULL DEFAULT 1;
ALTER TABLE user_settings ADD COLUMN use_closing_variations INTEGER NOT NULL DEFAULT 1;