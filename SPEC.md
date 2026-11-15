# Instrukcja dla Claude Code: kalkulator „BK2% – nadpłacać czy inwestować w obligacje?”

> Wklej cały ten plik do Claude Code jako pierwsze polecenie (albo zapisz jako `SPEC.md` w pustym folderze i napisz: „Zbuduj aplikację zgodnie z SPEC.md”).

---

## 0. Co masz zbudować (w skrócie)

Jeden plik **`index.html`** (HTML + CSS + JavaScript w jednym pliku, bez bibliotek z internetu, działa po dwukliku z dysku, także na telefonie), który pomaga osobie z **Bezpiecznym Kredytem 2% (BK2%)** odpowiedzieć na dwa pytania:

1. **„Ile spłacę?”** – jeśli co miesiąc odkładam X zł w obligacje skarbowe, ile kredytu spłacę jednorazowo w dniu zakończenia dopłat (120. rata)?
2. **„Ile muszę odkładać?”** – ile minimalnie odkładać co miesiąc (i w jakie obligacje, w którym miesiącu), żeby w dniu zakończenia dopłat spłacić **cały** kredyt?

Dodatkowo aplikacja pokazuje, co dzieje się z ratą po zakończeniu dopłat w 3 scenariuszach oprocentowania.

**Główny przekaz aplikacji:** pokazać, że inwestowanie w obligacje w okresie dopłat się opłaca, i dokładnie jak to zrobić (co kupować, kiedy, ile). Nadpłacanie na bieżąco oraz „skarpeta” to tylko **punkty odniesienia** do porównania, nie równorzędne rekomendacje.

Odbiorca: **amator**. Język interfejsu: **polski**. Priorytet: poprawne obliczenia + bardzo jasna prezentacja.

Dodatkowo (dla dewelopera, nie dla użytkownika): plik `tests.mjs` uruchamiany `node tests.mjs`, który testuje silnik obliczeń (sekcja 9).

---

## 1. Wiedza domenowa (przyjmij jako fakty modelu)

### 1.1 Bezpieczny Kredyt 2%
- Przez **pierwsze 120 miesięcy** od uruchomienia kredytu państwo dopłaca do odsetek. Kredytobiorca płaci efektywnie ok. **2%** (parametr, domyślnie 2,00%).
- W okresie dopłat raty są **obowiązkowo malejące**: część kapitałowa stała = kwota kredytu / liczba rat, odsetki = saldo × 2% / 12.
- Po 120 miesiącach dopłaty się kończą, kredyt przechodzi na **raty równe (annuitetowe)** ze zmiennym oprocentowaniem (wskaźnik WIBOR/POLSTR + marża banku). Dla uproszczenia aplikacja operuje **całkowitym oprocentowaniem** po dopłatach i nie rozbija go na wskaźnik i marżę.
- Dopłata państwa jest liczona od salda, więc **nadpłata zmniejsza też dopłatę**. Dla kredytobiorcy nadpłata w okresie dopłat „zarabia” więc tylko tyle, ile wynosi jego efektywne oprocentowanie (~2%). To jest kluczowy argument za inwestowaniem w obligacje i aplikacja ma to wprost wyjaśnić.
- **Nadpłata w pierwszych 36 miesiącach** od uruchomienia może spowodować utratę dopłat (wyjątki zależą m.in. od wkładu własnego i kwoty). Aplikacja **nie modeluje wyjątków**, tylko **ostrzega**, jeśli jakakolwiek nadpłata wypadłaby w miesiącach 1–36.
- Po 36 miesiącach banki co do zasady nie pobierają prowizji za nadpłatę. Parametr „prowizja za nadpłatę” domyślnie 0%.
- Po nadpłacie w okresie dopłat bank domyślnie **obniża ratę** (okres bez zmian).

### 1.2 Obligacje skarbowe (oferta MF na listopad 2026 – wartości domyślne, wszystkie edytowalne)
Cena zawsze **100 zł**, kupuje się tylko całe sztuki. Podatek Belki **19%** od odsetek. Opłata za przedterminowy wykup jest pobierana **od każdej sztuki**.

