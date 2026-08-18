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
 * Duas notas curtas, subindo — o padrão que o ouvido lê como "chegou algo", e não como erro.
 *
 * Volume baixo (0.06): a sala é de trabalho, e um aviso que assusta é desligado na mesma semana.
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
    for (const [i, hz] of [880, 1175].entries()) {
      const osc = c.createOscillator();
      const vol = c.createGain();
      osc.type = "sine";
      osc.frequency.value = hz;
      // Envelope curto: sem ele o oscilador começa e termina com um estalo audível.
      const inicio = agora + i * 0.13;
      vol.gain.setValueAtTime(0.0001, inicio);
      vol.gain.exponentialRampToValueAtTime(0.06, inicio + 0.02);
      vol.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.12);
      osc.connect(vol);
      vol.connect(c.destination);
      osc.start(inicio);
      osc.stop(inicio + 0.14);
    }
  } catch {
    // Áudio bloqueado ou indisponível. O aviso visual já está na tela; nada a fazer aqui.
  }
}
