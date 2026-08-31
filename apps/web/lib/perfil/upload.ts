import "server-only";
import { Conflict } from "@/lib/api/respond";
import { TETO_DA_FOTO_BYTES } from "./foto";

/**
 * Lê o arquivo do `multipart` e recusa o que nem chega a ser um envio de foto.
 *
 * Extraído porque as duas rotas (a própria e a de outra pessoa) fazem exatamente isto, e a segunda
 * cópia divergiria: alguém apertaria o teto numa e não na outra, e o caminho frouxo continuaria
 * aceitando o que o rigoroso recusa.
 *
 * ── A RECUSA POR TAMANHO ACONTECE DUAS VEZES, E É DE PROPÓSITO ────────────────────────────────
 *
 * Aqui, pelo cabeçalho, ANTES de ler o corpo — é o que evita carregar 50 MB na memória para depois
 * dizer que não cabia. E de novo em `guardarFoto`, sobre os bytes de verdade, porque o cabeçalho é
 * dito pelo cliente e uma requisição feita fora da tela chega com o que quiser.
 *
 * O de fora é conforto; o de dentro é a regra.
 */
export async function lerArquivoDaFoto(
  request: Request,
): Promise<{ nome: string; contentType: string; bytes: Buffer }> {
  const declarado = Number(request.headers.get("content-length") ?? 0);
  if (declarado > TETO_DA_FOTO_BYTES * 2) {
    // Folga de 2×: o `multipart` embrulha o arquivo com fronteiras e cabeçalhos, então o corpo é
    // sempre maior que a foto. Recusar pelo tamanho exato barraria foto que cabe.
    throw new Conflict("FOTO_GRANDE", "A foto passa de 2 MB. Envie uma menor.");
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    throw new Conflict("SEM_ARQUIVO", "Nenhuma foto foi enviada.");
  }

  return {
    nome: file.name || "foto",
    contentType: file.type,
    bytes: Buffer.from(await file.arrayBuffer()),
  };
}