| Symbol | Okres | 1. okres odsetkowy | Kolejne okresy | Odsetki | Opłata za wcześniejszy wykup | Limit opłaty |
|---|---|---|---|---|---|---|
| ROR | 12 mies. | 4,00% (1. miesiąc) | stopa ref. NBP + 0,00 pp | wypłacane co miesiąc | 0,50 zł | ≤ odsetki tylko w 1. okresie |
| DOR | 24 mies. | 4,15% (1. miesiąc) | stopa ref. NBP + 0,15 pp | wypłacane co miesiąc | 0,70 zł | ≤ odsetki tylko w 1. okresie |
| TOS | 36 mies. | 4,40% stałe przez cały okres | – | kapitalizowane co rok, wypłata przy wykupie | 1,00 zł | zawsze ≤ naliczone odsetki |
| COI | 48 mies. | 4,75% (1. rok) | inflacja + 1,50 pp | wypłacane co rok | 2,00 zł | ≤ odsetki tylko w 1. roku |
| EDO | 120 mies. | 5,35% (1. rok) | inflacja + 2,00 pp | kapitalizowane co rok | 3,00 zł | zawsze ≤ naliczone odsetki |
| ROS* | 72 mies. | 5,00% (1. rok) | inflacja + 2,00 pp | kapitalizowane co rok | 2,00 zł | zawsze ≤ naliczone odsetki |
| ROD* | 144 mies. | 5,60% (1. rok) | inflacja + 2,50 pp | kapitalizowane co rok | 3,00 zł | zawsze ≤ naliczone odsetki |

\* ROS/ROD (obligacje rodzinne) mogą kupić tylko osoby pobierające 800+, do wysokości otrzymanych świadczeń. **Domyślnie wyłączone**, włączane przełącznikiem.

Pozostałe założenia domyślne:
- **Stopa referencyjna NBP** (dla ROR/DOR): 3,75%, stała w czasie (edytowalna).
- **Inflacja**: 2,5% rocznie, czyli cel inflacyjny NBP, stała w czasie. W trybie Ekspert można ją edytować dla każdego roku kalendarzowego.
- **Kluczowe uproszczenie**: oferta obligacji w przyszłych miesiącach jest taka sama jak dziś. Pokaż to wyraźnie w sekcji „Założenia”.
- Pomijamy: OTS (3-mies., zdominowane), IKE/IKZE, zamianę obligacji po obniżonej cenie (99,90 zł), dzienne naliczanie odsetek (liczymy w pełnych miesiącach), zaokrąglenia podatku inne niż do grosza.

---

## 2. Dwa tryby interfejsu

Przełącznik na górze: **„Tryb prosty”** (domyślny) / **„Tryb ekspert”**.

### 2.1 Tryb prosty (Newbie Friendly): absolutne minimum
Pola:
1. **Kwota kredytu** (początkowa, z umowy). Domyślnie **500 000 zł**.
2. **Miesiąc i rok uruchomienia kredytu**. Domyślnie 10.2023.
3. **Okres kredytowania (lata)**. Domyślnie 25.
4. Wybór pytania (dwa duże kafle):
   - „Mam **X zł** miesięcznie – ile spłacę?” → pole X (domyślnie 1 000 zł, krok 100),
   - „Chcę spłacić **wszystko** po dopłatach – ile muszę odkładać?”.

Wszystko inne bierze wartości domyślne. Pod formularzem jest zwinięty panel **„Jakie założenia przyjęliśmy?”**: lista założeń prostym językiem, tylko do odczytu, z linkiem „zmień w trybie ekspert”.

### 2.2 Tryb ekspert: wszystko edytowalne
- **Kredyt**: kwota początkowa, data uruchomienia, okres (lata lub miesiące), opcjonalnie **aktualne saldo z banku** (nadpisuje wyliczone), efektywne oprocentowanie w okresie dopłat (2,00%), **3 scenariusze całkowitego oprocentowania po dopłatach (WIBOR/POLSTR + marża razem): 3,5% / 4,5% / 5,5%**, prowizja za nadpłatę (0%).
- **Data symulacji („dziś”)**: domyślnie bieżący miesiąc z zegara przeglądarki, edytowalna (potrzebne do testów i do sprawdzania „co by było, gdyby”).
- **Inwestowanie**: miesięczna kwota X (krok 100 zł), lista **jednorazowych wpłat** („+ dodaj wpłatę”: miesiąc/rok + kwota, krok 100 zł; przykłady 10 000, 20 000).
- **Obligacje**: tabela z sekcji 1.2. Każdy wiersz ma checkbox „uwzględniaj” i edytowalne: oprocentowanie 1. okresu, marżę, opłatę za wykup. Do tego stopa ref. NBP, inflacja (jedna liczba + rozwijana tabela rok po roku), stawka podatku (19%).
- **Obligacje rodzinne**: przełącznik + pole „łączna kwota 800+ otrzymywana miesięcznie” (limit zakupu ROS/ROD rośnie co miesiąc o tę kwotę, licząc od daty symulacji).
- Przycisk **„Przywróć domyślne”**.

