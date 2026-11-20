/* Pick&Bloom activity bank: the 12 families from "Pick One!" (Kids_Pick_One_Activity_Button_Bank.pdf). */
(function (root) {
  'use strict';

  function a(id, label, emoji) { return { id, label, emoji }; }

  const FAMILIES = [
    { id: 'move', name: 'Move My Body', color: '#2a7a46', light: '#e0f4e4', activities: [
      a('run', 'Run', '🏃'), a('jump', 'Jump', '🦘'), a('walk', 'Walk', '🚶'),
      a('bike', 'Bike', '🚲'), a('scooter', 'Scooter', '🛴'), a('swim', 'Swim', '🏊'),
      a('soccer', 'Soccer', '⚽'), a('dance', 'Dance', '💃'), a('climb', 'Climb', '🧗'),
      a('stretch', 'Stretch', '🙆'), a('yoga', 'Yoga', '🧘'), a('obstacle-course', 'Obstacle Course', '🚧'),
    ] },
    { id: 'learn', name: 'Learn & Think', color: '#2b67a8', light: '#ddeefc', activities: [
      a('read', 'Read', '📖'), a('write', 'Write', '✏️'), a('count', 'Count', '🔢'),
      a('phonics', 'Phonics', '🔤'), a('puzzle', 'Puzzle', '🧩'), a('maze', 'Maze', '🌀'),
      a('lego', 'Lego', '🧱'), a('science', 'Science', '🔬'), a('memory-game', 'Memory Game', '🃏'),
      a('i-spy', 'I Spy', '🔍'), a('storytelling', 'Storytelling', '🗣️'), a('build', 'Build', '🏗️'),
      a('language', 'Language', '🌐'), a('speaking', 'Speaking', '🎙️'), a('listening', 'Listening', '👂'),
    ] },
    { id: 'create', name: 'Create', color: '#7650a8', light: '#efe2fb', activities: [
      a('draw', 'Draw', '🖍️'), a('color', 'Color', '🎨'), a('paint', 'Paint', '🖌️'),
      a('play-doh', 'Play-Doh', '🤲'), a('craft', 'Craft', '✂️'), a('sing', 'Sing', '🎤'),
      a('dance', 'Dance', '🕺'), a('act', 'Act', '🎭'), a('puppet-show', 'Puppet Show', '🧦'),
      a('make-music', 'Make Music', '🥁'), a('build', 'Build', '🏰'), a('make-a-story', 'Make a Story', '📝'),
    ] },
    { id: 'play', name: 'Play', color: '#a86a00', light: '#fdefcf', activities: [
      a('hide-and-seek', 'Hide & Seek', '🙈'), a('tag', 'Tag', '👉'), a('bubbles', 'Bubbles', '🫧'),
      a('balloon-play', 'Balloon Play', '🎈'), a('board-game', 'Board Game', '🎲'), a('card-game', 'Card Game', '🃏'),
      a('toys', 'Toys', '🧸'), a('cars', 'Cars', '🚗'), a('superhero', 'Superhero', '🦸'),
      a('dinosaurs', 'Dinosaurs', '🦖'), a('treasure-hunt', 'Treasure Hunt', '🗺️'), a('pretend-play', 'Pretend Play', '👑'),
    ] },
    { id: 'outdoor', name: 'Outdoor Adventure', color: '#4f7d2c', light: '#e3f3da', activities: [
      a('cycle', 'Cycle', '🚴'), a('scooter', 'Scooter', '🛴'), a('playground', 'Playground', '🛝'),
      a('nature-walk', 'Nature Walk', '🌳'), a('hike', 'Hike', '🥾'), a('garden', 'Garden', '🌱'),
      a('bug-hunt', 'Bug Hunt', '🐞'), a('bird-watch', 'Bird Watch', '🐦'), a('leaf-hunt', 'Leaf Hunt', '🍂'),
      a('rock-hunt', 'Rock Hunt', '🪨'), a('ball-play', 'Ball Play', '🏀'), a('picnic', 'Picnic', '🧺'),
    ] },
    { id: 'friends', name: 'Friendship', color: '#a8436a', light: '#fde0e8', activities: [
      a('play-with-friend', 'Play with Friend', '👫'), a('build-together', 'Build Together', '🧱'), a('team-game', 'Team Game', '🏅'),
      a('take-turns', 'Take Turns', '🔄'), a('share', 'Share', '🍪'), a('help-someone', 'Help Someone', '🙋'),
      a('invite-a-friend', 'Invite a Friend', '💌'), a('compliment', 'Compliment', '🌟'), a('gentle-play', 'Gentle Play', '🕊️'),
      a('game-together', 'Game Together', '🎯'),
    ] },
    { id: 'calm', name: 'Calm My Body', color: '#237a73', light: '#dcf5f1', activities: [
      a('deep-breaths', 'Deep Breaths', '🌬️'), a('yoga', 'Yoga', '🧘'), a('stretch', 'Stretch', '🙆'),
      a('quiet-reading', 'Quiet Reading', '📚'), a('color', 'Color', '🖍️'), a('puzzle', 'Puzzle', '🧩'),
      a('calm-music', 'Calm Music', '🎶'), a('watch-clouds', 'Watch Clouds', '☁️'), a('cuddle', 'Cuddle', '🤗'),
      a('rest', 'Rest', '😌'),
    ] },
    { id: 'feelings', name: 'Feelings', color: '#a5532e', light: '#fde4da', activities: [
      a('name-my-feeling', 'Name My Feeling', '🏷️'), a('emotion-charades', 'Emotion Charades', '🎭'), a('teddys-problem', "Teddy's Problem", '🧸'),
      a('stop-breathe-choose', 'Stop-Breathe-Choose', '🛑'), a('talk-about-my-day', 'Talk About My Day', '💬'), a('say-sorry', 'Say Sorry', '💗'),
      a('use-words', 'Use Words', '🗨️'), a('proud-moment', 'Proud Moment', '🏆'),
    ] },
    { id: 'ican', name: 'I Can Do It', color: '#9a7212', light: '#fdf1d6', activities: [
      a('make-bed', 'Make Bed', '🛏️'), a('clean-toys', 'Clean Toys', '🧹'), a('organize-books', 'Organize Books', '📚'),
      a('water-plants', 'Water Plants', '🪴'), a('help-laundry', 'Help Laundry', '🧺'), a('set-table', 'Set Table', '🍽️'),
      a('organize-shoes', 'Organize Shoes', '👟'), a('carry-plate', 'Carry Plate', '🍛'), a('pack-bag', 'Pack Bag', '🎒'),
      a('brush-teeth', 'Brush Teeth', '🪥'),
    ] },
    { id: 'chef', name: 'Little Chef', color: '#a95d24', light: '#fde3cf', activities: [
      a('wash-fruit', 'Wash Fruit', '🍎'), a('peel-banana', 'Peel Banana', '🍌'), a('mix', 'Mix', '🥣'),
      a('pour', 'Pour', '🫗'), a('measure', 'Measure', '🥄'), a('make-sandwich', 'Make Sandwich', '🥪'),
      a('fruit-bowl', 'Fruit Bowl', '🍇'), a('smoothie', 'Smoothie', '🥤'), a('set-table', 'Set Table', '🍴'),
      a('clean-up', 'Clean Up', '🧽'),
    ] },
    { id: 'imagine', name: 'Imagination World', color: '#5a4aa5', light: '#e6e1fb', activities: [
      a('doctor', 'Doctor', '🩺'), a('chef', 'Chef', '🧑‍🍳'), a('teacher', 'Teacher', '🧑‍🏫'),
      a('firefighter', 'Firefighter', '🚒'), a('astronaut', 'Astronaut', '🚀'), a('scientist', 'Scientist', '🧪'),
      a('superhero', 'Superhero', '🦸'), a('dinosaur-explorer', 'Dinosaur Explorer', '🦕'), a('shopkeeper', 'Shopkeeper', '🏪'),
      a('mechanic', 'Mechanic', '🔧'), a('vet', 'Vet', '🐶'), a('camping', 'Camping', '⛺'),
    ] },
    { id: 'bedtime', name: 'Quiet & Bedtime', color: '#445f9c', light: '#e1e8f7', activities: [
      a('read-a-book', 'Read a Book', '📖'), a('made-up-story', 'Made-Up Story', '🌙'), a('lullaby', 'Lullaby', '🎵'),
      a('cuddle', 'Cuddle', '🤗'), a('slow-breaths', 'Slow Breaths', '🌬️'), a('happy-memory', 'Happy Memory', '💭'),
      a('gratitude', 'Gratitude', '🙏'), a('best-part-of-day', 'Best Part of Day', '⭐'),
    ] },
    // Added for the family (not in the printed PDF): everyday hygiene habits.
    { id: 'hygiene', name: 'Clean & Healthy', color: '#1f7a99', light: '#ddf3fa', activities: [
      a('bath', 'Bath', '🛁'), a('morning-brush', 'Morning Brush', '🪥'), a('night-brush', 'Night Brush', '🌙'),
      a('wash-hands', 'Wash Hands', '🧼'), a('wash-face', 'Wash Face', '💦'), a('wipe-nose', 'Wipe Nose', '🤧'),
      a('tissue-in-bin', 'Tissue in Bin', '🗑️'), a('cover-cough', 'Cover Cough', '😷'), a('potty-time', 'Potty Time', '🚽'),
      a('comb-hair', 'Comb Hair', '💇'), a('clean-clothes', 'Clean Clothes', '👕'), a('trim-nails', 'Trim Nails', '💅'),
    ] },
  ];

  const api = { FAMILIES };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PB = Object.assign(root.PB || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
