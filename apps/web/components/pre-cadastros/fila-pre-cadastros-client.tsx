"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, FileImage, IdCard, RefreshCw, Send, UserPlus, UserCheck } from "lucide-react";
import { formatDateTime } from "@brazil-tms/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { avisar } from "@/lib/ui/avisos";
import { normalizeForSearch } from "@/lib/search-normalize";

/**
 * A FILA DE PRÉ-CADASTROS (fatia 028, etapa 2) — a tela que torna o evento de 10/09 possível.
 *
 * Do outro lado, num estande sem ninguém do escritório, mais de cinquenta motoristas preenchem um
 * formulário no celular. Aqui é onde esses envios viram trabalho de alguém.
 *
 * ── O QUE ESTA TELA AINDA NÃO FAZ, E POR QUÊ ──────────────────────────────────────────────────
 *
 * Não confere, não corrige campo e não manda nada para a gerenciadora. Tudo isso é P2 e depende da
 * leitura da CNH. O que ela entrega é o que tem data: VER o que chegou, distinguir cadastro novo de
 * atualização, abrir as fotos e descartar o que for lixo.
 *
 * Ser honesto sobre isso é parte da tela: quem abrir esperando conferir aqui precisa entender em
 * dois segundos que ainda não é aqui.
 *
 * ── NOVO × ATUALIZAÇÃO É A DISTINÇÃO MAIS IMPORTANTE DA LISTA ─────────────────────────────────
 *
 * "Atualização" quer dizer que o CPF já é de um motorista cadastrado. Tratá-la como cadastro novo
 * criaria o mesmo motorista duas vezes na gerenciadora — e é exatamente o erro que a fila existe
 * para evitar. Por isso ela é um selo, com o nome de quem já está cadastrado ao lado, e não uma
 * coluna discreta.
 *
 * ── O FRESCOR É POLLING ───────────────────────────────────────────────────────────────────────
 *
 * Constituição: nada de Realtime. Vinte segundos, que no dia do evento é a diferença entre ver a
 * fila crescer e achar que o formulário parou.
 */

interface ItemDaFila {
  id: string;
  cpf: string;
  tipo: "novo" | "atualizacao";
  status: string;
  motoristaId: string | null;
  motoristaNome: string | null;
  nome: string | null;
  celular: string | null;
  envios: number;
  pendenciaToxicologico: boolean;
  leituraCnh: {
    estado: string;
    motivo?: string;
    lidos?: number;
    total?: number;
    /** O CPF impresso no documento, quando NÃO bate com o digitado. */
    cpfDivergente?: string;
  } | null;
  documentoCnhId: string | null;
  documentoComprovanteId: string | null;
  /** Preenchido quando o cadastro chegou à gerenciadora. É definitivo. */
  enviadoEm: string | null;
  /** A última tentativa: o que faltou, ou a recusa dela. */
  cadastro: { em: string; motivos?: string[]; erro?: string } | null;
  recebidoEm: string;
  atualizadoEm: string;
}

/** "39053344705" → "390.533.447-05". Guardado sem pontuação, lido com. */
function cpfLegivel(cpf: string): string {
  return cpf.length === 11
    ? `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`
    : cpf;
}

/** "71992067086" → "(71) 99206-7086". */
function celularLegivel(v: string | null): string {
  if (!v) return "—";
  if (v.length === 11) return `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7)}`;
  if (v.length === 10) return `(${v.slice(0, 2)}) ${v.slice(2, 6)}-${v.slice(6)}`;
  return v;
}

