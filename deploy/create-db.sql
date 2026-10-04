-- Banco da Mesa no forja-db (rodar uma vez, como forjaMaster):
--   docker exec -i forja-db psql -U forjaMaster -d postgres \
--     -v senha="'<senha forte>'" < deploy/create-db.sql
-- As tabelas o próprio mesa-server cria no boot (prisma migrate deploy).
CREATE ROLE mesa LOGIN PASSWORD :senha;
CREATE DATABASE mesa OWNER mesa;
REVOKE ALL ON DATABASE mesa FROM PUBLIC;
