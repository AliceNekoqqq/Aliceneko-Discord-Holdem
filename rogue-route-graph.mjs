const nodeId = (node) => typeof node === 'string' ? node : node?.id;

export function nextNodeIds(plan, fromId) {
  if (fromId == null) return (plan?.nodes?.[0] ?? []).map(nodeId);
  return (plan?.edges ?? []).filter((edge) => edge.from === fromId).map((edge) => edge.to);
}

export function reachableNodeIds(plan, fromId) {
  const seen = new Set();
  const queue = [fromId];
  while (queue.length) {
    const current = queue.shift();
    for (const id of nextNodeIds(plan, current)) if (!seen.has(id)) { seen.add(id); queue.push(id); }
  }
  return [...seen];
}

export function isConnectedPlan(plan) {
  const rows = plan?.nodes;
  if (!Number.isInteger(plan?.act) || plan.act < 1 || plan.act > 3 || !Array.isArray(rows) || rows.length !== 4 || rows.some((row) => !Array.isArray(row) || row.length !== 3)) return false;
  const ids = rows.flat().map(nodeId);
  const bossId = `a${plan.act}s5boss`;
  if (ids.some((id, i) => id !== `a${plan.act}s${Math.floor(i / 3) + 1}n${i % 3}`) || new Set(ids).size !== 12 || ids.includes(bossId)) return false;
  const known = new Set([...ids, bossId]);
  if (!Array.isArray(plan.edges)) return false;
  const pairs = new Set();
  for (const edge of plan.edges) {
    if (!edge || typeof edge !== 'object' || typeof edge.from !== 'string' || typeof edge.to !== 'string' || !known.has(edge.from) || !known.has(edge.to)) return false;
    const key = `${edge.from}>${edge.to}`;
    if (pairs.has(key)) return false;
    pairs.add(key);
  }
  for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
    const from = nodeId(rows[row][col]);
    const targets = nextNodeIds(plan, from);
    const expected = (col === 1 ? [0, 1, 2] : [col, 1]).map((targetCol) => nodeId(rows[row + 1][targetCol]));
    if (targets.length !== expected.length || expected.some((id) => !targets.includes(id))) return false;
  }
  const expectedEdges = [];
  for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
    const from = nodeId(rows[row][col]);
    for (const targetCol of (col === 1 ? [0, 1, 2] : [col, 1])) expectedEdges.push(`${from}>${nodeId(rows[row + 1][targetCol])}`);
  }
  for (const n of rows[3]) expectedEdges.push(`${nodeId(n)}>${bossId}`);
  if (pairs.size !== 24 || expectedEdges.some((edge) => !pairs.has(edge))) return false;
  if (plan.edges.some((edge) => edge.to === bossId && !rows[3].some((n) => nodeId(n) === edge.from))) return false;
  for (const n of rows[0]) if (!reachableNodeIds(plan, nodeId(n)).includes(bossId)) return false;
  return true;
}

export function routeAvailability(run, plan, slot) {
  const nodes = structuredClone(plan?.nodes?.[slot - 1] ?? []);
  const path = run?.path?.filter((entry) => entry.act === run.act) ?? [];
  const previous = path.at(-1);
  const previousCol = previous?.nodeId?.match(new RegExp(`^a${run.act}s${slot - 1}n([0-2])$`));
  const sequential = slot === 1 ? path.length === 0 : previous?.slot === slot - 1 && Boolean(previousCol);
  const reachable = new Set(sequential ? nextNodeIds(plan, previous?.nodeId ?? null) : []);
  const camps = path.filter((entry) => entry.type === 'camp').length;
  for (const node of nodes) {
    node.available = reachable.has(node.id);
    node.disabledReason = node.available ? null : '这条支路无法抵达';
    if (node.available && node.type === 'camp' && camps >= 1) { node.available = false; node.disabledReason = '本幕营地次数已达上限'; }
  }
  return { nodes, choices: nodes.filter((node) => node.available).map((node) => node.id) };
}
