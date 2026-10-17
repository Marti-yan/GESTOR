export function serviceSchema(db) {
  db.exec(`
CREATE TABLE IF NOT EXISTS couriers(id TEXT PRIMARY KEY,name TEXT NOT NULL,phone TEXT NOT NULL DEFAULT '',pin_hash TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS delivery_assignments(order_id TEXT PRIMARY KEY REFERENCES orders(id),courier_id TEXT NOT NULL REFERENCES couriers(id),status TEXT NOT NULL DEFAULT 'assigned',version INTEGER NOT NULL DEFAULT 1,notes TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS delivery_events(id TEXT PRIMARY KEY,order_id TEXT NOT NULL,courier_id TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS customer_locations(customer_key TEXT PRIMARY KEY,latitude REAL NOT NULL,longitude REAL NOT NULL,reference TEXT NOT NULL,confirmed_by TEXT NOT NULL,confirmed_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS courier_positions(courier_id TEXT PRIMARY KEY REFERENCES couriers(id),latitude REAL NOT NULL,longitude REAL NOT NULL,accuracy REAL NOT NULL,sharing INTEGER NOT NULL DEFAULT 1,captured_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS courier_sharing(courier_id TEXT PRIMARY KEY REFERENCES couriers(id),tracking_id TEXT NOT NULL,started_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS courier_tracks(id TEXT PRIMARY KEY,courier_id TEXT NOT NULL REFERENCES couriers(id),latitude REAL NOT NULL,longitude REAL NOT NULL,captured_at INTEGER NOT NULL,created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS courier_tracks_time ON courier_tracks(courier_id,created_at);
CREATE TABLE IF NOT EXISTS chat_contacts(id TEXT PRIMARY KEY,name TEXT NOT NULL,phone TEXT UNIQUE NOT NULL,consent INTEGER NOT NULL DEFAULT 0,consent_source TEXT NOT NULL DEFAULT '',consent_at TEXT,unsubscribed INTEGER NOT NULL DEFAULT 0,notes TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS chat_tags(id TEXT PRIMARY KEY,name TEXT UNIQUE NOT NULL,color TEXT NOT NULL DEFAULT '#ef5a36');
CREATE TABLE IF NOT EXISTS chat_tickets(id TEXT PRIMARY KEY,number INTEGER UNIQUE NOT NULL,contact_id TEXT NOT NULL REFERENCES chat_contacts(id),status TEXT NOT NULL DEFAULT 'waiting',agent_mode TEXT NOT NULL DEFAULT 'paused',version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS one_open_ticket ON chat_tickets(contact_id) WHERE status<>'closed';
CREATE TABLE IF NOT EXISTS chat_ticket_tags(ticket_id TEXT REFERENCES chat_tickets(id),tag_id TEXT REFERENCES chat_tags(id),PRIMARY KEY(ticket_id,tag_id));
CREATE TABLE IF NOT EXISTS chat_messages(id TEXT PRIMARY KEY,ticket_id TEXT REFERENCES chat_tickets(id),direction TEXT NOT NULL,body TEXT NOT NULL,provider_id TEXT UNIQUE,origin TEXT NOT NULL DEFAULT 'human',state TEXT NOT NULL DEFAULT 'received',error TEXT,created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS chat_messages_ticket ON chat_messages(ticket_id,created_at);
CREATE TABLE IF NOT EXISTS chat_quick_replies(id TEXT PRIMARY KEY,shortcut TEXT UNIQUE NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS chat_outbox(id TEXT PRIMARY KEY,message_id TEXT UNIQUE REFERENCES chat_messages(id),contact_id TEXT NOT NULL,ticket_id TEXT,kind TEXT NOT NULL,campaign_id TEXT,state TEXT NOT NULL DEFAULT 'pending',attempt INTEGER NOT NULL DEFAULT 0,due_at INTEGER NOT NULL,lease_until INTEGER,created_at TEXT NOT NULL,error TEXT);
CREATE TABLE IF NOT EXISTS chat_campaigns(id TEXT PRIMARY KEY,name TEXT NOT NULL,body TEXT NOT NULL,tag_id TEXT,template TEXT NOT NULL DEFAULT '{}',status TEXT NOT NULL DEFAULT 'draft',interval_seconds INTEGER NOT NULL DEFAULT 30,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS chat_campaign_recipients(campaign_id TEXT REFERENCES chat_campaigns(id),contact_id TEXT REFERENCES chat_contacts(id),state TEXT NOT NULL DEFAULT 'pending',outbox_id TEXT,PRIMARY KEY(campaign_id,contact_id));
CREATE TABLE IF NOT EXISTS ai_knowledge(id TEXT PRIMARY KEY,title TEXT NOT NULL,question TEXT NOT NULL,answer TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL);
CREATE VIRTUAL TABLE IF NOT EXISTS ai_knowledge_fts USING fts5(id UNINDEXED,title,question,answer,tokenize='unicode61 remove_diacritics 2');
CREATE TABLE IF NOT EXISTS ai_jobs(id TEXT PRIMARY KEY,ticket_id TEXT NOT NULL,message_id TEXT UNIQUE NOT NULL,state TEXT NOT NULL DEFAULT 'pending',lease_until INTEGER,created_at TEXT NOT NULL,error TEXT);
CREATE TABLE IF NOT EXISTS ai_training_examples(id TEXT PRIMARY KEY,question TEXT NOT NULL,answer TEXT NOT NULL,approved INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ai_training_jobs(id TEXT PRIMARY KEY,provider_id TEXT,status TEXT NOT NULL,model TEXT NOT NULL,trained_model TEXT,error TEXT,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS provider_secrets(name TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS atende_ticket_links(local_ticket_id TEXT PRIMARY KEY REFERENCES chat_tickets(id),account_key TEXT NOT NULL,remote_ticket_id TEXT NOT NULL,remote_contact_id TEXT NOT NULL,owned INTEGER NOT NULL DEFAULT 0,UNIQUE(account_key,remote_ticket_id));
CREATE TABLE IF NOT EXISTS atende_message_ids(account_key TEXT NOT NULL,remote_id TEXT NOT NULL,remote_wid TEXT NOT NULL DEFAULT '',local_message_id TEXT NOT NULL REFERENCES chat_messages(id),PRIMARY KEY(account_key,remote_id));
`);
  if (
    !db
      .prepare("PRAGMA table_info(chat_outbox)")
      .all()
      .some((c) => c.name === "connection_key")
  )
    db.exec("ALTER TABLE chat_outbox ADD COLUMN connection_key TEXT");
}
