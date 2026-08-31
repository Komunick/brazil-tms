import { describe, expect, it } from "vitest";
import { ALL_PERMISSIONS, ROLE_PERMISSIONS, can } from "@brazil-tms/shared";
import { evaluateProfile, type ProfileRow } from "./session-core";

/**
 * SEM CARGO ⇒ CONJUNTO VAZIO. **Nunca** o papel antigo.
 *
 * Esta é a regra que mais importa da fatia 029, e a tentação de quebrá-la é grande: um `??
 * ROLE_PERMISSIONS[role]` no lugar certo faria tudo continuar funcionando quando a leitura do cargo
 * falhasse. Parece robustez. É o contrário.
 *
 * ── POR QUE O FALLBACK É O PIOR DESFECHO POSSÍVEL ─────────────────────────────────────────────
 *
 * Se o `join` do cargo quebrar — uma migração que não subiu, uma tabela vazia, um `select` mal
 * escrito —, com fallback **ninguém descobre**. A tela funciona, o menu aparece inteiro, as rotas
 * respondem. A autorização voltou silenciosamente a ser a de código, e a tela de cargos passou a não
 * fazer efeito nenhum. O defeito só apareceria quando alguém editasse um cargo e nada acontecesse —
 * dias ou semanas depois, longe da causa.
 *
 * É o mesmo formato do defeito de `programacao_prefs`, que respondeu `200` por um dia inteiro sem
 * gravar nada.
 *
 * Sem fallback, o mesmo problema aparece em minutos: as pessoas entram e não veem nada.
 *
 * ── E VAZIO É O LADO CERTO DE ERRAR ───────────────────────────────────────────────────────────
 *
 * Num modelo de autorização, o outro lado do erro é conceder o que ninguém pediu.
 */
const perfil = (over: Partial<ProfileRow> = {}): ProfileRow => ({
  id: "u1",
  name: "Teste",
  email: "teste@example.com",
  role: "admin",
  status: "active",
  mustChangePassword: false,
  lastLoginAt: null,
  permissoes: [],
  cargo: null,
  ...over,
});

function usuarioDe(p: ProfileRow) {
  const r = evaluateProfile("u1", p);
  if (!r.authenticated) throw new Error("esperava sessão autenticada");
  return r.user;
}

describe("quem está sem cargo não alcança nada", () => {
  it("recusa TODAS as capacidades, uma a uma", () => {
    const user = usuarioDe(perfil());
    for (const chave of ALL_PERMISSIONS) {
      expect(can(user, chave)).toBe(false);
    }
    expect(user.permissoes.size).toBe(0);
  });

  it("NÃO cai no papel antigo — nem quando o papel é `admin`", () => {
    /**
     * O caso decisivo. Este perfil tem `role: "admin"`, que no catálogo alcança as 23. Sem cargo,
     * alcança ZERO. Se alguém acrescentar o fallback, este caso vira `true` e o teste cai — que é
     * exatamente o ponto.
     */
    const user = usuarioDe(perfil({ role: "admin", permissoes: [], cargo: null }));
    expect(ROLE_PERMISSIONS.admin.has("manage_users")).toBe(true);
    expect(can(user, "manage_users")).toBe(false);
  });

  it("cargo COM NOME e sem nada marcado também alcança zero", () => {
    // É o cargo recém-criado, antes de o admin marcar qualquer coisa — e o "Sem acesso" da migração.
    // A tela avisa antes de salvar, porque parece defeito e não é.
    const user = usuarioDe(perfil({ cargo: "Sem acesso", permissoes: [] }));
    expect(user.cargo).toBe("Sem acesso");
    expect(can(user, "view_all_trips")).toBe(false);
  });

  it("com cargo, alcança exatamente o que o cargo dá — nem mais, nem menos", () => {
    const user = usuarioDe(
      perfil({ role: "admin", cargo: "Despachante", permissoes: ["view_all_trips"] }),
    );
    expect(can(user, "view_all_trips")).toBe(true);
    // O papel diz admin; o cargo não dá `manage_users`. Quem manda é o cargo.
    expect(can(user, "manage_users")).toBe(false);
  });

  it("o nome do cargo chega à sessão — é o que permite dizer 'sem cargo definido'", () => {
    // Sem isto, a tela só poderia não mostrar nada, e "não vejo nada" é indistinguível de "quebrou".
    expect(usuarioDe(perfil()).cargo).toBeNull();
    expect(usuarioDe(perfil({ cargo: "Financeiro" })).cargo).toBe("Financeiro");
  });
});
