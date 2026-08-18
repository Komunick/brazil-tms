"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Sobreviver a um deploy sem ninguém precisar tocar na TV (2026-08-18).
 *
 * O painel do dia vive numa televisão no meio da sala, e todo merge derruba o servidor por um a dois
 * minutos: o `update` para o app ANTES de puxar o código, instalar dependências, migrar e buildar.
 * Não é um piscar — é a tela quebrada por dois minutos, várias vezes ao dia.
 *
 * Duas coisas fazem a queda passar despercebida, e são coisas diferentes:
 *
 *   NÃO APAGAR O QUE JÁ ESTÁ NA TELA. A consulta continua tentando; enquanto ela falha, o último
 *   retrato bom continua valendo. Trocar números por uma mensagem de erro é a pior escolha possível
 *   numa TV: quem passa na sala perde a informação inteira por causa de uma falha temporária que
 *   ninguém ali pode resolver. O que a tela DEVE fazer é dizer que está velha — e isso é o
 *   `desatualizado` daqui.
 *
 *   RECARREGAR QUANDO VOLTAR. Depois de um deploy o navegador continua rodando o pacote ANTIGO, e
 *   segue rodando para sempre: nenhuma correção nova chega à TV até alguém dar F5 nela. Por isso a
 *   volta dispara um `reload` — é o "só atualizar" que a sala precisa, sem ninguém subir na cadeira.
 *
 * O piso de tempo existe para separar as duas causas. Uma falha de rede de três segundos não merece
 * recarga; um servidor fora por vinte segundos ou mais é deploy ou reinício, e aí o pacote velho
 * provavelmente ficou para trás. Recarregar por qualquer engasgo criaria um laço de recarga numa
 * rede instável — que é exatamente o tipo de defeito que aparece só na TV, tarde da noite.
 */
export function useReconexao(
  comFalha: boolean,
  /** Quanto tempo fora do ar já é "deploy", e não engasgo de rede. */
  pisoMs = 20_000,
): { desatualizado: boolean } {
  const caiuEm = useRef<number | null>(null);
  const [desatualizado, setDesatualizado] = useState(false);

  useEffect(() => {
    if (comFalha) {
      if (caiuEm.current == null) caiuEm.current = Date.now();
      setDesatualizado(true);
      return;
    }

    const inicio = caiuEm.current;
    caiuEm.current = null;
    setDesatualizado(false);
    // Voltou depois de uma queda longa: o pacote em execução aqui provavelmente é o da versão
    // anterior. Uma recarga só, no momento em que o servidor já está de pé para respondê-la.
    if (inicio != null && Date.now() - inicio >= pisoMs) {
      window.location.reload();
    }
  }, [comFalha, pisoMs]);

  return { desatualizado };
}
