ALTER TABLE user_settings ADD COLUMN reject_message_check_enabled INTEGER DEFAULT 0 NOT NULL;
ALTER TABLE user_settings ADD COLUMN reject_keywords TEXT DEFAULT 'mesaj red\nred\nmesaj ret\nret\nmesaj almak istemiyorum' NOT NULL;
