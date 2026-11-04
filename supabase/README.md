# Tafelberg: Supabase-aanmelding en voortgang

Status: werkversie, niet actief. `cloud-config.js` bevat bewust geen adres. De productie-app verandert pas nadat de echte database, Auth, mail en beide transports zijn gecontroleerd.

## Wat de speler ziet

Bij een bestaande klimmer: Instellingen → Online bewaren → gebruikersnaam, wachtwoord (12–128 tekens), herhaling en herstel-e-mailadres. Supabase verstuurt een bevestigingsmail. Tot die bevestiging blijft de bestaande voortgang lokaal. Na bevestiging en aanmelden wordt ze gekoppeld aan het account. Een toestel onthoudt meerdere online en lokale spelers. Elk Auth-account heeft een uniek e-mailadres; hetzelfde hersteladres kan niet zonder aanvullende gezinsaccounts voor meerdere accounts worden hergebruikt. Gebruik voor een volgende speler een eigen bereikbaar adres. Dit is een beperking van deze eerste versie, geen voorwaarde voor lokaal spelen.

Gebruikersnaam vergeten of een ander account nodig? Accountbeheer gebeurt voorlopig via de eigenaar van het Supabase-project. Wachtwoord vergeten is beschikbaar via een herstelmail. E-maillinks moeten via de HTTPS-webapp worden geopend; de APK verwerkt nog geen Android-deeplinks. Daarna kan men met het nieuwe wachtwoord in de APK aanmelden.

## Beheerd project activeren

1. Maak een **gratis** Supabase-project voor Tafelberg aan, bij voorkeur Frankfurt (`eu-central-1`). Controleer de prijs vóór aanmaken. Gebruik dit project uitsluitend voor Tafelberg; de Auth-trigger reserveert voor iedere nieuwe gebruiker een Tafelberg-gebruikersnaam.
2. Controleer eerst bestaande tabellen. Pas daarna de SQL onder `migrations/` toe. De gebruikersnamen en limieten staan in `tafelberg_private`, buiten de Data API. Laat uitsluitend `public` in de Data API staan. Voortgang heeft RLS en alleen leesrechten voor de eigenaar; schrijven gaat via de gecontroleerde `tb_sync`-transactie.
3. Stel Auth Site URL en toegestane redirect exact in op `https://robinvandenbroecke.github.io/tafelberg/`. Laat e-mailbevestiging aan; minimum wachtwoordlengte 12. Schakel anonieme accounts en ongebruikte providers uit. Behoud de standaardbeveiligingen en sessieverversing. Auth-rollen worden nooit uit gebruikersmetadata afgeleid.
4. Configureer **eigen SMTP** voor verificatie en herstel. Supabase's standaardmailer is alleen bedoeld voor testadressen van de organisatie en is geen productiemaildienst. Gebruik een geverifieerd afzenderadres bij een mailprovider. Controleer verzendlimieten, ontvangst, spammap en herstel op een tweede toestel. Gebruik nooit de Gmail-koppeling van deze chat als maildienst voor de app. Zet SMTP-geheimen niet in GitHub.
5. Publiceer `functions/tafelberg/index.ts` als Edge Function `tafelberg`, met `verify_jwt=false`: aanmelden/herstel moeten zonder voorafgaande sessie bereikbaar zijn. De functie controleert voor lezen, schrijven en wachtwoordwijziging zelf de gebruiker via Auth. De beheer- en openbare sleutel worden alleen uit de standaard Supabase-serveromgevingsvariabelen gelezen. Geen beheersleutel in de app. Er zijn geen externe Node- of Deno-dependencies.
6. De functie heeft als standaard Site URL het bovenstaande webadres. Optioneel kan `TAFELBERG_SITE_URL` serverzijdig worden ingesteld. Alleen de web-origin en `null` voor de APK krijgen browser-CORS. Auth is ook bij een ontbrekende of vervalste Origin verplicht voor voortgang; CORS vervangt geen aanmelding.
7. Gebruik de teruggegeven project-API-URL om het functieadres te bepalen; schrijf alleen dat publieke adres (eindigend op `/functions/v1/tafelberg`) in `app/src/main/assets/www/js/cloud-config.js`. Laat de enkele aanhalingstekens staan voor de Android-brug.
8. Test op de echte dienst met wegwerpaccounts: e-mailbevestiging, gebruikersnaam/wachtwoord, verkeerde gegevens, twee spelers, twee toestellen, sessieverversing, offline→online, gelijktijdige uploads en herstel. Bekijk Auth-/Edge-logs en Security/Performance Advisors. Een nagebootste Auth-test vervangt dit niet.
9. Publiceer pas daarna de webapp. De APK moet opnieuw gebouwd en geïnstalleerd worden; de vaste signeersleutel en bestaande APK-workflow blijven ongewijzigd.

