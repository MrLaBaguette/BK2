// Testy silnika kalkulatora BK2%. Uruchom: node tests.mjs
// Silnik jest wycinany z <script id="engine"> w index.html i wykonywany przez vm,
// więc testujemy dokładnie ten kod, który działa w przeglądarce.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const html = readFileSync(fileURLToPath(new URL('./index.html', import.meta.url)), 'utf8');
const match = html.match(/<script id="engine">([\s\S]*?)<\/script>/);
if (!match) { console.error('Brak <script id="engine"> w index.html'); process.exit(1); }
const ctx = vm.createContext({});
vm.runInContext(match[1], ctx, { filename: 'index.html#engine' });
const E = ctx.BK2;

let pass = 0, fail = 0;
function group(name) { console.log('\n' + name); }
function test(name, fn) {
  try {
    const info = fn();
    console.log('  ✓ ' + name + (info ? '  — ' + info : ''));
    pass++;
  } catch (e) {
    console.log('  ✗ ' + name + '\n      ' + e.message);
    fail++;
  }
}
function near(a, b, tol, what) {
  if (!(Math.abs(a - b) <= tol)) throw new Error(`${what}: ${a} zamiast ${b} (±${tol})`);
}
function nearRel(a, b, rel, what) { near(a, b, Math.abs(b) * rel, what); }
function ok(cond, what) { if (!cond) throw new Error(what); }
const r2 = (x) => Math.round(x * 100) / 100;
const zl = (x) => E.fmtZl(x, 0).replace(/ /g, ' ');

// Parametry testowe: oferta i założenia domyślne, symulacja 11.2026.
const SIM = { year: 2026, month: 11 };
function params(over = {}) { return Object.assign(E.defaults(SIM), over); }
const P400 = (over = {}) => params(Object.assign({ K: 400000, n: 300 }, over));
const end = E.absOf(2033, 10);

/* ------------------------------------------------------------------ */
group('Kredyt');
test('1. K = 400 000, n = 300, 10.2023 → 11.2026: m0, S(37), rata 38, S(120)', () => {
  const L = E.loan(P400());
  ok(L.m0 === 37, `m0 = ${L.m0}, oczekiwano 37`);
  near(L.S(37), 350666.67, 0.005, 'S(37)');
  near(L.rata(38), 1917.78, 0.005, 'rata nr 38');
  near(L.S120, 240000, 0.005, 'S(120)');
  return `S(37) = ${r2(L.S(37))}, rata 38 = ${r2(L.rata(38))}, S(120) = ${r2(L.S120)}`;
});
test('2. Koniec dopłat dla uruchomienia 10.2023 = 10.2033', () => {
  const L = E.loan(P400());
  ok(E.fmtMM(L.endAbs) === '10.2033', `koniec = ${E.fmtMM(L.endAbs)}`);
  return E.fmtMM(L.endAbs);
});

/* ------------------------------------------------------------------ */
group('Pojedyncza obligacja (1 szt., bez reinwestycji kuponów)');
const P = params();
const start = E.absOf(2026, 12);
const single = (type, months) => E.bondRun(type, start, months, P).net;
[
  ['3. EDO trzymane 120 mies.', 'EDO', 120, 145.81],
  ['4. EDO sprzedane po 48 mies.', 'EDO', 48, 113.95],
  ['5. TOS sprzedane po 30 mies.', 'TOS', 30, 108.42],
  ['6. COI trzymane 48 mies.', 'COI', 48, 113.57],
  ['7. COI sprzedane po 30 mies. (opłata zjada odsetki 3. roku)', 'COI', 30, 107.09],
  ['8. ROR sprzedane po 6 mies.', 'ROR', 6, 101.04]
].forEach(([name, type, months, want]) => {
  test(name, () => { const v = single(type, months); near(v, want, 0.02, type); return v.toFixed(4) + ' zł'; });
});
test('7a. COI po 30 mies.: narosłe odsetki 3. roku = 2,00 zł, opłata 2,00 zł', () => {
  const run = E.bondRun('COI', start, 30, P);
  near(run.fee, 2, 1e-9, 'opłata');
  near(run.redemption, 100, 1e-9, 'kwota z wykupu');
});

