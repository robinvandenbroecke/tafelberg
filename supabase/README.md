# Tafelberg: Supabase-aanmelding en voortgang

Status: werkversie, niet actief. `cloud-config.js` bevat bewust geen adres. Database, Edge Function en SMTP zijn ingericht. De productie-app verandert pas nadat de echte Auth- en mailproeven zijn afgerond.

## Wat de speler ziet

Eén ouderaccount gebruikt een gebruikersnaam, wachtwoord (12–128 tekens) en herstel-e-mailadres. Het account kan maximaal 50 onafhankelijke klimmers bevatten. Kinderen hebben geen eigen e-mailadres nodig. Iedere klimmer heeft een eigen naam, tafelselectie, sterren, feiten en revisie. Na aanmelden worden alle accountklimmers opgehaald; de gebruiker kiest met wie hij speelt of maakt een nieuwe klimmer aan.

Wachtwoord vergeten is beschikbaar via een herstelmail. Gebruikersnaam vergeten en accountbeheer verlopen voorlopig via de projecteigenaar. E-maillinks moeten via de HTTPS-webapp worden geopend; de APK verwerkt nog geen Android-deeplinks. Daarna kan men met het nieuwe wachtwoord in de APK aanmelden.

### Bestaande lokale voortgang meenemen

- Bij **Account maken** kiest de gebruiker bij **Voortgang bij account maken** eventueel een eerste lokale klimmer. De huidige losse klimmer staat vooraf geselecteerd. Tijdens e-mailbevestiging blijft alle voortgang lokaal beschikbaar; de keuze wordt per gebruikersnaam op dat toestel onthouden. Na bevestiging wordt deze klimmer aan het account toegevoegd.
- Bij **Aanmelden met een bestaand account** wordt geen losse lokale voortgang automatisch geüpload. In het account kiest de gebruiker onder **Lokale voortgang meenemen** een bron en bij **Opslaan als** een nieuwe klimmer of dezelfde persoon die al in het account bestaat. Elke losse lokale klimmer kan afzonderlijk worden toegevoegd.
- Bij koppelen aan een bestaande klimmer wordt de verste volledige versie behouden: sterren, daarna afgeronde rondes/races/sprints, daarna beheersing. Scores worden niet opgeteld. Staat de accountklimmer verder, dan blijft de minder ver gevorderde lokale bron apart bewaard. De gebruiker moet dus zelf dezelfde persoon kiezen; het systeem kan namen niet betrouwbaar koppelen.
- Een lokale bron wordt pas vervangen na serverbevestiging en duurzame lokale opslag. Nieuwe klimmers krijgen een server-ID; een bewaarde aanvraag-ID voorkomt dubbele klimmers bij opnieuw verzenden na een verbindingsfout. Kinderen en accounts worden nooit op basis van een meegestuurde eigenaar gekoppeld.
- **Nog geen lokale voortgang meenemen** maakt een leeg gezinsaccount en behoudt alle lokale klimmers. Een klimmer die al aan een online account gekoppeld is, verschijnt niet als losse bron.

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

De client bewaart één toegangstoken en refresh-token per gezinsaccount. Per klimmer bewaart hij de accountkoppeling, revisie en lokale basisversie in een afzonderlijke opslag (`tafelberg.supabase.v2`). Het wachtwoord wordt alleen voor de aanvraag gebruikt en direct uit het formulier gehaald; het wordt niet lokaal opgeslagen. De voortgangskopie bevat deze sessieopslag niet. De pincode-/Google Sheets-werkversie wordt niet geïmporteerd of geactiveerd.

Het profiel met de meeste sterren wint, daarna het totaal van rondes/races/sprints, daarna de som van de beheersingsniveaus. Er wordt niets tussen toestellen opgeteld. Bij gelijke voortgang mag alleen de actuele revisie instellingen wijzigen. De transactie vergrendelt één account; een identieke herhaling verhoogt de revisie niet opnieuw. Dit voorkomt verlies door oudere uploads, maar voorkomt geen opzettelijk verzonnen scores door de eigenaar zelf. Het spel is geen wedstrijdplatform.

Lokale resultaten blijven bij verbindingsproblemen beschikbaar. Binnenkomende voortgang wordt tijdens een ronde uitgesteld. Ook resultaten van een eerder gekozen speler worden op de achtergrond verzonden. Afmelden of lokaal wissen verwijdert de online voortgang niet. Automatisch bijwerken slaat de lokale voortgang en synchronisatiestatus op; ongeüploade wijzigingen worden na herstart opnieuw aangeboden.

