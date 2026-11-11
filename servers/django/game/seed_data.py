"""
Banca dati delle 72 domande dell'Escape Room Fassicomo.

40 domande originali + 32 domande aggiuntive (4 per ogni livello).
Questo modulo è la fonte unica usata da:
  • `python manage.py seed_questions`      (popola il database)
  • `scripts/genera_pagine_livello2.py`    (crea le 9 pagine HTML)

Non contiene logica Django: può essere importato anche da uno script esterno.
"""

from __future__ import annotations

LEVEL_TITLES = {
    1: "Cifrario di Cesare",
    2: "Ispezione del codice",
    3: "Sistema binario",
    4: "Reti e Internet",
    5: "Cybersecurity",
    6: "Sicurezza pratica",
    7: "Logica e sequenze",
    8: "Codici e tastiera",
}

# Livello 2: file, etichetta del commento e token.
# L'etichetta cambia per non rendere il token banale da trovare.
LEVEL2_PAGES = {
    "2a": ("livello_2_target_a.html", "TOKEN", "ROOT"),
    "2b": ("livello_2_target_b.html", "TOKEN", "ADMIN"),
    "2c": ("livello_2_target_c.html", "TOKEN", "CYBER"),
    "2d": ("livello_2_target_d.html", "TOKEN", "FIREWALL"),
    "2e": ("livello_2_target_e.html", "TOKEN", "TOKEN"),
    "2f": ("livello_2_target_f.html", "ACCESSO", "SICURO"),
    "2g": ("livello_2_target_g.html", "PASSWORD TEMPORANEA", "NETA2026"),
    "2h": ("livello_2_target_h.html", "CODICE DI SBLOCCO", "FLASH"),
    "2i": ("livello_2_target_i.html", "CHIAVE DI RETE", "PING"),
}


def _text(code, body, answer, hint="", title=""):
    return {
        "code": code,
        "type": "text",
        "title": title,
        "text": body,
        "answer": answer,
        "hint": hint,
        "options": [],
        "html_file": "",
    }


def _choice(code, question, options, answer, hint="", title=""):
    return {
        "code": code,
        "type": "choice",
        "title": title,
        "text": question,
        "answer": answer,
        "hint": hint,
        "options": options,
        "html_file": "",
    }


def _inspect(code, title=""):
    filename, label, token = LEVEL2_PAGES[code]
    return {
        "code": code,
        "type": "code_inspection",
        "title": title or f"Accesso al settore {code[-1].upper()}",
        "text": (
            "Il sito nasconde un codice di accesso nel proprio codice sorgente. "
            "Apri la pagina, cerca il commento HTML e inserisci il valore indicato."
        ),
        "answer": token,
        "hint": (
            "Il valore cercato è dentro un commento HTML: cerca la parola TOKEN "
            "e copia solo il testo che segue i due punti."
        ),
        "options": [],
        "html_file": filename,
        "comment_label": label,
        "level2_token": token,
    }


CIFRARIO = "Decifra il messaggio cifrato con il cifrario di Cesare (chiave di spostamento: III): "
BINARIO = "Converti il seguente byte binario in numero decimale: "

