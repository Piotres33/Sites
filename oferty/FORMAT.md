# Format plików ofert

Folder oferty: `C:\Users\Lodomir\Documents\Openbot\Kupowanie elektroniki\oferty\dane\<ID>\`.
Narzędzia: `C:\Users\Lodomir\OpenBot\Shared\narzedzia\`. Nie zapisuj w `kosz` ani w `ulubione.json` (zmienia je użytkownik).
Dane przekazujemy plikami, a w wiadomościach między botami podajemy tylko `[ID: …]` i jedno zdanie.

| Kolejność | Plik | Kto | Jak |
|---|---|---|---|
| 1 | `szacownik.json` | Adi | `szacownik\szacuj.cmd "<link>" --fraza … --model … --zapisz <ID>` |
| 2 | `weryfikacja.json` | Mietek | usterki i ostrzeżenia sprawdzone z opisem (format niżej) |
| 3 | `diagnoza.json` | Mietek | części, warianty, ryzyko (format niżej) |
| 4 | `sito.json` / `odrzucona.json` | kalkulator | `kalkulator\kalkuluj.cmd <ID> --sito` – przy ODPUŚĆ sam zapisuje `odrzucona.json` |
| 5 | `czesci.json` | Rabin | konkretne oferty części (format niżej) |
| 6 | `raport.json` | kalkulator | `kalkulator\kalkuluj.cmd <ID> --uzasadnienie "…"` (uruchamia Andrzej) |

Kalkulator i `szacuj.cmd --zapisz` same odświeżają stronę. Po ręcznej zmianie pliku uruchom `strona-ofert\odswiez.cmd`.
Kod wyjścia 1 = błąd w pliku; komunikat podaje plik i pole. Popraw i uruchom ponownie.

## weryfikacja.json (Mietek)

```json
{ "id": "<ID>", "usterki": ["…"], "ostrzezenia": ["…"], "poprawki": [{ "adi": "co podało narzędzie", "mietek": "poprawka i powód" }] }
```

## diagnoza.json (Mietek)

```json
{
  "id": "<ID>",
  "model": "Xbox Series X 1TB (model 1882)",
  "ryzyko": 6,
  "czas_pracy_h": 3,
  "diagnoza": "2–4 zdania: objaw, podejrzane układy, czego brakuje.",
  "wartosc_na_czesci": 900,
  "cena_sprzedazy": null,
  "cena_sprzedazy_powod": null,
  "czesci": [
    { "klucz": "zasilacz", "nazwa": "Zasilacz wewnętrzny EP2-18849", "grupa": "naprawa", "szacunek": 250 },
    { "klucz": "plyta", "nazwa": "Płyta główna 1882 EMEA", "grupa": "wymiana_plyty", "szacunek": 800 }
  ],
  "warianty": [
    { "nazwa": "A) Wymiana zasilacza", "czesci": ["zasilacz"], "szansa_pct": 60, "czas_h": 1 },
    { "nazwa": "B) Zakup płyty", "czesci": ["plyta"], "szansa_pct": 85, "czas_h": 2 }
  ]
}
```

- `grupa`: `niezbedne` (doliczana do każdego wariantu, np. brakujący RAM/SSD/gładzik), `naprawa`, `wymiana_plyty`, `gorsza_diagnoza` (Rabin nie wycenia).
- `szacunek`: typowa cena części z dostawą w zł (tani zamiennik) – tylko do sita; Rabin poda prawdziwą.
- `wartosc_na_czesci`: za ile realnie sprzedasz sprzęt na części (plan B); `null`, gdy nie wiesz.
- `cena_sprzedazy`: tylko gdy porównania w szacownik.json są złe (inny model/konfiguracja) – wtedy podaj ostrożną cenę sprawnego i powód. Inaczej `null`.
- `szansa_pct`: szansa powodzenia wariantu, `null` gdy nie wiesz.

## czesci.json (Rabin)

```json
{
  "id": "<ID>",
  "czesci": {
    "zasilacz": {
      "tania": { "tytul": "dosłownie ze strony", "numer": "17416925523", "stan": "używany", "typ": "Kup teraz", "cena": 200, "dostawa": 10.49, "link": "https://allegro.pl/oferta/…" },
      "oem": "brak"
    }
  }
}
```

Klucze części jak w `diagnoza.json`. `dostawa`: `null`, gdy strona jej nie podaje. Brak oferty = `"brak"`.

## Zasady kalkulacji (kalkulator)

- Cena sprzedaży: `cena_sprzedazy` Mietka, inaczej dolny kwartyl przy ≥ 5 ofertach, inaczej najtańsza oferta; wolny popyt −10%. Ceny porównawcze to ceny ogłoszeń, nie transakcji.
- Wpływ netto = cena × (1 − rabat 10%) × (1 − prowizja 8%) – ustawienia: `szacownik\ustawienia.json`.
- Zysk = wpływ netto − zakup z dostawą − części (niezbędne + części wariantu). ROI = zysk / koszt.
- Najlepszy wariant – wg zysku oczekiwanego (szansa × zysk + porażka × plan B), bez szansy – wg zysku.
- Cena maks.: ROI ≥ max(30%, ryzyko × 10%) i zysk ≥ 150 zł. Werdykt: KUP (cena ≤ maks.), NEGOCJUJ (maks. ≥ 70% ceny; w sicie 60%), inaczej ODPUŚĆ; ryzyko > 8 = ODPUŚĆ.
