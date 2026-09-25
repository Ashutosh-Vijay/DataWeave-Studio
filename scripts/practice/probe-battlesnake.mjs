/**
 * Could a DataWeave script actually play Battlesnake?
 *
 * The game gives a snake roughly 500ms to answer per turn. This runs a
 * realistic move script — wall avoidance, self avoidance, opponent avoidance,
 * and a nudge towards food — against a realistic 11x11 board, warm, the way it
 * would run in a game.
 */
import { openEngine } from '../dwEngine.mjs';

const MOVE = `%dw 2.0
// \`some\` is NOT in core — this is the import the first draft of this probe
// forgot, and the engine said so in 6ms.
import * from dw::core::Arrays
output application/json
var me = payload.you
var head = me.head
var w = payload.board.width
var h = payload.board.height
// Every square any snake currently occupies. Tails are included, which is
// slightly pessimistic — a tail moves away unless the snake just ate.
var blocked = flatten(payload.board.snakes map ((s) -> s.body))
var options = [
  { dir: "up",    x: head.x,     y: head.y + 1 },
  { dir: "down",  x: head.x,     y: head.y - 1 },
  { dir: "left",  x: head.x - 1, y: head.y },
  { dir: "right", x: head.x + 1, y: head.y }
]
var safe = options filter ((o) ->
  (o.x >= 0) and (o.x < w) and (o.y >= 0) and (o.y < h)
  and not (blocked some ((b) -> b.x == o.x and b.y == o.y))
)
// Closest food by manhattan distance, then head towards it.
var target = (payload.board.food orderBy ((f) -> abs(f.x - head.x) + abs(f.y - head.y)))[0]
var best = if (target != null and !isEmpty(safe))
    (safe orderBy ((o) -> abs(o.x - target.x) + abs(o.y - target.y)))[0]
  else if (!isEmpty(safe)) safe[0]
  else options[0]
---
{ move: best.dir, shout: "heading " ++ best.dir }`;

// A believable mid-game board: 11x11, four snakes, scattered food.
const snake = (id, cells) => ({
  id,
  name: id,
  health: 80,
  body: cells.map(([x, y]) => ({ x, y })),
  head: { x: cells[0][0], y: cells[0][1] },
  length: cells.length,
});
const board = {
  game: { id: 'probe' },
  turn: 87,
  board: {
    width: 11,
    height: 11,
    food: [{ x: 2, y: 9 }, { x: 8, y: 3 }, { x: 5, y: 5 }, { x: 0, y: 0 }],
    hazards: [],
    snakes: [
      snake('me', [[5, 6], [5, 5], [5, 4], [4, 4], [3, 4], [3, 5], [3, 6]]),
      snake('b', [[8, 8], [8, 7], [8, 6], [7, 6], [6, 6]]),
      snake('c', [[1, 2], [1, 3], [2, 3], [2, 4]]),
      snake('d', [[9, 1], [9, 2], [9, 3]]),
    ],
  },
};
board.you = board.board.snakes[0];

const dw = await openEngine({ quiet: true });
const payload = JSON.stringify(board);

const first = await dw.run(MOVE, { payload });
console.log('cold  :', first.ok ? `${first.output.replace(/\s+/g, ' ')}  ${first.ms}ms` : 'ERROR ' + first.error.split('\n')[0]);

const times = [];
for (let i = 0; i < 40; i++) {
  const r = await dw.run(MOVE, { payload });
  if (!r.ok) { console.log('ERROR', r.error.split('\n')[0]); break; }
  times.push(r.ms);
}
times.sort((a, b) => a - b);
console.log(
  `warm  : ${times.length} turns — median ${times[Math.floor(times.length / 2)]}ms, ` +
  `p95 ${times[Math.floor(times.length * 0.95)]}ms, worst ${times.at(-1)}ms`,
);
console.log(`budget: Battlesnake allows ~500ms per move.`);

dw.close();
