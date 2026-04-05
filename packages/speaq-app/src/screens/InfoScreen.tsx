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
      { heading: "What is SPEAQ?", body: "SPEAQ is the most secure communication and freedom platform in the world. It combines quantum-resistant encryption, censorship resistance, private payments, and decentralized mining in one app. No government, corporation, or hacker can read your messages, track your payments, or block your access." },
      { heading: "Why is SPEAQ so secure?", body: "Every message, call, file, and payment is encrypted with AES-256 -the same standard used by military and intelligence agencies. Each conversation has its own unique encryption key derived from SHA-256. The relay server sees ONLY encrypted data -it cannot read content, identify who is talking to whom, or determine what is being sent. This is called zero-knowledge architecture." },
      { heading: "Your SPEAQ ID", body: "Your SPEAQ ID is generated locally on your device using cryptographically secure random numbers. It is not linked to your phone number, email, or real name. No one can trace your SPEAQ ID back to you unless you choose to share it." },
      { heading: "Messages", body: "All messages are end-to-end encrypted before they leave your device. They can only be decrypted by you and the recipient. The relay server sees only encrypted blobs. Messages are stored locally on your device -if you delete the app, messages are gone forever. Use Disappearing Messages (tap the T button in chat) to auto-delete messages after a set time." },
      { heading: "Voice & Video Calls", body: "Calls use WebRTC peer-to-peer technology. Audio and video go directly between devices when possible, bypassing the server entirely. Call signaling is relayed through the encrypted relay server." },
      { heading: "Q-Credits & Wallet", body: "Q-Credits are SPEAQ's internal currency. 1 QC = 1 USD. Transactions are instant and free between users. Your wallet balance is stored locally on your device. You can send QC via SPEAQ ID, QR code, or from your contacts. Projects let you allocate QC for specific purposes." },
      { heading: "Mining", body: "SPEAQ Mining is Proof of Contribution -you earn Q-Credits by helping the network. Your phone can relay messages, validate transactions, and store encrypted fragments. Mining rewards decrease as the network grows (halving model). You earn 2-5 QC per day, which is significant income in many countries." },
      { heading: "Quantum Vault", body: "The Quantum Vault stores your sensitive files (photos, documents, notes) with encryption. It has two layers: a visible layer (normal PIN) and a hidden layer (secret PIN). If someone forces you to open your phone, the hidden layer is completely invisible -there is no technical proof it exists. This is called plausible deniability." },
      { heading: "Ghost Groups", body: "Ghost Groups are invisible group chats. Members cannot see who else is in the group. The server has no record of the group. Messages are sent individually to each member. This protects activists, journalists, and anyone who needs to communicate without a visible group structure." },
      { heading: "Witness Mode", body: "Witness Mode creates tamper-proof evidence. When you record something, it is timestamped and hashed with SHA-256. The hash proves the content existed at that exact moment and has not been modified. Use this for documenting human rights violations, corruption, or any situation where evidence must be preserved." },
      { heading: "Dead Man's Switch", body: "If you don't check in within your set interval, a pre-configured message is automatically sent to your chosen contacts. This protects journalists, activists, and whistleblowers. If something happens to you, your emergency contacts will be notified." },
      { heading: "Security Tips", body: "1. Never share your PIN with anyone.\n2. Use a different PIN for the hidden vault layer.\n3. Enable Disappearing Messages for sensitive conversations.\n4. Regularly back up important vault files.\n5. Use the Dead Man's Switch if you are in a dangerous situation.\n6. Do not screenshot sensitive conversations.\n7. Keep your app updated for the latest security patches.\n8. Use a strong PIN (6 digits, not 1234 or birthday).\n9. If crossing a border, switch to the normal vault layer.\n10. Your SPEAQ ID is your identity -share it only with trusted people." },
      { heading: "What SPEAQ does NOT collect", body: "SPEAQ collects NO personal data on its servers. No email, no phone number, no real name, no location, no contacts, no message content, no call records, no wallet balances, no browsing history. Everything stays on your device. The relay server operates on zero-knowledge -it processes encrypted data without ever seeing the content." },
      { heading: "In case of emergency", body: "If you need to quickly erase all data: go to Settings > Delete All Data. This permanently removes everything -identity, messages, contacts, wallet, vault files. Nothing can be recovered. If you are being monitored, remember that the hidden vault layer is invisible to anyone who doesn't know the secret PIN." },
    ],
  },
  nl: {
    title: "Hoe SPEAQ Werkt",
    sections: [
      { heading: "Wat is SPEAQ?", body: "SPEAQ is het meest beveiligde communicatie- en vrijheidsplatform ter wereld. Het combineert quantum-bestendige encryptie, censuurbestendigheid, prive-betalingen en gedecentraliseerde mining in een app. Geen enkele overheid, bedrijf of hacker kan je berichten lezen, je betalingen volgen of je toegang blokkeren." },
      { heading: "Waarom is SPEAQ zo veilig?", body: "Elk bericht, gesprek, bestand en elke betaling wordt versleuteld met AES-256 -dezelfde standaard die door militaire en inlichtingendiensten wordt gebruikt. Elk gesprek heeft zijn eigen unieke encryptiesleutel afgeleid van SHA-256. De relay server ziet ALLEEN versleutelde data -het kan geen inhoud lezen, niet identificeren wie met wie praat, of bepalen wat er wordt verzonden. Dit heet zero-knowledge architectuur." },
      { heading: "Je SPEAQ ID", body: "Je SPEAQ ID wordt lokaal op je apparaat gegenereerd met cryptografisch veilige willekeurige getallen. Het is niet gekoppeld aan je telefoonnummer, e-mail of echte naam. Niemand kan je SPEAQ ID naar jou herleiden tenzij je het zelf deelt." },
      { heading: "Berichten", body: "Alle berichten zijn end-to-end versleuteld voordat ze je apparaat verlaten. Ze kunnen alleen worden ontsleuteld door jou en de ontvanger. De relay server ziet alleen versleutelde blobs. Berichten worden lokaal op je apparaat opgeslagen -als je de app verwijdert, zijn berichten voor altijd weg. Gebruik Verdwijnende Berichten (tik op de T-knop in chat) om berichten automatisch te verwijderen na een ingestelde tijd." },
      { heading: "Spraak- en Videogesprekken", body: "Gesprekken gebruiken WebRTC peer-to-peer technologie. Audio en video gaan direct tussen apparaten wanneer mogelijk, zonder de server. Gespreksignalering wordt doorgestuurd via de versleutelde relay server." },
      { heading: "Q-Credits & Portemonnee", body: "Q-Credits zijn SPEAQ's interne valuta. 1 QC = 1 USD. Transacties zijn direct en gratis tussen gebruikers. Je saldo wordt lokaal op je apparaat opgeslagen. Je kunt QC versturen via SPEAQ ID, QR-code of vanuit je contacten. Projecten laten je QC toewijzen aan specifieke doeleinden." },
      { heading: "Mining", body: "SPEAQ Mining is Proof of Contribution -je verdient Q-Credits door het netwerk te helpen. Je telefoon kan berichten doorsturen, transacties valideren en versleutelde fragmenten opslaan. Mining-beloningen nemen af naarmate het netwerk groeit (halving model). Je verdient 2-5 QC per dag, wat in veel landen een significant inkomen is." },
      { heading: "Quantum Kluis", body: "De Quantum Kluis slaat je gevoelige bestanden (foto's, documenten, notities) versleuteld op. Het heeft twee lagen: een zichtbare laag (normale PIN) en een verborgen laag (geheime PIN). Als iemand je dwingt je telefoon te openen, is de verborgen laag compleet onzichtbaar -er is geen technisch bewijs dat het bestaat. Dit heet plausible deniability." },
      { heading: "Ghost Groepen", body: "Ghost Groepen zijn onzichtbare groepschats. Leden kunnen niet zien wie er nog meer in de groep zit. De server heeft geen registratie van de groep. Berichten worden individueel naar elk lid gestuurd. Dit beschermt activisten, journalisten en iedereen die moet communiceren zonder een zichtbare groepsstructuur." },
      { heading: "Getuige Modus", body: "Getuige Modus maakt manipulatiebestendig bewijs. Wanneer je iets vastlegt, wordt het voorzien van een tijdstempel en gehasht met SHA-256. De hash bewijst dat de inhoud op dat exacte moment bestond en niet is gewijzigd. Gebruik dit voor het documenteren van mensenrechtenschendingen, corruptie of elke situatie waarin bewijs bewaard moet worden." },
      { heading: "Dead Man's Switch", body: "Als je niet incheckt binnen je ingestelde interval, wordt een vooraf ingesteld bericht automatisch naar je gekozen contacten gestuurd. Dit beschermt journalisten, activisten en klokkenluiders. Als er iets met je gebeurt, worden je noodcontacten gewaarschuwd." },
      { heading: "Beveiligingstips", body: "1. Deel je PIN nooit met iemand.\n2. Gebruik een andere PIN voor de verborgen kluis laag.\n3. Schakel Verdwijnende Berichten in voor gevoelige gesprekken.\n4. Maak regelmatig back-ups van belangrijke kluis bestanden.\n5. Gebruik de Dead Man's Switch als je in een gevaarlijke situatie bent.\n6. Maak geen screenshots van gevoelige gesprekken.\n7. Houd je app bijgewerkt voor de laatste beveiligingsupdates.\n8. Gebruik een sterke PIN (6 cijfers, niet 1234 of verjaardag).\n9. Bij het oversteken van een grens, schakel naar de normale kluis laag.\n10. Je SPEAQ ID is je identiteit -deel het alleen met vertrouwde mensen." },
      { heading: "Wat SPEAQ NIET verzamelt", body: "SPEAQ verzamelt GEEN persoonlijke gegevens op zijn servers. Geen e-mail, geen telefoonnummer, geen echte naam, geen locatie, geen contacten, geen berichtinhoud, geen gespreksregistraties, geen saldi, geen browsegeschiedenis. Alles blijft op je apparaat. De relay server werkt op zero-knowledge -het verwerkt versleutelde data zonder ooit de inhoud te zien." },
      { heading: "In geval van nood", body: "Als je snel alle gegevens moet wissen: ga naar Instellingen > Alle gegevens wissen. Dit verwijdert permanent alles -identiteit, berichten, contacten, portemonnee, kluis bestanden. Niets kan worden hersteld. Als je wordt gemonitord, onthoud dat de verborgen kluis laag onzichtbaar is voor iedereen die de geheime PIN niet kent." },
    ],
  },
  fr: {
    title: "Comment SPEAQ Fonctionne",
    sections: [
      { heading: "Qu'est-ce que SPEAQ?", body: "SPEAQ est la plateforme de communication et de liberte la plus securisee au monde. Elle combine chiffrement resistant aux ordinateurs quantiques, resistance a la censure, paiements prives et minage decentralise en une seule application." },
      { heading: "Pourquoi SPEAQ est-il si sur?", body: "Chaque message, appel, fichier et paiement est chiffre avec AES-256. Chaque conversation a sa propre cle de chiffrement unique. Le serveur relais ne voit que des donnees chiffrees -architecture zero-knowledge." },
      { heading: "Conseils de securite", body: "1. Ne partagez jamais votre PIN.\n2. Utilisez un PIN different pour le coffre cache.\n3. Activez les messages ephemeres pour les conversations sensibles.\n4. Utilisez le Dead Man's Switch en situation dangereuse.\n5. Ne faites pas de captures d'ecran de conversations sensibles." },
      { heading: "Ce que SPEAQ ne collecte PAS", body: "SPEAQ ne collecte AUCUNE donnee personnelle sur ses serveurs. Pas d'email, pas de numero de telephone, pas de nom reel, pas de localisation. Tout reste sur votre appareil." },
    ],
  },
  es: {
    title: "Como Funciona SPEAQ",
    sections: [
      { heading: "Que es SPEAQ?", body: "SPEAQ es la plataforma de comunicacion y libertad mas segura del mundo. Combina cifrado resistente a computadoras cuanticas, resistencia a la censura, pagos privados y mineria descentralizada en una sola aplicacion." },
      { heading: "Por que SPEAQ es tan seguro?", body: "Cada mensaje, llamada, archivo y pago se cifra con AES-256. Cada conversacion tiene su propia clave de cifrado unica. El servidor de retransmision solo ve datos cifrados -arquitectura de conocimiento cero." },
      { heading: "Consejos de seguridad", body: "1. Nunca comparta su PIN.\n2. Use un PIN diferente para la boveda oculta.\n3. Active los mensajes que desaparecen para conversaciones sensibles.\n4. Use el Dead Man's Switch en situaciones peligrosas.\n5. No haga capturas de pantalla de conversaciones sensibles." },
      { heading: "Lo que SPEAQ NO recopila", body: "SPEAQ no recopila NINGUN dato personal en sus servidores. Sin email, sin numero de telefono, sin nombre real, sin ubicacion. Todo permanece en su dispositivo." },
    ],
  },
  ru: {
    title: "Kak Rabotaet SPEAQ",
    sections: [
      { heading: "Chto takoe SPEAQ?", body: "SPEAQ -samaya bezopasnaya platforma svyazi i svobody v mire. Ona ob'edinyaet kvantovo-ustojchivoe shifrovanie, ustoychivost k tsenzure, chastnye platezhi i detsentralizovannyy mayning v odnom prilozhenii." },
      { heading: "Pochemu SPEAQ tak bezopasen?", body: "Kazhdoe soobshchenie, zvonok, fayl i platezh zashifrovany s pomoshchyu AES-256. Kazhdyj razgovor imeet svoy unikalnyy klyuch shifrovaniya. Retranslyatsionnyy server vidit TOLKO zashifrovannye dannye -arkhitektura nulevogo znaniya." },
      { heading: "Sovety po bezopasnosti", body: "1. Nikogda ne soobshchayte svoy PIN.\n2. Ispolzuyte drugoy PIN dlya skrytogo khranilishcha.\n3. Vklyuchite ischezayushchie soobshcheniya dlya konfidentsialnykh razgovorov.\n4. Ispolzuyte Dead Man's Switch v opasnykh situatsiyakh." },
    ],
  },
  de: {
    title: "Wie SPEAQ Funktioniert",
    sections: [
      { heading: "Was ist SPEAQ?", body: "SPEAQ ist die sicherste Kommunikations- und Freiheitsplattform der Welt. Sie kombiniert quantenresistente Verschlusselung, Zensurresistenz, private Zahlungen und dezentrales Mining in einer App. Keine Regierung, kein Unternehmen und kein Hacker kann Ihre Nachrichten lesen, Ihre Zahlungen verfolgen oder Ihren Zugang blockieren." },
      { heading: "Warum ist SPEAQ so sicher?", body: "Jede Nachricht, jeder Anruf, jede Datei und jede Zahlung wird mit AES-256 verschlusselt -dem gleichen Standard, der von Militar und Geheimdiensten verwendet wird. Jedes Gesprach hat seinen eigenen einzigartigen Verschlusselungsschlussel. Der Relay-Server sieht NUR verschlusselte Daten -Zero-Knowledge-Architektur." },
      { heading: "Sicherheitstipps", body: "1. Teilen Sie Ihre PIN niemals mit jemandem.\n2. Verwenden Sie eine andere PIN fur die versteckte Tresorschicht.\n3. Aktivieren Sie verschwindende Nachrichten fur sensible Gesprache.\n4. Verwenden Sie den Dead Man's Switch in gefahrlichen Situationen.\n5. Machen Sie keine Screenshots von sensiblen Gesprachen.\n6. Halten Sie Ihre App fur die neuesten Sicherheitsupdates aktuell.\n7. Verwenden Sie eine starke PIN (6 Ziffern).\n8. An Grenzubergangen zur normalen Tresorschicht wechseln.\n9. Ihre SPEAQ ID ist Ihre Identitat -teilen Sie sie nur mit vertrauenswurdigen Personen." },
      { heading: "Was SPEAQ NICHT sammelt", body: "SPEAQ sammelt KEINE personlichen Daten auf seinen Servern. Keine E-Mail, keine Telefonnummer, kein echter Name, kein Standort, keine Kontakte, keine Nachrichteninhalte, keine Anrufprotokolle, keine Kontostande. Alles bleibt auf Ihrem Gerat." },
    ],
  },
  sl: {
    title: "Kako Deluje SPEAQ",
    sections: [
      { heading: "Kaj je SPEAQ?", body: "SPEAQ je najvarnejsa komunikacijska in svobodna platforma na svetu. Zdruzuje kvantno odporno sifriranje, odpornost na cenzuro, zasebna placila in decentralizirano rudarjenje v eni aplikaciji." },
      { heading: "Zakaj je SPEAQ tako varen?", body: "Vsako sporocilo, klic, datoteka in placilo je sifrirano z AES-256. Vsak pogovor ima svoj edinstven sifrirni kljuc. Posredovalni streznik vidi SAMO sifrirane podatke -arhitektura brez znanja." },
      { heading: "Varnostni nasveti", body: "1. Nikoli ne delite svojega PIN-a.\n2. Uporabite drugacen PIN za skriti trezor.\n3. Vklopite izginjajoca sporocila za obcutljive pogovore.\n4. Uporabite Dead Man's Switch v nevarnih situacijah." },
    ],
  },
  lg: {
    title: "SPEAQ Ekola Etya",
    sections: [
      { heading: "SPEAQ Kye Ki?", body: "SPEAQ ye pulaatifomu y'empuliziganya n'eddembe esinga kuyiikika mu nsi yonna. Ekwatiriza enkuuma ey'obukiiko obw'amaanyi, okuziyiza censorship, okusasula mu kyama ne mining." },
      { heading: "Lwaki SPEAQ Enkalu Ennyo?", body: "Buli bubaka, okuyita, fayiro n'okusasula bikuumibwa ne AES-256. Buli mboozi erina ekisumuluzo kyayo ekyenjawulo. Server eraba BWEREERE -tekisobola kusoma byonna." },
    ],
  },
  sw: {
    title: "Jinsi SPEAQ Inavyofanya Kazi",
    sections: [
      { heading: "SPEAQ ni Nini?", body: "SPEAQ ni jukwaa la mawasiliano na uhuru salama zaidi duniani. Inachanganya usimbaji unaostahimili kompyuta za quantum, upinzani wa udhibiti, malipo ya faragha na uchimbaji madini uliosambazwa katika programu moja." },
      { heading: "Kwa Nini SPEAQ ni Salama Sana?", body: "Kila ujumbe, simu, faili na malipo husimbwa kwa AES-256. Kila mazungumzo yana ufunguo wake wa kipekee wa usimbaji. Seva ya kupitisha inaona TU data iliyosimbwa -muundo wa maarifa sifuri." },
      { heading: "Vidokezo vya Usalama", body: "1. Usishiriki PIN yako na mtu yeyote.\n2. Tumia PIN tofauti kwa kabati la siri.\n3. Washa ujumbe unaopotea kwa mazungumzo nyeti.\n4. Tumia Dead Man's Switch katika hali hatari." },
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
