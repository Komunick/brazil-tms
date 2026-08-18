/**
 * O SOM DO AVISO DE OFERTA (2026-08-18).
 *
 * Dois tons curtos, gerados no próprio navegador. Sem arquivo de áudio de propósito: um `.mp3` seria
 * mais um recurso para servir, versionar e ver falhar em silêncio — e o que se quer aqui cabe em
 * quatro linhas de oscilador.
 *
 * ── O QUE O NAVEGADOR NÃO DEIXA ────────────────────────────────────────────────────────────────
 *
 * Página nenhuma toca som antes de a pessoa interagir com ela: o Chrome cria o contexto de áudio
 * "suspenso" e só libera depois de um clique ou uma tecla. Isso é do navegador, não contornável, e
 * atinge em cheio o caso da TV — a tela que ninguém toca é justamente a que nunca vai apitar.
 *
 * Então o arquivo faz as duas coisas que dá para fazer, e nenhuma promessa além:
 *
 *   TENTA DESTRAVAR no primeiro clique ou tecla que a página receber, uma vez só. Num computador
 *   onde alguém trabalha, isso acontece nos primeiros segundos e o som passa a funcionar sozinho.
 *
 *   FALHA CALADO. Sem áudio, o aviso continua aparecendo — que é o essencial. Som é reforço; se ele
 *   virar condição, a tela deixa de avisar em silêncio e ninguém entende por quê.
 */

/**
 * O VOLUME, e por que ele mudou (2026-08-18).
 *
 * Nasceu em 0.06 pensando em sala de trabalho — "um aviso que assusta é desligado na mesma semana".
 * O destino real é outro: uma TV de parede, com alto-falante de TV, numa sala com gente conversando.
 * Lá, 0.06 simplesmente não se ouve.
 *
 * Este é o único número aqui que é escolha e não medição. Se ficar alto demais na sala, é o que se
 * mexe — e é o motivo de ele estar sozinho no topo do arquivo, e não perdido no meio da função.
 */
const VOLUME = 0.28;

/**
 * Três notas subindo, e não duas.
 *
 * Duas notas soam como notificação de sistema — a sala aprende a ignorar em uma semana. Três subindo
 * é o padrão que o ouvido lê como "chegou algo para você", e ainda dura pouco menos de meio segundo.
 */
const NOTAS = [784, 1046, 1318];

let ctx: AudioContext | null = null;
let destravando = false;

function contexto(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx ??= new Ctor();
    return ctx;
  } catch {
    return null;
  }
}

/** Liga o áudio no primeiro gesto da pessoa — o navegador não aceita antes disso. */
function agendarDestrave(c: AudioContext): void {
  if (destravando) return;
  destravando = true;
  const liberar = (): void => {
    void c.resume().catch(() => undefined);
    window.removeEventListener("pointerdown", liberar);
    window.removeEventListener("keydown", liberar);
  };
  window.addEventListener("pointerdown", liberar, { once: true });
  window.addEventListener("keydown", liberar, { once: true });
}

/**
 * Três notas curtas, subindo — o padrão que o ouvido lê como "chegou algo", e não como erro.
 *
 * Os dois números para mexer quando a sala reclamar (ou não ouvir) estão no topo do arquivo, e não
 * perdidos aqui dentro: `VOLUME` e `NOTAS`.
 */
export function tocarAviso(): void {
  const c = contexto();
  if (!c) return;
  if (c.state === "suspended") {
    agendarDestrave(c);
    void c.resume().catch(() => undefined);
    // Sem gesto ainda: não adianta tocar num contexto suspenso, e insistir só empilha nós de áudio.
    if (c.state === "suspended") return;
  }
  try {
    const agora = c.currentTime;
    for (const [i, hz] of NOTAS.entries()) {
      const osc = c.createOscillator();
      const vol = c.createGain();
      // TRIANGULAR, e não senoidal (2026-08-18). A senoide é o tom mais "limpo" que existe — e é
      // justamente por isso que ela some numa sala: não tem harmônicos para atravessar ruído de fundo
      // e alto-falante de TV. A triangular carrega no mesmo volume de pico.
      osc.type = "triangle";
      osc.frequency.value = hz;
      // Envelope: sem ele o oscilador começa e termina com um estalo audível.
      const inicio = agora + i * 0.14;
      vol.gain.setValueAtTime(0.0001, inicio);
      vol.gain.exponentialRampToValueAtTime(VOLUME, inicio + 0.02);
      vol.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.13);
      osc.connect(vol);
      vol.connect(c.destination);
      osc.start(inicio);
      osc.stop(inicio + 0.15);
    }
  } catch {
    // Áudio bloqueado ou indisponível. O aviso visual já está na tela; nada a fazer aqui.
  }
}