/* ------------------------------------------------------------------ */
group('Optymalizator (ciągły)');
test('9. bez ROS/ROD: V[120], EDO dla h 74–120, TOS dla h 25–47, gotówka dla h = 1', () => {
  const o = E.optimize(P, end, 120);
  near(o.V[120], 1.4581, 0.0005, 'V[120]');
  for (let h = 74; h <= 120; h++) ok(o.choice[h] === 'EDO', `h = ${h}: ${o.choice[h]}, oczekiwano EDO`);
  for (let h = 25; h <= 47; h++) ok(o.choice[h] === 'TOS', `h = ${h}: ${o.choice[h]}, oczekiwano TOS`);
  ok(o.choice[1] === 'CASH', `h = 1: ${o.choice[1]}, oczekiwano gotówki`);
  return `V[120] = ${o.V[120].toFixed(4)}`;
});
test('10. z ROS/ROD (bez limitu): ROD dla h 37–120, V[120] = 1,4926', () => {
  const p = params({ family: { enabled: true, monthly: 0 } });
  const o = E.optimize(p, end, 120);
  for (let h = 37; h <= 120; h++) ok(o.choice[h] === 'ROD', `h = ${h}: ${o.choice[h]}, oczekiwano ROD`);
  near(o.V[120], 1.4926, 0.0005, 'V[120]');
  return `V[120] = ${o.V[120].toFixed(4)}, h = 36: ${o.choice[36]}`;
});

/* ------------------------------------------------------------------ */
group('Scenariusz end-to-end (K = 400 000, 25 lat, 10.2023, symulacja 11.2026)');
const res400 = E.compute(P400({ X: 1000 }));
test('11. X = 1 000 zł → nadpłata ≈ 93 500 zł, dług ≈ 146 500 zł', () => {
  nearRel(res400.bonds.net, 93500, 0.015, 'nadpłata');
  near(res400.bonds.debt, 146500, 93500 * 0.015, 'dług po nadpłacie');
  return `nadpłata ${zl(res400.bonds.net)}, dług ${zl(res400.bonds.debt)}, IRR ${(res400.irr * 100).toFixed(2)}%`;
});
test('12. wariant C (ten sam wydatek) → saldo ≈ 151 100 zł, obligacje wygrywają', () => {
  nearRel(res400.C.balance, 151100, 0.005, 'saldo w wariancie C');
  ok(res400.bonds.debt < res400.C.balance, 'obligacje powinny wygrać');
  return `saldo C ${zl(res400.C.balance)}, przewaga obligacji ${zl(res400.C.balance - res400.bonds.debt)}`;
});
test('13. „Ile muszę odkładać?” → 2 600 lub 2 700 zł, X spłaca, X − 100 nie', () => {
  const res = E.compute(P400({ question: 'need' }));
  ok(res.X === 2600 || res.X === 2700, `X = ${res.X}`);
  const p = P400();
  const at = (x) => E.simulate(p, x, res.planOpt, true).net;
  ok(at(res.X) >= 240000, `przy X nadpłata ${at(res.X)} < 240 000`);
  ok(at(res.X - 100) < 240000, `przy X − 100 nadpłata ${at(res.X - 100)} ≥ 240 000`);
  return `X = ${res.X} zł (nadpłata ${zl(at(res.X))}; przy ${res.X - 100} zł: ${zl(at(res.X - 100))})`;
});

