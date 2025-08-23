import { setDatelineWithAD, setYearRoman, setCopyrightBrand } from './modules/date.js';
import { startWeather }  from './modules/weather.js';
import { startNews }     from './modules/rss.js';
import { startScores }   from './modules/scores.js';
import { startHero }     from './modules/hero.js'

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
