/**
 * Rogne les espaces d'une valeur entrante avant validation, et laisse tout le reste intact.
 *
 * Extrait des 8 DTO qui répétaient ce lambda à l'identique (AD-17 : extraction, jamais
 * duplication). `TransformFnParams.value` est typé `any` par class-transformer, ce qui faisait
 * remonter la valeur en `any` dans chaque DTO ; le paramètre est ici ramené à `unknown` pour que
 * le narrowing `typeof` soit le seul chemin d'accès à la chaîne.
 */
export function trimIfString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}