/* ------------------------------------------------------------------ */
group('Wartości domyślne (K = 500 000, 10.2023, 25 lat, symulacja 11.2026)');
const resDef = E.compute(params());
test('14a. S(120) = 300 000, rata nr 38 = 2 397,22 zł', () => {
  near(resDef.loan.S120, 300000, 0.005, 'S(120)');
  near(resDef.loan.rata(38), 2397.22, 0.005, 'rata nr 38');
  near(resDef.rataNow, 2397.22, 0.005, 'rata „teraz”');
});
test('14b. X = 1 000 zł → nadpłata ≈ 93 500 zł; wariant C ≈ 211 100 zł', () => {
  nearRel(resDef.bonds.net, 93500, 0.015, 'nadpłata');
  nearRel(resDef.C.balance, 211100, 0.005, 'saldo C');
  return `nadpłata ${zl(resDef.bonds.net)}, saldo C ${zl(resDef.C.balance)}`;
});
test('14c. „Ile muszę odkładać?” → 3 300 lub 3 400 zł', () => {
  const res = E.compute(params({ question: 'need' }));
  ok(res.X === 3300 || res.X === 3400, `X = ${res.X}`);
  ok(res.bonds.net >= 300000, 'nadpłata < S(120)');
  return `X = ${res.X} zł, nadpłata ${zl(res.bonds.net)}`;
});
test('14d. „Uwzględnij Uczucia”: wpłaty 83 000, KOSZT ≈ 10 500, INFLACJA ≈ 6 600; widok nie zmienia obliczeń', () => {
  const f = resDef.feelings;
  near(f.deposits, 83000, 0.005, 'suma wpłat do skarpety');
  nearRel(f.cost, 10500, 0.15, 'KOSZT');
  nearRel(f.inflationLoss, 6600, 0.10, 'INFLACJA');
  // przełącznik jest tylko widokiem: wynik z flagą i bez flagi musi być identyczny
  const a = JSON.stringify(E.compute(Object.assign(params(), { feelings: true })));
  const b = JSON.stringify(E.compute(Object.assign(params(), { feelings: false })));
  ok(a === b && b === JSON.stringify(resDef), 'wynik zależy od przełącznika');
  return `KOSZT ${zl(f.cost)}, INFLACJA ${zl(f.inflationLoss)}`;
});

/* ------------------------------------------------------------------ */
group('Brzegowe');
test('14. jednorazowa wpłata 20 000 zł w 12.2026 w trybie 2 zmniejsza wymagane X', () => {
  const without = E.compute(params({ question: 'need' })).X;
  const withOne = E.compute(params({ question: 'need', oneTime: [{ abs: E.absOf(2026, 12), amount: 20000 }] })).X;
  ok(withOne < without, `z wpłatą ${withOne}, bez ${without}`);
  return `${without} zł → ${withOne} zł`;
});
test('15. symulacja 11.2033 (po dopłatach): blokada, bez wyjątków', () => {
  const res = E.compute(params({ simAbs: E.absOf(2033, 11) }));
  ok(res.blocked === 'ended', `blocked = ${res.blocked}`);
  return 'komunikat „okres dopłat już się skończył”';
});
test('15a. symulacja 09.2033 i 08.2033 (h ≤ 1): brak zakupów, wszystko w gotówce', () => {
  for (const [y, m, months] of [[2033, 9, 1], [2033, 8, 2]]) {
    const res = E.compute(params({ simAbs: E.absOf(y, m) }));
    ok(!res.blocked, 'nie powinno być blokady');
    ok(res.sim.rows.length === months, `${months} mies. symulacji, jest ${res.sim.rows.length}`);
    ok(res.sim.rows.every((r) => r.buys.length === 0), 'nie powinno być zakupów');
    near(res.bonds.net, 1000 * months, 1e-9, 'nadpłata = suma wpłat');
    ok(res.warnings.some((w) => w.code === 'shortHorizon'), 'brak ostrzeżenia o krótkim horyzoncie');
  }
});
test('16. uruchomienie 03.2025 + X > 0 → ostrzeżenie o 36 miesiącach w wariancie C', () => {
  const res = E.compute(params({ launchAbs: E.absOf(2025, 3) }));
  ok(res.C.early36.length > 0, 'brak nadpłat w miesiącach 1–36');
  ok(res.warnings.some((w) => w.code === 'early36'), 'brak ostrzeżenia early36');
  ok(E.fmtMM(res.C.payAbs) === '04.2028', `zebrane kwoty nadpłacone w ${E.fmtMM(res.C.payAbs)}, oczekiwano 04.2028 (rata 37)`);
  return `nadpłaty z ${E.fmtMM(res.warnings[0].from)}–${E.fmtMM(res.warnings[0].to)} zebrane i nadpłacone w ${E.fmtMM(res.C.payAbs)}`;
});

