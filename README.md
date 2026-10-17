# Tafelberg

Een maaltafelspel voor het tweede leerjaar, gemaakt voor Hector. Elke tafel is een berg. Wie de sommen van een tafel vlot kent, klimt naar de top en plant er een vlag.

Het spel draait volledig offline als Android-app en is afgestemd op twee toestellen: een Samsung Galaxy Tab S3 (kleur, liggend of staand) en een Boox Note (e-ink, meestal staand). Op een Boox start het vanzelf in een zwart-witweergave zonder beweging.

## Wat zit erin

- **Bergen**: het startscherm toont de tien tafels als een bergketen. Het gele pad op elke berg toont hoe ver hij al geklommen is.
- **Tafel bekijken**: per som een stippenmodel met groepjes, de som als herhaald optellen, en een tip om ze slim af te leiden.
- **Klim de tafelrij**: de tafel als telrij opzeggen, steen per steen naar de top, en daarna achteruit naar beneden.
- **Oefenen**: korte rondes met een eigen toetsenblok. Gemengd over de gekozen tafels of per tafel.
- **Mijn tafelkaart**: alle honderd sommen in één rooster, gekleurd volgens hoe goed ze zitten.
- **Instellingen**: naam, welke tafels meetellen, lengte van een ronde, deelsommen, e-inkweergave, geluid.

## Didactische opbouw

Het spel volgt de gebruikelijke lijn uit de klas: begrijpen, afleiden, automatiseren.

1. **Begrijpen.** Een vermenigvuldiging is een aantal groepjes: 4 × 3 zijn vier groepjes van drie. Dat wordt getoond met stippen in bakjes, met een vijfstructuur zodat aantallen in één oogopslag te zien zijn.
2. **Afleiden.** Hints vertrekken van de steunpunttafels 1, 2, 5 en 10 (5 × is de helft van 10 ×, 9 × is 10 × min één keer, 4 × is het dubbel van 2 ×) en van de wisseleigenschap.
3. **Automatiseren.** Elke som heeft een eigen niveau, volgens het Leitner-principe met gespreide herhaling. Juist en vlot (binnen ongeveer vijf seconden, typen inbegrepen) laat een som stijgen; ze komt dan pas na een dag terug, daarna na twee, vier en negen dagen. Stijgen kan alleen als de som aan de beurt is, zodat herhaling over meerdere dagen gespreid blijft.

Verder:

- **Kleine porties nieuw.** Een ronde brengt maar enkele nieuwe sommen tegelijk binnen. Kent het kind een nieuwe som meteen vlot, dan komt er een volgende bij. Na twee moeilijke sommen volgt bewust een som die al goed gaat.
- **Fouten als leermoment.** Na een fout ziet het kind meteen het stippenmodel en een hint, typt het de juiste uitkomst zelf over, en krijgt het dezelfde som enkele vragen later opnieuw. Veelvoorkomende fouten krijgen gerichte uitleg, zoals optellen in plaats van vermenigvuldigen of één groepje te veel.
- **Hulp vragen mag.** De knop Hulp toont het model zonder de uitkomst. Een som met hulp telt als nog niet gekend, zonder dat het als fout voelt.
- **Afwisseling in vorm.** Sommen die al goed gaan, komen ook als wisselsom (3 × 4 naast 4 × 3) en met een ontbrekend getal (? × 4 = 12). Deelsommen (12 : 3) kunnen in de instellingen aan.
- **Geen klok in beeld.** Snelheid telt mee voor het niveau, maar wordt enkel zichtbaar als beloning (een bliksem). Fouten worden nooit in rood getoond.

## Installeren

Elke push naar `main` bouwt automatisch een APK via GitHub Actions. Die staat op twee plaatsen:

- bij de laatste **release** (Releases → Tafelberg.apk), handig om rechtstreeks op de tablet te downloaden;
- als **artefact** bij elke run onder Actions.

Op de tablet: download `Tafelberg.apk`, open het bestand en sta de installatie toe wanneer Android vraagt om apps uit deze bron te vertrouwen. Een nieuwere versie installeer je er gewoon overheen; de voortgang blijft bewaard.

## Signeren

De APK wordt ondertekend met een vaste sleutel uit de repository-secrets, zodat updates over een bestaande installatie heen gaan:

| Secret | Inhoud |
| --- | --- |
| `TAFELBERG_KEYSTORE_B64` | de keystore, base64-gecodeerd |
| `TAFELBERG_KEYSTORE_PASSWORD` | wachtwoord van de keystore |
| `TAFELBERG_KEY_ALIAS` | alias van de sleutel |
| `TAFELBERG_KEY_PASSWORD` | wachtwoord van de sleutel |

Zonder die secrets bouwt de workflow toch, maar met een tijdelijke sleutel. Een volgende versie vraagt dan eerst een verwijdering van de oude, en dan gaat de voortgang verloren.

## Opbouw van het project

```
app/src/main/assets/www/   het spel zelf (HTML, CSS, JavaScript, lettertypen)
app/src/main/java/...      de Android-schil: een schermvullende WebView
.github/workflows/         de bouwstraat voor de APK
```

Het spel is gewone HTML en JavaScript zonder bibliotheken, bewust in ES5 geschreven zodat ook oudere WebViews op e-inklezers het draaien. Open `app/src/main/assets/www/index.html` in een browser om het zonder Android te proberen; met `?eink=1` achter de URL zie je de e-inkweergave.

Lokaal bouwen kan met `./gradlew assembleRelease` (Java 17 en de Android SDK zijn nodig).

## Lettertypen

Fredoka (koppen en cijfers) en Andika (tekst, ontworpen voor beginnende lezers), beide onder de SIL Open Font License. De licenties staan in `app/src/main/assets/www/fonts/`.
