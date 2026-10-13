// Only gameplay changes make an upgrade useful; labels and descriptions do not.
export function hasUsefulUpgrade(card){
 if(!card?.upgrade)return false;
 const upgraded={...card,...card.upgrade};
 const gameplay=c=>JSON.stringify([c.cost??0,c.selfCost??0,Boolean(c.exhaust),Boolean(c.replayable),c.effects??[]]);
 return gameplay(card)!==gameplay(upgraded);
}
