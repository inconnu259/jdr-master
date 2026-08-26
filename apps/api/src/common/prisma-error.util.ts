/**
 * Vrai si `e` porte le code d'erreur Prisma donné (P2002 unicité, P2003 clé étrangère…).
 *
 * Duck-typing assumé plutôt qu'un `instanceof Prisma.PrismaClientKnownRequestError` : les specs
 * simulent ces rejets avec de simples littéraux `{ code: 'P2002' }`, jamais de vraies instances.
 * Un `instanceof` les laisserait remonter en 500 sous les tests tout en passant en production —
 * exactement le genre de divergence que le typage doit empêcher, pas introduire.
 */
export function hasPrismaErrorCode(e: unknown, code: string): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: unknown }).code === code;
}