## Synchronisatie en veiligheid

De server leidt de eigenaar uitsluitend af uit de geverifieerde Auth-gebruiker. Een meegestuurde gebruikers-ID bepaalt nooit tot welk profiel toegang bestaat. De Auth-trigger registreert een unieke, genormaliseerde gebruikersnaam; latere wijzigingen in `user_metadata` geven geen extra rechten en veranderen die naam niet.

De client bewaart per speler toegangstoken, refresh-token, revisie en een lokale basisversie in een afzonderlijke opslag (`tafelberg.supabase.v1`). Het wachtwoord wordt alleen voor de aanvraag gebruikt en direct uit het formulier gehaald; het wordt niet lokaal opgeslagen. De voortgangskopie bevat deze sessieopslag niet. De pincode-/Google Sheets-werkversie wordt niet geïmporteerd of geactiveerd.

Het profiel met de meeste sterren wint, daarna het totaal van rondes/races/sprints, daarna de som van de beheersingsniveaus. Er wordt niets tussen toestellen opgeteld. Bij gelijke voortgang mag alleen de actuele revisie instellingen wijzigen. De transactie vergrendelt één account; een identieke herhaling verhoogt de revisie niet opnieuw. Dit voorkomt verlies door oudere uploads, maar voorkomt geen opzettelijk verzonnen scores door de eigenaar zelf. Het spel is geen wedstrijdplatform.

Lokale resultaten blijven bij verbindingsproblemen beschikbaar. Binnenkomende voortgang wordt tijdens een ronde uitgesteld. Ook resultaten van een eerder gekozen speler worden op de achtergrond verzonden. Afmelden of lokaal wissen verwijdert de online voortgang niet. Automatisch bijwerken slaat de lokale voortgang en synchronisatiestatus op; ongeüploade wijzigingen worden na herstart opnieuw aangeboden.

De Android-app krijgt internettoegang plus een native brug die uitsluitend het vaste HTTPS-functieadres accepteert. Redirects worden geweigerd, time-outs en berichtgroottes begrensd. Externe navigatie en universele file-toegang blijven geblokkeerd. De API-URL bevat geen sleutel.

De dienst begrenst pogingen op gehashte IP-/gebruikersnaamsleutels en gebruikt daarnaast Supabase Auth-limieten. Deze grenzen zijn geen garantie tegen volumetrische aanvallen of uitputting van gratis quota. Indien publiek gebruik groeit: CAPTCHA inrichten en de limieten herzien. Cookies of browsercredentials worden niet naar de Edge Function verzonden. Wachtwoorden en tokens horen niet in logs.

## Beperkingen gratis pakket

Gratis projecten kunnen na ongeveer een week met weinig activiteit worden gepauzeerd; online aanmelden/synchroniseren werkt dan pas na hervatten. Lokale voortgang en offline spelen blijven beschikbaar. Quota en beschikbaarheid zijn geen garantie. Bewaar regelmatig een eigen voortgangskopie. SMTP heeft afzonderlijke grenzen en vereist configuratie.

## Controle

- `npm run test:cloud`: echte PostgreSQL-migratie in PGlite, Edge-handler tegen die database en de echte ES5-app in Chromium. Alleen de externe Supabase Auth-service is nagebootst; er worden geen echte gebruikers aangemaakt of herstelmails verstuurd.
- Database: RLS, eigenaarcontrole, verboden directe wijzigingen/privélookup, revisies, rangorde, herhalingen, invoer en snelheidslimieten.
- Edge: aanmelden, fouten zonder accountlijst of e-mail te onthullen, tokenverversing, afmelden, herstel, CORS en gebruikersgebonden RPC.
- Browser: overzetten van een lokale klimmer, bevestiging, twee spelers en twee toestellen, offline wijzigingen, uitgesteld toepassen tijdens een ronde, herstel-link en sessies buiten de voortgangskopie.
- `npm test`: bovendien bestaande tafelselectie-, scherm- en offline-/updatetests.
- `.github/workflows/controle.yml`: Chromium + WebKit en een Android-debugbuild op een pull request, zonder signeersleutel en zonder publicatie.