/* ------------------------------------------------------------------ */
group('Dodatkowe sprawdzenia');
test('saldo z banku nadpisuje wyliczone saldo', () => {
  const L = E.loan(params({ bankBalance: 430000 }));
  near(L.Sm0, 430000, 1e-9, 'S(m0)');
  near(L.cap, 430000 / 263, 1e-9, 'część kapitałowa');
  near(L.S120, 430000 - 83 * 430000 / 263, 1e-6, 'S(120)');
});
test('ROS/ROD z limitem 800+: zakupy rodzinnych nie przekraczają otrzymanych świadczeń', () => {
  const res = E.compute(params({ X: 2000, family: { enabled: true, monthly: 800 } }));
  let fam = 0;
  res.sim.rows.forEach((r, i) => {
    r.buys.forEach((b) => { if (b.type === 'ROS' || b.type === 'ROD') fam += b.units * 100; });
    ok(fam <= 800 * (i + 1) + 1e-9, `miesiąc ${i + 1}: ${fam} > ${800 * (i + 1)}`);
  });
  ok(fam > 0, 'nie kupiono żadnych obligacji rodzinnych');
  const first = res.sim.rows[0].buys.map((b) => `${b.type} ${b.units}`).join(' + ');
  ok(first === 'ROD 8 + EDO 12', `1. miesiąc: ${first}, oczekiwano ROD 8 + EDO 12 (reszta wg rankingu V2 bez ROS/ROD)`);
  const noFam = E.compute(params({ X: 2000 }));
  ok(res.bonds.net > noFam.bonds.net, 'ROS/ROD z limitem powinny dać więcej niż bez nich');
  return `1. miesiąc: ${first}; ROS/ROD za ${zl(fam)}, nadpłata ${zl(res.bonds.net)} (bez ROS/ROD ${zl(noFam.bonds.net)})`;
});
test('X niewielokrotne 100 zł: reszta czeka w gotówce i dołącza do zakupu', () => {
  const res = E.compute(params({ X: 1250 }));
  ok(res.sim.rows[0].cost === 1200 && Math.abs(res.sim.rows[0].cash - 50) < 1e-9, 'w 1. miesiącu: zakup 1 200, reszta 50');
  ok(res.sim.rows[1].cost === 1300, 'w 2. miesiącu: zakup 1 300');
  ok(res.warnings.some((w) => w.code === 'notMultiple'), 'brak informacji o zaokrągleniu');
});
test('wyłączone wszystkie obligacje → wszystko w gotówce', () => {
  const p = params();
  E.ORDER.forEach((b) => { p.bonds[b].on = false; });
  const res = E.compute(p);
  near(res.bonds.net, res.sim.deposits, 1e-9, 'nadpłata = wpłaty');
  ok(res.warnings.some((w) => w.code === 'noBonds'), 'brak ostrzeżenia');
});
test('po dopłatach: rata bez strategii, niższa rata, krótszy okres', () => {
  const a = resDef.after[1]; // 4,5%
  near(a.base, E.annuity(300000, 0.045, 180), 1e-9, 'rata bez strategii');
  ok(a.low < a.base && a.shorterBy > 0 && a.saveShort > a.saveLow, 'niższa rata / krótszy okres');
  return `4,5%: ${zl(a.base)} → ${zl(a.low)} albo krócej o ${E.fmtDuration(a.shorterBy)}`;
});
test('całość spłacona → „Spłacasz cały kredyt” i nadwyżka', () => {
  const res = E.compute(params({ X: 5000 }));
  ok(res.after.every((s) => s.paidOff), 'scenariusze powinny pokazać spłatę');
  ok(res.bonds.surplus > 0 && res.bonds.debt === 0, 'nadwyżka');
  ok(res.cross !== null, 'punkt przecięcia portfela z saldem');
});
test('inflacja rok po roku zmienia wynik EDO', () => {
  const p = params({ inflationByYear: { 2028: 0.06 } });
  ok(E.bondRun('EDO', start, 120, p).net > E.bondRun('EDO', start, 120, P).net, 'wyższa inflacja → więcej');
});
test('formatowanie pl-PL', () => {
  ok(E.fmtZl(1234).replace(/ /g, ' ') === '1 234 zł', E.fmtZl(1234));
  ok(E.fmtPct(0.044) === '4,40%', E.fmtPct(0.044));
  ok(E.fmtMonth(end).replace(/ /g, ' ') === 'paź 2033', E.fmtMonth(end));
  ok(E.fmtMonthLoc(end).replace(/ /g, ' ') === 'październiku 2033', E.fmtMonthLoc(end));
});

