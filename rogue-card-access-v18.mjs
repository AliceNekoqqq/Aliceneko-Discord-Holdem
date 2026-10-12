export function cardAllowed(catalog, id, professionId) {
  const card = catalog?.cards?.[id];
  if (!card) return false;
  return !card.professionOnly || card.professionOnly === professionId;
}
