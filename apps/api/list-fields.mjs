import { PDFDocument } from 'pdf-lib';
import { readFile } from 'node:fs/promises';

const bytes = await readFile('/work/apps/api/game-systems/ryuutama/assets/Ryuutama-fiche_equipement_edit.pdf');
const doc = await PDFDocument.load(bytes);
const form = doc.getForm();
const fields = form.getFields();
const names = fields.map(f => f.getName()).sort();
console.log(JSON.stringify(names, null, 0));
console.log('TOTAL', names.length);
