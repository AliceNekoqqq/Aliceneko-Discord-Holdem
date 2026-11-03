// Four-seat presentation model for the warehouse auction.
//
// It only reads bids the server has already published (`session.history`).
// Opponents' offers stay sealed until the human submits, so a round with no
// history entry is rendered as "sealed" instead of being guessed.

export const SEAT_COUNT = 4;
export const SEAT_ROUNDS = 5;

function isRound(value) {
  return Boolean(
    value &&
      Array.isArray(value.bids) &&
      value.bids.length === SEAT_COUNT &&
      value.bids.every((bid) => Number.isInteger(bid) && bid >= 0),
  );
}

function normalPriority(priority) {
  const ok =
    Array.isArray(priority) &&
    priority.length === SEAT_COUNT &&
    new Set(priority).size === SEAT_COUNT &&
    priority.every((n) => Number.isInteger(n) && n >= 0 && n < SEAT_COUNT);
  return ok ? priority : [0, 1, 2, 3];
}

function rankSeats(bids, order) {
  return [0, 1, 2, 3].sort(
    (a, b) => bids[b] - bids[a] || order.indexOf(a) - order.indexOf(b),
  );
}

export function buildSeatStage(input = {}) {
  const { history, priority, round, status, result, names } = input;
  const rounds = (Array.isArray(history) ? history : []).filter(isRound);
  const latest = rounds.length ? rounds[rounds.length - 1] : null;
  const order = normalPriority(priority);
  const bids = latest ? latest.bids : null;
  const settled = status !== "active";
  const winner =
    settled && Number.isInteger(result?.winner) ? result.winner : null;
  const ranked = bids ? rankSeats(bids, order) : [];
  const sorted = bids ? [...bids].sort((a, b) => b - a) : [];
  const top = sorted.length ? sorted[0] : 0;
  const second = sorted.length > 1 ? sorted[1] : 0;

  const seats = Array.from({ length: SEAT_COUNT }, (_, index) => {
    const bid = bids ? bids[index] : null;
    const leader = Boolean(bids) && bid > 0 && ranked[0] === index;
    const won = winner === index;
    let state = "sealed";
    if (won) state = "won";
    else if (bid !== null) state = bid === 0 ? "pass" : leader ? "top" : "bid";
    return {
      index,
      name: String(names?.[index] ?? `席位${index + 1}`),
      you: index === 0,
      bid,
      leader,
      winner: won,
      state,
    };
  });

  return {
    round: latest ? latest.round : Number.isInteger(round) ? round : 1,
    total: SEAT_ROUNDS,
    open: Boolean(bids),
    decided: Boolean(latest?.done),
    settled,
    winner,
    price: settled && Number.isFinite(result?.price) ? result.price : null,
    top,
    margin: Math.max(0, top - second),
    seats,
  };
}
