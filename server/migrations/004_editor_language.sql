-- Persist Monaco language per document (editor_language).
alter table documents
  add column if not exists editor_language text;

update documents
set editor_language = 'typescript'
where editor_language is null;

alter table documents
  alter column editor_language set default 'typescript';
