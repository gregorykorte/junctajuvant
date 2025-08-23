import { TZ, CITY } from './config.js';

export function toRoman(num){
  const pairs = [["M",1000],["CM",900],["D",500],["CD",400],["C",100],["XC",90],["L",50],["XL",40],["X",10],["IX",9],["V",5],["IV",4],["I",1]];
  let out = ""; for (const [r,v] of pairs){ while(num >= v){ out += r; num -= v; } } return out;
}

export function setDatelineWithAD(){
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const dl = document.getElementById('dateline');
  if (dl) dl.textContent = `${CITY} — ${fmt.format(now)} A.D.`;
}

export function setYearRoman(){
  const y = document.getElementById('year');
  if (y) y.textContent = toRoman(new Date().getFullYear());
}

// Replace the brand string in the copyright line
// Current HTML is: "© <span id=\"year\"></span> junctajuvant.com"
// We swap the trailing text for "The Juncta Juvant" without touching surrounding markup.
export function setCopyrightBrand(){
  const y = document.getElementById('year');
  if (!y) return;
  const parent = y.parentElement;
  if (!parent) return;
  parent.innerHTML = `© <span id="year">${y.textContent || ''}</span> The Juncta Juvant`;
}