export function FilaPreCadastrosClient(): React.ReactElement {
  const t = useTranslations("PreCadastros");
  const queryClient = useQueryClient();
  const [busca, setBusca] = useState("");
  const [arquivando, setArquivando] = useState<ItemDaFila | null>(null);
  const [motivo, setMotivo] = useState("");

  const consulta = useQuery({
    queryKey: ["pre-cadastros"],
    queryFn: async () => {
      const res = await fetch("/api/pre-cadastros");
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as { items: ItemDaFila[] };
    },
    refetchInterval: 20_000,
  });

  const arquivar = useMutation({
    mutationFn: async ({ id, motivo }: { id: string; motivo: string }) => {
      const res = await fetch(`/api/pre-cadastros/${id}/arquivar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo }),
      });
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as { arquivado: boolean };
    },
    onSuccess: async () => {
      avisar({ tipo: "ok", texto: t("arquivado") });
      setArquivando(null);
      setMotivo("");
      await queryClient.invalidateQueries({ queryKey: ["pre-cadastros"] });
    },
    onError: () => avisar({ tipo: "erro", texto: t("arquivarFalhou") }),
  });

  /**
   * O EMPURRÃO — e o aviso diz "pedido", não "enviado".
   *
   * A rota devolve 202: o job foi para a fila, a gerenciadora ainda não respondeu. Dizer "enviado"
   * aqui seria uma tela afirmando um fato que só existirá daqui a alguns segundos — e que pode não
   * existir, se ainda faltar campo. O desfecho aparece no polling, que é onde ele é verdade.
   */
  const enviar = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/pre-cadastros/${id}/enviar`, { method: "POST" });
      if (!res.ok) throw new Error(String(res.status));
    },
    onSuccess: async () => {
      avisar({ tipo: "ok", texto: t("envioPedido") });
      await queryClient.invalidateQueries({ queryKey: ["pre-cadastros"] });
    },
    onError: () => avisar({ tipo: "erro", texto: t("envioFalhou") }),
  });

  /**
   * O código cru é o ÚLTIMO recurso, e é melhor do que "campo faltando".
   *
   * Um motivo novo em `motivosDeNaoCadastrar` sem tradução aqui aparece como `sem_toxicologico` —
   * feio, e ainda assim suficiente para alguém entender e ir atrás. Um rótulo genérico seria mais
   * bonito e não diria nada.
   */
  const faltandoLegivel = (codigo: string): string =>
    t.has(`faltando.${codigo}`) ? t(`faltando.${codigo}`) : codigo;

  const itens = useMemo(() => {
    const todos = consulta.data?.items ?? [];
    const termo = normalizeForSearch(busca.trim());
    if (!termo) return todos;
    // Busca por nome ou CPF, com e sem pontuação: quem está no balcão digita dos dois jeitos.
    return todos.filter(
      (i) =>
        normalizeForSearch(i.nome ?? "").includes(termo) ||
        i.cpf.includes(termo.replace(/\D/g, "")) ||
        cpfLegivel(i.cpf).includes(busca.trim()),
    );
  }, [consulta.data, busca]);

  if (consulta.isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder={t("buscar")}
          className="max-w-xs"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => void consulta.refetch()}
          disabled={consulta.isFetching}
        >
          <RefreshCw className={consulta.isFetching ? "animate-spin" : undefined} />
          {t("atualizar")}
        </Button>
        <span className="text-muted-foreground text-sm">{t("naFila", { n: itens.length })}</span>
      </div>

      {itens.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center text-sm">
            {busca ? t("vazioBusca") : t("vazioFila")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {itens.map((item) => (
            <Card key={item.id}>
              <CardContent className="flex flex-wrap items-start justify-between gap-4 py-4">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{item.nome ?? t("semNome")}</span>
                    {item.tipo === "atualizacao" ? (
                      <Badge variant="secondary" className="gap-1">
                        <UserCheck className="size-3" />
                        {t("atualizacao")}
                        {item.motoristaNome ? ` · ${item.motoristaNome}` : ""}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1">
                        <UserPlus className="size-3" />
                        {t("cadastroNovo")}
                      </Badge>
                    )}
                    {/* Mais de um envio quase sempre é foto ruim na primeira tentativa. */}
                    {item.envios > 1 ? (
                      <Badge variant="outline">{t("envios", { n: item.envios })}</Badge>
                    ) : null}
                    {/*
                      A DIVERGÊNCIA DE CPF vem ANTES de tudo, e em vermelho.

                      O CPF impresso no documento não é o que a pessoa digitou. Aconteceu no
                      primeiro cadastro real recebido — a foto era a CNH de outra pessoa — e só
                      apareceu porque alguém abriu o arquivo. Enviado assim, gastaria uma
                      solicitação de pesquisa na gerenciadora para voltar reprovado.

                      Em destaque porque é o único aviso desta tela que muda o que se FAZ com a
                      linha, em vez de apenas descrever o estado dela.
                    */}
                    {item.leituraCnh?.cpfDivergente ? (
                      <Badge
                        variant="destructive"
                        title={t("cpfDivergenteDetalhe", { cpf: item.leituraCnh.cpfDivergente })}
                      >
                        {t("cpfDivergente")}
                      </Badge>
                    ) : null}
                    {/*
                      O ESTADO DA LEITURA, dito com honestidade.

                      "Lendo…" quando ainda não processou, a contagem quando deu certo, e o motivo
                      quando falhou. Um selo que só aparecesse no sucesso deixaria a falha
                      indistinguível de "ainda não chegou a vez" — e alguém esperaria por algo que
                      nunca vem.
                    */}
                    {item.leituraCnh === null ? (
                      <Badge variant="outline" className="text-muted-foreground">
                        {t("cnhLendo")}
                      </Badge>
                    ) : item.leituraCnh.estado === "lido" ? (
                      <Badge variant="secondary">
                        {t("cnhLida", {
                          lidos: item.leituraCnh.lidos ?? 0,
                          total: item.leituraCnh.total ?? 0,
                        })}
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-amber-700 dark:text-amber-400"
                        title={item.leituraCnh.motivo ?? undefined}
                      >
                        {item.leituraCnh.estado === "nao_configurado"
                          ? t("cnhSemChave")
                          : t("cnhFalhou")}
                      </Badge>
                    )}
                    {item.pendenciaToxicologico ? (
                      <Badge variant="outline" className="text-amber-700 dark:text-amber-400">
                        {t("toxicologico")}
                      </Badge>
                    ) : null}
                    {/*
                      O DESFECHO DO ENVIO — a resposta que o botão precisa ter.

                      Três estados e nada de "em andamento": entre o clique e a resposta passam
                      segundos, e um selo intermediário piscaria sem informar. O que falta aparece
                      POR EXTENSO, e não como "incompleto", porque a pessoa está aqui para resolver:
                      "incompleto" a manda abrir o cadastro para descobrir o quê.
                    */}
                    {item.enviadoEm ? (
                      <Badge
                        variant="secondary"
                        className="text-emerald-700 dark:text-emerald-400"
                        title={t("enviadoEm", { data: formatDateTime(item.enviadoEm) })}
                      >
                        <Send className="size-3" />
                        {t("enviado")}
                      </Badge>
                    ) : item.cadastro?.erro ? (
                      <Badge variant="destructive" title={item.cadastro.erro}>
                        {t("envioRecusado")}
                      </Badge>
                    ) : item.cadastro?.motivos?.length ? (
                      <Badge
                        variant="outline"
                        className="text-amber-700 dark:text-amber-400"
                        title={item.cadastro.motivos.map(faltandoLegivel).join(" · ")}
                      >
                        {t("faltam", {
                          n: item.cadastro.motivos.length,
                          quais: item.cadastro.motivos.slice(0, 2).map(faltandoLegivel).join(", "),
                        })}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="text-muted-foreground text-sm">
                    {cpfLegivel(item.cpf)} · {celularLegivel(item.celular)}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {t("recebidoEm", { data: formatDateTime(item.recebidoEm) })}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/*
                    Link simples com `target="_blank"`, e não abertura por JavaScript: a rota
                    redireciona para uma URL assinada de trinta segundos, e um `window.open` depois
                    de um `await` é bloqueado como popup, em silêncio.
                  */}
                  {item.documentoCnhId ? (
                    <Button asChild variant="outline" size="sm">
                      <a
                        href={`/api/pre-cadastros/documento/${item.documentoCnhId}`}
                        target="_blank"
                        rel="noopener"
                      >
                        <IdCard />
                        {t("cnh")}
                      </a>
                    </Button>
                  ) : null}
                  {item.documentoComprovanteId ? (
                    <Button asChild variant="outline" size="sm">
                      <a
                        href={`/api/pre-cadastros/documento/${item.documentoComprovanteId}`}
                        target="_blank"
                        rel="noopener"
                      >
                        <FileImage />
                        {t("comprovante")}
                      </a>
                    </Button>
                  ) : null}
                  {/*
                    SÓ APARECE ENQUANTO FAZ SENTIDO.

                    Quem já foi para a gerenciadora não tem botão — não porque o clique quebraria
                    algo (a consulta do worker exige `enviado_em IS NULL`), mas porque um botão que
                    não faz nada ensina que os botões desta tela não fazem nada.
                  */}
                  {item.enviadoEm ? null : (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={enviar.isPending}
                      onClick={() => enviar.mutate(item.id)}
                    >
                      <Send />
                      {t("enviar")}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setArquivando(item);
                      setMotivo("");
                    }}
                  >
                    <Archive />
                    {t("arquivar")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={arquivando !== null} onOpenChange={(open) => !open && setArquivando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("arquivarTitulo")}</DialogTitle>
            <DialogDescription>{t("arquivarDescricao")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="motivo-arquivar">
              {t("motivo")}
            </label>
            <Input
              id="motivo-arquivar"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder={t("motivoExemplo")}
            />
            {/* Obrigatório de propósito: meses depois, "arquivado" sem motivo não distingue
                duplicata de cadastro legítimo fechado por engano. */}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArquivando(null)}>
              {t("cancelar")}
            </Button>
            <Button
              disabled={motivo.trim().length < 3 || arquivar.isPending}
              onClick={() =>
                arquivando && arquivar.mutate({ id: arquivando.id, motivo: motivo.trim() })
              }
            >
              {t("arquivar")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
