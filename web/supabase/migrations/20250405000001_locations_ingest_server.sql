-- Which ingest server (e.g. Skippy, Joey) wrote this location. Used so the UI can show "Server: Skippy" for the last packet.
alter table public.locations
  add column if not exists ingest_server text;

comment on column public.locations.ingest_server is 'Name of the ingest server that received and wrote this row (e.g. Skippy, Joey). Set via INGEST_SERVER_NAME env on the ingest process.';
