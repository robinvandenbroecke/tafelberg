# Online bewaren met Google Sheets

Deze werkversie is nog niet geactiveerd: `js/cloud-config.js` bevat bewust een lege URL. De bestaande app blijft daardoor lokaal werken. Publiceer de webdienst pas na goedkeuring van de hieronder beschreven toegang en na een controle van de echte Google-verbinding.

## Voorbereiden

Gebruik een privéspreadsheet met de tabbladen Spelers, Voortgang, Rondes en Sessies. De kolommen staan in deze volgorde:

- Spelers: user_id, username, display_name, pin_hash, pin_salt, pin_algorithm, pin_parameters_json, created_at, updated_at, failed_attempts, locked_until, recovery_hash.
- Voortgang: user_id, revision, schema_version, player_json, updated_at, last_device_id.
- Rondes: round_id, user_id, device_id, started_at, finished_at, received_at, base_revision, state_hash. Dit is een synchronisatielogboek: het laatste veld bevat een hash van de volledige momentopname, geen afzonderlijk antwoord of volledige spelopslag.
- Sessies: session_id, user_id, device_id, token_hash, created_at, expires_at, last_seen_at, revoked_at.

Voer `npm ci` en `npm run build:sync` uit. Kopieer Code.gs, Password.gs en Progress.gs als aparte scriptbestanden naar Apps Script, Bridge.html als HTML-bestand en appsscript.json als manifest. Samenvoegen van de drie scriptbestanden in Code.gs kan ook. Houd de licentie bij de broncode.

Stel onder Projectinstellingen → Scriptproperty's `SPREADSHEET_ID` in. De dienst maakt bij de eerste aanvraag zelf een geheime `PEPPER`. Zet die nooit in GitHub, de webapp of de spreadsheet. Wijzig of verwijder die niet: bestaande pincodes kunnen dan niet meer worden gecontroleerd.

## Toegang en activeren

De web-app moet worden uitgevoerd als de eigenaar en toegankelijk zijn voor **Iedereen**, zodat kinderen alleen hun Tafelberg-gebruikersnaam en pincode nodig hebben. De API is daarmee publiek bereikbaar; gebruikersgegevens worden uitsluitend na geldige Tafelberg-aanmelding teruggegeven. De spreadsheet zelf blijft privé. Apps Script vraagt de eigenaar een Google-machtiging om spreadsheets te lezen en te schrijven; de gebruikte OAuth-scope geldt voor alle spreadsheets van dat Google-account, hoewel deze code uitsluitend de ingestelde spreadsheet opent. Geef deze toegang alleen na bewuste goedkeuring. Een afzonderlijk Google-account voor Tafelberg beperkt die bevoegdheid.

Kopieer na implementatie de definitieve HTTPS-URL die eindigt op `/exec` naar `window.TB_CLOUD_URL` in `app/src/main/assets/www/js/cloud-config.js` (enkele aanhalingstekens behouden). Bouw daarna webapp en APK opnieuw. Test de URL ook uitgelogd van Google: aanmelden, twee gebruikers gescheiden, tweede toestel, offline spelen en opnieuw verbinden. Pas daarna de status in de spreadsheet aan en publiceer naar main.

## Welke voortgang blijft bewaard?

De volledige spelersversie met de meeste verdiende sterren wint. Bij gelijkstand tellen eerst het aantal afgeronde oefen-, race- en sprintrondes en daarna de totale beheersing van de sommen. Voortgang wordt niet opgeteld tussen toestellen. Bij een gelijke stand en een verouderde revisie blijft de bestaande serverversie staan. Herhaalde uploads hebben een uniek wijzigings-ID en verhogen de revisie niet opnieuw. Een versie die tijdens een ronde binnenkomt, wordt pas op een veilig scherm toegepast.

Er zijn meerdere lokale én online spelers mogelijk. De zescijferige pincode wordt met PBKDF2-SHA256 (600.000 iteraties), een unieke salt en een geheime serverwaarde verwerkt. Pincodes worden niet bewaard. Er zijn tijdslimieten voor mislukte aanmeldingen en registratie. Sessietokens verlopen na dertig dagen; alleen hun hash staat in de spreadsheet. Herstel gebruikt een afzonderlijke code die één keer wordt getoond. Bewaar die bij een ouder. Een voortgangskopie bevat geen sessietokens of pincodes.

Offline blijft het spel lokale voortgang opslaan. Online aanmelden en nieuwe spelers ophalen vragen internet. Opnieuw aanmelden overschrijft nooit een bestaande lokale versie die verder staat. Een lokale reset ontkoppelt die klimmer van online bewaren; de verste online versie wordt niet gewist.

## Grenzen en onderhoud

Google Apps Script en Sheets hebben dagquota; dit is bedoeld voor een kleine groep, zonder beschikbaarheidsgarantie. De dienst begrenst aanvragen en het aantal accounts; een profiel past in één cel en is maximaal 44.000 tekens. Bewaar regelmatig een privékopie van de spreadsheet en beveilig het eigenaaraccount. Verwijder verlopen sessies en oude logboekregels alleen na een back-up en behoud recente wijzigings-ID's om herhalingen te herkennen. Opgeslagen gebruikersnamen, namen en voortgang zijn privégegevens; deel het bestand niet openbaar.

## Tests

`npm run test:sync` controleert de serverlogica met een geïsoleerde Sheet-simulatie en het echte appscherm in Chromium met een nagebootste Android-transportlaag. Daaronder vallen aanmelden, meerdere spelers, pincode en herstel, blokkering na mislukte aanmeldingen, herhaalde uploads, gegevensscheiding, offline wijzigingen, behoud van de verste versie en uitgesteld toepassen tijdens een ronde. Dit bewijst nog niet de echte Google-publicatie, HTML-iframeverbinding, quota of de native Android-netwerklaag. Controleer die na het verkrijgen van de machtiging op de echte dienst en APK.

De APK heeft hiervoor internettoegang en een beperkte `AndroidSync`-brug nodig. Alleen de in het APK-asset ingestelde Apps Script-URL wordt geaccepteerd; redirects moeten HTTPS blijven en op de twee toegestane Google-hosts uitkomen. De WebView blijft externe navigaties blokkeren. De bestaande APK-workflow en signeersleutel blijven ongewijzigd.
