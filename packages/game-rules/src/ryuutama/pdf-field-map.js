/**
 * Options des dropdowns "Arme Fav" du PDF officiel — ne correspondent pas
 * littéralement aux labels du contenu seedé (accentuation/pluriel différents),
 * donc mappées explicitement plutôt que dérivées d'un label.
 */
const WEAPON_PDF_OPTION = {
    arc: 'Arc',
    'epee-courte': 'Epées courtes',
    'epee-longue': 'Epées longues',
    hache: 'Haches',
    lance: 'Lances',
};
/** Avertit (plutôt que d'échouer silencieusement) sur une catégorie d'arme hors des 5 connues du template PDF. */
function weaponPdfOption(weaponCategoryId) {
    const option = WEAPON_PDF_OPTION[weaponCategoryId];
    if (option === undefined) {
        console.warn(`[game-rules] Catégorie d'arme "${weaponCategoryId}" sans option PDF connue — champ "Arme Fav" laissé vide.`);
        return '';
    }
    return option;
}
/**
 * Mappe une fiche Ryuutama vers les champs AcroForm du fichier "edit"
 * (`Ryuutama_fiche_de_voyageur_big_edit.pdf`, 119 champs réels — vérifiés un par un
 * via pdf-lib, pas devinés).
 *
 * Champs du template volontairement non couverts (aucune donnée correspondante dans
 * `RyuutamaSheetData`/`DerivedStats` ce palier, ou hors scope) : créé le,
 * Homme dragon, Maladresses, Arme 2/3 (+ A2/A3 *), Protection 1-3 (+ P1-3 *),
 * Vêtement 1-6 (+ V1-6 effet-res). `Condition` (jauge dérivée VIG+ESP) et
 * `Encombrement` (limite d'encombrement) n'ont **aucun champ correspondant** sur ce
 * template officiel — vérifié exhaustivement sur les 119 champs, ce n'est pas un
 * oubli. `specialtyTypeId` (sous-choix Artisan) et `narrative.personality` n'ont pas
 * non plus de champ dédié sur ce template (les seuls champs narratifs disponibles
 * sont Nom/Sexe/Âge/Couleur représentative/Village natal) — non mappés pour la même
 * raison, volontairement.
 *
 * Depuis la Story 6.3 (capacités de montée de niveau) : `Paysage climat` (+ les 22 champs de
 * résistance par terrain) et les 6 statuts d'immunité (Blessé/Las/Empoisonné/Surexcité/Malade/
 * Choc) sont mappés dynamiquement depuis `data.levelUps[]` (capacités `landscape`/`immunity`),
 * via `content.capabilityLabels` — cf. bas de fonction. `Classe 2` (dropdown) est mappé de la
 * même façon pour la capacité `class` (niveau 5), ainsi que les Talent/Effet 4-6 correspondants
 * (`content.secondaryClassTalents`). `PX` est mappé depuis `content.xp`. Les 6 lignes du tableau
 * de talents (`talent 1`/`Talent 2-6`, `Effet 1-6`) remplissent aussi leurs 2 dropdowns
 * `Attribut 1.{i}.{0|1}` (i=0..5) depuis `TalentField.attributes`, si renseigné. Les capacités
 * `type` (niveau 6), `dragon-protection` (niveau 9) et `legendary-journey` (niveau 10) n'ont,
 * elles, **aucun** champ AcroForm dédié sur ce template (vérifié) — affichées en référence sur
 * la fiche web uniquement (`character-sheet.ts`), jamais dans le PDF.
 */