/* ------------------------------------------------------------------ */
group('Obligacje, które już masz');
const holdP = (holdings, over = {}) => params(Object.assign({ holdings }, over));
test('H1. kod serii: EDO0434 = EDO kupione 04.2024, wykup 04.2034', () => {
  const s = E.parseSeries('edo0434');
  ok(s && s.type === 'EDO', 'typ');
  ok(E.fmtMM(s.startAbs) === '04.2024' && E.fmtMM(s.matAbs) === '04.2034', `${E.fmtMM(s.startAbs)} / ${E.fmtMM(s.matAbs)}`);
  ok(E.parseSeries('XYZ0434') === null && E.parseSeries('EDO1334') === null && E.parseSeries('EDO04') === null, 'złe kody');
});
test('H2. B: EDO0434, 10 szt., wartość dziś 1 150 zł → sprzedaż w 10.2033 z opłatą i podatkiem', () => {
  const p = holdP({ mode: 'series', series: [{ code: 'EDO0434', units: 10, value: 1150 }] });
  const L = E.loan(p), h = E.buildHoldings(p, L);
  // 31 mies. od zakupu, 7 mies. w 3. roku (4,5%); do 10.2033 jeszcze 7 pełnych lat i 6 mies. 10. roku
  const base = 1150 / (1 + 0.045 * 7 / 12), v = base * 1.045 ** 7 * (1 + 0.045 * 6 / 12);
  const want = v - 30 - (v - 1000 - 30) * 0.19;
  near(h.flows[83], want, 0.01, 'kwota ze sprzedaży');
  near(h.cash, want, 0.01, 'brak innych wpływów');
  ok(h.lots[0].matured === false && E.fmtMM(h.lots[0].exitAbs) === '10.2033', 'sprzedaż na koniec dopłat');
  return `sprzedaż ${zl(want)}`;
});
test('H3. B: COI0628, 20 szt. → kupon w 06.2027, kupon i wykup w 06.2028', () => {
  const p = holdP({ mode: 'series', series: [{ code: 'COI0628', units: 20 }] });
  const h = E.buildHoldings(p, E.loan(p));
  near(h.flows[7], 2000 * 0.04 * 0.81, 1e-9, 'kupon 06.2027');
  near(h.flows[19], 2000 * 0.04 * 0.81 + 2000, 1e-9, 'kupon i wykup 06.2028');
  near(h.cash, 2000 + 2 * 64.8, 1e-9, 'razem');
  ok(h.lots[0].matured === true, 'wykup przed końcem dopłat');
});
test('H4. B: seria już wykupiona albo zły kod → pominięta z ostrzeżeniem', () => {
  const res = E.compute(holdP({ mode: 'series', series: [{ code: 'ROR0526', units: 5 }, { code: 'ABC', units: 1 }] }));
  const w = res.warnings.find((x) => x.code === 'holdIgnored');
  ok(w && w.items.length === 2 && w.items[0].reason === 'matured' && w.items[1].reason === 'code', JSON.stringify(w));
  near(res.bonds.net, resDef.bonds.net, 1e-6, 'wynik jak bez obligacji');
});
test('H5. C: EDO 10 000 zł nominału, 11 000 zł dziś – wykup po / przed końcem dopłat', () => {
  const after = E.buildHoldings(holdP({ mode: 'types', types: [{ type: 'EDO', nominal: 10000, value: 11000, before: false }] }), E.loan(params()));
  const before = E.buildHoldings(holdP({ mode: 'types', types: [{ type: 'EDO', nominal: 10000, value: 11000, before: true }] }), E.loan(params()));
  ok(after.lots[0].exitAbs === end && before.lots[0].exitAbs === E.absOf(2026, 11) + 42, 'miesiące wyjścia');
  const v83 = 11000 * 1.045 ** (83 / 12), v42 = 11000 * 1.045 ** (42 / 12);
  near(after.cash, v83 - 300 - (v83 - 10000 - 300) * 0.19, 0.01, 'po: z opłatą 3 zł/szt.');
  near(before.cash, v42 - (v42 - 10000) * 0.19, 0.01, 'przed: bez opłaty');
  return `po: ${zl(after.cash)}, przed: ${zl(before.cash)} (+ reinwestycja wg planu)`;
});
test('H6. posiadane obligacje zmniejszają wymagane X i zwiększają nadpłatę', () => {
  const holdings = { mode: 'types', types: [{ type: 'EDO', nominal: 30000, value: 33000, before: false }] };
  const need = E.compute(holdP(holdings, { question: 'need' }));
  ok(need.X < 3300, `X = ${need.X}`);
  const pay = E.compute(holdP(holdings));
  ok(pay.bonds.net > resDef.bonds.net + pay.holdings.liq0, 'nadpłata rośnie o więcej niż dzisiejsza wartość netto');
  near(pay.D.sock, 83000 + pay.holdings.cash, 1e-6, 'skarpeta dostaje gotówkę z obligacji');
  ok(pay.C.balance < resDef.C.balance, 'wariant C też je uwzględnia');
  return `X: 3300 → ${need.X} zł; nadpłata ${zl(pay.bonds.net)}`;
});