### 2.3 Easter egg: przełącznik „Uwzględnij Uczucia”
Na samym końcu sekcji parametrów obligacji (w trybie ekspert) oraz na dole panelu „Jakie założenia przyjęliśmy?” (w trybie prostym): mały, niepozorny przełącznik **„Uwzględnij Uczucia 🥺”**, domyślnie wyłączony.

Po włączeniu:
- główna karta wyniku przełącza się na wariant **„skarpeta”** (wariant D z sekcji 6): wszystkie wpłaty leżą w gotówce na 0%, a linia portfela na wykresie robi się płaska;
- **bezpośrednio pod przełącznikiem** pojawia się krótka ramka (szary kolor, kursywa) z **jednym losowo wybranym** tekstem z poniższych pięciu. Losuj przy każdym włączeniu przełącznika. Ten sam tekst nie może wypaść dwa razy z rzędu:
  1. „Spokój ducha za jedyne {KOSZT} zł. Paragon wystawi inflacja.”
  2. „Skarpeta: 0% zysku, 100% uczuć, −{INFLACJA} zł siły nabywczej.”
  3. „Gratulacje, wybrałeś strategię »skarpeta«. Inflacja dziękuje za współpracę.”
  4. „Komfort psychiczny wyceniony na {KOSZT} zł. Rata po dopłatach i tak przyjdzie, z uczuciami czy bez.”
  5. „Idź już kupić żonie kalendarz adwentowy z Ritualsa i nie truj mi dupy.”
- **na samym dole strony wyników** (jako podsumowanie, nad stopką z zastrzeżeniami), dopóki przełącznik jest włączony, wyświetla się stała ramka:
  > **Excel nie uwzględnia psychiki? Uwzględnia. Właśnie ją wyceniliśmy: {KOSZT} zł.**
  > Tyle mniej będziesz mieć w {DATA_KONCA_DOPŁAT}, trzymając pieniądze w skarpecie zamiast w obligacjach skarbowych, czyli najnudniejszej i najbezpieczniejszej inwestycji w tym kraju. W tym czasie inflacja po cichu zje Ci jeszcze ok. {INFLACJA} zł siły nabywczej. Skarpeta nie zadzwoni z pretensjami, ale rata po dopłatach już tak.
- Placeholdery (podstawiane na żywo, format „10 500 zł”, data „październiku 2033”):
  - `{KOSZT}` = nadpłata ze strategii obligacyjnej − suma wpłat do skarpety,
  - `{INFLACJA}` = suma wpłat − ich wartość przeliczona na dzisiejsze pieniądze przy założonej inflacji (każda wpłata dyskontowana o czas, jaki przeleżała),
- w ramce podsumowania link **„Dobra, wyłącz uczucia”**, który wyłącza przełącznik i przywraca normalny widok.

Przełącznik nie zmienia żadnych innych obliczeń. To tylko inny widok wyniku.

**Zaokrąglanie do 100 zł:** wszystkie pola kwot inwestowanych mają `step=100`. Jeśli użytkownik wpisze np. 1 250, zaokrąglij w dół do 1 200 i pokaż drobną informację: „Obligacje kosztują 100 zł za sztukę, więc liczymy 1 200 zł. Reszta (50 zł) czeka i dołącza do następnego zakupu”.

---

## 3. Model kredytu