QUESTIONS = [
    # ---------------------------------------------------------- livello 1
    _text("1a", CIFRARIO + "<code>KDFNHU</code>", "HACKER", "Torna indietro di tre lettere per ogni carattere.", "Cifrario di Cesare"),
    _text("1b", CIFRARIO + "<code>FRGLFH</code>", "CODICE", "F → C, R → O, G → D…"),
    _text("1c", CIFRARIO + "<code>VHUYHU</code>", "SERVER", "V → S, H → E, U → R…"),
    _text("1d", CIFRARIO + "<code>DUGXLQR</code>", "ARDUINO", "D → A, U → R, G → D…"),
    _text("1e", CIFRARIO + "<code>ZHE</code>", "WEB", "Z → W, H → E, E → B."),
    _text("1f", CIFRARIO + "<code>OLQHD</code>", "ILINE", "O → L, L → I, Q → N…"),
    _text("1g", CIFRARIO + "<code>PRQLWRU</code>", "MONITOR", "P → M, R → O, Q → N…"),
    _text("1h", CIFRARIO + "<code>FDYDO</code>", "CAVAL", "F → C, D → A, Y → V…"),
    _text("1i", CIFRARIO + "<code>FRPSXWHU</code>", "COMPUTER", "F → C, R → O, P → M…"),
    # ---------------------------------------------------------- livello 2
    _inspect("2a"),
    _inspect("2b"),
    _inspect("2c"),
    _inspect("2d"),
    _inspect("2e"),
    _inspect("2f"),
    _inspect("2g"),
    _inspect("2h"),
    _inspect("2i"),
    # ---------------------------------------------------------- livello 3
    _text("3a", BINARIO + "<code>00001010</code>", "10", "I pesi dei bit sono 128 64 32 16 8 4 2 1."),
    _text("3b", BINARIO + "<code>00001101</code>", "13", "8 + 4 + 1 = 13."),
    _text("3c", BINARIO + "<code>00010001</code>", "17", "16 + 1 = 17."),
    _text("3d", BINARIO + "<code>00010100</code>", "20", "16 + 4 = 20."),
    _text("3e", BINARIO + "<code>00011011</code>", "27", "16 + 8 + 2 + 1 = 27."),
    _text("3f", BINARIO + "<code>00000101</code>", "5", "4 + 1 = 5."),
    _text("3g", BINARIO + "<code>00010010</code>", "18", "16 + 2 = 18."),
    _text("3h", BINARIO + "<code>00011110</code>", "30", "16 + 8 + 4 + 2 = 30."),
    _text("3i", BINARIO + "<code>00100000</code>", "32", "Il bit da 32 è acceso."),
    # ---------------------------------------------------------- livello 4
    _choice("4a", "Quale tra questi è un indirizzo IP locale di default comunemente usato nei router di casa?",
            ["192.168.1.1", "255.255.255.255", "8.8.8.8", "10.0.0.0.1"], "192.168.1.1",
            "Gli indirizzi IP di casa iniziano quasi sempre con 192.168…", "Indirizzi privati"),
    _choice("4b", "Quale protocollo garantisce la trasmissione sicura e crittografata dei dati sul web?",
            ["HTTP", "HTTPS", "FTP", "SMTP"], "HTTPS", 'La "S" finale sta per Security.', "Protocolli web"),
    _choice("4c", "Quale dispositivo instrada i pacchetti di dati tra reti diverse (per esempio casa e Internet)?",
            ["Switch", "Router", "Modem", "Access Point"], "Router", 'Deriva da "route", percorso.', "Dispositivi di rete"),
    _choice("4d", "Quale servizio converte i nomi di dominio (per esempio google.com) in indirizzi IP numerici?",
            ["DHCP", "DNS", "IPSEC", "NAT"], "DNS", "Significa Domain Name System.", "Servizi di rete"),
    _choice("4e", 'Che cos’è il "Default Gateway" in una rete informatica?',
            ["Il punto di uscita/router verso Internet", "La password del Wi-Fi", "Un antivirus di rete", "Il cavo Ethernet di collegamento"],
            "Il punto di uscita/router verso Internet", "È la porta di uscita verso l’esterno.", "Gateway"),
    _choice("4f", "Quale porta è associata per convenzione al traffico web sicuro HTTPS?",
            ["21", "80", "443", "25"], "443", "Compare negli indirizzi che iniziano con https://.", "Porte di rete"),
    _choice("4g", "Quale dispositivo collega una rete domestica a Internet?",
            ["Stampante", "Modem-router", "Tastiera", "Monitor"], "Modem-router", "Unisce modem e router.", "Dispositivi di rete"),
    _choice("4h", "Quale indirizzo appartiene alla rete privata locale?",
            ["192.168.0.15", "8.8.8.8", "1.1.1.1", "200.100.50.25"], "192.168.0.15",
            "Le reti private usano 192.168…, 10…. o 172.16–31.", "Indirizzi privati"),
    _choice("4i", "Che cosa indica la sigla Wi-Fi?",
            ["Wireless Fidelity", "Wired Firewall", "Web File", "Wireless File Interface"], "Wireless Fidelity",
            "Nasce dalla contrazione di wireless e fidelity.", "Wi-Fi"),
    # ---------------------------------------------------------- livello 5
    _choice("5a", "Quale tipo di attacco informatico usa e-mail false per rubare password e dati personali?",
            ["Phishing", "Malware", "DDoS", "Brute Force"], "Phishing", 'Richiama "fishing", pescare.', "Minacce"),
    _choice("5b", "Come si chiama un programma malevolo nascosto dentro un software apparentemente utile?",
            ["Trojan", "Worm", "Spyware", "Adware"], "Trojan", "Prende il nome dal cavallo di Troia.", "Malware"),
    _choice("5c", "Quale attacco intasa un server con richieste fittizie fino a renderlo irraggiungibile?",
            ["Phishing", "DDoS", "Man in the Middle", "SQL Injection"], "DDoS", "Distributed Denial of Service.", "Minacce"),
    _choice("5d", "Come si definisce un malware che cifra i dati della vittima e chiede un riscatto per sbloccarli?",
            ["Spyware", "Ransomware", "Keylogger", "Rootkit"], "Ransomware", 'In inglese "ransom" è il riscatto.', "Malware"),
    _choice("5e", "L’arte di manipolare le persone per farsi consegnare informazioni riservate si chiama:",
            ["Phishing", "Social Engineering", "Hacking etico", "Spoofing"], "Social Engineering",
            "Unisce sociale e ingegneria.", "Minacce"),
    _choice("5f", "Quale attacco prova molte password fino a trovare quella corretta?",
            ["Brute force", "Phishing", "Spoofing", "Backup"], "Brute force", "Forza bruta, appunto.", "Password"),
    _choice("5g", "Come si chiama un programma che registra i tasti premuti?",
            ["Keylogger", "Firewall", "Router", "VPN"], "Keylogger", "Key, tasto, e logger, registratore.", "Malware"),
    _choice("5h", "Quale pratica consiste nell’aggiornare regolarmente software e sistemi?",
            ["Patch management", "Spam", "Phishing", "DDoS"], "Patch management", "Le patch sono le correzioni di sicurezza.", "Difese"),
    _choice("5i", "Quale strumento autentica l’identità con un codice temporaneo?",
            ["Autenticazione a due fattori", "Antivirus", "Backup", "Firewall"], "Autenticazione a due fattori",
            "Oltre alla password serve un secondo codice, spesso a scadenza.", "Difese"),
    # ---------------------------------------------------------- livello 6
    _choice("6a", "Analizza gli allegati di questa finta e-mail. Quale file è un malware mascherato?",
            ["foto_gita.jpg", "invito_festa.pdf.exe", "compiti.docx", "brano.mp3"], "invito_festa.pdf.exe",
            "Attenzione alle doppie estensioni!", "Allegati"),
    _choice("6b", "Quale tra queste estensioni indica un file eseguibile capace di installare un virus?",
            [".png", ".txt", ".exe", ".mp4"], ".exe", 'In inglese ".exe" sta per Executable.', "Allegati"),
    _choice("6c", "Quale indirizzo presenta il dominio più sospetto per un presunto accesso alla tua banca?",
            ["https://www.google.it", "http://www.banka-login-sicuro.com", "https://www.wikipedia.org", "https://www.scuola.edu.it"],
            "http://www.banka-login-sicuro.com", "Controlla il dominio: anche il phishing può usare HTTPS.", "Phishing"),
    _choice("6d", "Ricevi un SMS inatteso che chiede di pagare subito tramite un link. Quale mittente indica esplicitamente un numero sconosciuto?",
            ["Poste Italiane", "Amazon Support", "+39 392 000 0000 (Sconosciuto)", "Servizio Clienti"],
            "+39 392 000 0000 (Sconosciuto)", "Anche un nome aziendale può essere falsificato.", "SMishing"),
    _choice("6e", "Quale tra queste password è la più robusta contro gli attacchi informatici?",
            ["12345678", "password", "juventus", "H@ck3r_2024!"], "H@ck3r_2024!",
            "Servono maiuscole, minuscole, numeri e simboli.", "Password"),
    _choice("6f", 'Ricevi il messaggio: "Il tuo account sarà bloccato tra 5 minuti, clicca qui". Cosa fai?',
            ["Clicco subito", "Non clicco e verifico sul sito ufficiale", "Invio la password", "Condivido il link"],
            "Non clicco e verifico sul sito ufficiale", "La fretta è l’arma del phishing.", "Phishing"),
    _choice("6g", "Quale azione protegge di più i dati se il computer viene rubato?",
            ["Cifratura del disco", "Cambiare lo sfondo", "Un nome utente semplice", "Una Wi-Fi aperta"],
            "Cifratura del disco", "Senza la chiave i dati risultano illeggibili.", "Cifratura"),
    _choice("6h", "Quale pratica riduce il rischio se una password viene rubata?",
            ["Usare password diverse per ogni servizio", "Usare la stessa password ovunque", "Scrivere la password sul monitor", "Condividerla in chat"],
            "Usare password diverse per ogni servizio", "Una password unica compromessa apre tutte le porte.", "Password"),
    _choice("6i", "Quale file allegato è il più sospetto?",
            ["relazione.pdf", "foto.png", "fattura.pdf.exe", "canzone.mp3"], "fattura.pdf.exe",
            "Doppia estensione: un eseguibile travestito da PDF.", "Allegati"),
    # ---------------------------------------------------------- livello 7
    _text("7a", "Completa la sequenza di trasmissione dati: <code>2 · 4 · 8 · 16 · ?</code>", "32",
          "Ogni numero è il doppio del precedente.", "Sequenze"),
    _text("7b", "Trova il numero mancante nella sequenza: <code>1 · 3 · 7 · 15 · ?</code>", "31",
          "Moltiplica per 2 e aggiungi 1."),
    _text("7c", "Trova il valore del codice di sblocco: <code>10 · 20 · 40 · 70 · ?</code>", "110",
          "Gli incrementi crescono: +10, +20, +30, +40."),
    _text("7d", "Decodifica il pattern di frequenza: <code>3 · 6 · 12 · 24 · ?</code>", "48",
          "Raddoppia il valore precedente."),
    _text("7e", "Risolvi l’algoritmo di sicurezza: <code>5 · 10 · 15 · 20 · ?</code>", "25", "Tabellina del 5."),
    _text("7f", "Completa la sequenza: <code>2 · 6 · 18 · 54 · ?</code>", "162", "Moltiplica per 3."),
    _text("7g", "Completa la sequenza: <code>100 · 90 · 80 · 70 · ?</code>", "60", "Scende di 10 ogni volta."),
    _text("7h", "Completa la sequenza: <code>1 · 4 · 9 · 16 · ?</code>", "25", "Sono i quadrati: 1², 2², 3², 4²…"),
    _text("7i", "Completa la sequenza: <code>5 · 11 · 23 · 47 · ?</code>", "95", "Moltiplica per 2 e aggiungi 1."),
    # ---------------------------------------------------------- livello 8
    _text("8a", "Sulla tastiera QWERTY, sposta ogni lettera della parola <code>WEB</code> a destra di un tasto sulla stessa riga. Ottieni:",
          "ERN", "W→E, E→R, B→N.", "Tastiera"),
    _text("8b", "Decodifica il codice usando la 1ª e la 4ª lettera della parola <code>CYBER</code>:", "CE",
          "C-Y-B-E-R: la 1ª è C, la 4ª è E."),
    _text("8c", "Se A=1, B=2, C=3… quale parola formano i numeri <code>3 - 1 - 20</code>?", "CAT",
          "3=C, 1=A, 20=T."),
    _text("8d", "Sulla tastiera QWERTY, sposta ogni lettera della parola <code>NET</code> a destra di un tasto sulla stessa riga. Ottieni:",
          "MRY", "N→M, E→R, T→Y."),
    _text("8e", "Se inverti le lettere della parola <code>SERVER</code>, quale codice ottieni?", "REVRES",
          "Leggi da destra verso sinistra."),
    _text("8f", "Se A=1, B=2, C=3… quale parola formano i numeri <code>8 - 1 - 3 - 11</code>?", "HACK",
          "8=H, 1=A, 3=C, 11=K."),
    _text("8g", "Inverti le lettere della parola <code>NETWORK</code>:", "KROWTEN",
          "Parti dall’ultima lettera."),
    _text("8h", "Sulla tastiera QWERTY, sposta ogni lettera della parola <code>DOG</code> a destra di un tasto sulla stessa riga. Ottieni:",
          "FPH", "D→F, O→P, G→H."),
    _text("8i", "Prendi la 2ª e la 5ª lettera della parola <code>SECURITY</code>:", "EI",
          "S-E-C-U-R-I-T-Y: la 2ª è E, la 5ª è I."),
]


def by_level():
    out = {}
    for item in QUESTIONS:
        out.setdefault(int(item["code"][0]), []).append(item)
    return out


assert len(QUESTIONS) == 72, f"attese 72 domande, trovate {len(QUESTIONS)}"


if __name__ == "__main__":  # controllo rapido
    from collections import Counter

    counts = Counter(item["code"][0] for item in QUESTIONS)
    print("domande per livello:", dict(sorted(counts.items())))
    print("totale:", len(QUESTIONS))
