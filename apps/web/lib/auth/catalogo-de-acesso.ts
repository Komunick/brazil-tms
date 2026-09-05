import { ALL_PERMISSIONS, type PermissionKey } from "@brazil-tms/shared";
import { NAV_GRUPOS, NAV_ITEMS } from "@/lib/nav";

/**
 * O QUE O ADMIN VÊ NA TELA DE CARGOS — em português, e não em nomes internos (fatia 029, FR-003).
 *
 * A tela pergunta "o que este cargo enxerga?" com palavras da operação — "Torre de Controle",
 * "Expedição", "Cancelar viagem". Por baixo, cada marca liga uma `PermissionKey` das 23 que os 169
 * pontos do servidor já verificam. Não existe um segundo vocabulário: existe uma TRADUÇÃO.
 *
 * ── POR QUE AQUI, E NÃO EM `packages/shared` COMO O PLANO DIZIA ───────────────────────────────
 *
 * Porque metade deste catálogo é DERIVADA do `nav.ts`, que vive no app. `shared` não pode importar
 * de `apps/web` — seria a dependência ao contrário. Podia-se mover o `nav.ts` para o `shared`, mas
 * ele é feito de ícone, rótulo e grupo de menu: coisa de tela, no lugar certo. O plano errou o
 * endereço, não a ideia.
 *
 * ── AS DUAS METADES, E POR QUE ELAS SÃO DIFERENTES ────────────────────────────────────────────
 *
 * **PÁGINAS (9 permissões)** — derivadas do `nav.ts`, agrupadas pelo `grupo` que ele já declara.
 * Nada é redigitado: se um item de menu mudar de permissão, esta tela acompanha sozinha. Várias
 * páginas compartilham a mesma permissão (sete itens pedem `view_all_trips`), e por isso a marca é
 * por PERMISSÃO com as páginas listadas junto — marcar "Torre de Controle" sem marcar "Ocorrências"
 * seria uma promessa que o servidor não tem como cumprir.
 *
 * **AÇÕES (14 permissões)** — o que nenhum item de menu reivindica: cancelar viagem, apagar,
 * exportar faturamento. Não existe página de onde tirar o rótulo, então ele é escrito à mão aqui.
 *
 * ── O QUE IMPEDE ISTO DE ENVELHECER ───────────────────────────────────────────────────────────
 *
 * `catalogo-de-acesso.test.ts` afirma que **toda `PermissionKey` aparece em exatamente um lugar**.
 * Uma capacidade nova derruba a CI até alguém a colocar aqui.
 *
 * Sem esse teste, o desfecho é silencioso e ruim: a capacidade existe, o servidor a verifica, e
 * NENHUM cargo consegue concedê-la — a tela que depende dela fica inalcançável para todo mundo, sem
 * erro em lugar nenhum. É exatamente o formato de defeito que esta fatia inteira tenta evitar.
 */

/** Um item marcável na tela: uma permissão, com o nome que a operação usa. */
export interface ItemDoCatalogo {
  permissao: PermissionKey;
  /** As páginas que esta permissão abre. Vazio para as ações. */
  paginas: string[];
}

export interface GrupoDoCatalogo {
  /** A chave do grupo do menu (`operacao`, `cadastros`…) ou `acoes`. */
  chave: string;
  itens: ItemDoCatalogo[];
}

/** O grupo das capacidades que não abrem página nenhuma. */
export const GRUPO_DAS_ACOES = "acoes";

/**
 * O rótulo de cada AÇÃO, escrito à mão porque não há página de onde tirá-lo.
 *
 * Em português da operação, e não tradução literal da chave: `delete_archive` é "arquivar", não
 * "apagar arquivo" — no TMS nada é apagado de verdade (princípio III), e um rótulo que diga "apagar"
 * assusta quem concede e mente sobre o que acontece.
 */
export const ROTULO_DA_ACAO: Record<string, string> = {
  edit_trip_plan: "Editar o planejado da viagem",
  update_trip_status: "Mudar o status da viagem",
  cancel_trip: "Cancelar viagem",
  mark_completed: "Concluir viagem",
  mark_billing_ready: "Liberar para faturamento",
  resolve_dispute: "Resolver divergência de faturamento",
  delete_archive: "Arquivar cadastro",
  create_exceptions: "Abrir ocorrência",
  resolve_exceptions: "Resolver ocorrência",
  upload_documents: "Anexar documento",
  verify_documents: "Conferir documento",
  export_billing: "Exportar faturamento",
  manage_trips: "Criar e transicionar viagem",
  import_freight_rates: "Substituir a tabela de fretes",
  /*
    O rótulo diz "PARA A EQUIPE" porque é o que o poder tem de diferente (030, 01/09).

    Aceitar já é irreversível; ignorar passou a tirar a oferta da tela de TODOS. Quem marca esta
    caixa está dando a alguém o poder de decidir sozinho que a empresa não pega um frete — e ninguém
    mais fica sabendo que ele existiu, a não ser no registro.

    "Decidir oferta de spot" sozinho soaria como "olhar as ofertas", que é outra coisa e já vem de
    `view_all_trips`.
  */
  decidir_spot: "Aceitar e ignorar oferta de spot — para a equipe",
  /*
    AS DUAS MARCAS DIZEM DE QUE SETOR SÃO, e não só o que fazem.

    "Marcar SM" sozinho não ajuda quem monta um cargo: a pergunta que essa pessoa tem na cabeça é
    "isso é do GR ou do Fiscal?". O nome do setor no rótulo responde antes de ela precisar perguntar
    a alguém — e é o que evita que as duas sejam marcadas juntas por precaução, que é como uma
    separação de setor morre.
  */
  marcar_sm: "Marcar a SM na programação — setor GR",
  marcar_cte: "Marcar o CTE na programação — setor Fiscal",
};

/**
 * O catálogo montado: grupos de página na ordem do menu, e as ações por último.
 *
 * As ações vêm no fim de propósito. Quem monta um cargo pensa primeiro em "o que essa pessoa
 * ABRE", e só depois em "o que ela pode FAZER lá dentro" — pôr as ações no meio obrigaria a decidir
 * sobre cancelamento de viagem antes de decidir se a pessoa vê viagens.
 */
export function montarCatalogo(): GrupoDoCatalogo[] {
  const porPermissao = new Map<PermissionKey, { grupo: string; paginas: string[] }>();

  for (const item of NAV_ITEMS) {
    if (!item.permission) continue;
    const atual = porPermissao.get(item.permission);
    if (atual) atual.paginas.push(item.key);
    else porPermissao.set(item.permission, { grupo: item.grupo, paginas: [item.key] });
  }

  const grupos: GrupoDoCatalogo[] = NAV_GRUPOS.map((chave) => ({
    chave,
    itens: [...porPermissao.entries()]
      .filter(([, v]) => v.grupo === chave)
      .map(([permissao, v]) => ({ permissao, paginas: v.paginas })),
  })).filter((g) => g.itens.length > 0);

  const acoes = ALL_PERMISSIONS.filter((p) => !porPermissao.has(p)).map((permissao) => ({
    permissao,
    paginas: [],
  }));

  return acoes.length > 0 ? [...grupos, { chave: GRUPO_DAS_ACOES, itens: acoes }] : grupos;
}

/**
 * Toda permissão do catálogo, na ordem em que a tela as mostra.
 *
 * É o que o teste usa para provar que nenhuma ficou de fora — e o que a tela usa para marcar tudo.
 */
export function permissoesDoCatalogo(): PermissionKey[] {
  return montarCatalogo().flatMap((g) => g.itens.map((i) => i.permissao));
}