Oznaczenia: `K` kwota początkowa, `n` liczba rat (lata × 12), `r2` efektywne oprocentowanie w okresie dopłat (0,02), `m0` liczba rat już zapłaconych = pełne miesiące od miesiąca uruchomienia do miesiąca symulacji (np. uruchomienie 10.2023, symulacja 11.2026 → `m0 = 37`). `T = 120` to numer ostatniej raty z dopłatą. Data końca dopłat = miesiąc uruchomienia + 120 miesięcy.

- Saldo po `m` ratach bez nadpłat: `S(m) = K × (1 − m/n)`. Jeśli podano saldo z banku, to ono jest `S(m0)`, a część kapitałowa od tego momentu = `S(m0) / (n − m0)`.
- Rata `m` (malejąca, m ≤ 120): `kapitał + S(m−1) × r2 / 12`.
- Jeśli `m0 ≥ 120`: komunikat „Okres dopłat już się skończył – ten kalkulator dotyczy okresu dopłat” i blokada obliczeń.

**Po okresie dopłat (od raty 121):** saldo pozostałe `R = S(120) − nadpłata` (nadpłata pomniejszona o prowizję). Dla każdego scenariusza całkowitego oprocentowania `i` (3,5 / 4,5 / 5,5%) licz dwa warianty:
- **(a) Niższa rata**: annuitet od `R` na `n − 120` miesięcy.
- **(b) Krótszy okres**: rata = annuitet od `S(120)` bez nadpłaty (czyli rata, jaką płaciłby bez żadnej strategii). Policz, w ile miesięcy spłaci `R` przy tej racie. Pokaż „o X lat i Y mies. krócej” oraz oszczędność na odsetkach.
- Zawsze pokazuj też **punkt odniesienia**: ratę po dopłatach bez żadnej strategii (annuitet od `S(120)` na `n − 120` mies.) w porównaniu z obecną ratą. To jest „szok po 10 latach”, który użytkownik musi zobaczyć.
- Jeśli nadpłata ≥ `S(120)`: „Spłacasz cały kredyt 🎉” + nadwyżka do ręki.

---

## 4. Model obligacji (silnik)

Napisz funkcję `bondValue(type, monthsHeld, horizonInfo, params)`, która dla **1 sztuki (100 zł)** kupionej w danym miesiącu zwraca przepływy pieniężne netto (po Belce i opłatach). Zasady:

- **Kapitalizowane (TOS, EDO, ROS, ROD)**: wartość rośnie co pełny rok: `100 × Π(1 + r_k)`. W niepełnym roku dolicz odsetki proporcjonalnie do pełnych miesięcy: `× (1 + r_k × mies/12)`.
  - Wykup w terminie: `netto = 100 + odsetki × (1 − 0,19)`.
  - Wykup przed terminem: `opłata = min(opłata_szt, odsetki)`, `netto = 100 + (odsetki − opłata) × (1 − 0,19)`.
- **Z kuponem (COI rocznie, ROR/DOR miesięcznie)**: każdy kupon jest opodatkowany w dniu wypłaty, a netto trafia do „gotówki do reinwestycji”. Przy wcześniejszym wykupie: odsetki narosłe od ostatniego kuponu, opłata = `min(opłata_szt, narosłe)` **tylko w 1. okresie odsetkowym**, w kolejnych pobierana w całości (wtedy można dostać mniej niż 100 zł). Podatek liczony od `max(0, narosłe − opłata)`.
- Oprocentowanie roku `k` obligacji indeksowanej = inflacja przyjęta dla roku kalendarzowego, w którym ten okres się zaczyna, plus marża. Dla ROR/DOR: stopa ref. NBP (+ marża).
- Kwoty liczone z dokładnością do grosza (zaokrąglaj dopiero przy wyświetlaniu, nie w trakcie obliczeń).

---

## 5. Optymalizator: „w co kupować w którym miesiącu”

Najlepszy wybór zależy tylko od **liczby miesięcy pozostałych do końca dopłat `h`**. Wszystkie pieniądze dostępne w danym miesiącu (wpłata + kupony + wykupione obligacje + reszta gotówki) mają ten sam horyzont.

