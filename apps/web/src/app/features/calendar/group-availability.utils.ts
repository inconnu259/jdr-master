import type { SlotMemberDto } from '@master-jdr/shared';

/**
 * Story 36.8 — la disponibilité du groupe, sur un canal séparé (FR-53).
 *
 * Fonctions pures, testées sans TestBed (patron `poll-track.utils.ts` / `day-detail.utils.ts`).
 * Elles ne connaissent ni Angular ni HTTP : elles projettent une donnée déjà chargée
 * (`AggregatedSlotDto`) vers la forme qu'affichent les quatre surfaces.
 *
 * 🚨 **La règle fondatrice : le groupe n'est PAS un rang.** Il a été sorti de la préséance le
 * 2026-08-17 (`EXPERIENCE.md:253`) parce qu'au dernier rang il devenait invisible dès qu'une
 * déclaration ou une séance existait — c'est-à-dire presque toujours. *Une couche qu'on n'allume
 * que pour ne rien voir ne sert à rien.* Il vit donc sur **un autre canal** : le fond de la bande
 * dit MA situation, la jauge dit celle du groupe, et les deux cohabitent.
 *
 * 🚨 **Deux vides à ne pas confondre** (`EXPERIENCE.md:308`, `DESIGN.md` §7.9 bis) : jauge
 * **pleine en rouge** = tout le monde est bloqué ; jauge **vide** = personne de disponible *et*
 * personne ne s'est prononcé. Ce ne sont pas les mêmes informations.
 */

/** Un membre de la troupe et son statut sur le créneau, tel que les surfaces le consomment.
 *  Repris tel quel du serveur — aucune projection, aucun re-tri : **l'ordre est celui reçu**,
 *  c'est lui qui fait que la position identifie la personne. */
export type GroupMember = SlotMemberDto;

/** La disponibilité du groupe sur UN créneau.
 *
 *  `total` est l'effectif de la troupe — **le MJ compris** (`participantCount()` côté serveur),
 *  le même dénominateur que `VoteParticipation.total`. Les deux canaux d'une même bande ne
 *  doivent jamais compter la troupe différemment (défaut corrigé par la story 36.6). */
export interface GroupAvailability {
  available: number;
  unavailable: number;
  unknown: number;
  total: number;
  /** Le détail nominatif, **servi au seul MJ** (`AggregatedSlotDto.members`). `null` = le serveur
   *  n'en a pas servi, donc la surface rend une jauge.
   *
   *  🚨 **`null`, jamais `undefined`** (AD-10 : une seule représentation de « rien »), et
   *  **jamais un tableau vide pour dire « pas d'identités »** : `[]` voudrait dire « une troupe
   *  de zéro personne », ce qui n'est pas la même chose que « je n'ai pas le droit de savoir ». */
  members: GroupMember[] | null;
}

/** Le seuil au-delà duquel les pastilles cèdent la place à la jauge (AC5, `EXPERIENCE.md:305`).
 *  Écrit une fois : la surface ne le redécide pas. */
export const GROUP_PASTILLE_MAX = 6;

/**
 * Ramène une valeur à un entier fini et positif.
 *
 * 🚨 Même garde que `safeCount()` de `poll-track.utils.ts`, et pour le même motif RÉEL : quand le
 * serveur ne sert pas encore un agrégat (client neuf, API en retard — l'état transitoire d'un
 * déploiement), les champs arrivent `undefined` et la valeur finit dans un attribut `style`. Le
 * typage ne protège de rien : la charge utile vient du réseau.
 */
function safeCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Vrai quand la surface doit rendre **une pastille par membre** plutôt qu'une jauge (AC4/AC5).
 *
 * 🚨 **La forme suit la DONNÉE, jamais un drapeau de rôle.** `isMjMode()` dérive de la route, pas
 * du rôle réel sur la partie ; le serveur, lui, est la seule autorité sur qui reçoit des
 * identités (garde `isMj` de `getHeatmap`). Tester la présence de la liste, c'est déléguer la
 * décision à la seule instance qui la connaisse — même raisonnement que `mjSlots`, qui teste
 * `'members' in s` et non le mode.
 */
export function showsMemberPastilles(group: GroupAvailability): boolean {
  const members = group.members;
  return members !== null && members.length > 0 && members.length <= GROUP_PASTILLE_MAX;
}

