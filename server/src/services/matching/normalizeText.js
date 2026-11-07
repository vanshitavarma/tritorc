export const normalizeText = (text) => {
  if (typeof text !== 'string') return '';
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[-_—–/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};