Programowanie dynamiczne (ciągłe, na 1 zł, bez zaokrągleń do 100):
- `V[0] = 1`.
- Dla `h = 1…120`: `V[h] = max po dostępnych typach b z f_b(h) / 100`, gdzie `f_b(h)` to wartość netto w dniu końca dopłat ze 100 zł zainwestowanych w `b`:
  - jeśli `b` zapada przed końcem (`okres_b ≤ h`), kwota netto z wykupu jest reinwestowana: `× V[h − okres_b]`;
  - każdy kupon netto wypłacony w miesiącu `j` jest reinwestowany: `× V[h − j]`;
  - jeśli `b` nie zapada przed końcem, sprzedajemy go przedterminowo w miesiącu `h` (z opłatą i Belką).
- `wybór[h] = argmax`. Jeśli żaden typ nie daje > 1,0000 (np. `h ≤ 1`), wybór = **„zostaw w gotówce”**.
- ROS/ROD tylko gdy włączone. Przy wyczerpanym limicie kup do wysokości limitu, a resztę w drugi najlepszy typ (licz też `V2`/ranking typów dla każdego `h`).

Uwaga: optymalizator może wskazywać nieintuicyjne wybory (np. przy domyślnych założeniach na 2–4 lata wygrywa TOS, a nie COI). Tak ma być: decyduje matematyka, a tabela „dlaczego ta obligacja?” (sekcja 7) pokazuje porównanie netto wszystkich typów dla danego `h`.

---

## 6. Symulacja miesięczna (realna, z całymi sztukami)

Dla każdego miesiąca `m = m0+1 … 120` (`h = 120 − m`):
1. Do puli gotówki dodaj: wpłatę miesięczną X, jednorazowe wpłaty z tego miesiąca, kupony netto, kwoty netto z obligacji, które zapadły.
2. Jeśli `h ≥ 1` i wybór ≠ gotówka: kup `floor(pula / 100)` sztuk typu `wybór[h]` (z limitem rodzinnych). Reszta zostaje w puli (0%).
3. Zapisz wiersz harmonogramu: data, wpłata, kupiono (typ, sztuki, kwota), wartość portfela netto „gdybym sprzedał dziś”, saldo kredytu.

W miesiącu 120 sprzedaj wszystko (przedterminowo, jeśli trzeba) i zsumuj z gotówką. To jest **kwota nadpłaty**. Przed nadpłatą odejmij prowizję banku.

**Tryb „Ile muszę odkładać?”**: wyszukiwanie binarne po X (wielokrotności 100 zł, od 0 do `S(120)`), najmniejsze X, przy którym nadpłata ≥ `S(120)`. Uwzględnij jednorazowe wpłaty z trybu ekspert. Jeśli one same wystarczą, X = 0.

**Wariant porównawczy C – „nadpłacam na bieżąco”**: ten sam miesięczny wydatek co w strategii obligacyjnej (rata z harmonogramu bez nadpłat + X + wpłaty jednorazowe). Ponieważ bank po nadpłacie obniża ratę, w każdym miesiącu nadpłać `X + (rata z harmonogramu bez nadpłat − aktualna rata)`, żeby porównanie było uczciwe. Kwoty z miesięcy 1–36 od uruchomienia zbieraj (0%) i nadpłać jednorazowo w miesiącu 37, z ostrzeżeniem o ryzyku utraty dopłat. Porównaj **saldo po 120. racie** w C z `S(120) − nadpłata` w strategii obligacyjnej.

**Wariant D – „nic nie robię”**: saldo `S(120)`, a X co miesiąc ląduje w skarpecie (0%). Pokaż dla kontrastu.

---

## 7. Co pokazuje ekran wyników (kolejność ważna)

1. **Duża karta z odpowiedzią** (jedno zdanie, duża liczba):
   - tryb 1: „Odkładając **1 000 zł** miesięcznie, w **październiku 2033** spłacisz **93 500 zł** z **300 000 zł** długu”,
   - tryb 2: „Żeby spłacić cały kredyt w **październiku 2033**, odkładaj **3 300 zł** miesięcznie”.

   (Liczby przykładowe dla wartości domyślnych i daty symulacji 11.2026.)
