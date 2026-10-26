// The navigation map: which layout each kind spreads into, how a spread is shown,
// and what each gesture does at each level. Change the wiring here, nowhere else.
import { settings } from './settings.js';

// Beats lay out as the Thread. The people web, place map and idea inbox arrive in milestone 4;
// until then those piles spread as a loose scatter.
export const LAYOUT_OF = { b: 'thread', p: 'scatter', l: 'scatter', i: 'scatter', q: 'scatter' };

// On the table, as its own screen, or in a pop-up sheet (switch in the tuning panel).
export const stageFor = () => settings.stage;

export const GESTURES = {
  deck: { tapDeck: 'cut' },
  piles: { tapPile: 'spread', flingPile: 'spread' },
  spread: { drag: 'glide', tapCard: 'lift', holdCard: 'move' },
  lifted: { tapCard: 'write', tapTable: 'setBack', swipeLeft: 'next', swipeRight: 'prev', swipeUp: 'connections', swipeDown: 'setBack' },
  conn: { tapCard: 'lift', swipeDown: 'back', tapTable: 'back' }
};

export const HOLD_MS = 380;   // how long a press must last to pick a card up
export const SLOP = 9;        // how far a finger can wander and still be a tap (px)
