const VALID_RACES = [
    'DRAGON_VERT',
    'DRAGON_BLEU',
    'DRAGON_ROUGE',
    'DRAGON_NOIR',
];
export function validateHommeDragon(data, catalog) {
    const errors = [];
    if (!data.nom?.trim()) {
        errors.push({ field: 'nom', message: 'Le nom est obligatoire' });
    }
    if (!data.race || !VALID_RACES.includes(data.race)) {
        errors.push({
            field: 'race',
            message: `Race invalide. Races acceptées : ${VALID_RACES.join(', ')}`,
        });
    }
    const entry = catalog.find((e) => e.key === data.artefact?.key);
    if (!data.artefact?.key || !entry || entry.race !== data.race) {
        errors.push({
            field: 'artefact.key',
            message: "L'artefact choisi doit appartenir à la race sélectionnée",
        });
    }
    return { valid: errors.length === 0, errors };
}
