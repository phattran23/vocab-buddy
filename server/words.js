import { DAILY_TOPICS } from './words-daily.js';
import { BEGINNER } from './toeic-beginner.js';
import { INTERMEDIATE } from './toeic-intermediate.js';
import { ADVANCED } from './toeic-advanced.js';

// TOEIC rows are [word, ipa, pos, vi, example, example-vi]; abstract words get no photo (q: '').
const toeic = (level, topics) => topics.map((t) => ({
  slug: t.slug, name: t.name, emoji: t.emoji, color: t.color, level,
  words: t.words.map(([word, ph, pos, vi, ex, exVi]) => ({ word, ph, pos, vi, ex, exVi, def: '', emoji: t.emoji, q: '' })),
}));
// Starter content. `q` overrides the image search query when the word alone is ambiguous.
export const TOPICS = [
  {
    slug: 'animals', name: 'Animals', emoji: '🐶', color: '#ff9f43',
    words: [
      { word: 'cat', vi: 'con mèo', ph: '/kæt/', def: 'A small furry pet that purrs.', ex: 'The cat sleeps on the sofa.', emoji: '🐱' },
      { word: 'dog', vi: 'con chó', ph: '/dɒɡ/', def: 'A friendly pet that barks.', ex: 'My dog loves to play fetch.', emoji: '🐶' },
      { word: 'elephant', vi: 'con voi', ph: '/ˈelɪfənt/', def: 'A huge grey animal with a long trunk.', ex: 'The elephant sprayed water with its trunk.', emoji: '🐘' },
      { word: 'rabbit', vi: 'con thỏ', ph: '/ˈræbɪt/', def: 'A small animal with long ears that hops.', ex: 'The rabbit ate a carrot.', emoji: '🐰' },
      { word: 'lion', vi: 'sư tử', ph: '/ˈlaɪən/', def: 'A big wild cat, the king of the jungle.', ex: 'The lion roared loudly.', emoji: '🦁' },
      { word: 'fish', vi: 'con cá', ph: '/fɪʃ/', def: 'An animal that lives and swims in water.', ex: 'The fish swam in the bowl.', emoji: '🐟', q: 'goldfish' },
      { word: 'bird', vi: 'con chim', ph: '/bɜːd/', def: 'An animal with feathers and wings.', ex: 'A bird sang in the tree.', emoji: '🐦' },
      { word: 'monkey', vi: 'con khỉ', ph: '/ˈmʌŋki/', def: 'A clever animal that climbs trees.', ex: 'The monkey ate a banana.', emoji: '🐵' },
    ],
  },
  {
    slug: 'food', name: 'Food', emoji: '🍎', color: '#ff6b9d',
    words: [
      { word: 'apple', vi: 'quả táo', ph: '/ˈæpl/', def: 'A round red or green fruit.', ex: 'I eat an apple every day.', emoji: '🍎' },
      { word: 'banana', vi: 'quả chuối', ph: '/bəˈnɑːnə/', def: 'A long yellow fruit.', ex: 'Monkeys love bananas.', emoji: '🍌' },
      { word: 'bread', vi: 'bánh mì', ph: '/bred/', def: 'Baked food made from flour.', ex: 'She made a sandwich with bread.', emoji: '🍞' },
      { word: 'cheese', vi: 'phô mai', ph: '/tʃiːz/', def: 'A food made from milk.', ex: 'Mice love cheese.', emoji: '🧀' },
      { word: 'egg', vi: 'quả trứng', ph: '/eɡ/', def: 'An oval food laid by a hen.', ex: 'I had an egg for breakfast.', emoji: '🥚' },
      { word: 'milk', vi: 'sữa', ph: '/mɪlk/', def: 'A white drink from cows.', ex: 'Drink your milk!', emoji: '🥛', q: 'glass of milk' },
      { word: 'rice', vi: 'cơm / gạo', ph: '/raɪs/', def: 'Small white grains eaten as food.', ex: 'We eat rice with fish.', emoji: '🍚', q: 'bowl of rice' },
      { word: 'pizza', vi: 'bánh pizza', ph: '/ˈpiːtsə/', def: 'A flat round bread with cheese on top.', ex: 'Let’s order a pizza tonight.', emoji: '🍕' },
    ],
  },
  {
    slug: 'travel', name: 'Travel', emoji: '✈️', color: '#4cc9f0',
    words: [
      { word: 'airplane', vi: 'máy bay', ph: '/ˈeəpleɪn/', def: 'A vehicle that flies in the sky.', ex: 'The airplane landed at noon.', emoji: '✈️' },
      { word: 'passport', vi: 'hộ chiếu', ph: '/ˈpɑːspɔːt/', def: 'A document you need to travel abroad.', ex: 'Don’t forget your passport!', emoji: '🛂' },
      { word: 'suitcase', vi: 'va li', ph: '/ˈsuːtkeɪs/', def: 'A bag for carrying clothes on a trip.', ex: 'She packed her suitcase.', emoji: '🧳' },
      { word: 'hotel', vi: 'khách sạn', ph: '/həʊˈtel/', def: 'A place where travellers stay and sleep.', ex: 'We stayed in a hotel by the sea.', emoji: '🏨' },
      { word: 'beach', vi: 'bãi biển', ph: '/biːtʃ/', def: 'A sandy place next to the sea.', ex: 'The kids built a castle on the beach.', emoji: '🏖️' },
      { word: 'map', vi: 'bản đồ', ph: '/mæp/', def: 'A drawing that shows places and roads.', ex: 'Look at the map to find the way.', emoji: '🗺️', q: 'world map' },
      { word: 'ticket', vi: 'vé', ph: '/ˈtɪkɪt/', def: 'A paper or card that lets you travel or enter.', ex: 'I bought a train ticket.', emoji: '🎫' },
      { word: 'train', vi: 'tàu hỏa', ph: '/treɪn/', def: 'A long vehicle that runs on rails.', ex: 'The train arrives at six.', emoji: '🚆' },
    ],
  },
  ...DAILY_TOPICS,
  ...toeic('beginner', BEGINNER),
  ...toeic('intermediate', INTERMEDIATE),
  ...toeic('advanced', ADVANCED),
];