export function mapToPdfFields(data, derived, content) {
    const narrative = data.narrative ?? {};
    const attributes = data.attributes ?? { AGI: 0, ESP: 0, INT: 0, VIG: 0 };
    const equipment = data.equipment ?? { individual: [], contenants: [], animaux: [] };
    // `individual` est un InventoryItem[] (Story 6.4) — projeté sur les noms pour le champ texte
    // "Notes" ci-dessous. Story 14.1 : les anciennes entrées `group` (texte libre) sont désormais
    // fusionnées dans `individual` par la migration — plus de liste séparée à concaténer.
    const individualEquipment = (equipment.individual ?? []).map((item) => item.name);
    const homeAndMotivation = [narrative.homeTown, narrative.motivation]
        .filter((v) => Boolean(v?.trim()))
        .join(' — ');
    const levelUps = data.levelUps ?? [];
    // Niveau réellement appliqué (1 + nombre de montées de niveau validées) — jamais dérivé de
    // l'xp, cohérent avec `CharacterDto.level` (cf. `character.service.ts#toDto`).
    const level = 1 + levelUps.length;
    // Le tableau du template a 6 lignes (Talent 1-3 = classe primaire, Talent 4-6 = classe
    // secondaire si obtenue) — un slot par index, jamais fusionnées.
    const talentSlots = [...content.classTalents, ...(content.secondaryClassTalents ?? [])].slice(0, 6);
    const TALENT_FIELD_NAMES = ['talent 1', 'Talent 2', 'Talent 3', 'Talent 4', 'Talent 5', 'Talent 6'];
    const EFFET_FIELD_NAMES = ['Effet 1', 'Effet 2', 'Effet 3', 'Effet 4', 'Effet 5', 'Effet 6'];
    const talentFields = talentSlots.flatMap((talent, i) => {
        const rows = [
            { field: TALENT_FIELD_NAMES[i], value: talent.name, kind: 'text' },
            { field: EFFET_FIELD_NAMES[i], value: talent.effect, kind: 'text' },
        ];
        const [attr0, attr1] = talent.attributes ?? [];
        if (attr0)
            rows.push({ field: `Attribut 1.${i}.0`, value: attr0, kind: 'dropdown' });
        if (attr1)
            rows.push({ field: `Attribut 1.${i}.1`, value: attr1, kind: 'dropdown' });
        return rows;
    });
    const fields = [
        { field: 'Nom', value: narrative.name ?? '', kind: 'text' },
        { field: 'Joueur', value: content.ownerPseudo, kind: 'text' },
        { field: 'Sexe', value: narrative.sex ?? '', kind: 'text' },
        { field: 'Âge', value: narrative.age ?? '', kind: 'text' },
        { field: 'Niveau', value: String(level), kind: 'text' },
        { field: 'PX', value: String(content.xp ?? 0), kind: 'text' },
        { field: 'Type', value: content.typeLabel, kind: 'text' },
        { field: 'Objet fétiche', value: data.fetiqueObject ?? '', kind: 'text' },
        {
            field: 'Couleur représentative et autres signes particuliers',
            value: narrative.physicalTraits ?? '',
            kind: 'text',
        },
        {
            field: 'Village natal et raisons du départ',
            value: homeAndMotivation,
            kind: 'text',
        },
        { field: 'PV max', value: String(derived.PV), kind: 'text' },
        { field: 'PE max', value: String(derived.PE), kind: 'text' },
        { field: 'Initiative', value: String(derived.Initiative), kind: 'text' },
        { field: 'Arme 1', value: content.weaponLabel, kind: 'text' },
        { field: 'A1 prec', value: content.weaponTouchFormula, kind: 'text' },
        { field: 'A1 deg', value: content.weaponDamageFormula, kind: 'text' },
        {
            field: 'Notes',
            value: individualEquipment.join(', '),
            kind: 'text',
        },
        { field: 'Classe 1', value: content.classLabel, kind: 'dropdown' },
        {
            field: 'Arme Fav',
            value: weaponPdfOption(data.weaponCategoryId),
            kind: 'dropdown',
        },
        {
            field: 'AGI',
            value: String(attributes.AGI),
            kind: 'dropdown',
        },
        {
            field: 'ESP',
            value: String(attributes.ESP),
            kind: 'dropdown',
        },
        {
            field: 'INT',
            value: String(attributes.INT),
            kind: 'dropdown',
        },
        {
            field: 'VIG',
            value: String(attributes.VIG),
            kind: 'dropdown',
        },
        ...talentFields,
    ];
    if (content.landscapeDropdownValue) {
        fields.push({ field: 'Paysage climat', value: content.landscapeDropdownValue, kind: 'dropdown' });
    }
    // Capacités choisies via le LevelUpWizard (Story 6.3) — un champ par capacité résolue, aucun
    // champ poussé si la clé n'est pas trouvée dans le contenu seedé (dégradation silencieuse,
    // cohérent avec `weaponPdfOption`/le reste de cette fonction : jamais de crash sur une donnée
    // de contenu manquante).
    for (const entry of levelUps) {
        for (const { type, params } of entry.capabilities) {
            if (type === 'landscape') {
                const key = params.key;
                const label = key && content.capabilityLabels?.landscape?.[key];
                if (label)
                    fields.push({ field: label, value: '+2', kind: 'text' });
            }
            else if (type === 'immunity') {
                const key = params.key;
                const label = key && content.capabilityLabels?.immunity?.[key];
                if (label)
                    fields.push({ field: label, value: 'Immunisé', kind: 'text' });
            }
            else if (type === 'class') {
                const key = params.key;
                const label = key && content.capabilityLabels?.class?.[key];
                if (label)
                    fields.push({ field: 'Classe 2', value: label, kind: 'dropdown' });
            }
            // 'attribute' déjà reflété via les dropdowns AGI/ESP/INT/VIG ci-dessus (mutation directe de
            // sheetData.attributes par CharacterService.applyLevelUp). 'type'/'dragon-protection'/
            // 'legendary-journey' : aucun champ PDF dédié (cf. docblock ci-dessus).
        }
    }
    return fields;
}
