/**
 * Types partagés entre l'API (NestJS) et le front (Angular).
 * Import type-only côté apps → effacé à la compilation, aucun coût runtime.
 */
/** Systèmes de jeu proposés (liste constante — le moteur de règles viendra au Palier 2). */
export const GAME_SYSTEMS = [
    { id: 'draconis', name: 'Draconis' },
    { id: 'conte-de-minuit', name: 'Conte de Minuit' },
    { id: 'ryuutama', name: 'Ryuutama' },
    { id: 'esteren', name: 'Esteren' },
];
/**
 * Dimensions du cadre portrait de l'export PDF Ryuutama, mesurées empiriquement en Story 4.6
 * (`apps/api/game-systems/ryuutama/assets/README.md`, section "Zone du portrait"). Consommées
 * par `PortraitCropper` (web) pour que son masque de prévisualisation rectangulaire corresponde
 * au cadre réel du PDF.
 *
 * **Dupliquées, pas partagées**, avec `PORTRAIT_WIDTH`/`PORTRAIT_HEIGHT` dans
 * `apps/api/src/characters/ryuutama-pdf.service.ts` : `@master-jdr/shared` est une frontière
 * **types uniquement, effacée au runtime** (CLAUDE.md/project-context.md), donc l'API ne peut
 * pas importer ces constantes comme valeurs (Jest ne transforme pas ce module en tant que
 * dépendance de workspace). Si ces valeurs changent, mettre à jour les deux emplacements.
 */
export const RYUUTAMA_PDF_PORTRAIT_WIDTH = 188.18;
export const RYUUTAMA_PDF_PORTRAIT_HEIGHT = 136.48;
export const RYUUTAMA_PDF_PORTRAIT_ASPECT_RATIO = RYUUTAMA_PDF_PORTRAIT_WIDTH / RYUUTAMA_PDF_PORTRAIT_HEIGHT;