2. **Porównanie z punktami odniesienia** (3 poziome słupki: Obligacje wyróżnione kolorem akcentu / Nadpłacanie na bieżąco / Skarpeta, obie szare): dług po 10 latach. Pod spodem jedno zdanie: „Obligacje wygrywają o X zł, bo zarabiają na czysto ok. Y% rocznie, a nadpłata kredytu daje tylko ~2%”. Y = roczna stopa zwrotu netto portfela (IRR z miesięcznych przepływów).
3. **Wykres liniowy (SVG, rysowany ręcznie)**: saldo kredytu (malejące) i wartość portfela netto (rosnąca) w czasie do końca dopłat. Jeśli się przecinają, zaznacz punkt: „od tego miesiąca mógłbyś spłacić całość”.
4. **Co po dopłatach**: tabela 3 scenariuszy (3,5 / 4,5 / 5,5% całkowitego oprocentowania) × (rata bez strategii | niższa rata | krótszy okres o …).
5. **Plan zakupów**: zgrupowany tekstowo, np. „12.2026–02.2027: ROR · 03.2027–09.2030: TOS · 10.2030–09.2033: EDO”. Pod nim rozwijana pełna tabela miesiąc po miesiącu i przycisk **„Pobierz plan (CSV)”** (separator `;`, przecinek dziesiętny, żeby Excel PL otworzył poprawnie).
6. **„Dlaczego ta obligacja?”**: rozwijane. Dla wybranego `h` tabela: każdy typ → ile netto ze 100 zł w dniu końca dopłat, z opłatą za wykup i Belką w osobnych kolumnach.
7. **Ostrzeżenia** (żółte ramki, tylko gdy dotyczy): nadpłata w pierwszych 36 mies.; X niewielokrotne 100 zł; brak sensownej obligacji przy bardzo krótkim horyzoncie; ROS/ROD bez limitu.
8. **Założenia i zastrzeżenia** (stopka): „To symulacja, nie porada finansowa. Oprocentowanie przyszłych emisji obligacji i stóp kredytu jest nieznane. Zasady nadpłaty i prowizje sprawdź w umowie lub w banku”.

Przeliczanie **na żywo** (debounce ~200 ms) przy każdej zmianie pola. Bez przycisku „Oblicz”.

---

## 8. Wymagania UX i techniczne

- **Jeden plik `index.html`**, vanilla JS, zero zależności i CDN. Działa z `file://`, offline. Wykresy jako własne SVG.
- Kod podzielony logicznie: blok `<script id="engine">` z czystymi funkcjami bez dostępu do DOM (kredyt, obligacje, optymalizator, symulacja, IRR) oraz osobny blok UI. Silnik ma być ładowalny w Node do testów (np. `tests.mjs` wycina zawartość `<script id="engine">` z `index.html` i wykonuje ją przez `new Function` / `vm`).
- Formatowanie `pl-PL`: „1 234 zł”, „4,40%”, daty „paź 2033”. Pola procentowe akceptują przecinek i kropkę.
- **Dymki „?”** przy pojęciach (1–2 zdania, prostym językiem): podatek Belki, kapitalizacja, przedterminowy wykup, wskaźnik WIBOR/POLSTR, marża, rata malejąca/równa, dopłata BK2%, „dlaczego nadpłata daje tylko 2%”.
- Responsywność: mobile-first, czytelne od 360 px. Kontrast WCAG AA. Duże pola dotykowe.
- Styl: spokojny, „finansowy”, jeden kolor akcentu, dużo światła, bez emoji poza 1–2 w karcie sukcesu.
- Brak localStorage (plik ma być prosty do wysłania dalej). Opcjonalnie: przycisk „Kopiuj link z ustawieniami” zapisujący parametry w `#hash` URL.
- Walidacja: puste lub absurdalne wartości (okres < 15 lat, data z przyszłości, marża > 10%) → komunikat przy polu, bez wywracania aplikacji.

---

## 9. Testy akceptacyjne (`tests.mjs`, wszystkie muszą przejść)

Parametry dla testów: oferta i założenia domyślne z sekcji 1.2 (inflacja 2,5%, stopa NBP 3,75%), Belka 19%, ROS/ROD wyłączone, chyba że napisano inaczej.

**Kredyt**
1. K = 400 000, n = 300, uruchomienie 10.2023, symulacja 11.2026 → `m0 = 37`, `S(37) = 350 666,67`, rata nr 38 = **1 917,78 zł**, `S(120) = 240 000,00`.
2. Data końca dopłat dla uruchomienia 10.2023 = **10.2033**.

