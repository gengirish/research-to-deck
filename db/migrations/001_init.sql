CREATE EXTENSION IF NOT EXISTS vector;

-- Papers are global and reused across jobs (acts as the ingestion cache).
CREATE TABLE IF NOT EXISTS papers (
  paper_id        TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  authors         TEXT[] NOT NULL DEFAULT '{}',
  year            INT,
  venue           TEXT,
  abstract        TEXT,
  citation_count  INT,
  url             TEXT,
  pdf_url         TEXT,
  doi             TEXT,
  arxiv_id        TEXT,
  content_source  TEXT,            -- 'pdf' | 'abstract' | 'title' once ingested
  ingested_at     TIMESTAMPTZ
);

-- voyage-3.5 produces 1024-dim embeddings.
CREATE TABLE IF NOT EXISTS chunks (
  id          BIGSERIAL PRIMARY KEY,
  paper_id    TEXT NOT NULL REFERENCES papers(paper_id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  page        INT,
  content     TEXT NOT NULL,
  embedding   vector(1024) NOT NULL,
  UNIQUE (paper_id, chunk_index)
);
CREATE INDEX IF NOT EXISTS chunks_embedding_hnsw ON chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS chunks_paper_id_idx ON chunks (paper_id);

-- Per-topic Semantic Scholar search cache.
CREATE TABLE IF NOT EXISTS search_cache (
  cache_key   TEXT PRIMARY KEY,
  results     JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jobs (
  id           UUID PRIMARY KEY,
  topic        TEXT NOT NULL,
  paper_count  INT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'queued',   -- queued | running | done | failed
  stage        TEXT NOT NULL DEFAULT 'queued',   -- searching | ingesting | retrieving | synthesizing | rendering | done | failed
  progress     INT NOT NULL DEFAULT 0,
  error        TEXT,
  stats        JSONB NOT NULL DEFAULT '{}',
  deck         BYTEA,
  deck_name    TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS job_papers (
  job_id    UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  paper_id  TEXT NOT NULL REFERENCES papers(paper_id),
  rank      INT NOT NULL,
  PRIMARY KEY (job_id, paper_id)
);
