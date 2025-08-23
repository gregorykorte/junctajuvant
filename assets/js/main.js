import { setDatelineWithAD, setYearRoman, setCopyrightBrand } from './modules/date.js';
import { startWeather } from './modules/weather.js';
import { startNews } from './modules/rss.js';
import { startScores } from './modules/scores.js';


// Boot
document.addEventListener('DOMContentLoaded', () => {
// Header & footer
setDatelineWithAD();
setYearRoman();
setCopyrightBrand();


// Rails
startWeather();
startNews();
startScores();


// Dateline rolls hourly (year stays fixed)
setInterval(setDatelineWithAD, 60 * 60 * 1000);
});