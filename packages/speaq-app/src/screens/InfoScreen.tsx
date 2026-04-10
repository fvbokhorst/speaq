/**
 * SPEAQ - Info Screen
 * Complete guide: how SPEAQ works, security, tips
 * Available in all 9 languages
 */

import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { colors } from "../theme/brand";
import { getLanguage } from "../services/i18n";

interface Props {
  onBack: () => void;
}

const INFO: Record<string, { title: string; sections: { heading: string; body: string }[] }> = {
  en: {
    title: "How SPEAQ Works",
    sections: [
      { heading: "What is SPEAQ?", body: "SPEAQ is the most secure communication and freedom platform in the world. It combines quantum-resistant encryption, censorship resistance, private payments, and network contributions in one app. No government, corporation, or hacker can read your messages, track your payments, or block your access." },
      { heading: "Why is SPEAQ so secure?", body: "Every message, call, file, and payment is encrypted with AES-256 -the same standard used by military and intelligence agencies. Each conversation has its own unique encryption key derived from SHA-256. The relay server sees ONLY encrypted data -it cannot read content, identify who is talking to whom, or determine what is being sent. This is called zero-knowledge architecture." },
      { heading: "Your SPEAQ ID", body: "Your SPEAQ ID is generated locally on your device using cryptographically secure random numbers. It is not linked to your phone number, email, or real name. No one can trace your SPEAQ ID back to you unless you choose to share it." },
      { heading: "Messages", body: "All messages are end-to-end encrypted before they leave your device. They can only be decrypted by you and the recipient. The relay server sees only encrypted blobs. Messages are stored locally on your device -if you delete the app, messages are gone forever. Use Disappearing Messages (tap the T button in chat) to auto-delete messages after a set time." },
      { heading: "Voice & Video Calls", body: "Calls use WebRTC peer-to-peer technology. Audio and video go directly between devices when possible, bypassing the server entirely. Call signaling is relayed through the encrypted relay server." },
      { heading: "Q-Credits & Wallet", body: "Q-Credits are SPEAQ's internal currency pegged to gold: 1 QC = 0.01 gram of gold. This means the value of your QC is tied to real, physical gold, not to any government currency that can be printed or inflated.\n\nMaximum supply: 21,000,000 QC (fixed forever, like Bitcoin). Total gold backing: 210 kg.\n\nCan QC become worth more than gold? Yes. The gold peg is a FLOOR, not a ceiling. If millions of people want QC and only 21 million exist, scarcity drives the price above the gold peg. Early adopters benefit most.\n\nSmallest unit: 1 Spark = 0.00000001 QC (like Bitcoin's satoshi). If a whole country adopts QC, people simply use smaller units. The system scales infinitely.\n\nExample: if QC price rises 100x through adoption, 1 QC = 1 gram gold. A bread costs 500,000 Sparks. The credits don't get smaller, the units people use get smaller. Like cents to euros." },
      { heading: "Contributions", body: "SPEAQ rewards network participation. You earn Q-Credits by helping the network grow. Your phone can relay messages (0.0001 QC each), validate transactions (0.0002 QC each), store encrypted fragments (0.0001 QC each), and more. You earn 0.02-0.05 QC per day (0.02-0.05 gram gold). In many countries this is significant income.\n\nHow halving works: every 2,100,000 QC distributed by the network, rewards are cut in half. This creates scarcity and protects value. Early contributors earn more. The system supports approximately 960 contributors initially, decreasing with each halving. Total distribution timeline: 40+ years before all 21 million QC are mined.\n\n7 ways to contribute:\n1. Relay: relay encrypted messages\n2. Mesh: act as Bluetooth/WiFi node\n3. Bridge: be a cash-to-QC agent\n4. Validation: validate transaction proofs\n5. Storage: store encrypted data\n6. Translation: translate the app\n7. Onboarding: bring new active users" },
      { heading: "Quantum Vault", body: "The Quantum Vault stores your sensitive files (photos, documents, notes) with encryption. It has two layers: a visible layer (normal PIN) and a hidden layer (secret PIN). If someone forces you to open your phone, the hidden layer is completely invisible -there is no technical proof it exists. This is called plausible deniability." },
      { heading: "Ghost Groups", body: "Ghost Groups are invisible group chats. Members cannot see who else is in the group. The server has no record of the group. Messages are sent individually to each member. This protects activists, journalists, and anyone who needs to communicate without a visible group structure." },
      { heading: "Witness Mode", body: "Witness Mode creates tamper-proof evidence. When you record something, it is timestamped and hashed with SHA-256. The hash proves the content existed at that exact moment and has not been modified. Use this for documenting human rights violations, corruption, or any situation where evidence must be preserved." },
      { heading: "Dead Man's Switch", body: "If you don't check in within your set interval, a pre-configured message is automatically sent to your chosen contacts. This protects journalists, activists, and whistleblowers. If something happens to you, your emergency contacts will be notified." },
      { heading: "Security Tips", body: "1. Never share your PIN with anyone.\n2. Use a different PIN for the hidden vault layer.\n3. Enable Disappearing Messages for sensitive conversations.\n4. Regularly back up important vault files.\n5. Use the Dead Man's Switch if you are in a dangerous situation.\n6. Do not screenshot sensitive conversations.\n7. Keep your app updated for the latest security patches.\n8. Use a strong PIN (6 digits, not 1234 or birthday).\n9. If crossing a border, switch to the normal vault layer.\n10. Your SPEAQ ID is your identity -share it only with trusted people." },
      { heading: "What SPEAQ does NOT collect", body: "SPEAQ collects NO personal data on its servers. No email, no phone number, no real name, no location, no contacts, no message content, no call records, no wallet balances, no browsing history. Everything stays on your device. The relay server operates on zero-knowledge -it processes encrypted data without ever seeing the content." },
      { heading: "In case of emergency", body: "If you need to quickly erase all data: go to Settings > Delete All Data. This permanently removes everything -identity, messages, contacts, wallet, vault files. Nothing can be recovered. If you are being monitored, remember that the hidden vault layer is invisible to anyone who doesn't know the secret PIN." },
      { heading: "Proof of Contribution (C+) - Pre-Blockchain Contributions", body: "Before the blockchain launches, all contributions are tracked locally on your device. Every contribution reward is double-signed:\n\n1. You sign with your private key (proves your identity)\n2. The relay server co-signs as witness (proves the work actually happened)\n\nBoth signatures are stored in your contribution ledger. When the blockchain launches, only entries with BOTH signatures are accepted. This makes fraud impossible - you cannot fake the relay's signature, and the relay only signs when you actually contribute to the network.\n\nYour contribution ledger is your proof of early contribution. The earlier you start, the more you earn before the first halving." },
      { heading: "Sovereign Wallet (FIPS 204)", body: "SPEAQ generates a quantum-resistant signing keypair (ML-DSA-65, FIPS 204) on your device when you first open the wallet. This keypair is your sovereign on-chain identity. Your private key never leaves your device - not even SPEAQ can access it. When you send Q-Credits, the transaction is signed with your personal quantum-resistant key and verified by the blockchain network. No intermediary, no central authority, no backdoor. Your keys, your money." },
      { heading: "SPEAQ Chain Blockchain", body: "SPEAQ has its own quantum-resistant blockchain. Blocks are produced every 30 seconds by validators selected through Proof of Contribution. Each block is dual-signed with ML-DSA-65 (FIPS 204) and SPHINCS+ (FIPS 205) for maximum security. The blockchain tracks Q-Credit balances, processes transactions, and ensures no one can create money from nothing. Maximum supply: 21,000,000 QC, enforced by code, not by policy." },
    ],
  },
  nl: {
    title: "Hoe SPEAQ Werkt",
    sections: [
      { heading: "Wat is SPEAQ?", body: "SPEAQ is het meest beveiligde communicatie- en vrijheidsplatform ter wereld. Het combineert quantum-bestendige encryptie, censuurbestendigheid, prive-betalingen en netwerkbijdragen in een app. Geen enkele overheid, bedrijf of hacker kan je berichten lezen, je betalingen volgen of je toegang blokkeren." },
      { heading: "Waarom is SPEAQ zo veilig?", body: "Elk bericht, gesprek, bestand en elke betaling wordt versleuteld met AES-256 -dezelfde standaard die door militaire en inlichtingendiensten wordt gebruikt. Elk gesprek heeft zijn eigen unieke encryptiesleutel afgeleid van SHA-256. De relay server ziet ALLEEN versleutelde data -het kan geen inhoud lezen, niet identificeren wie met wie praat, of bepalen wat er wordt verzonden. Dit heet zero-knowledge architectuur." },
      { heading: "Je SPEAQ ID", body: "Je SPEAQ ID wordt lokaal op je apparaat gegenereerd met cryptografisch veilige willekeurige getallen. Het is niet gekoppeld aan je telefoonnummer, e-mail of echte naam. Niemand kan je SPEAQ ID naar jou herleiden tenzij je het zelf deelt." },
      { heading: "Berichten", body: "Alle berichten zijn end-to-end versleuteld voordat ze je apparaat verlaten. Ze kunnen alleen worden ontsleuteld door jou en de ontvanger. De relay server ziet alleen versleutelde blobs. Berichten worden lokaal op je apparaat opgeslagen -als je de app verwijdert, zijn berichten voor altijd weg. Gebruik Verdwijnende Berichten (tik op de T-knop in chat) om berichten automatisch te verwijderen na een ingestelde tijd." },
      { heading: "Spraak- en Videogesprekken", body: "Gesprekken gebruiken WebRTC peer-to-peer technologie. Audio en video gaan direct tussen apparaten wanneer mogelijk, zonder de server. Gespreksignalering wordt doorgestuurd via de versleutelde relay server." },
      { heading: "Q-Credits & Portemonnee", body: "Q-Credits zijn SPEAQ's interne valuta gekoppeld aan goud: 1 QC = 0,01 gram goud. De waarde is gekoppeld aan echt, fysiek goud, niet aan een overheidsvaluta die bijgedrukt kan worden.\n\nMaximale voorraad: 21.000.000 QC (voor altijd vast, zoals Bitcoin). Totale gouddekking: 210 kg.\n\nKan QC meer waard worden dan goud? Ja. De goudkoppeling is een VLOER, geen plafond. Als miljoenen mensen QC willen en er zijn er maar 21 miljoen, drijft schaarste de prijs boven de goudkoppeling. Vroege gebruikers profiteren het meest.\n\nKleinste eenheid: 1 Spark = 0,00000001 QC (zoals Bitcoin's satoshi). Als een heel land QC adopteert, gebruiken mensen simpelweg kleinere eenheden. Het systeem schaalt oneindig.\n\nVoorbeeld: als de QC-prijs 100x stijgt door adoptie, dan is 1 QC = 1 gram goud. Een brood kost dan 500.000 Sparks. De credits worden niet kleiner, de eenheden die mensen gebruiken worden kleiner. Zoals centen bij euro's." },
      { heading: "Contributions", body: "SPEAQ beloont netwerkparticipatie. Je verdient Q-Credits door het netwerk te helpen. Je telefoon kan berichten doorsturen (0,0001 QC), transacties valideren (0,0002 QC), en versleutelde fragmenten opslaan (0,0001 QC). Je verdient 0.02-0.05 QC per dag (0,02-0,05 gram goud).\n\nHoe halving werkt: elke 2.100.000 QC gedistribueerd door het netwerk worden beloningen gehalveerd. Dit creert schaarste en beschermt de waarde. Vroege bijdragers verdienen meer. Het systeem ondersteunt initieel circa 960 miners, afnemend bij elke halving. Totale distributie tijdlijn: 40+ jaar.\n\n7 manieren om bij te dragen:\n1. Relay: berichten doorsturen\n2. Mesh: Bluetooth/WiFi node\n3. Bridge: cash-naar-QC agent\n4. Validatie: transactiebewijzen valideren\n5. Opslag: versleutelde data opslaan\n6. Vertaling: app vertalen\n7. Onboarding: nieuwe gebruikers aanbrengen" },
      { heading: "Quantum Kluis", body: "De Quantum Kluis slaat je gevoelige bestanden (foto's, documenten, notities) versleuteld op. Het heeft twee lagen: een zichtbare laag (normale PIN) en een verborgen laag (geheime PIN). Als iemand je dwingt je telefoon te openen, is de verborgen laag compleet onzichtbaar -er is geen technisch bewijs dat het bestaat. Dit heet plausible deniability." },
      { heading: "Ghost Groepen", body: "Ghost Groepen zijn onzichtbare groepschats. Leden kunnen niet zien wie er nog meer in de groep zit. De server heeft geen registratie van de groep. Berichten worden individueel naar elk lid gestuurd. Dit beschermt activisten, journalisten en iedereen die moet communiceren zonder een zichtbare groepsstructuur." },
      { heading: "Getuige Modus", body: "Getuige Modus maakt manipulatiebestendig bewijs. Wanneer je iets vastlegt, wordt het voorzien van een tijdstempel en gehasht met SHA-256. De hash bewijst dat de inhoud op dat exacte moment bestond en niet is gewijzigd. Gebruik dit voor het documenteren van mensenrechtenschendingen, corruptie of elke situatie waarin bewijs bewaard moet worden." },
      { heading: "Dead Man's Switch", body: "Als je niet incheckt binnen je ingestelde interval, wordt een vooraf ingesteld bericht automatisch naar je gekozen contacten gestuurd. Dit beschermt journalisten, activisten en klokkenluiders. Als er iets met je gebeurt, worden je noodcontacten gewaarschuwd." },
      { heading: "Beveiligingstips", body: "1. Deel je PIN nooit met iemand.\n2. Gebruik een andere PIN voor de verborgen kluis laag.\n3. Schakel Verdwijnende Berichten in voor gevoelige gesprekken.\n4. Maak regelmatig back-ups van belangrijke kluis bestanden.\n5. Gebruik de Dead Man's Switch als je in een gevaarlijke situatie bent.\n6. Maak geen screenshots van gevoelige gesprekken.\n7. Houd je app bijgewerkt voor de laatste beveiligingsupdates.\n8. Gebruik een sterke PIN (6 cijfers, niet 1234 of verjaardag).\n9. Bij het oversteken van een grens, schakel naar de normale kluis laag.\n10. Je SPEAQ ID is je identiteit -deel het alleen met vertrouwde mensen." },
      { heading: "Wat SPEAQ NIET verzamelt", body: "SPEAQ verzamelt GEEN persoonlijke gegevens op zijn servers. Geen e-mail, geen telefoonnummer, geen echte naam, geen locatie, geen contacten, geen berichtinhoud, geen gespreksregistraties, geen saldi, geen browsegeschiedenis. Alles blijft op je apparaat. De relay server werkt op zero-knowledge -het verwerkt versleutelde data zonder ooit de inhoud te zien." },
      { heading: "In geval van nood", body: "Als je snel alle gegevens moet wissen: ga naar Instellingen > Alle gegevens wissen. Dit verwijdert permanent alles -identiteit, berichten, contacten, portemonnee, kluis bestanden. Niets kan worden hersteld. Als je wordt gemonitord, onthoud dat de verborgen kluis laag onzichtbaar is voor iedereen die de geheime PIN niet kent." },
      { heading: "Proof of Contribution (C+) - Pre-Blockchain Contributions", body: "Voordat de blockchain live gaat, vindt alle bijdragen lokaal worden bijgehouden op je apparaat. Elke bijdrage beloning wordt dubbel gesigned:\n\n1. Jij signeert met je private key (bewijst je identiteit)\n2. De relay server tekent mee als getuige (bewijst dat het werk echt is gedaan)\n\nBeide handtekeningen worden opgeslagen in je bijdrage ledger. Bij blockchain launch worden alleen entries met BEIDE handtekeningen geaccepteerd. Fraude is onmogelijk.\n\nJe bijdrage ledger is je bewijs van vroege bijdrage. Hoe eerder je begint, hoe meer je verdient voor de eerste halving." },
      { heading: "Soevereine Portemonnee (FIPS 204)", body: "SPEAQ genereert een quantum-bestendig signing keypair (ML-DSA-65, FIPS 204) op je apparaat wanneer je de portemonnee voor het eerst opent. Dit keypair is je soevereine on-chain identiteit. Je private key verlaat nooit je apparaat - zelfs SPEAQ kan er niet bij. Wanneer je Q-Credits verstuurt, wordt de transactie gesigned met je persoonlijke quantum-bestendige sleutel en geverifieerd door het blockchain netwerk. Geen tussenpersoon, geen centrale autoriteit, geen achterdeur. Jouw sleutels, jouw geld." },
      { heading: "SPEAQ Chain Blockchain", body: "SPEAQ heeft zijn eigen quantum-bestendige blockchain. Blocks worden elke 30 seconden geproduceerd door validators geselecteerd via Proof of Contribution. Elk block wordt dubbel gesigned met ML-DSA-65 (FIPS 204) en SPHINCS+ (FIPS 205) voor maximale beveiliging. De blockchain houdt Q-Credit saldi bij, verwerkt transacties, en zorgt dat niemand geld uit het niets kan maken. Maximale voorraad: 21.000.000 QC, afgedwongen door code, niet door beleid." },
    ],
  },
  fr: {
    title: "Comment SPEAQ Fonctionne",
    sections: [
      { heading: "Qu'est-ce que SPEAQ?", body: "SPEAQ est la plateforme de communication et de liberte la plus securisee au monde. Elle combine chiffrement resistant aux ordinateurs quantiques, resistance a la censure, paiements prives et contributions reseau en une seule application. Aucun gouvernement, entreprise ou pirate ne peut lire vos messages." },
      { heading: "Pourquoi SPEAQ est-il si sur?", body: "Chaque message, appel, fichier et paiement est chiffre avec AES-256, le meme standard utilise par les armees. Chaque conversation a sa propre cle de chiffrement unique. Le serveur relais ne voit que des donnees chiffrees. Architecture zero-knowledge." },
      { heading: "Votre SPEAQ ID", body: "Votre SPEAQ ID est genere localement sur votre appareil. Il n'est lie a aucun numero de telephone, email ou nom reel. Personne ne peut remonter a vous." },
      { heading: "Messages", body: "Tous les messages sont chiffres de bout en bout. Seuls vous et le destinataire pouvez les dechiffrer. Les messages sont stockes localement. Utilisez les Messages Ephemeres (bouton T) pour une suppression automatique." },
      { heading: "Appels Vocaux et Video", body: "Les appels utilisent la technologie WebRTC pair-a-pair. L'audio et la video passent directement entre les appareils." },
      { heading: "Q-Credits et Portefeuille", body: "Les Q-Credits sont la monnaie interne de SPEAQ, adossee a l'or : 1 QC = 0,01 gramme d'or. La valeur est liee a de l'or reel et physique, pas a une devise gouvernementale qui peut etre imprimee ou inflatee.\n\nOffre maximale : 21 000 000 QC (fixe pour toujours, comme Bitcoin). Couverture or totale : 210 kg.\n\nLe QC peut-il valoir plus que l'or ? Oui. L'adossement a l'or est un PLANCHER, pas un plafond. Si des millions de personnes veulent du QC et qu'il n'en existe que 21 millions, la rarete pousse le prix au-dessus de l'adossement or. Les premiers utilisateurs en profitent le plus.\n\nPlus petite unite : 1 Spark = 0,00000001 QC (comme le satoshi de Bitcoin). Si un pays entier adopte le QC, les gens utilisent simplement des unites plus petites. Le systeme s'adapte a l'infini.\n\nExemple : si le prix du QC augmente 100x grace a l'adoption, 1 QC = 1 gramme d'or. Un pain coute 500 000 Sparks. Les credits ne deviennent pas plus petits, les unites utilisees deviennent plus petites. Comme les centimes par rapport aux euros." },
      { heading: "Contributions", body: "Les contributions SPEAQ sont la Preuve de Participation. Vous gagnez des Q-Credits en aidant le reseau. Votre telephone peut relayer des messages et valider des transactions. Vous gagnez 0.02-0.05 QC par jour." },
      { heading: "Coffre Quantique", body: "Le Coffre Quantique stocke vos fichiers sensibles avec chiffrement. Il a deux couches: visible (PIN normal) et cachee (PIN secret). La couche cachee est completement invisible. C'est le deni plausible." },
      { heading: "Groupes Fantomes", body: "Les Groupes Fantomes sont des discussions de groupe invisibles. Les membres ne peuvent pas voir qui d'autre est dans le groupe. Cela protege les activistes et journalistes." },
      { heading: "Mode Temoin", body: "Le Mode Temoin cree des preuves infalsifiables. Quand vous enregistrez quelque chose, c'est horodate et hashe avec SHA-256. Le hash prouve que le contenu existait a ce moment exact." },
      { heading: "Dead Man's Switch", body: "Si vous ne vous manifestez pas dans l'intervalle defini, un message pre-configure est automatiquement envoye a vos contacts choisis." },
      { heading: "Conseils de securite", body: "1. Ne partagez jamais votre PIN.\n2. Utilisez un PIN different pour le coffre cache.\n3. Activez les messages ephemeres pour les conversations sensibles.\n4. Utilisez le Dead Man's Switch en situation dangereuse.\n5. Ne faites pas de captures d'ecran sensibles.\n6. Gardez votre app a jour.\n7. Utilisez un PIN fort (6 chiffres).\n8. Aux frontieres, passez a la couche normale du coffre.\n9. Votre SPEAQ ID est votre identite, partagez-le avec des personnes de confiance.\n10. Sauvegardez regulierement les fichiers importants." },
      { heading: "Ce que SPEAQ ne collecte PAS", body: "SPEAQ ne collecte AUCUNE donnee personnelle sur ses serveurs. Pas d'email, pas de telephone, pas de nom, pas de localisation, pas de contenu de messages. Tout reste sur votre appareil." },
      { heading: "En cas d'urgence", body: "Pour effacer toutes les donnees: Parametres > Supprimer toutes les donnees. Cela supprime definitivement tout. La couche cachee du coffre est invisible pour quiconque ne connait pas le PIN secret." },
      { heading: "Preuve de Contribution (C+) - Contributions Pre-Blockchain", body: "Avant le lancement de la blockchain, toutes les contributions sont suivies localement. Chaque recompense est doublement signee. La fraude est impossible car les deux signatures sont necessaires." },
      { heading: "Portefeuille Souverain (FIPS 204)", body: "SPEAQ genere une paire de cles de signature resistante aux ordinateurs quantiques (ML-DSA-65, FIPS 204) sur votre appareil. Cette paire de cles est votre identite souveraine on-chain. Votre cle privee ne quitte jamais votre appareil. Vos cles, votre argent." },
      { heading: "Blockchain SPEAQ Chain", body: "SPEAQ possede sa propre blockchain resistante aux ordinateurs quantiques. Les blocs sont produits toutes les 30 secondes. Chaque bloc est doublement signe avec ML-DSA-65 et SPHINCS+. Offre maximale: 21.000.000 QC." },
    ],
  },
  es: {
    title: "Como Funciona SPEAQ",
    sections: [
      { heading: "Que es SPEAQ?", body: "SPEAQ es la plataforma de comunicacion y libertad mas segura del mundo. Combina cifrado resistente a computadoras cuanticas, resistencia a la censura, pagos privados y contribuciones de red en una sola aplicacion. Ningun gobierno, empresa o hacker puede leer sus mensajes." },
      { heading: "Por que SPEAQ es tan seguro?", body: "Cada mensaje, llamada, archivo y pago se cifra con AES-256, el mismo estandar usado por militares. Cada conversacion tiene su propia clave de cifrado unica. El servidor solo ve datos cifrados. Arquitectura de conocimiento cero." },
      { heading: "Tu SPEAQ ID", body: "Tu SPEAQ ID se genera localmente en tu dispositivo. No esta vinculado a tu numero de telefono, email o nombre real. Nadie puede rastrearte." },
      { heading: "Mensajes", body: "Todos los mensajes estan cifrados de extremo a extremo. Solo tu y el destinatario pueden descifrarlos. Los mensajes se almacenan localmente. Usa Mensajes que Desaparecen (boton T) para eliminacion automatica." },
      { heading: "Llamadas de Voz y Video", body: "Las llamadas usan tecnologia WebRTC punto a punto. El audio y video van directamente entre dispositivos." },
      { heading: "Q-Credits y Cartera", body: "Los Q-Credits son la moneda interna de SPEAQ, respaldada por oro: 1 QC = 0,01 gramo de oro. El valor esta vinculado a oro real y fisico, no a una moneda gubernamental que puede imprimirse o inflarse.\n\nOferta maxima: 21 000 000 QC (fijo para siempre, como Bitcoin). Respaldo total en oro: 210 kg.\n\nPuede el QC valer mas que el oro? Si. El respaldo en oro es un PISO, no un techo. Si millones de personas quieren QC y solo existen 21 millones, la escasez impulsa el precio por encima del respaldo en oro. Los primeros usuarios se benefician mas.\n\nUnidad mas pequena: 1 Spark = 0,00000001 QC (como el satoshi de Bitcoin). Si un pais entero adopta QC, la gente simplemente usa unidades mas pequenas. El sistema escala infinitamente.\n\nEjemplo: si el precio del QC sube 100x por adopcion, 1 QC = 1 gramo de oro. Un pan cuesta 500 000 Sparks. Los creditos no se hacen mas pequenos, las unidades que la gente usa se hacen mas pequenas. Como centimos respecto a euros." },
      { heading: "Contribuciones", body: "Las contribuciones SPEAQ son Prueba de Participacion. Ganas Q-Credits ayudando a la red. Tu telefono puede retransmitir mensajes y validar transacciones. Ganas 0.02-0.05 QC por dia." },
      { heading: "Boveda Cuantica", body: "La Boveda Cuantica almacena tus archivos sensibles con cifrado. Tiene dos capas: visible (PIN normal) y oculta (PIN secreto). La capa oculta es completamente invisible. Negacion plausible." },
      { heading: "Grupos Fantasma", body: "Los Grupos Fantasma son chats de grupo invisibles. Los miembros no pueden ver quien mas esta en el grupo. Protege a activistas y periodistas." },
      { heading: "Modo Testigo", body: "El Modo Testigo crea evidencia a prueba de manipulacion. Cuando grabas algo, se marca con fecha y hora y se hashea con SHA-256." },
      { heading: "Dead Man's Switch", body: "Si no te reportas dentro del intervalo establecido, un mensaje preconfigurado se envia automaticamente a tus contactos elegidos." },
      { heading: "Consejos de seguridad", body: "1. Nunca comparta su PIN.\n2. Use un PIN diferente para la boveda oculta.\n3. Active mensajes que desaparecen para conversaciones sensibles.\n4. Use el Dead Man's Switch en situaciones peligrosas.\n5. No haga capturas de pantalla sensibles.\n6. Mantenga la app actualizada.\n7. Use un PIN fuerte (6 digitos).\n8. En fronteras, cambie a la capa normal.\n9. Su SPEAQ ID es su identidad, compartalo solo con personas de confianza.\n10. Respalde archivos importantes regularmente." },
      { heading: "Lo que SPEAQ NO recopila", body: "SPEAQ no recopila NINGUN dato personal en sus servidores. Sin email, sin telefono, sin nombre, sin ubicacion, sin contenido de mensajes. Todo permanece en su dispositivo." },
      { heading: "En caso de emergencia", body: "Para borrar todos los datos: Ajustes > Eliminar todos los datos. Esto elimina permanentemente todo. La capa oculta es invisible para quien no conozca el PIN secreto." },
      { heading: "Prueba de Contribucion (C+) - Contribuciones Pre-Blockchain", body: "Antes del lanzamiento de la blockchain, todas las contribuciones se rastrean localmente. Cada recompensa se firma dos veces. El fraude es imposible ya que ambas firmas son necesarias." },
      { heading: "Billetera Soberana (FIPS 204)", body: "SPEAQ genera un par de claves de firma resistente a computadoras cuanticas (ML-DSA-65, FIPS 204) en tu dispositivo. Este par de claves es tu identidad soberana on-chain. Tu clave privada nunca sale de tu dispositivo. Tus claves, tu dinero." },
      { heading: "Blockchain SPEAQ Chain", body: "SPEAQ tiene su propia blockchain resistente a computadoras cuanticas. Los bloques se producen cada 30 segundos. Cada bloque tiene doble firma con ML-DSA-65 y SPHINCS+. Suministro maximo: 21.000.000 QC." },
    ],
  },
  ru: {
    title: "Kak Rabotaet SPEAQ",
    sections: [
      { heading: "Chto takoe SPEAQ?", body: "SPEAQ - samaya bezopasnaya platforma svyazi i svobody v mire. Ona ob'edinyaet kvantovo-ustojchivoe shifrovanie, ustoychivost k tsenzure, chastnye platezhi i setevye vklady. Ni odno pravitelstvo ili khaker ne mozhet chitat vashi soobshcheniya." },
      { heading: "Pochemu SPEAQ tak bezopasen?", body: "Kazhdoe soobshchenie, zvonok, fayl i platezh zashifrovany AES-256, tem zhe standartom kotoryy ispolzuyut voennye. U kazhdogo razgovora svoy unikalnyy klyuch. Server vidit TOLKO zashifrovannye dannye." },
      { heading: "Vash SPEAQ ID", body: "Vash SPEAQ ID generiruyetsya lokalno. On ne privyazan k nomeru telefona, email ili imeni. Nikto ne mozhet vas otsledit." },
      { heading: "Soobshcheniya", body: "Vse soobshcheniya zashifrovany ot kontsa do kontsa. Tolko vy i poluchatel mozhete ikh rasshifrovat. Soobshcheniya khranyatsya lokalno. Ispolzuyte Ischezayushchie Soobshcheniya (knopka T)." },
      { heading: "Zvonki", body: "Zvonki ispolzuyut tekhnologiyu WebRTC peer-to-peer. Audio i video idut napryamuyu mezhdu ustroystvami." },
      { heading: "Q-Credits i Koshelek", body: "Q-Credits - vnutrennyaya valyuta SPEAQ, privyazannaya k zolotu: 1 QC = 0,01 gramma zolota. Stoimost privyazana k realnomu, fizicheskomu zolotu, a ne k gosudarstvennoy valyute kotoruyu mozhno napechatat ili obeztsen it.\n\nMaksimalnyy ob'yom: 21 000 000 QC (fiksirovano navsegda, kak Bitcoin). Obshcheye zolotoye obespechenie: 210 kg.\n\nMozhet li QC stoit dorozhe zolota? Da. Privyazka k zolotu - eto POL, a ne potolok. Yesli milliony lyudey khotyat QC, a ikh vsego 21 million, defitsit tolkayet tsenu vyshe zolotoy privyazki. Rannie polzovateli vyygryvayut bolshe vsego.\n\nNaymenshaya yedinitsa: 1 Spark = 0,00000001 QC (kak satoshi u Bitcoin). Yesli tselaya strana primyet QC, lyudi prosto ispolzuyut menshiye yedinitsy. Sistema masshtabiruyetsya beskonechno.\n\nPrimer: yesli tsena QC vyrastet v 100 raz cherez prinyatie, 1 QC = 1 gramm zolota. Khleb stoit 500 000 Sparks. Kredity ne stanovyatsya menshe, yedinitsy kotoryye lyudi ispolzuyut stanovyatsya menshe. Kak kopeyki k rublyam." },
      { heading: "Vklady", body: "Vklady SPEAQ - Dokazatelstvo Uchastiya. Vy zarabatyvayete Q-Credits pomogaya seti. Vash telefon mozhet retranslirovat soobshcheniya i validirovat tranzaktsii. 0.02-0.05 QC v den." },
      { heading: "Kvantovoe Khranilishche", body: "Kvantovoe Khranilishche khranit fayly s shifrovaniem. Dva sloya: vidimyy (obychnyy PIN) i skrytyy (sekretnyy PIN). Skrytyy sloy polnostyu nevidim. Pravdopodobnoe otritsanie." },
      { heading: "Prizrachnye Gruppy", body: "Nevidimye gruppovye chaty. Uchastniki ne mogut videt kto yeshche v gruppe. Zashchishchayet aktivistov i zhurnalistov." },
      { heading: "Rezhim Svidetelya", body: "Sozdayet zashchishchennye ot poddelki dokazatelstva. Zapisi poluchayut metku vremeni i khesh SHA-256." },
      { heading: "Dead Man's Switch", body: "Yesli vy ne otmechaetes v techenie intervala, soobshchenie avtomaticheski otpravlyayetsya vashim kontaktam." },
      { heading: "Sovety po bezopasnosti", body: "1. Nikogda ne soobshchayte PIN.\n2. Ispolzuyte drugoy PIN dlya skrytogo khranilishcha.\n3. Vklyuchite ischezayushchie soobshcheniya.\n4. Ispolzuyte Dead Man's Switch v opasnykh situatsiyakh.\n5. Ne delayte skrinshoty.\n6. Obnovlyayte prilozhenie.\n7. Ispolzuyte silnyy PIN.\n8. Na granitsakh perekhodite na obychnyy sloy.\n9. Vash SPEAQ ID - vasha lichnost.\n10. Regulyarno sokhyranayte fayly." },
      { heading: "Chto SPEAQ NE sobirayet", body: "SPEAQ ne sobirayet NIKAKIKH dannykh na serverakh. Ni email, ni telefon, ni imya, ni mestopolozhenie. Vse na vashem ustroystve." },
      { heading: "V sluchaye chrezvychaynoy situatsii", body: "Dlya udaleniya vsekh dannykh: Nastroyki > Udalit vse. Eto navsegda udalyaet vsyo. Skrytyy sloy nevidim bez sekretnogo PIN." },
      { heading: "Dokazatelstvo Vklada (C+) - Pre-Blockchain Vklady", body: "Do zapuska blokchejna vse vklady otslezhivayutsya lokalno. Kazhdaya nagrada podpisyvaetsya dvazhdy. Moshennichestvo nevozmozhno." },
      { heading: "Suverenniy Koshelek (FIPS 204)", body: "SPEAQ generiruet kvantovo-ustoychivuyu paru klyuchey dlya podpisi (ML-DSA-65, FIPS 204) na vashem ustroystve. Vash privatniy klyuch nikogda ne pokidaet vashe ustroystvo. Vashi klyuchi, vashi dengi." },
      { heading: "Blokcheyn SPEAQ Chain", body: "SPEAQ imeet sobstvenniy kvantovo-ustoychiviy blokcheyn. Bloki sozdayutsya kazhdye 30 sekund. Kazhdiy blok imeet dvoynuyu podpis ML-DSA-65 i SPHINCS+. Maksimalnoe predlozhenie: 21.000.000 QC." },
    ],
  },
  de: {
    title: "Wie SPEAQ Funktioniert",
    sections: [
      { heading: "Was ist SPEAQ?", body: "SPEAQ ist die sicherste Kommunikations- und Freiheitsplattform der Welt. Sie kombiniert quantenresistente Verschlusselung, Zensurresistenz, private Zahlungen und Netzwerk-Beitrage. Keine Regierung, kein Unternehmen und kein Hacker kann Ihre Nachrichten lesen." },
      { heading: "Warum ist SPEAQ so sicher?", body: "Jede Nachricht, jeder Anruf, jede Datei und jede Zahlung wird mit AES-256 verschlusselt, dem gleichen Standard der von Militar verwendet wird. Jedes Gesprach hat seinen eigenen Schlussel. Der Relay-Server sieht NUR verschlusselte Daten. Zero-Knowledge-Architektur." },
      { heading: "Ihre SPEAQ ID", body: "Ihre SPEAQ ID wird lokal auf Ihrem Gerat generiert. Sie ist nicht mit Ihrer Telefonnummer, E-Mail oder Ihrem Namen verknupft. Niemand kann Sie zuruckverfolgen." },
      { heading: "Nachrichten", body: "Alle Nachrichten sind Ende-zu-Ende verschlusselt. Nur Sie und der Empfanger konnen sie lesen. Nachrichten werden lokal gespeichert. Nutzen Sie Verschwindende Nachrichten (T-Taste) fur automatische Loschung." },
      { heading: "Sprach- und Videoanrufe", body: "Anrufe nutzen WebRTC Peer-to-Peer Technologie. Audio und Video gehen direkt zwischen Geraten." },
      { heading: "Q-Credits und Geldborse", body: "Q-Credits sind SPEAQs interne Wahrung, gestuetzt durch Gold: 1 QC = 0,01 Gramm Gold. Der Wert ist an echtes, physisches Gold gebunden, nicht an eine Regierungswahrung die gedruckt oder entwertet werden kann.\n\nMaximale Menge: 21.000.000 QC (fuer immer festgelegt, wie Bitcoin). Gesamte Golddeckung: 210 kg.\n\nKann QC mehr wert werden als Gold? Ja. Die Goldbindung ist ein BODEN, keine Decke. Wenn Millionen Menschen QC wollen und nur 21 Millionen existieren, treibt Knappheit den Preis ueber die Goldbindung. Fruehe Nutzer profitieren am meisten.\n\nKleinste Einheit: 1 Spark = 0,00000001 QC (wie Bitcoins Satoshi). Wenn ein ganzes Land QC einfuehrt, nutzen die Menschen einfach kleinere Einheiten. Das System skaliert unendlich.\n\nBeispiel: wenn der QC-Preis durch Verbreitung 100x steigt, ist 1 QC = 1 Gramm Gold. Ein Brot kostet 500.000 Sparks. Die Credits werden nicht kleiner, die Einheiten die Menschen nutzen werden kleiner. Wie Cent zu Euro." },
      { heading: "Contributions", body: "SPEAQ Beitrage belohnen Netzwerkhilfe. Sie verdienen Q-Credits indem Sie dem Netzwerk helfen. Ihr Telefon kann Nachrichten weiterleiten und Transaktionen validieren. 0.02-0.05 QC pro Tag." },
      { heading: "Quantentresor", body: "Der Quantentresor speichert Ihre sensiblen Dateien verschlusselt. Zwei Schichten: sichtbar (normaler PIN) und versteckt (geheimer PIN). Die versteckte Schicht ist vollig unsichtbar. Glaubhafte Abstreitbarkeit." },
      { heading: "Geistergruppen", body: "Unsichtbare Gruppenchats. Mitglieder sehen nicht wer sonst in der Gruppe ist. Schutzt Aktivisten und Journalisten." },
      { heading: "Zeugenmodus", body: "Erstellt falschungssichere Beweise. Aufzeichnungen werden mit Zeitstempel und SHA-256 Hash versehen." },
      { heading: "Dead Man's Switch", body: "Wenn Sie sich nicht innerhalb des Intervalls melden, wird eine Nachricht automatisch an Ihre Kontakte gesendet." },
      { heading: "Sicherheitstipps", body: "1. Teilen Sie Ihre PIN niemals.\n2. Andere PIN fur den versteckten Tresor.\n3. Verschwindende Nachrichten fur sensible Gesprache.\n4. Dead Man's Switch in Gefahrensituationen.\n5. Keine Screenshots.\n6. App aktuell halten.\n7. Starke PIN (6 Ziffern).\n8. An Grenzen zur normalen Schicht wechseln.\n9. SPEAQ ID nur mit Vertrauenspersonen teilen.\n10. Regelmaessig Dateien sichern." },
      { heading: "Was SPEAQ NICHT sammelt", body: "SPEAQ sammelt KEINE Daten auf seinen Servern. Keine E-Mail, kein Telefon, kein Name, kein Standort, keine Nachrichteninhalte. Alles bleibt auf Ihrem Gerat." },
      { heading: "Im Notfall", body: "Alle Daten loschen: Einstellungen > Alle Daten loschen. Dies loscht permanent alles. Die versteckte Schicht ist unsichtbar ohne den geheimen PIN." },
      { heading: "Beweis des Beitrags (C+) - Pre-Blockchain Contributions", body: "Vor dem Start der Blockchain findet alle Beitrage lokal statt. Jede Belohnung wird doppelt signiert. Betrug ist unmoglich." },
      { heading: "Souverane Wallet (FIPS 204)", body: "SPEAQ generiert ein quantenresistentes Signatur-Schlusselpaar (ML-DSA-65, FIPS 204) auf Ihrem Gerat. Dieses Schlusselpaar ist Ihre souverane On-Chain-Identitat. Ihr privater Schlussel verlasst niemals Ihr Gerat. Ihre Schlussel, Ihr Geld." },
      { heading: "SPEAQ Chain Blockchain", body: "SPEAQ hat seine eigene quantenresistente Blockchain. Blocke werden alle 30 Sekunden produziert. Jeder Block wird doppelt signiert mit ML-DSA-65 und SPHINCS+. Maximales Angebot: 21.000.000 QC." },
    ],
  },
  sl: {
    title: "Kako Deluje SPEAQ",
    sections: [
      { heading: "Kaj je SPEAQ?", body: "SPEAQ je najvarnejsa komunikacijska in svobodna platforma na svetu. Zdruzuje kvantno odporno sifriranje, odpornost na cenzuro, zasebna placila in prispevke omrezja. Nobena vlada, podjetje ali heker ne more brati vasih sporocil." },
      { heading: "Zakaj je SPEAQ tako varen?", body: "Vsako sporocilo, klic, datoteka in placilo je sifrirano z AES-256, enakim standardom ki ga uporablja vojska. Vsak pogovor ima svoj edinstven kljuc. Streznik vidi SAMO sifrirane podatke." },
      { heading: "Vas SPEAQ ID", body: "Vas SPEAQ ID se generira lokalno na vasi napravi. Ni povezan z vaso telefonsko stevilko, e-posto ali imenom. Nihce vas ne more slediti." },
      { heading: "Sporocila", body: "Vsa sporocila so sifrirana od konca do konca. Samo vi in prejemnik jih lahko berete. Sporocila so shranjena lokalno. Uporabite Izginjajoca Sporocila (gumb T) za samodejno brisanje." },
      { heading: "Glasovni in Video Klici", body: "Klici uporabljajo tehnologijo WebRTC peer-to-peer. Zvok in video gredo neposredno med napravami." },
      { heading: "Q-Credits in Denarnica", body: "Q-Credits so notranja valuta SPEAQ, podprta z zlatom: 1 QC = 0,01 grama zlata. Vrednost je vezana na pravo, fizicno zlato, ne na drzavno valuto ki jo lahko tiskajo ali razvrednotijo.\n\nNajvecja kolicina: 21.000.000 QC (za vedno fiksno, kot Bitcoin). Skupna zlata podpora: 210 kg.\n\nLahko QC postane vreden vec kot zlato? Da. Vezava na zlato je TLA, ne strop. Ce milijoni ljudi zelijo QC in jih obstaja samo 21 milijonov, pomanjkanje dvigne ceno nad zlato vezavo. Zgodnji uporabniki imajo najvec koristi.\n\nNajmanjsa enota: 1 Spark = 0,00000001 QC (kot Bitcoinov satoshi). Ce cela drzava sprejme QC, ljudje preprosto uporabljajo manjse enote. Sistem se neskoncno prilagaja.\n\nPrimer: ce cena QC naraste 100x skozi sprejetje, je 1 QC = 1 gram zlata. Kruh stane 500.000 Sparkov. Krediti ne postanejo manjsi, enote ki jih ljudje uporabljajo postanejo manjse. Kot centi pri evrih." },
      { heading: "Prispevki", body: "SPEAQ Prispevki so Dokaz Sodelovanja. Zasluzite Q-Credits s pomocjo omrezju. Vas telefon lahko posreduje sporocila in potrjuje transakcije. 0.02-0.05 QC na dan." },
      { heading: "Kvantni Trezor", body: "Kvantni Trezor shranjuje obcutljive datoteke sifrirano. Dve plasti: vidna (obicajen PIN) in skrita (skrivni PIN). Skrita plast je popolnoma nevidna. Verjetna zanikljivost." },
      { heading: "Nevidne Skupine", body: "Nevidni skupinski pogovori. Clani ne vidijo kdo drug je v skupini. Sciti aktiviste in novinarje." },
      { heading: "Nacin Price", body: "Ustvari dokaze odporne na ponarejanje. Posnetki dobijo casovni zig in SHA-256 hash." },
      { heading: "Dead Man's Switch", body: "Ce se ne prijavite v intervalu, se sporocilo samodejno poslje vasim stikom." },
      { heading: "Varnostni nasveti", body: "1. Nikoli ne delite PIN-a.\n2. Drugacen PIN za skriti trezor.\n3. Izginjajoca sporocila za obcutljive pogovore.\n4. Dead Man's Switch v nevarnih situacijah.\n5. Brez posnetkov zaslona.\n6. Posodabljajte aplikacijo.\n7. Mocen PIN (6 stevilk).\n8. Na mejah preklopite na obicajno plast.\n9. SPEAQ ID delite samo z zaupanja vrednimi.\n10. Redno varnostno kopirajte datoteke." },
      { heading: "Kaj SPEAQ NE zbira", body: "SPEAQ ne zbira NOBENIH podatkov na streznikih. Brez e-poste, telefona, imena, lokacije, vsebine sporocil. Vse ostane na vasi napravi." },
      { heading: "V primeru nujnosti", body: "Za brisanje vseh podatkov: Nastavitve > Izbrisi vse. To trajno izbrise vse. Skrita plast je nevidna brez skrivnega PIN-a." },
      { heading: "Dokaz prispevka (C+) - Pred-blockchain prispevki", body: "Pred zagonom verige blokov se vsi prispevki se sledijo lokalno. Vsaka nagrada je dvojno podpisana. Goljufija je nemogoca." },
      { heading: "Suverena Denarnica (FIPS 204)", body: "SPEAQ generira kvantno odporen par podpisnih kljucev (ML-DSA-65, FIPS 204) na vasi napravi. Vas zasebni kljuc nikoli ne zapusti naprave. Vasi kljuci, vas denar." },
      { heading: "SPEAQ Chain Blockchain", body: "SPEAQ ima lastno kvantno odporno verigo blokov. Bloki se proizvedejo vsakih 30 sekund. Vsak blok je dvojno podpisan z ML-DSA-65 in SPHINCS+. Najvecja zaloga: 21.000.000 QC." },
    ],
  },
  lg: {
    title: "SPEAQ Ekola Etya",
    sections: [
      { heading: "SPEAQ Kye Ki?", body: "SPEAQ ye pulaatifomu y'empuliziganya n'eddembe esinga kuyiikika mu nsi yonna. Ekwatiriza enkuuma ey'obukiiko, okuziyiza censorship, okusasula mu kyama ne network contributions. Tewali gavumenti oba hacker asobola kusoma bubaka bwo." },
      { heading: "Lwaki SPEAQ Enkalu Ennyo?", body: "Buli bubaka, okuyita, fayiro n'okusasula bikuumibwa ne AES-256, sitandaadi y'emu eyikozesebwa ab'eggye. Buli mboozi erina ekisumuluzo kyayo ekyenjawulo. Server eraba BWEREERE, tekisobola kusoma byonna." },
      { heading: "SPEAQ ID Yo", body: "SPEAQ ID yo ekolebwa wano ku simu yo. Terikwatiriziddwa na nnamba y'essimu, email oba erinnya lyo. Tewali asobola okukugoberera." },
      { heading: "Obubaka", body: "Obubaka bwonna bukuumiddwa end-to-end. Gwe wekka n'alifuna ye mwe musobola okubusoma. Obubaka butereddwa ku simu yo. Kozesa Obubaka Obuggwaamu (T button)." },
      { heading: "Okuyita mu Doboozi ne Video", body: "Okuyita kukozesa tekinologiya ya WebRTC peer-to-peer. Eddoboozi ne video bigenda butereevu wakati wa simu." },
      { heading: "Q-Credits n'Ensawo", body: "Q-Credits ze ssente za SPEAQ, ezikwatiririziddwa ne zaabu: 1 QC = 0,01 guramu ya zaabu. Omuwendo gukwatiririziddwa ne zaabu ey'entuufu, si ssente za gavumenti ezisobola okufuulibwa oba okuweerera.\n\nObungi obusinga: 21,000,000 QC (kweyongeddeyo, nga Bitcoin). Zaabu yonna eyekuuma: 210 kg.\n\nQ-Credits zisobola okufuuka za muwendo ogusinga zaabu? Yee. Okukwatiririzibwa ne zaabu kwe NTOBO, si kasolya. Obungi bw'abantu bwe baagala QC naye waliwo 21 million zokka, obutono bulinnya omuwendo wazo okusinga zaabu. Ab'olubereberye bwe bafuna ennyo.\n\nEkitundu ekitono ennyo: 1 Spark = 0,00000001 QC (nga satoshi ya Bitcoin). Ensi yonna bw'ekozesa QC, abantu bakozesa bitundu ebitono. System efuula ennene ennyo.\n\nEkyokulabirako: omuwendo gwa QC bwe gukula emirundi 100 olw'okukozesebwa, 1 QC = 1 guramu ya zaabu. Omugaati gusasula 500,000 Sparks. Credits tezifuuka ntono, ebitundu abantu bye bakozesa bye bifuuka ebitono. Nga sente ennaku eri silingi." },
      { heading: "Contributions", body: "SPEAQ Contributions ye Obujulizi bw'Okuyamba. Ofuna Q-Credits ng'oyamba network. Simu yo esobola okuwereza bubaka n'okukakasa entambuza. 0.02-0.05 QC olunaku." },
      { heading: "Esitimu ya Quantum", body: "Esitimu etereka fayiro zo enkuumiddwa. Ebifo bibiri: ekirabikirwa (PIN ow'enjawulo) n'ekikisiddwa (PIN ow'ekyama). Ekifo ekikisiddwa tekirabikirwa. Plausible deniability." },
      { heading: "Ebibinja Ebitabika", body: "Mboozi z'ekibinja ezitabikirwa. Abawereddwamu tebasobola kulaba ba ani abalala. Kikuuma ba activist ne journalist." },
      { heading: "Omujulizi Mode", body: "Akola obujulizi obutasobola kukyusibwa. Ebitereddwa bifuna time stamp ne SHA-256 hash." },
      { heading: "Dead Man's Switch", body: "Bw'otogezebwa mu budde bw'oteese, obubaka buwereddwa otomakiki eri abantu b'olondeddwa." },
      { heading: "Ebiragiro by'Obukuumi", body: "1. Togabanya PIN yo.\n2. Kozesa PIN endala ku kifo ekikisiddwa.\n3. Kolola obubaka obugwaamu.\n4. Kozesa Dead Man's Switch mu mbeera ey'akabi.\n5. Tokola screenshots.\n6. Kozesa PIN ey'amaanyi.\n7. Update app.\n8. Ku borders kozesa normal layer.\n9. SPEAQ ID yo gabanya n'abantu b'okwesiga.\n10. Tereka fayiro zo." },
      { heading: "SPEAQ Kye Kitakuuŋŋaanya", body: "SPEAQ tekuuŋŋaanya data yonna ku servers. Tewali email, tewali nnamba, tewali erinnya, tewali location. Byonna bisigala ku simu yo." },
      { heading: "Mu mbeera ey'Amangu", body: "Okusangula data yonna: Settings > Delete All Data. Kino kisangula byonna. Ekifo ekikisiddwa tekirabikirwa eri buli omu atamanya PIN ey'ekyama." },
      { heading: "Obujulizi bw'Okugaba (C+)", body: "Nga blockchain tennatandika, okusimba kwonna kukola mu kifo kyo. Buli mpeera esainibwa emirundi ebiri. Obbubbi tekisoboka." },
      { heading: "Ensawo Eyeereka (FIPS 204)", body: "SPEAQ ekola ekimu ky'okusayina ekizimba quantum (ML-DSA-65, FIPS 204) ku kifaananyi kyo. Ekimu kyo eky'ekyama tekiva ku kifaananyi kyo. Bisumuluzo byo, ssente zo." },
      { heading: "SPEAQ Chain Blockchain", body: "SPEAQ erina blockchain yaayo eyezimba quantum. Blocks zitondebwa buli sekondi 30. Buli block erina okusayinibwa okubiri ne ML-DSA-65 ne SPHINCS+. Omuwendo ogusingayo: 21.000.000 QC." },
    ],
  },
  sw: {
    title: "Jinsi SPEAQ Inavyofanya Kazi",
    sections: [
      { heading: "SPEAQ ni Nini?", body: "SPEAQ ni jukwaa la mawasiliano na uhuru salama zaidi duniani. Inachanganya usimbaji wa quantum, upinzani wa udhibiti, malipo ya faragha na michango ya mtandao. Hakuna serikali au hacker anayeweza kusoma ujumbe wako." },
      { heading: "Kwa Nini SPEAQ ni Salama Sana?", body: "Kila ujumbe, simu, faili na malipo husimbwa kwa AES-256, kiwango kile kile kinachotumika na jeshi. Kila mazungumzo yana ufunguo wake wa kipekee. Seva inaona TU data iliyosimbwa." },
      { heading: "SPEAQ ID Yako", body: "SPEAQ ID yako inazalishwa ndani ya kifaa chako. Haijaunganishwa na nambari yako ya simu, barua pepe au jina. Hakuna anayeweza kukufuatilia." },
      { heading: "Ujumbe", body: "Ujumbe wote umesimbwa mwisho hadi mwisho. Wewe na mpokeaji peke yenu mnaweza kusoma. Ujumbe huhifadhiwa ndani ya kifaa. Tumia Ujumbe Unaopotea (kitufe T)." },
      { heading: "Simu za Sauti na Video", body: "Simu hutumia teknolojia ya WebRTC peer-to-peer. Sauti na video huenda moja kwa moja kati ya vifaa." },
      { heading: "Q-Credits na Mkoba", body: "Q-Credits ni sarafu ya ndani ya SPEAQ, iliyounganishwa na dhahabu: 1 QC = 0,01 gramu ya dhahabu. Thamani imefungwa kwa dhahabu halisi, si kwa sarafu ya serikali inayoweza kuchapishwa au kupunguza thamani.\n\nUgavi wa juu: 21,000,000 QC (imewekwa milele, kama Bitcoin). Dhahabu yote inayolinda: 210 kg.\n\nJe QC inaweza kuwa na thamani zaidi ya dhahabu? Ndiyo. Uhusiano na dhahabu ni SAKAFU, si dari. Ikiwa mamilioni ya watu wanataka QC na 21 milioni tu zipo, uhaba unasukuma bei juu ya uhusiano wa dhahabu. Watumiaji wa mapema wanafaidika zaidi.\n\nKipimo kidogo zaidi: 1 Spark = 0,00000001 QC (kama satoshi ya Bitcoin). Ikiwa nchi nzima itakubali QC, watu hutumia vipimo vidogo. Mfumo hupanuka bila kikomo.\n\nMfano: ikiwa bei ya QC inapanda mara 100 kupitia matumizi, 1 QC = 1 gramu ya dhahabu. Mkate unagharimu Sparks 500,000. Mikopo haipungui, vipimo ambavyo watu hutumia vinapungua. Kama senti kwa euro." },
      { heading: "Michango", body: "Michango ya SPEAQ ni Uthibitisho wa Ushiriki. Unapata Q-Credits kwa kusaidia mtandao. Simu yako inaweza kupitisha ujumbe na kuthibitisha shughuli. QC 2-5 kwa siku." },
      { heading: "Kabati la Quantum", body: "Kabati la Quantum huhifadhi faili nyeti kwa usimbaji. Tabaka mbili: inayoonekana (PIN ya kawaida) na iliyofichwa (PIN ya siri). Tabaka iliyofichwa haionekani kabisa. Kukataa kuaminika." },
      { heading: "Vikundi vya Roho", body: "Mazungumzo ya kikundi yasiyoonekana. Wanachama hawawezi kuona ni nani mwingine. Inalinda wanaharakati na waandishi wa habari." },
      { heading: "Hali ya Shahidi", body: "Huunda ushahidi usioweza kubadilishwa. Rekodi hupata muhuri wa wakati na SHA-256 hash." },
      { heading: "Dead Man's Switch", body: "Usipojisajili ndani ya muda, ujumbe hutumwa kiotomatiki kwa anwani zako." },
      { heading: "Vidokezo vya Usalama", body: "1. Usishiriki PIN yako.\n2. Tumia PIN tofauti kwa kabati la siri.\n3. Washa ujumbe unaopotea.\n4. Tumia Dead Man's Switch katika hali hatari.\n5. Usipige picha za skrini.\n6. Sasisha programu.\n7. Tumia PIN imara.\n8. Kwenye mipaka, badilisha hadi tabaka la kawaida.\n9. SPEAQ ID yako ni utambulisho wako.\n10. Hifadhi nakala za faili mara kwa mara." },
      { heading: "SPEAQ Haikusanyi Nini", body: "SPEAQ haikusanyi data YOYOTE kwenye seva. Hakuna barua pepe, nambari, jina, eneo, maudhui ya ujumbe. Kila kitu kinabaki kwenye kifaa chako." },
      { heading: "Kwa Dharura", body: "Kufuta data yote: Mipangilio > Futa data zote. Hii inafuta kila kitu milele. Tabaka iliyofichwa haionekani bila PIN ya siri." },
      { heading: "Uthibitisho wa Mchango (C+)", body: "Kabla ya blockchain kuanzishwa, michango yote inafuatiliwa ndani ya kifaa chako. Kila tuzo inasainiwa mara mbili. Udanganyifu hauwezekani." },
      { heading: "Mkoba wa Uhuru (FIPS 204)", body: "SPEAQ inatengeneza jozi ya funguo za kusaini zinazostahimili quantum (ML-DSA-65, FIPS 204) kwenye kifaa chako. Funguo yako ya faragha haitoki kwenye kifaa chako kamwe. Funguo zako, pesa zako." },
      { heading: "SPEAQ Chain Blockchain", body: "SPEAQ ina blockchain yake inayostahimili quantum. Blocks zinazalishwa kila sekunde 30. Kila block ina saini mbili za ML-DSA-65 na SPHINCS+. Ugavi wa juu: 21.000.000 QC." },
    ],
  },
};

