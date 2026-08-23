import { useTranslations } from "next-intl";
import { displayStatusOf, type TripDisplayStatus } from "@brazil-tms/shared";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * pt-BR trip-status badge (005 R14, §16). Maps each `trip_status` to an accessible (WCAG-AA) colour by
 * lifecycle phase: intake = slate, planning = indigo, execution = blue, done = green, billing = amber,
 * terminal = red/gray. Follows the master-data status-badge pattern (Badge + i18n label) but with a
 * per-status colour so operators can scan the dense board. Renders in server or client components
 * (next-intl `useTranslations` is isomorphic). Slice 015 dropped the `validation_error`/`validated`
 * keys (the `Record<TripStatus>` is now the 16-value machine).
 */
/**
 * A cor conta em que PONTO DA VIAGEM ela está, não só a que fase pertence (2026-08-16).
 *
 * As sete etapas de execução — da chegada na origem à descarga — dividiam um único azul. Num quadro
 * de 40 linhas isso significava que "chegou na origem" e "em trânsito" eram a mesma mancha, e a
 * pessoa tinha de LER cada etiqueta para saber o que estava acontecendo. Agora a cor caminha com a
 * viagem: espera cinza → planejada violeta → na origem azul-claro → EM TRÂNSITO azul forte → chegou
 * ao destino verde-água → concluída verde → faturamento âmbar. De relance, a linha se lê sozinha.
 *
 * Cada uma ganhou par para o tema escuro: as versões claras viravam manchas fluorescentes sobre o
 * fundo escuro, com o texto escuro quase ilegível.
 */
const STATUS_CLASS: Record<TripDisplayStatus, string> = {
  /**
   * As duas filas que viviam dentro de "Recebida" (2026-08-18, a pedido).
   *
   * Cores diferentes porque pedem AÇÕES diferentes, de pessoas diferentes: em análise espera alguém
   * decidir aceitar ou rejeitar; p/atribuir espera alguém escalar motorista. Do mesmo cinza, o
   * quadro mostrava 389 linhas iguais escondendo duas filas de 63 e 326.
   *
   * O âmbar de "em análise" é de propósito o mesmo tom do faturamento pendente: as duas são "parado
   * esperando decisão de gente". O violeta de "p/atribuir" encosta no de "atribuída", que é o passo
   * seguinte dela — a cor caminha junto com a viagem.
   */
  in_analysis:
    "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-400/25",
  to_assign:
    "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:border-violet-400/20",
  /**
   * O cliente já pôs motorista e confirmou; espera-se o comparecimento para a rota começar.
   *
   * Verde-água, o mesmo tom das etapas de destino, porque aqui NÃO há trabalho de despacho pendente
   * — é uma espera saudável. Mandar essa linha para "p/atribuir" seria pedir à operação um trabalho
   * que o cliente já fez.
   */
  /**
   * VERDE FRACO, e o rótulo virou "ETA Origem" (2026-08-23, a pedido, em duas rodadas).
   *
   * Era verde-água claro, o mesmo tom das etapas de destino. Passou por verde forte e voltou para
   * um verde claro — desta vez o verde da família, não o azul-esverdeado: o forte foi para o EM
   * TRÂNSITO, que é o que o quadro precisa achar de longe. Aqui o caminhão ainda está a caminho, e
   * a espera saudável não compete com quem já está na estrada.
   *
   * O nome mudou junto: "NA ORIGEM" dizia que o caminhão JÁ estava lá, e ele não está — está a
   * caminho, com hora marcada. ETA Origem é o que o próprio portal chama, e em caixa normal: as
   * outras etiquetas todas são assim, e só ela gritava.
   */
  awaiting_arrival:
    "bg-green-100 text-green-800 border-green-200 dark:bg-green-500/15 dark:text-green-300 dark:border-green-400/25",
  // `received` continua existindo na MÁQUINA e no histórico: um evento antigo aponta para ele, e
  // sem esta entrada a linha do tempo ficaria sem cor. Na tela ele nunca aparece sozinho — quem
  // decide o rótulo é `displayStatusOf`.
  received:
    "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-500/15 dark:text-slate-300 dark:border-slate-400/25",
  assigned:
    "bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-400/25",
  confirmed:
    "bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-400/25",
  at_origin:
    "bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-400/25",
  loading:
    "bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-400/25",
  loaded:
    "bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-400/25",
  /**
   * VERDE FORTE, e agora sozinha nele (2026-08-23, a pedido, segunda rodada).
   *
   * É a única etiqueta cheia do quadro, e isso é o ponto: é onde o caminhão está andando, e num
   * quadro de 40 linhas precisa ser achada sem ler. Passou pelo azul e por um verde cana antes de
   * ficar aqui — o verde que o ETA Origem estreou de manhã e devolveu à tarde.
   */
  in_transit:
    "bg-green-600 text-white border-green-700 dark:bg-green-500 dark:text-white dark:border-green-400",
  at_destination:
    "bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-400/25",
  unloading:
    "bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-400/25",
  unloaded:
    "bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-400/25",
  /**
   * BEGE (2026-08-23, a pedido). Concluída sai do verde e vira um tom neutro e quente: ela é o
   * arquivo do dia, não a novidade. O verde forte fica para o que ainda está acontecendo.
   */
  completed:
    "border-[hsl(38_30%_74%)] bg-[hsl(40_44%_88%)] text-[hsl(34_38%_26%)] dark:border-[hsl(38_22%_34%)] dark:bg-[hsl(38_22%_20%)] dark:text-[hsl(40_42%_76%)]",
  billing_pending:
    "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-400/25",
  billing_ready:
    "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-400/25",
  billed:
    "bg-green-100 text-green-800 border-green-200 dark:bg-green-500/15 dark:text-green-300 dark:border-green-400/25",
  /**
   * VERMELHO FRACO (2026-08-23, a pedido). Era cinza, de propósito — cancelada é fim de linha e não
   * pede ação. O vermelho claro a distingue do resto sem competir com a disputa, que é o vermelho
   * de verdade e essa sim pede alguém.
   */
  cancelled:
    "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-300/90 dark:border-red-400/20",
  disputed:
    "bg-red-100 text-red-800 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-400/25",
};

export function TripStatusBadge({
  status,
  /**
   * A resposta do cliente (`Pending` / `Accepted`), quando a tela a tem.
   *
   * Só muda alguma coisa para `received`, e é o que desdobra a etiqueta em "Em análise" ou
   * "P/Atribuir". Ausente, a viagem cai em "P/Atribuir" — ver `displayStatusOf` para o porquê.
   */
  portalAcceptance,
  /** O que o portal chama a viagem — `Assigned` quer dizer que já tem motorista lá. */
  portalStatus,
}: {
  status: TripDisplayStatus;
  portalAcceptance?: string | null;
  portalStatus?: string | null;
}) {
  const t = useTranslations("Trips.status");
  // Já veio desdobrado (contagem do painel, ficha do quadro)? Passa direto. Veio cru (uma linha do
  // quadro, a linha do tempo)? Desdobra aqui, com um só lugar decidindo.
  const chave =
    status === "received"
      ? displayStatusOf(status, portalAcceptance ?? null, portalStatus ?? null)
      : status;
  return (
    <Badge variant="outline" className={cn("font-medium", STATUS_CLASS[chave])}>
      {t(chave)}
    </Badge>
  );
}
