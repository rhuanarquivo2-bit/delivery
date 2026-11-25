#!/usr/bin/env bash
# Roda as migrações e os testes de regras de acesso num Postgres local (sem Supabase).
# Uso: PGHOST=/tmp PGPORT=5432 PGUSER=postgres ./supabase/tests/run.sh
# Os testes imprimem os resultados; os "ERROR" esperados (acesso negado, loja fechada...)
# estão comentados nos próprios arquivos.
set -euo pipefail

DB="${TEST_DB:-delivery_test}"
DIR="$(cd "$(dirname "$0")" && pwd)"

psql -q -c "drop database if exists ${DB}" -c "create database ${DB}"
psql -q -d "$DB" -v ON_ERROR_STOP=1 -f "$DIR/00_stubs_supabase.sql"
for f in "$DIR"/../migrations/*.sql; do
  psql -q -d "$DB" -v ON_ERROR_STOP=1 -f "$f"
done
psql -q -d "$DB" \
  -c "insert into auth.users values ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222')" \
  -c "grant all on storage.objects to authenticated"

echo "== Fase 1: regras de acesso =="
psql -d "$DB" -f "$DIR/fase1_regras_de_acesso.sql"
echo "== Fase 2: cardápio e pedidos =="
psql -d "$DB" -f "$DIR/fase2_cardapio_pedidos.sql"
echo "== Fase 3: promoções e cupons =="
psql -d "$DB" -f "$DIR/fase3_promocoes_cupons.sql"
echo "== Fase 4: Pix online e financeiro =="
psql -d "$DB" -f "$DIR/fase4_pix_financeiro.sql"
echo "== Fase 5: motoboys =="
psql -d "$DB" -f "$DIR/fase5_motoboys.sql"
echo "== Fase 6: demonstração =="
psql -d "$DB" -f "$DIR/fase6_demonstracao.sql"
echo "== Fase 7: agendamento, clientes e desempenho =="
psql -d "$DB" -f "$DIR/fase7_melhorias.sql"
echo "== Fase 8: mais pedido e cliente pelo celular =="
psql -d "$DB" -f "$DIR/fase8_site_cliente.sql"
echo "== Fase 9: meus pedidos =="
psql -d "$DB" -f "$DIR/fase9_meus_pedidos.sql"
echo "== Fase 10: sugestões no carrinho =="
psql -d "$DB" -f "$DIR/fase10_sugestoes.sql"
echo "== Fase 11: fidelidade =="
psql -d "$DB" -f "$DIR/fase11_fidelidade.sql"
echo "== Fase 12: notificações =="
psql -d "$DB" -f "$DIR/fase12_notificacoes.sql"
echo "== Fase 13: acesso das lojas =="
psql -d "$DB" -f "$DIR/fase13_acesso_lojas.sql"