export default function InfoScreen({ onBack }: Props) {
  const lang = getLanguage();
  const content = INFO[lang] || INFO.en;

  return (
    <View style={st.container}>
      <View style={st.header}>
        <TouchableOpacity onPress={onBack} style={st.backBtn}>
          <Text style={st.backText}>{"<"}</Text>
        </TouchableOpacity>
        <Text style={st.title}>{content.title}</Text>
      </View>

      <ScrollView style={st.scroll} contentContainerStyle={{ paddingBottom: 100 }}>
        {content.sections.map((section, i) => (
          <View key={i} style={st.section}>
            <Text style={st.heading}>{section.heading}</Text>
            <Text style={st.body}>{section.body}</Text>
          </View>
        ))}

        <View style={st.footer}>
          <Text style={st.footerText}>SPEAQ Freely.</Text>
          <Text style={st.footerSub}>thespeaq.com</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.depth.void },
  header: { flexDirection: "row", alignItems: "center", paddingTop: 60, paddingHorizontal: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.border.subtle },
  backBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center", marginRight: 8 },
  backText: { color: colors.voice.gold, fontSize: 20, fontWeight: "600" },
  title: { color: colors.signal.white, fontSize: 22, fontWeight: "700", fontFamily: "Georgia" },
  scroll: { flex: 1, paddingHorizontal: 20 },

  section: { marginTop: 24 },
  heading: { color: colors.voice.gold, fontSize: 16, fontWeight: "600", marginBottom: 8 },
  body: { color: colors.signal.light, fontSize: 14, lineHeight: 22 },

  footer: { alignItems: "center", marginTop: 40, paddingVertical: 20, borderTopWidth: 1, borderTopColor: colors.border.subtle },
  footerText: { color: colors.voice.gold, fontSize: 16, fontWeight: "600", fontFamily: "Georgia" },
  footerSub: { color: colors.signal.steel, fontSize: 12, marginTop: 4, fontFamily: "Courier" },
});
