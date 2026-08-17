import { useTranslations } from "next-intl";
import type { TripStatus } from "@brazil-tms/shared";
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
const STATUS_CLASS: Record<TripStatus, string> = {
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
  // A única que o quadro precisa achar de longe: é onde o caminhão está andando.
  in_transit:
    "bg-blue-600 text-white border-blue-700 dark:bg-blue-500 dark:text-white dark:border-blue-400",
  at_destination:
    "bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-400/25",
  unloading:
    "bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-400/25",
  unloaded:
    "bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-400/25",
  completed:
    "bg-green-100 text-green-800 border-green-200 dark:bg-green-500/15 dark:text-green-300 dark:border-green-400/25",
  billing_pending:
    "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-400/25",
  billing_ready:
    "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-400/25",
  billed:
    "bg-green-100 text-green-800 border-green-200 dark:bg-green-500/15 dark:text-green-300 dark:border-green-400/25",
  cancelled:
    "bg-gray-200 text-gray-700 border-gray-300 dark:bg-gray-500/15 dark:text-gray-400 dark:border-gray-400/25",
  disputed:
    "bg-red-100 text-red-800 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-400/25",
};

export function TripStatusBadge({ status }: { status: TripStatus }) {
  const t = useTranslations("Trips.status");
  return (
    <Badge variant="outline" className={cn("font-medium", STATUS_CLASS[status])}>
      {t(status)}
    </Badge>
  );
}
