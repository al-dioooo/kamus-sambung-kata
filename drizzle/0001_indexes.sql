create extension if not exists pg_trgm;

create index idx_words_prefix on words (word text_pattern_ops) where status = 'active';
create index idx_words_len on words ((length(word))) where status = 'active';
