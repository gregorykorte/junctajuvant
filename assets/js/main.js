const V = '?v=2025-08-22-8';

import { setDatelineWithAD, setYearRoman, setCopyrightBrand } from './modules/date.js'   + V;
import { startWeather }  from './modules/weather.js' + V;
import { startNews }     from './modules/rss.js'     + V;
import { startScores }   from './modules/scores.js'  + V;
import { startHero }     from './modules/hero.js'    + V;

document.addEventListener('DOMContentLoaded', () => {
  setDatelineWithAD();
  setYearRoman();
  setCopyrightBrand();

  startWeather();
  startNews();
  startScores();
  startHero();  // ← new

  setInterval(setDatelineWithAD, 60 * 60 * 1000);
});