/**
 * La hauteur remplie de la jauge, en pourcentage — remplie **par le bas**, à proportion des
 * membres disponibles (`DESIGN.md` §7.9 bis).
 *
 * Bornée comme `trackSegments()` : effectif nul ⇒ zéro (jamais une division par zéro ni un
 * `NaN%` dans un attribut `style`), et plus de disponibles que de membres (effectif périmé)
 * ⇒ 100 %, jamais au-delà.
 */
export function groupFillRatio(group: GroupAvailability): number {
  const total = safeCount(group.total);
  if (total <= 0) return 0;
  return Math.min(100, (safeCount(group.available) / total) * 100);
}

/**
 * Vrai quand **tout le monde** est bloqué — la jauge est alors **pleine, en rouge** (AC6).
 *
 * 🚨 Réservé à `unavailable === total`, littéralement « tout le monde ». Le cas intermédiaire
 * (personne de disponible, une partie du groupe bloquée, le reste muet) rend une jauge **vide** :
 * c'est une décision de la story 36.8, qu'aucun document amont ne tranchait. La nuance n'est pas
 * perdue pour autant — elle vit dans le nom accessible, qui dit toujours les trois nombres.
 */
export function groupIsAllBlocked(group: GroupAvailability): boolean {
  const total = safeCount(group.total);
  return total > 0 && safeCount(group.unavailable) >= total;
}

/**
 * Le nom accessible du canal (AC15).
 *
 * 🚨 **Sans texte, ce canal n'existe pas pour un lecteur d'écran** : la jauge code par la
 * PROPORTION et les pastilles par la POSITION — ni l'une ni l'autre n'est lisible. Il dit donc
 * toujours les trois nombres, y compris ceux qui valent zéro quand ils portent l'information :
 * c'est **la seule** façon de distinguer les deux vides autrement que par la couleur (P-1).
 *
 * Les identités ne sont énoncées que si le serveur en a servi — la fonction ne peut structurellement
 * pas en inventer.
 */
export function groupAriaLabel(group: GroupAvailability): string {
  const total = safeCount(group.total);
  const available = Math.min(safeCount(group.available), total);
  const unavailable = Math.min(safeCount(group.unavailable), total);

  const parts = [
    `Disponibilité du groupe : ${available} sur ${total} disponible${available > 1 ? 's' : ''}`,
  ];

  // Les deux vides, dits en toutes lettres — c'est ici que l'AC6 tient sans la couleur.
  if (groupIsAllBlocked(group)) {
    parts.push('tout le monde est bloqué');
  } else if (available === 0 && unavailable === 0) {
    parts.push("personne ne s'est prononcé");
  } else if (unavailable > 0) {
    parts.push(`${unavailable} indisponible${unavailable > 1 ? 's' : ''}`);
  }

  const members = group.members;
  if (members !== null && members.length > 0) {
    parts.push(members.map((m) => `${m.displayName} ${memberStatusWord(m)}`).join(', '));
  }

  return parts.join(' — ');
}

/** Le statut d'un membre, **en toutes lettres**. Point unique du vocabulaire du canal : les
 *  surfaces n'en écrivent jamais un second (même règle qu'`answerLabel()` pour le vote). */
export function memberStatusWord(member: GroupMember): string {
  switch (member.status) {
    case 'AVAILABLE':
      return 'disponible';
    case 'UNAVAILABLE':
      return 'indisponible';
    default:
      return 'sans réponse';
  }
}

/** La version courte de `memberStatusWord()`, pour les largeurs où le mot entier ne tient plus
 *  (rail sous 500 px). Un glyphe, jamais la seule couleur (P-1) : la couleur du nom et ce
 *  caractère portent la même information, redondante par construction. */
export function memberStatusGlyph(member: GroupMember): string {
  switch (member.status) {
    case 'AVAILABLE':
      return 'D';
    case 'UNAVAILABLE':
      return 'I';
    default:
      return '?';
  }
}

/** Le compteur qui double la forme là où il y a la place (rail, Agenda) — « 2 / 4 ».
 *  Borné comme `counterLabel()` du vote : un effectif périmé n'affiche jamais « 5 / 4 ». */
export function groupCounterLabel(group: GroupAvailability): string {
  const total = safeCount(group.total);
  return `${Math.min(safeCount(group.available), total)} / ${total}`;
}
