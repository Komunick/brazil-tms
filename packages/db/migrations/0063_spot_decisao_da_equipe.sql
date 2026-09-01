-- IGNORAR UMA OFERTA DE SPOT PASSA A VALER PARA A EQUIPE (2026-09-01, decisão do usuário)
--
-- ── O QUE MUDA, E POR QUE A DECISÃO SE INVERTEU ──────────────────────────────────────────────
--
-- Ontem, ignorar limpava só a tela de quem clicava. A regra foi escolhida contra a alternativa
-- oposta, e por um bom motivo: ninguém deveria conseguir esconder uma oferta da equipe.
--
-- O usuário inverteu isso hoje, e a razão é o que mudou junto: os CARGOS EDITÁVEIS entraram ontem
-- (fatia 029). Com eles, "quem pode decidir" deixou de ser uma pergunta sem resposta — passa a
-- existir a permissão `decidir_spot`, e só quem a tem decide. Ignorar deixou de ser um gesto sobre
-- a própria tela e virou uma DECISÃO sobre o frete: "esta a gente não pega".
--
-- O que se perde está registrado de propósito: uma pessoa passa a poder tirar uma oferta da vista
-- de todos. É deliberado — é para isso que a permissão existe —, e é por isso que o motivo e a
-- auditoria entram junto. Quando alguém perguntar "por que perdemos aquele frete?", o registro
-- responde.
--
-- ── A TABELA MUDA DE FORMA, e os dados existentes cabem ──────────────────────────────────────
--
-- Ela nasceu ontem com chave `(oferta, pessoa)`: uma linha por pessoa que ignorou. Agora é UMA
-- decisão por oferta, então a chave passa a ser só a oferta.
--
-- Medido antes de escrever: em produção há 17 linhas, de 9 pessoas, sobre apenas 2 ofertas — os
-- dois cartões de TESTE enviados hoje. A deduplicação abaixo guarda a linha mais antiga de cada
-- oferta (quem decidiu primeiro) e descarta as repetidas. Nenhuma decisão real se perde.

-- 1) Uma decisão por oferta: fica a primeira de cada.
DELETE FROM "spot_offer_dispensas" d
 USING "spot_offer_dispensas" outra
 WHERE d."spot_offer_id" = outra."spot_offer_id"
   AND (d."dispensada_em" > outra."dispensada_em"
        OR (d."dispensada_em" = outra."dispensada_em" AND d."user_id" > outra."user_id"));
--> statement-breakpoint

ALTER TABLE "spot_offer_dispensas" DROP CONSTRAINT "spot_offer_dispensas_pk";--> statement-breakpoint
ALTER TABLE "spot_offer_dispensas"
  ADD CONSTRAINT "spot_offer_dispensas_pk" PRIMARY KEY ("spot_offer_id");--> statement-breakpoint

-- 2) O MOTIVO, e ele é OPCIONAL de propósito.
--
-- Obrigar a escrever faria a operação digitar "n" para se livrar do campo — e um registro cheio de
-- "n" é pior que um vazio, porque parece informação e ninguém desconfia dele. Em branco, o registro
-- ainda guarda quem e quando, que é o que responde a pergunta principal.
ALTER TABLE "spot_offer_dispensas" ADD COLUMN IF NOT EXISTS "motivo" text;--> statement-breakpoint

-- 3) A PERMISSÃO NOVA PRECISA SER SEMEADA, senão ninguém a tem.
--
-- Depois da fatia 029 o acesso vem das linhas de `cargo_permissoes`, não mais de código. Uma chave
-- nova em `ALL_PERMISSIONS` não concede nada sozinha: ela apenas passa a APARECER na tela de
-- cargos. Sem este insert, `decidir_spot` nasceria sem dono e o botão ficaria cinza para todos —
-- inclusive para o administrador.
insert into cargo_permissoes (cargo_id, permissao) values
  ((select id from cargos where nome = 'Administrador'), 'decidir_spot')
on conflict do nothing;--> statement-breakpoint

-- 4) O CARGO "SPOT", pedido pelo usuário.
--
-- ⚠ LEIA ANTES DE PÔR ALGUÉM NELE: no modelo da 029 cada pessoa tem UM cargo, e ele substitui o
-- que ela tinha. Um despachante movido para "SPOT" PERDE a Expedição, a Torre e todo o resto — dos
-- 34 usuários, 18 são despachantes hoje.
--
-- Este cargo serve a quem cuida SÓ do leilão. Para quem já tem outro cargo e também decide spot, o
-- caminho é marcar a caixa "Aceitar e ignorar oferta de spot" no cargo que a pessoa já tem, em
-- Sistema → Cargos. Foi exatamente para isso que os cargos viraram editáveis.
-- `cargos` tem só `nome` e `ativo` — não há coluna de descrição, e a primeira versão desta migração
-- tentou gravar uma. A simulação no dev pegou; o teste não pegaria, porque ele lê o SQL como texto e
-- não o executa. Fica registrado: guarda de texto não substitui rodar.
insert into cargos (nome)
select 'SPOT'
where not exists (select 1 from cargos where nome = 'SPOT');--> statement-breakpoint

-- Ele vê o painel e decide o spot. `assign_resources` entra porque aceitar uma oferta GRAVA a
-- ordem de aceite da viagem — é a mesma porta da tela de viagem, e sem ela o aceite seria recusado
-- no servidor depois de o botão já ter aparecido.
insert into cargo_permissoes (cargo_id, permissao) values
  ((select id from cargos where nome = 'SPOT'), 'view_all_trips'),
  ((select id from cargos where nome = 'SPOT'), 'decidir_spot'),
  ((select id from cargos where nome = 'SPOT'), 'assign_resources')
on conflict do nothing;