De Android-app krijgt internettoegang plus een native brug die uitsluitend het vaste HTTPS-functieadres accepteert. Redirects worden geweigerd, time-outs en berichtgroottes begrensd. Externe navigatie en universele file-toegang blijven geblokkeerd. De API-URL bevat geen sleutel.

De dienst begrenst pogingen op gehashte IP-/gebruikersnaamsleutels en gebruikt daarnaast Supabase Auth-limieten. Deze grenzen zijn geen garantie tegen volumetrische aanvallen of uitputting van gratis quota. Indien publiek gebruik groeit: CAPTCHA inrichten en de limieten herzien. Cookies of browsercredentials worden niet naar de Edge Function verzonden. Wachtwoorden en tokens horen niet in logs.

## Beperkingen gratis pakket

Gratis projecten kunnen na ongeveer een week met weinig activiteit worden gepauzeerd; online aanmelden/synchroniseren werkt dan pas na hervatten. Lokale voortgang en offline spelen blijven beschikbaar. Quota en beschikbaarheid zijn geen garantie. Bewaar regelmatig een eigen voortgangskopie. SMTP heeft afzonderlijke grenzen en vereist configuratie.

## Controle

- `npm run test:cloud`: echte PostgreSQL-migratie in PGlite, Edge-handler tegen die database en de echte ES5-app in Chromium. Alleen de externe Supabase Auth-service is nagebootst; er worden geen echte gebruikers aangemaakt of herstelmails verstuurd.
- Database: meerdere klimmers per account, afzonderlijke revisies, herhaalde aanmaak zonder duplicaat, RLS, eigenaarcontrole, verboden directe wijzigingen/privélookup, revisies, rangorde, herhalingen, invoer en snelheidslimieten.
- Edge: aanmelden, fouten zonder accountlijst of e-mail te onthullen, tokenverversing, afmelden, herstel, CORS en gebruikersgebonden RPC.
- Browser: overzetten van een lokale klimmer, bevestiging, twee spelers en twee toestellen, offline wijzigingen, uitgesteld toepassen tijdens een ronde, herstel-link en sessies buiten de voortgangskopie.
- `npm test`: bovendien bestaande tafelselectie-, scherm- en offline-/updatetests.
- `.github/workflows/controle.yml`: Chromium + WebKit en een Android-debugbuild op een pull request, zonder signeersleutel en zonder publicatie.

## Ingerichte infrastructuur (4 november 2026)

Project `tafelberg` (`sjzbgdhxtibnbyutlyas`) is aangemaakt in de organisatie Tafelberg, Frankfurt, tegen de bevestigde prijs van €0/maand. Alle drie migraties zijn toegepast en Edge Function `tafelberg` versie 2 is actief. De derde migratie voegt meerdere klimmers per account toe en behoudt bestaande profielen. Een teruggedraaide testtransactie op de echte database bevestigt twee onafhankelijke klimmers bij één account, geen duplicaat na herhaalde aanmaak en geen zichtbaarheid vanuit een tweede account. Zowel Security als Performance Advisors melden geen waarschuwingen. Een transactie met twee tijdelijke testaccounts bevestigt op de echte database dat de ingelogde gebruiker alleen zijn eigen profiel ziet en dat anoniem synchroniseren niet mag; de transactie is teruggedraaid. De Security Advisor meldt geen waarschuwingen na het verplaatsen van de schrijfimplementatie naar het privéschema. De publieke wrapper heeft geen verhoogde privileges.

Auth Site URL en de exacte redirect zijn ingesteld op `https://robinvandenbroecke.github.io/tafelberg/`. De minimumwachtwoordlengte is twaalf tekens; e-mailbevestiging staat aan en anonieme aanmelding staat uit. Eigen SMTP via Brevo is opgeslagen en na herladen gecontroleerd: `smtp-relay.brevo.com`, poort 587, afzendernaam Tafelberg en een bij Brevo geverifieerde afzender. Het bestaande Gmail-afzenderadres heeft nog geen eigen geauthenticeerd domein; Brevo meldt hiervoor een aanbeveling voor betere afleverbaarheid. De SMTP-sleutel staat uitsluitend in de beveiligde Supabase-configuratie en hoort niet in deze repository.

Echte e-mailbevestiging, aanmelden en wachtwoordherstel moeten nog worden gecontroleerd met een tijdelijk testaccount en een afgesproken ontvanger. Er is nog geen testaccount aangemaakt. Het publieke functieadres wordt pas daarna ingevuld; de online-knoppen zijn nog niet geactiveerd. De privé-tabellen hebben expliciete deny-policies, naast ontbrekende directe tabelrechten voor gewone gebruikers.