/* ------------------------------------------------------------------ */
group('Prosty plan zakupów (prostota wygrywa do 1%)');
test('P1. domyślnie: jedna obligacja przez cały okres, strata ≤ 1% względem planu optymalnego', () => {
  const kinds = new Set(resDef.sim.rows.flatMap((r) => r.buys.map((b) => b.type)));
  ok(resDef.planInfo.simple, 'plan powinien być uproszczony');
  ok(kinds.size === 1, `kupowane typy: ${[...kinds].join(', ')}`);
  ok(resDef.planInfo.loss >= 0 && resDef.planInfo.loss <= 0.01 * resDef.planInfo.optNet, `strata ${resDef.planInfo.loss}`);
  return `${[...kinds].join('')} przez cały okres; plan optymalny dałby +${zl(resDef.planInfo.loss)} (${(resDef.planInfo.loss / resDef.planInfo.optNet * 100).toFixed(2)}%)`;
});
test('P2. plan prosty nie przeplata: każdy typ kupujesz w jednym ciągłym okresie', () => {
  for (const p of [params(), params({ inflation: 0.05 }), params({ launchAbs: E.absOf(2025, 3) }), params({ family: { enabled: true, monthly: 0 } })]) {
    const segs = E.compute(p).plan.filter((s) => s.label !== 'END' && s.label !== 'NONE');
    const labels = segs.map((s) => s.label);
    ok(new Set(labels).size === labels.length, `przeplatanie: ${labels.join(' → ')}`);
  }
});
test('P3. tolerancja 0 → plan optymalny', () => {
  const res = E.compute(params({ planTolerance: 0 }));
  ok(!res.planInfo.simple && Math.abs(res.planInfo.loss) < 1e-6, 'plan optymalny');
  near(res.bonds.net, 93256, 1, 'nadpłata jak w planie optymalnym');
});

console.log(`\n${pass} zaliczonych, ${fail} niezaliczonych`);
process.exit(fail ? 1 : 0);
