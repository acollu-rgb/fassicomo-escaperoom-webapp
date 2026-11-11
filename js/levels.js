/* ============================================================
   levels.js — contenuti didattici dell'Escape Room
   Scuola Fassicomo · versione 2.0.4
   Espone window.LEVELS = { titles, variants, modeInfo }
   ============================================================ */
(function (global) {
  'use strict';

  const titles = {
    1: 'Crittografia (Cifrario di Cesare)',
    2: 'Sviluppo Web — scopri il token',
    3: 'Sistemi numerici (codice binario)',
    4: 'Reti di computer',
    5: 'Cybersecurity e phishing',
    6: 'Identificazione delle minacce',
    7: 'Enigma — logical password',
    8: 'Keyboard cipher e secret code'
  };

  const variants = {
    1: [
      { code: '1a', text: 'Decifra il messaggio cifrato con il cifrario di Cesare (chiave di spostamento: III): <code>KDFNHU</code>', ans: 'HACKER' },
      { code: '1b', text: 'Decifra il messaggio cifrato con il cifrario di Cesare (chiave di spostamento: III): <code>FRGLFH</code>', ans: 'CODICE' },
      { code: '1c', text: 'Decifra il messaggio cifrato con il cifrario di Cesare (chiave di spostamento: III): <code>VHUYHU</code>', ans: 'SERVER' },
      { code: '1d', text: 'Decifra il messaggio cifrato con il cifrario di Cesare (chiave di spostamento: III): <code>DUGXLQR</code>', ans: 'ARDUINO' },
      { code: '1e', text: 'Decifra il messaggio cifrato con il cifrario di Cesare (chiave di spostamento: III): <code>ZHE</code>', ans: 'WEB' },
      { code: '1f', text: 'Decifra il messaggio cifrato con il cifrario di Cesare (chiave di spostamento: III): <code>OLQHD</code>', ans: 'ILINE' },
      { code: '1g', text: 'Decifra il messaggio cifrato con il cifrario di Cesare (chiave di spostamento: III): <code>PRQLWRU</code>', ans: 'MONITOR' },
      { code: '1h', text: 'Decifra il messaggio cifrato con il cifrario di Cesare (chiave di spostamento: III): <code>FDYDO</code>', ans: 'CAVAL' },
      { code: '1i', text: 'Decifra il messaggio cifrato con il cifrario di Cesare (chiave di spostamento: III): <code>FRPSXWHU</code>', ans: 'COMPUTER' }
    ],
    2: [
      { code: '2a', ans: 'ROOT' },
      { code: '2b', ans: 'ADMIN' },
      { code: '2c', ans: 'CYBER' },
      { code: '2d', ans: 'FIREWALL' },
      { code: '2e', ans: 'TOKEN' },
      { code: '2f', ans: 'SICURO' },
      { code: '2g', ans: 'NETA2026' },
      { code: '2h', ans: 'FLASH' },
      { code: '2i', ans: 'PING' }
    ],
    3: [
      { code: '3a', text: 'Converti il seguente byte binario in numero decimale: <code>00001010</code>', ans: '10' },
      { code: '3b', text: 'Converti il seguente byte binario in numero decimale: <code>00001101</code>', ans: '13' },
      { code: '3c', text: 'Converti il seguente byte binario in numero decimale: <code>00010001</code>', ans: '17' },
      { code: '3d', text: 'Converti il seguente byte binario in numero decimale: <code>00010100</code>', ans: '20' },
      { code: '3e', text: 'Converti il seguente byte binario in numero decimale: <code>00011011</code>', ans: '27' },
      { code: '3f', text: 'Converti il seguente byte binario in numero decimale: <code>00000101</code>', ans: '5' },
      { code: '3g', text: 'Converti il seguente byte binario in numero decimale: <code>00010010</code>', ans: '18' },
      { code: '3h', text: 'Converti il seguente byte binario in numero decimale: <code>00011110</code>', ans: '30' },
      { code: '3i', text: 'Converti il seguente byte binario in numero decimale: <code>00100000</code>', ans: '32' }
    ],
    4: [
      { code: '4a', q: 'Quale tra questi è un indirizzo IP locale di default comunemente usato nei router di casa?', opts: ['192.168.1.1', '255.255.255.255', '8.8.8.8', '10.0.0.0.1'], ans: '192.168.1.1', hint: 'Gli indirizzi IP di casa iniziano quasi sempre con 192.168…' },
      { code: '4b', q: 'Quale protocollo garantisce la trasmissione sicura e crittografata dei dati sul web?', opts: ['HTTP', 'HTTPS', 'FTP', 'SMTP'], ans: 'HTTPS', hint: 'Cerca la sigla con la "S" finale, che sta per Security.' },
      { code: '4c', q: 'Quale dispositivo instrada i pacchetti di dati tra reti diverse (per esempio casa e Internet)?', opts: ['Switch', 'Router', 'Modem', 'Access Point'], ans: 'Router', hint: 'Il nome deriva dalla parola inglese "route" (percorso).' },
      { code: '4d', q: 'Quale servizio converte i nomi di dominio (per esempio google.com) in indirizzi IP numerici?', opts: ['DHCP', 'DNS', 'IPSEC', 'NAT'], ans: 'DNS', hint: 'Significa Domain Name System.' },
      { code: '4e', q: 'Che cos’è il "Default Gateway" in una rete informatica?', opts: ['Il punto di uscita/router verso Internet', 'La password del Wi-Fi', 'Un antivirus di rete', 'Il cavo Ethernet di collegamento'], ans: 'Il punto di uscita/router verso Internet', hint: 'È la "porta di uscita" verso l’esterno.' },
      { code: '4f', q: 'Quale porta è associata per convenzione al traffico web sicuro HTTPS?', opts: ['21', '80', '443', '25'], ans: '443', hint: 'È la porta che il browser mostra quando l’indirizzo inizia con https://.' },
      { code: '4g', q: 'Quale dispositivo collega una rete domestica a Internet?', opts: ['Stampante', 'Modem-router', 'Tastiera', 'Monitor'], ans: 'Modem-router', hint: 'Unisce la funzione di modem e quella di router.' },
      { code: '4h', q: 'Quale indirizzo appartiene alla rete privata locale?', opts: ['192.168.0.15', '8.8.8.8', '1.1.1.1', '200.100.50.25'], ans: '192.168.0.15', hint: 'Gli indirizzi privati iniziano con 192.168, 10 oppure 172.16–31.' },
      { code: '4i', q: 'Che cosa indica la sigla Wi-Fi?', opts: ['Wireless Fidelity', 'Wired Firewall', 'Web File', 'Wireless File Interface'], ans: 'Wireless Fidelity', hint: 'Il nome commerciale deriva da "wireless" e "fidelity".' }
    ],
    5: [
      { code: '5a', q: 'Quale tipo di attacco informatico usa e-mail false per rubare password e dati personali?', opts: ['Phishing', 'Malware', 'DDoS', 'Brute Force'], ans: 'Phishing', hint: 'Il nome deriva dalla pronuncia inglese di "pescare" (fishing).' },
      { code: '5b', q: 'Come si chiama un programma malevolo nascosto dentro un software apparentemente utile?', opts: ['Trojan', 'Worm', 'Spyware', 'Adware'], ans: 'Trojan', hint: 'Prende il nome dal cavallo di Troia della mitologia.' },
      { code: '5c', q: 'Quale attacco intasa un server con richieste fittizie fino a renderlo irraggiungibile?', opts: ['Phishing', 'DDoS', 'Man in the Middle', 'SQL Injection'], ans: 'DDoS', hint: 'Significa Distributed Denial of Service.' },
      { code: '5d', q: 'Come si definisce un malware che cifra i dati della vittima e chiede un riscatto per sbloccarli?', opts: ['Spyware', 'Ransomware', 'Keylogger', 'Rootkit'], ans: 'Ransomware', hint: 'In inglese "ransom" significa proprio "riscatto".' },
      { code: '5e', q: 'L’arte di manipolare le persone per farsi consegnare informazioni riservate si chiama:', opts: ['Phishing', 'Social Engineering', 'Hacking etico', 'Spoofing'], ans: 'Social Engineering', hint: 'Unisce i concetti di "sociale" e "ingegneria".' },
      { code: '5f', q: 'Quale attacco prova molte password fino a trovare quella corretta?', opts: ['Brute force', 'Phishing', 'Spoofing', 'Backup'], ans: 'Brute force', hint: 'In inglese "brute force" significa forza bruta.' },
      { code: '5g', q: 'Come si chiama un programma che registra i tasti premuti?', opts: ['Keylogger', 'Firewall', 'Router', 'VPN'], ans: 'Keylogger', hint: 'Unisce "key" (tasto) e "logger" (registratore).' },
      { code: '5h', q: 'Quale pratica consiste nell’aggiornare regolarmente software e sistemi?', opts: ['Patch management', 'Spam', 'Phishing', 'DDoS'], ans: 'Patch management', hint: 'Le "patch" sono le correzioni di sicurezza.' },
      { code: '5i', q: 'Quale strumento autentica l’identità con un codice temporaneo?', opts: ['Autenticazione a due fattori', 'Antivirus', 'Backup', 'Firewall'], ans: 'Autenticazione a due fattori', hint: 'Oltre alla password serve un secondo codice, spesso a scadenza.' }
    ],
    6: [
      { code: '6a', q: 'Analizza gli allegati di questa finta e-mail. Quale file è un malware mascherato?', opts: ['foto_gita.jpg', 'invito_festa.pdf.exe', 'compiti.docx', 'brano.mp3'], ans: 'invito_festa.pdf.exe', hint: 'Attenzione ai file con doppia estensione o che finiscono in .exe!' },
      { code: '6b', q: 'Quale tra queste estensioni indica un file eseguibile capace di installare un virus?', opts: ['.png', '.txt', '.exe', '.mp4'], ans: '.exe', hint: 'In inglese ".exe" sta per Executable.' },
      { code: '6c', q: 'Quale indirizzo presenta il dominio più sospetto per un presunto accesso alla tua banca?', opts: ['https://www.google.it', 'http://www.banka-login-sicuro.com', 'https://www.wikipedia.org', 'https://www.scuola.edu.it'], ans: 'http://www.banka-login-sicuro.com', hint: 'Controlla il dominio: anche i siti di phishing possono usare HTTPS.' },
      { code: '6d', q: 'Ricevi un SMS inatteso che chiede di pagare subito tramite un link. Quale mittente indica esplicitamente un numero sconosciuto?', opts: ['Poste Italiane', 'Amazon Support', '+39 392 000 0000 (Sconosciuto)', 'Servizio Clienti'], ans: '+39 392 000 0000 (Sconosciuto)', hint: 'Cerca il numero indicato come sconosciuto: anche un nome aziendale può essere falsificato.' },
      { code: '6e', q: 'Quale tra queste password è la più robusta contro gli attacchi informatici?', opts: ['12345678', 'password', 'juventus', 'H@ck3r_2024!'], ans: 'H@ck3r_2024!', hint: 'Una password forte usa maiuscole, minuscole, numeri e simboli.' },
      { code: '6f', q: 'Ricevi il messaggio: "Il tuo account sarà bloccato tra 5 minuti, clicca qui". Cosa fai?', opts: ['Clicco subito', 'Non clicco e verifico sul sito ufficiale', 'Invio la password', 'Condivido il link'], ans: 'Non clicco e verifico sul sito ufficiale', hint: 'La fretta è l’arma preferita del phishing: verifica sempre dal sito ufficiale.' },
      { code: '6g', q: 'Quale azione protegge di più i dati se il computer viene rubato?', opts: ['Cifratura del disco', 'Cambiare lo sfondo', 'Un nome utente semplice', 'Una Wi-Fi aperta'], ans: 'Cifratura del disco', hint: 'Senza la chiave, i dati cifrati risultano illeggibili.' },
      { code: '6h', q: 'Quale pratica riduce il rischio se una password viene rubata?', opts: ['Usare password diverse per ogni servizio', 'Usare la stessa password ovunque', 'Scrivere la password sul monitor', 'Condividerla in chat'], ans: 'Usare password diverse per ogni servizio', hint: 'Una password unica compromessa apre tutte le porte.' },
      { code: '6i', q: 'Quale file allegato è il più sospetto?', opts: ['relazione.pdf', 'foto.png', 'fattura.pdf.exe', 'canzone.mp3'], ans: 'fattura.pdf.exe', hint: 'La doppia estensione nasconde un eseguibile dietro un finto PDF.' }
    ],
    7: [
      { code: '7a', text: 'Completa la sequenza di trasmissione dati: <code>2 · 4 · 8 · 16 · ?</code>', ans: '32', hint: 'Ogni numero è il doppio del precedente.' },
      { code: '7b', text: 'Trova il numero mancante nella sequenza: <code>1 · 3 · 7 · 15 · ?</code>', ans: '31', hint: 'Moltiplica per 2 e aggiungi 1.' },
      { code: '7c', text: 'Trova il valore del codice di sblocco: <code>10 · 20 · 40 · 70 · ?</code>', ans: '110', hint: 'L’incremento aumenta ogni volta: +10, +20, +30, +40.' },
      { code: '7d', text: 'Decodifica il pattern di frequenza: <code>3 · 6 · 12 · 24 · ?</code>', ans: '48', hint: 'Raddoppia il valore precedente.' },
      { code: '7e', text: 'Risolvi l’algoritmo di sicurezza: <code>5 · 10 · 15 · 20 · ?</code>', ans: '25', hint: 'È la tabellina del 5.' },
      { code: '7f', text: 'Completa la sequenza: <code>2 · 6 · 18 · 54 · ?</code>', ans: '162', hint: 'Ogni numero si ottiene moltiplicando il precedente per 3.' },
      { code: '7g', text: 'Completa la sequenza: <code>100 · 90 · 80 · 70 · ?</code>', ans: '60', hint: 'Si scende di 10 ogni volta.' },
      { code: '7h', text: 'Completa la sequenza: <code>1 · 4 · 9 · 16 · ?</code>', ans: '25', hint: 'Sono i quadrati: 1², 2², 3², 4²…' },
      { code: '7i', text: 'Completa la sequenza: <code>5 · 11 · 23 · 47 · ?</code>', ans: '95', hint: 'Moltiplica per 2 e aggiungi 1, come 5→11→23.' }
    ],
    8: [
      { code: '8a', text: 'Sulla tastiera QWERTY, sposta ogni lettera della parola <code>WEB</code> a destra di un tasto sulla stessa riga. Ottieni:', ans: 'ERN', hint: 'Sulla tastiera: W→E, E→R, B→N.' },
      { code: '8b', text: 'Decodifica il codice usando la 1ª e la 4ª lettera della parola <code>CYBER</code>:', ans: 'CE', hint: 'C-Y-B-E-R: la 1ª è C, la 4ª è E.' },
      { code: '8c', text: 'Se A=1, B=2, C=3… quale parola formano i numeri <code>3 - 1 - 20</code>?', ans: 'CAT', hint: '3=C, 1=A, 20=T.' },
      { code: '8d', text: 'Sulla tastiera QWERTY, sposta ogni lettera della parola <code>NET</code> a destra di un tasto sulla stessa riga. Ottieni:', ans: 'MRY', hint: 'N→M, E→R, T→Y.' },
      { code: '8e', text: 'Se inverti le lettere della parola <code>SERVER</code>, quale codice ottieni?', ans: 'REVRES', hint: 'Leggila da destra verso sinistra.' },
      { code: '8f', text: 'Se A=1, B=2, C=3… quale parola formano i numeri <code>8 - 1 - 3 - 11</code>?', ans: 'HACK', hint: '8=H, 1=A, 3=C, 11=K.' },
      { code: '8g', text: 'Inverti le lettere della parola <code>NETWORK</code>:', ans: 'KROWTEN', hint: 'Parti dall’ultima lettera e procedi verso sinistra.' },
      { code: '8h', text: 'Sulla tastiera QWERTY, sposta ogni lettera della parola <code>DOG</code> a destra di un tasto sulla stessa riga. Ottieni:', ans: 'FPH', hint: 'D→F, O→P, G→H.' },
      { code: '8i', text: 'Prendi la 2ª e la 5ª lettera della parola <code>SECURITY</code>:', ans: 'EI', hint: 'S-E-C-U-R-I-T-Y: la 2ª è E, la 5ª è I.' }
    ]
  };

  /* Impostazioni fisse (nessun parametro modificabile in Admin). */
  const modeInfo = {
    5: { key: 'rapida', label: 'Rapida', levels: 5, totalSeconds: 12 * 60, penaltySeconds: 120, icon: '⚡', description: '5 livelli · 12 minuti · penalità −2:00' },
    8: { key: 'completa', label: 'Completa', levels: 8, totalSeconds: 17 * 60, penaltySeconds: 150, icon: '🏆', description: '8 livelli · 17 minuti · penalità −2:30' }
  };

  global.LEVELS = Object.freeze({ titles, variants, modeInfo });

  if (typeof module === 'object' && module.exports) module.exports = global.LEVELS;
})(typeof window !== 'undefined' ? window : globalThis);