**Pojedyncza obligacja (1 szt., bez reinwestycji kuponów)**
3. EDO trzymane 120 mies. → **145,81 zł** netto (±0,02).
4. EDO sprzedane po 48 mies. → **113,95 zł** (±0,02).
5. TOS sprzedane po 30 mies. → **108,42 zł** (±0,02).
6. COI trzymane 48 mies. (suma kuponów netto + 100) → **113,57 zł** (±0,02).
7. COI sprzedane po 30 mies. → **107,09 zł** (±0,02). Opłata 2 zł zjada całe narosłe odsetki z 3. roku.
8. ROR sprzedane po 6 mies. → **101,04 zł** (±0,02).

**Optymalizator (ciągły, bez ROS/ROD)**
9. `V[120] = 1,4581` (±0,0005); wybór dla `h ∈ [74,120]` = **EDO**; dla `h ∈ [25,47]` = **TOS**; dla `h = 1` = **gotówka**.
10. Z włączonymi ROS/ROD (bez limitu): wybór dla `h ∈ [37,120]` = **ROD**, `V[120] = 1,4926` (±0,0005).

**Scenariusz end-to-end (dane z testu 1)**
11. Tryb „Ile spłacę?”, X = 1 000 zł → nadpłata w 10.2033 ≈ **93 500 zł** (±1,5%), dług po nadpłacie ≈ **146 500 zł**.
12. Wariant C (nadpłacanie na bieżąco, ten sam wydatek) → saldo po 120. racie ≈ **151 100 zł** (±0,5%). Obligacje muszą wygrać.
13. Tryb „Ile muszę odkładać?” → X = **2 600 lub 2 700 zł** (wielokrotność 100), a nadpłata przy tym X ≥ 240 000 zł, przy X − 100 < 240 000 zł.

**Wartości domyślne (K = 500 000, 10.2023, 25 lat, symulacja 11.2026)**
14a. `S(120) = 300 000`, rata nr 38 = **2 397,22 zł**.
14b. X = 1 000 zł → nadpłata ≈ **93 500 zł** (±1,5%); wariant C → saldo ≈ **211 100 zł** (±0,5%).
14c. Tryb „Ile muszę odkładać?” → X = **3 300 lub 3 400 zł**.
14d. „Uwzględnij Uczucia” przy X = 1 000 zł: suma wpłat do skarpety = 83 000 zł, `{KOSZT}` ≈ **10 500 zł** (±15%), `{INFLACJA}` ≈ **6 600 zł** (±10%). Wyłączenie przełącznika przywraca identyczne wyniki jak przed włączeniem.

**Brzegowe**
14. Jednorazowa wpłata 20 000 zł w 12.2026 w trybie 2 zmniejsza wymagane X.
15. Symulacja 11.2033 (h ≈ 0): brak zakupów, wszystko w gotówce, bez błędów.
16. Uruchomienie 03.2025 + X > 0 w wariancie C → pojawia się ostrzeżenie o 36 miesiącach.

Uruchom `node tests.mjs` i pokaż wynik. Jeśli test 11–13 nie mieści się w tolerancji, najpierw sprawdź konwencję liczenia miesięcy (m0, numer raty, `h`), a dopiero potem zmieniaj model.

---

## 10. Kolejność pracy dla Claude Code

1. Zbuduj silnik (sekcje 3–6) + `tests.mjs`. Doprowadź testy do zielonego **przed** pisaniem UI.
2. Zbuduj UI w trybie prostym, potem ekspert.
3. Wykresy SVG, CSV, dymki.
4. Otwórz `index.html` w przeglądarce (lub headless) i sprawdź: domyślne wartości dają wyniki z testów 11–13, przełączanie trybów nie gubi danych, widok mobilny 375 px.
5. Na koniec wypisz listę przyjętych uproszczeń i rzeczy, których nie byłeś pewien.

## 11. Czego NIE robić
- Nie dodawaj frameworków, bundlerów, CDN, fontów z internetu.
- Nie zgaduj przyszłych ofert obligacji. Używaj parametrów i pokazuj je jako założenia.
- Nie pisz rekomendacji typu „kup X”. Aplikacja pokazuje wynik przy założeniach.
- Nie ukrywaj podatku ani opłat. Zawsze pokazuj je osobno w tabelach.
