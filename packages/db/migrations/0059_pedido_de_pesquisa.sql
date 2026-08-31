-- O PEDIDO DE PESQUISA À GERENCIADORA (31/08, fatia 028, etapa 6).
--
-- Esta é a metade que CUSTA. O `setMotorista` cria a pessoa e é de graça (decisão D7); a
-- solicitação de pesquisa é cobrada, por chamada, e não existe homologação — a primeira execução
-- já é uma cobrança real.
--
-- ── AS DUAS COLUNAS EXISTEM PARA REIVINDICAR, NÃO PARA REGISTRAR ────────────────────────────
--
-- `pesquisa_solicitada_em` é gravada ANTES da chamada, com `WHERE pesquisa_solicitada_em IS NULL`.
-- Quem conseguir gravar é quem chama; qualquer segundo clique — outra aba, outro operador, um
-- duplo-clique — encontra a linha já reivindicada e desiste sem gastar.
--
-- É o mesmo padrão do `enviado_em` ao lado, e a diferença é o que está em jogo: lá um reenvio
-- criaria uma duplicata que dá para arquivar; aqui ele vira uma linha na fatura.
--
-- Verificar antes de chamar não bastaria: entre a verificação e a chamada cabe a segunda aba. Só a
-- escrita condicional é atômica.
--
-- ── QUEM PEDIU FICA GRAVADO, E É O PONTO ───────────────────────────────────────────────────
--
-- `pesquisa_solicitada_por` responde a pergunta que ninguém consegue responder hoje: quando a
-- fatura chegar com uma solicitação de que ninguém se lembra, quem a pediu e quando. Sem isso, o
-- gasto é anônimo por construção.
--
-- ── O QUE FOI PEDIDO E O QUE ELA RESPONDEU FICAM EM `campos` ───────────────────────────────
--
-- As opções marcadas (Expressa, Pesquisa+, Biométrica — as três que encarecem) e a resposta crua
-- vão para `campos.pesquisaGerenciadora`, junto de `leituraCnh` e `cadastroGerenciadora`. É onde a
-- tela já lê, e guardar a resposta SEM TRADUÇÃO é o que permitiu, duas vezes neste projeto, achar
-- um defeito que a versão interpretada escondia.
--
-- Coluna própria para elas seria uma migração a cada campo novo que a gerenciadora devolver — e ela
-- devolve `Codigo`, `Situacao`, `PhotocheckUrl` e `PhotocheckExpiracao`, que ainda vão mudar.

ALTER TABLE driver_preregistrations
  ADD COLUMN IF NOT EXISTS pesquisa_solicitada_em timestamptz,
  ADD COLUMN IF NOT EXISTS pesquisa_solicitada_por uuid REFERENCES users (id);

COMMENT ON COLUMN driver_preregistrations.pesquisa_solicitada_em IS
  'Gravada ANTES da chamada cobrada, para reivindicar a linha. Não-nula = já pediram, não peça de novo.';
COMMENT ON COLUMN driver_preregistrations.pesquisa_solicitada_por IS
  'Quem apertou. Existe para a fatura ter dono: sem ela o gasto é anônimo.';
