/**
 * Script to fix all 17 2026 Korean movies and series by replacing the Unsplash placeholder
 * with their real, official MovieBox HD poster artwork, backdrops, and episode stills.
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const adminService = require('../services/adminService');

const POSTER_MAP = {
  '331894071855836048': 'https://pbcdnw.aoneroom.com/image/2026/09/24/6eae96a9c3c5fe29dced826b02a567f9.jpg',  // Hope [Hindi]
  '7022932076140052616': 'https://pbcdnw.aoneroom.com/image/2026/04/01/3fd26fb6fcb3a6d4d744174610c8d699.jpeg', // HUMINT [Hindi]
  '8280774283480165112': 'https://pbcdnw.aoneroom.com/image/2026/05/28/bf03ad81cae22f8b3a8e7689682a956e.jpeg', // Salmokji: Whispering Water [Hindi]
  '4666948055344764304': 'https://pbcdnw.aoneroom.com/image/2026/02/19/49cb2c95afbeed69c686a1a4dda70c74.jpg',  // Project Y [Hindi]
  '8652972607077342664': 'https://pbcdnw.aoneroom.com/image/2026/03/27/b3261e0f3b6bd34da242a14feff1045a.jpeg', // BTS: The Return [Hindi]
  '874833288387512056': 'https://pbcdnw.aoneroom.com/image/2026/09/24/01670adde96aa12aa68d03417dd9cace.jpg',  // Perfect Crown [Hindi]
  '706911921223650264': 'https://pbcdnw.aoneroom.com/image/2026/09/14/48f045c12d53dde6bed96e7bb67c8ced.jpg',  // Mad Concrete Dreams [Hindi]
  '4183836956931122184': 'https://pbcdnw.aoneroom.com/image/2026/10/18/36d04282b0ad89cea8ffa19dc8989499.jpg', // If Wishes Could Kill [Hindi]
  '5203417860348986440': 'https://pbcdnw.aoneroom.com/image/2026/10/16/eef640d883a426db86ccf64ff04d3040.jpg', // Boyfriend on Demand [Hindi]
  '5097017101148115856': 'https://pbcdnw.aoneroom.com/image/2026/10/25/20eb8f26d0bdd2e83e6ad0bc85adf79a.jpg', // The East Palace [Hindi]
  '8540517644796157272': 'https://pbcdnw.aoneroom.com/image/2026/10/21/9bd9f19dd8d07fd49088704cfe2cb78e.jpg', // Spooky in Love [Hindi]
  '4397066641696345744': 'https://pbcdnw.aoneroom.com/image/2026/06/02/7521fb70b46221edc8240472cb1f57fd.jpeg', // Reborn Rookie [Hindi]
  '4439270089858372624': 'https://pbcdnw.aoneroom.com/image/2026/10/09/f205ef3f49668fcffbf27c03ea4e481e.jpg', // Teach You A Lesson [Hindi]
  '6657365783343416200': 'https://pbcdnw.aoneroom.com/image/2026/10/25/06cb95402b7e9bbe11a5887a44b8b814.jpg', // See You at Work Tomorrow! [Hindi]
  '8637267170101281656': 'https://pbcdnw.aoneroom.com/image/2026/10/18/85e8743676889a7a618c025751c602ad.jpg', // Spring Fever [Hindi]
  '3749246425109095096': 'https://pbcdnw.aoneroom.com/image/2026/10/26/a8eab787873dba89673fd6d7fae37b3f.jpg', // The Judge Returns [Hindi]
  '2292877793048286096': 'https://pbcdnw.aoneroom.com/image/2026/10/24/3f3784c0152c27e09312e0221904c5c4.jpg', // The Apartment Job [Hindi]
  '4496069975786013120': 'https://pbcdnw.aoneroom.com/image/2026/09/08/f49e2430e64c57c12b88351b7bd8f335.jpg'  // Fifties Professionals [Hindi]
};

async function fixPosters() {
  console.log('=== FIXING POSTERS FOR 2026 KOREAN TITLES ===\n');

  const content = adminService.readContent();
  let updatedMovies = 0;
  let updatedSeries = 0;

  // 1. Fix Movies
  (content.movies || []).forEach(m => {
    const sId = String(m.subjectId || m.id).replace('mb-m-', '');
    if (POSTER_MAP[sId]) {
      const realUrl = POSTER_MAP[sId];
      m.poster = realUrl;
      m.backdrop = realUrl;
      m.cover = realUrl;
      updatedMovies++;
      console.log(`✓ Updated movie poster: "${m.title}" -> ${realUrl}`);
    }
  });

  // 2. Fix Series & Episode Stills
  (content.series || []).forEach(s => {
    const sId = String(s.subjectId || s.id).replace('mb-s-', '');
    if (POSTER_MAP[sId]) {
      const realUrl = POSTER_MAP[sId];
      s.poster = realUrl;
      s.backdrop = realUrl;
      s.cover = realUrl;

      // Update all episodes
      if (Array.isArray(s.episodes)) {
        s.episodes.forEach(ep => {
          ep.still = realUrl;
          ep.stillPath = realUrl;
        });
      }

      if (Array.isArray(s.seasons)) {
        s.seasons.forEach(season => {
          if (Array.isArray(season.episodes)) {
            season.episodes.forEach(ep => {
              ep.still = realUrl;
              ep.stillPath = realUrl;
            });
          }
        });
      }

      updatedSeries++;
      console.log(`✓ Updated series poster & episodes: "${s.title}" (${s.episodes?.length || 0} eps) -> ${realUrl}`);
    }
  });

  adminService.writeContent(content);

  console.log('\n=============================================');
  console.log(`SUCCESS: Fixed ${updatedMovies} Movies and ${updatedSeries} Series with Official HD Covers!`);
  console.log('=============================================\n');
}

fixPosters();
