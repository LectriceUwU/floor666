"use strict";
// Site content. Edit this file to add, remove or reorder features; the page builds itself from it.
// Each category becomes a section (and a link in the navigation); each feature becomes a card.
//
// Category fields
//   id        anchor of the section (#gameplay) — keep it unique, no spaces
//   nav       short label for the navigation bar
//   code      small label above the title
//   title     section heading
//   features  list of cards
//
// Feature fields
//   id        unique slug; the card gets id="feature-<id>", handy to attach a custom visual to it later
//   title     card heading
//   subtitle  optional second line of the heading
//   text      description
//   tag       optional small label (e.g. "All game modes")
//   variant   optional highlighted border: "blood" (red), "gold" or "arcane" (purple)
//   media     optional, shown above the title: { src: "img/floor.png", alt: "…" } or a raw HTML string

window.F666 = window.F666 || {};

F666.FEATURES = [
  {
    id: "gameplay",
    nav: "Gameplay",
    code: "Sector 01",
    title: "Floor 666 & Gameplay",
    features: [
      {
        id: "floor-666",
        title: "Floor 666",
        subtitle: "The Ultimate Challenge",
        text: "An enormous, monstrous, labyrinthine floor featuring multiple paths, custom rooms and hidden routes waiting to be discovered.",
        variant: "blood",
      },
      {
        id: "golden-mutations",
        title: "Golden Mutations",
        text: "Upgrade your existing mutations into powerful golden versions with enhanced abilities.",
        variant: "gold",
      },
      {
        id: "heroes",
        title: "Heroes",
        subtitle: "A Special New Class",
        text: "Meet five unique heroes, each with their own upgrade paths.",
        variant: "arcane",
      },
      {
        id: "new-mutations",
        title: "100+ New Mutations",
        text: "Discover and unlock over 100 new mutations as you progress, opening the door to countless new strategies and playstyles.",
      },
      {
        id: "new-events",
        title: "New Events",
        text: "Encounter new events throughout your adventure that occur directly within the floor.",
      },
      {
        id: "classless-units",
        title: "Classless Units",
        text: "Recruit powerful new units that belong to no traditional class. These unusual fighters wield unique abilities borrowed straight from Despot's arsenal.",
      },
      {
        id: "upgrade-tree",
        title: "Reworked Upgrade Tree",
        text: "Explore a redesigned progression system with new upgrades and possibilities.",
      },
      {
        id: "new-quests",
        title: "New Quests",
        text: "Complete new challenges and objectives throughout your journey.",
      },
      {
        id: "cursed-mutations",
        title: "Reworked Cursed Mutations",
        text: "Discover exclusive mutations that turn the tables by affecting your enemies instead of your own army.",
      },
      {
        id: "custom-enemies",
        title: "Custom Enemies & Battle Layouts",
        text: "Face new enemy combinations, custom encounters and unique battlefield formations.",
      },
    ],
  },
  {
    id: "koth",
    nav: "KoTH",
    code: "Sector 02",
    title: "King of the Hill (KoTH)",
    features: [
      {
        id: "ultima-league",
        title: "Ultima League",
        text: "Compete in a brand-new KoTH leaderboard exclusively designed for Floor 666.",
      },
      {
        id: "army-saves",
        title: "Army Saves",
        text: "Save and manage your KoTH and custom armies.",
        tag: "All game modes",
      },
      {
        id: "private-matches",
        title: "Private Matches",
        text: "Challenge other players directly in private battles.",
        tag: "All game modes",
      },
      {
        id: "team-editor",
        title: "Team Editor",
        text: "Create, customize and test army compositions by simulating KoTH battles.",
        tag: "All game modes",
      },
      {
        id: "koth-more",
        title: "And Much More",
        text: "Additional KoTH improvements and features to expand the competitive experience.",
      },
    ],
  },
  {
    id: "audio",
    nav: "Audio & Perf.",
    code: "Sector 03",
    title: "Audio & Performance",
    features: [
      {
        id: "soundtracks",
        title: "New Soundtracks",
        text: "Enjoy new music that accompanies the chaos of Floor 666.",
      },
      {
        id: "ram-fixes",
        title: "RAM Leak Fixes",
        text: "Fixes for memory leaks, alongside code optimizations that improve performance across all game modes, not just Floor 666.",
        tag: "All game modes",
      },
    ],
  },
];
