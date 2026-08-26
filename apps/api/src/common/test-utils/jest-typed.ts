/**
 * Enveloppes typées autour des utilitaires de `@types/jest` qui renvoient `any`.
 *
 * `expect.objectContaining()`, `expect.any()` et `mock.calls` sont typés `any` en amont : dès
 * qu'une valeur en sort, elle contamine tout ce qui l'accueille et les règles `no-unsafe-*`
 * remontent des centaines d'erreurs qui ne décrivent aucune dette réelle. Les enveloppes
 * ci-dessous confinent le `any` à ce seul fichier — le reste des specs manipule des types.
 *
 * Réservé aux specs (exclu de `tsconfig.build.json`, jamais importé par du code de production).
 */

/** `expect.objectContaining()` sans propager `any` au littéral qui accueille le matcher. */
export function objectLike(shape: Record<string, unknown>): unknown {
  return expect.objectContaining(shape) as unknown;
}

/** `expect.arrayContaining()` sans propager `any`. */
export function arrayLike(items: unknown[]): unknown {
  return expect.arrayContaining(items) as unknown;
}

/** `expect.any()` sans propager `any` — `ctor` est un constructeur (String, Number, Date…). */
export function anyOf(ctor: unknown): unknown {
  return expect.any(ctor) as unknown;
}

/** `expect.stringContaining()` sans propager `any`. */
export function stringLike(fragment: string): unknown {
  return expect.stringContaining(fragment) as unknown;
}

/**
 * Argument d'un appel enregistré par un mock, relu avec le type que le test attend.
 *
 * `jest.fn()` sans signature explicite type ses arguments en `any` : sans cette relecture, la
 * moindre navigation dans `mock.calls[0][0]` remonte en `no-unsafe-member-access`. Le type est
 * affirmé par l'appelant — c'est un test, il sait ce qu'il a passé au mock.
 */
export function callArg<T>(mock: jest.Mock, callIndex = 0, argIndex = 0): T {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  return mock.mock.calls[callIndex][argIndex] as T;
}

/**
 * Liste des appels enregistrés par un mock, relue avec le tuple d'arguments attendu par le test.
 * Même raison que `callArg` : `jest.fn()` sans signature type ses arguments en `any`.
 */
export function mockCalls<TArgs extends unknown[]>(mock: jest.Mock): TArgs[] {
  return mock.mock.calls as TArgs[];
}
