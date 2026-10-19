(function () {
  'use strict';
  var ua = navigator.userAgent, promptEvent = null, host = document.getElementById('instructions');
  var pointer = document.getElementById('pointer'), ready = false;
  var ipad = /iPad/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var ios = ipad || /iPhone|iPod/i.test(ua), android = /Android/i.test(ua);
  var embedded = /FBAN|FBAV|Instagram|WhatsApp|\bLine\/|LinkedInApp|GSA\/|Gmail|Messenger|; wv\)|\bwv\b/i.test(ua) || (/AppleWebKit/i.test(ua) && ios && !/Safari|CriOS|FxiOS|EdgiOS/i.test(ua));
  var browser = /CriOS/i.test(ua) ? 'Chrome' : (/EdgiOS/i.test(ua) ? 'Edge' : (/FxiOS/i.test(ua) ? 'Firefox' : 'Safari'));
  function el(tag, text, cls) { var n = document.createElement(tag); if (text) n.appendChild(document.createTextNode(text)); if (cls) n.className = cls; return n; }
  function standalone() { return navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches); }
  function step(list, kind, text, note) {
    var li = el('li'), mark = el('span', '', 'step-icon'), body = el('span', text);
    if (kind === 'share') {
      var svg = document.createElementNS('http://www.w3.org/2000/svg','svg'); svg.setAttribute('viewBox','0 0 24 24');
      var path = document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d','M7 9H4v12h16V9h-3M12 16V2M7 7l5-5 5 5');svg.appendChild(path);mark.appendChild(svg);
    } else mark.appendChild(el('b', kind));
    if (note) body.appendChild(el('small', note)); li.appendChild(mark);li.appendChild(body);list.appendChild(li);
  }
  function copyLink() {
    var text = location.href.split('?')[0].split('#')[0];
    function fallback() { var input = el('input', '', 'link-code');input.value=text;input.readOnly=true;input.setAttribute('aria-label','Installatielink');host.appendChild(input);input.focus();input.select(); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function(){host.appendChild(el('p','Link gekopieerd.'));},fallback); else fallback();
  }
  function render() {
    if (!ready) return;
    host.innerHTML='';pointer.className='';pointer.textContent='';
    var steps = el('ol', '', 'steps');
    if (embedded) {
      host.setAttribute('data-device','in-app');
      host.appendChild(el('h2', 'Open deze pagina in ' + (ios ? 'Safari' : 'Chrome')));
      host.appendChild(el('p', 'Tik op de ⋯-knop van deze app en kies ‘Open in browser’. Of kopieer de link en plak hem in je browser.'));
      var copy=el('button','Link kopiëren','copy-btn');copy.addEventListener('click',copyLink,false);host.appendChild(copy);
    } else if (ios) {
      host.setAttribute('data-device',ipad?'ipad':('ios-'+browser.toLowerCase()));
      host.appendChild(el('h2','Zo zet je Tafelberg op je beginscherm'));
      var where = ipad ? 'rechtsboven, naast de adresbalk' : (browser==='Safari'?'onderaan het scherm':(browser==='Chrome'?'rechts in de adresbalk':'in het menu van '+browser));
      step(steps,'share','Tik op het deel-icoon '+where+'.', 'Een vierkant met een pijl omhoog. Staat het icoon elders? Kijk ook in het menu ⋯.');
      step(steps,'+','Kies ‘Zet op beginscherm’.','Scroll zo nodig eerst naar beneden in de lijst.');
      step(steps,'✓','Tik op ‘Voeg toe’.','Laat ‘Open als webapp’ aan als je die keuze ziet.');
      host.appendChild(steps);
      if(browser!=='Safari')host.appendChild(el('p','Dit kan vanaf iOS 16.4. Zie je de keuze niet? Open de link in Safari.'));
      pointer.className=ipad?'point-top':'point-bottom';pointer.textContent=ipad?'↑':'↓';
    } else if (android) {
      host.setAttribute('data-device',promptEvent?'android-prompt':'android-menu');
      if(promptEvent) {
        var btn=el('button','Installeer Tafelberg','install-btn');
        btn.addEventListener('click',function(){
          var saved=promptEvent;promptEvent=null;
          try { saved.prompt(); saved.userChoice.then(function(choice){
            if(choice.outcome==='accepted')done();else render();
          },function(){render();}); } catch(e){render();}
        },false);host.appendChild(btn);
      } else {
        step(steps,'⋮','Open het menu van je browser.');
        step(steps,'+','Kies ‘App installeren’ of ‘Toevoegen aan startscherm’.');
        step(steps,'✓','Bevestig met ‘Installeren’ of ‘Toevoegen’.');host.appendChild(steps);
      }
    } else {
      host.setAttribute('data-device','desktop');
      host.appendChild(el('h2','Neem je telefoon of tablet erbij'));
      var qr=el('img','','qr');qr.src='qr.svg';qr.alt='QR-code naar deze installatiepagina';qr.width=200;qr.height=200;host.appendChild(qr);
      host.appendChild(el('p','Scan dit met de tablet of telefoon van je kind.'));
    }
  }
  function done(){ host.innerHTML='';pointer.className='';pointer.textContent='';host.appendChild(el('p','Klaar! Je vindt Tafelberg op je beginscherm.')); }
  window.addEventListener('beforeinstallprompt',function(event){ event.preventDefault();promptEvent=event;render(); },false);
  window.addEventListener('appinstalled',done,false);
  if (standalone()) { location.replace('../'); return; }
  ready=true;render();
  // Chrome kan de installatiegebeurtenis pas na de eerste render sturen.
  if(android&&!promptEvent)setTimeout(render,2000);
  if(location.protocol==='https:'&&'serviceWorker' in navigator)navigator.serviceWorker.register('../sw.js',{scope:'../'}).then(function(){},function(){});
}());
