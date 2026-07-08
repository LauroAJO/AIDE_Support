-- 0035_gmail_integration.sql
-- Integração Gmail para a conta dedicada lcestech.consulting@gmail.com.
-- Uma única conta externa (compartilhada) cujo token é guardado uma vez pelo
-- owner; todos os usuários AIDE leem os e-mails sincronizados. Sem envio a
-- partir do AIDE — o usuário clica "Abrir no Gmail" para responder no browser.

CREATE TABLE IF NOT EXISTS external_accounts (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  account_type TEXT DEFAULT 'gmail',
  display_name TEXT DEFAULT '',
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at INTEGER,
  authorized_by TEXT REFERENCES users(id),
  authorized_at INTEGER,
  active INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS gmail_emails (
  id TEXT PRIMARY KEY,
  account_id TEXT REFERENCES external_accounts(id)
    ON DELETE CASCADE,
  gmail_message_id TEXT UNIQUE NOT NULL,
  thread_id TEXT,
  subject TEXT DEFAULT '(sem assunto)',
  from_email TEXT DEFAULT '',
  from_name TEXT DEFAULT '',
  to_email TEXT DEFAULT '',
  snippet TEXT DEFAULT '',
  body_text TEXT DEFAULT '',
  body_html TEXT DEFAULT '',
  date_sent INTEGER,
  is_read INTEGER DEFAULT 0,
  is_starred INTEGER DEFAULT 0,
  labels TEXT DEFAULT '[]',
  gmail_link TEXT DEFAULT '',
  synced_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_gmail_account
  ON gmail_emails(account_id);
CREATE INDEX IF NOT EXISTS idx_gmail_date
  ON gmail_emails(date_sent DESC);
CREATE INDEX IF NOT EXISTS idx_gmail_read
  ON gmail_emails(is_read);
CREATE INDEX IF NOT EXISTS idx_gmail_thread
  ON gmail_emails(thread_id);
