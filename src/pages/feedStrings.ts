import type { LanguageCode } from '../types/neophi';

/** Copy for the in-app feed that the app's main string table does not already have. */
export interface FeedStrings {
  feed: string;
  laterToast: string;
  doneToast: string;
  aiOff: string;
  aiPending: string;
  aiFailed: string;
  aiNotSure: string;
  maybe: string;
  savedAgo: (days: number) => string;
  unavailable: string;
  privateLabel: string;
  aiSorted: string;
  youSorted: string;
  noCategory: string;
  emptyTitle: string;
  emptyBody: string;
  allCaughtUp: string;
  theme: string;
  previewNote: string;
  loading: string;
  switchOn: string;
  switchOff: string;
  libraryEmpty: string;
  rename: string;
  save: string;
  cancel: string;
  uncategorized: string;
  sampleChip: string;
  openOnInstagram: string;
  /** Saving from Instagram: connect once, then share Reels to the account. */
  ig: InstagramStrings;
}

export interface InstagramStrings {
  stripTitle: string;
  stripBody: (handle: string | null) => string;
  connect: string;
  modalTitle: string;
  close: string;
  step1: (handle: string | null) => string;
  openInstagram: string;
  step2: string;
  copy: string;
  copied: string;
  codeHint: (minutes: number) => string;
  expired: string;
  newCode: string;
  step3: string;
  waiting: string;
  makingCode: string;
  failed: string;
  tryAgain: string;
  notAvailable: string;
  linkedTitle: string;
  linkedBody: (handle: string | null) => string;
  linkedHow: string;
  done: string;
  disconnect: string;
  disconnectConfirm: string;
  disconnected: string;
  welcomeLinkedTitle: string;
  welcomeLinkedBody: (handle: string | null) => string;
  settingsTitle: string;
  settingsLinked: string;
  settingsNotLinked: string;
  arrived: (title: string) => string;
  view: string;
  dismiss: string;
  fromInstagram: string;
  manage: string;
}

export const FEED_STRINGS: Record<LanguageCode, FeedStrings> = {
  en: {
    feed: 'Feed',
    laterToast: 'Moved to later. It comes back tomorrow.',
    doneToast: 'Marked done.',
    aiOff: 'Private: AI is off for this save.',
    aiPending: 'Reading this save…',
    aiFailed: 'Could not read this one. Your link and note are kept.',
    aiNotSure: 'not sure',
    maybe: 'Maybe',
    savedAgo: (d) => (d <= 0 ? 'Saved today' : d === 1 ? 'Saved yesterday' : `Saved ${d} days ago`),
    unavailable: 'Not available',
    privateLabel: 'Private',
    aiSorted: 'AI sorted',
    youSorted: 'Sorted by you',
    noCategory: 'Not sorted yet',
    emptyTitle: 'Nothing saved yet',
    emptyBody: 'Save a Reel, a link or a screenshot with a few words about why. It shows up here.',
    allCaughtUp: 'You are all caught up. Saves marked Later come back here.',
    theme: 'Theme',
    previewNote: 'Preview: this part needs the Neophi server. Later, Done and Add context work here.',
    loading: 'Loading…',
    switchOn: 'Switch on',
    switchOff: 'Switch off',
    libraryEmpty: 'Your library is empty. Save something with +, or try the sample library from Feed.',
    rename: 'Rename',
    save: 'Save',
    cancel: 'Cancel',
    uncategorized: 'Not sorted yet',
    sampleChip: 'Sample library loaded so you can explore. Delete it any time in Settings.',
    openOnInstagram: 'Open on Instagram',
    ig: {
      stripTitle: 'Save straight from Instagram',
      stripBody: (h) => (h ? `Connect once, then share any Reel to @${h}.` : 'Connect once, then share any Reel to our account.'),
      connect: 'Connect Instagram',
      modalTitle: 'Save from Instagram',
      close: 'Close',
      step1: (h) => (h ? `Open Instagram and message @${h}` : 'Open Instagram and message our account'),
      openInstagram: 'Open Instagram',
      step2: 'Send this code as your message',
      copy: 'Copy',
      copied: 'Copied',
      codeHint: (m) => `Works once, for the next ${m} min.`,
      expired: 'This code has expired.',
      newCode: 'Get a new code',
      step3: 'That is all. This page connects by itself.',
      waiting: 'Waiting for your message…',
      makingCode: 'Making your code…',
      failed: 'Could not make a code just now.',
      tryAgain: 'Try again',
      notAvailable: 'Saving from Instagram is not switched on yet.',
      linkedTitle: 'Instagram is connected',
      linkedBody: (h) => (h ? `Share any Reel to @${h}.` : 'Share any Reel to our account.'),
      linkedHow: 'Type why you saved it in the same message, or right after. It shows up here in about a minute, with your words first.',
      done: 'Done',
      disconnect: 'Disconnect Instagram',
      disconnectConfirm: 'Stop saving from Instagram? What you already saved stays here.',
      disconnected: 'Instagram disconnected.',
      welcomeLinkedTitle: 'Now share a Reel',
      welcomeLinkedBody: (h) =>
        h ? `Send any Reel to @${h} on Instagram and say why. It lands here.` : 'Send any Reel to our account on Instagram and say why. It lands here.',
      settingsTitle: 'Instagram',
      settingsLinked: 'Connected. Reels you share to the account are saved here.',
      settingsNotLinked: 'Not connected. Connect once to save Reels by sending them in a DM.',
      arrived: (t) => `Saved from Instagram: ${t}`,
      view: 'View',
      dismiss: 'Dismiss',
      fromInstagram: 'Saved from Instagram',
      manage: 'Manage',
    },
  },
  hinglish: {
    feed: 'Feed',
    laterToast: 'Later mein rakha. Kal wapas aayega.',
    doneToast: 'Done mark kiya.',
    aiOff: 'Private: is save ke liye AI band hai.',
    aiPending: 'Padh rahe hain…',
    aiFailed: 'Ise padh nahi paaye. Link aur note save hain.',
    aiNotSure: 'pakka nahi',
    maybe: 'Shayad',
    savedAgo: (d) => (d <= 0 ? 'Aaj save kiya' : d === 1 ? 'Kal save kiya' : `${d} din pehle save kiya`),
    unavailable: 'Available nahi',
    privateLabel: 'Private',
    aiSorted: 'AI ne sort kiya',
    youSorted: 'Tumne sort kiya',
    noCategory: 'Abhi sort nahi hua',
    emptyTitle: 'Abhi kuch save nahi',
    emptyBody: 'Reel, link ya screenshot do shabdon ke saath save karo ki kyun. Woh yahan dikhega.',
    allCaughtUp: 'Sab dekh liya. Later wale saves yahan wapas aayenge.',
    theme: 'Theme',
    previewNote: 'Preview: is hisse ke liye Neophi server chahiye. Later, Done aur context yahan chalte hain.',
    loading: 'Load ho raha hai…',
    switchOn: 'On karo',
    switchOff: 'Off karo',
    libraryEmpty: 'Library khaali hai. + se kuch save karo, ya Feed se sample library try karo.',
    rename: 'Naam badlo',
    save: 'Save',
    cancel: 'Cancel',
    uncategorized: 'Abhi sort nahi hua',
    sampleChip: 'Sample library load hai taaki tum dekh sako. Settings mein kabhi bhi delete karo.',
    openOnInstagram: 'Instagram pe kholo',
    ig: {
      stripTitle: 'Seedha Instagram se save karo',
      stripBody: (h) => (h ? `Ek baar connect karo, phir koi bhi Reel @${h} ko bhejo.` : 'Ek baar connect karo, phir koi bhi Reel humare account ko bhejo.'),
      connect: 'Instagram connect karo',
      modalTitle: 'Instagram se save karo',
      close: 'Band karo',
      step1: (h) => (h ? `Instagram kholo aur @${h} ko message karo` : 'Instagram kholo aur humare account ko message karo'),
      openInstagram: 'Instagram kholo',
      step2: 'Yeh code apne message mein bhejo',
      copy: 'Copy',
      copied: 'Copy ho gaya',
      codeHint: (m) => `Sirf ek baar chalega, agle ${m} min tak.`,
      expired: 'Yeh code expire ho gaya.',
      newCode: 'Naya code lo',
      step3: 'Bas. Yeh page apne aap connect ho jaayega.',
      waiting: 'Tumhare message ka intezaar…',
      makingCode: 'Code ban raha hai…',
      failed: 'Abhi code nahi ban paaya.',
      tryAgain: 'Phir try karo',
      notAvailable: 'Instagram se save karna abhi chalu nahi hai.',
      linkedTitle: 'Instagram connect ho gaya',
      linkedBody: (h) => (h ? `Koi bhi Reel @${h} ko bhejo.` : 'Koi bhi Reel humare account ko bhejo.'),
      linkedHow: 'Kyun save kiya, woh usi message mein ya turant baad likho. Lagbhag ek minute mein yahan dikhega, tumhare shabd sabse upar.',
      done: 'Ho gaya',
      disconnect: 'Instagram disconnect karo',
      disconnectConfirm: 'Instagram se save karna band karein? Jo save ho chuka hai woh yahin rahega.',
      disconnected: 'Instagram disconnect ho gaya.',
      welcomeLinkedTitle: 'Ab ek Reel bhejo',
      welcomeLinkedBody: (h) =>
        h ? `Instagram par koi bhi Reel @${h} ko bhejo aur kyun likho. Woh yahan aa jaayega.` : 'Instagram par koi bhi Reel humare account ko bhejo aur kyun likho. Woh yahan aa jaayega.',
      settingsTitle: 'Instagram',
      settingsLinked: 'Connect hai. Account ko bheji gayi Reels yahan save hoti hain.',
      settingsNotLinked: 'Connect nahi hai. Ek baar connect karo, phir DM se Reels save karo.',
      arrived: (t) => `Instagram se save hua: ${t}`,
      view: 'Dekho',
      dismiss: 'Hatao',
      fromInstagram: 'Instagram se save hua',
      manage: 'Manage karo',
    },
  },
  hi: {
    feed: 'फ़ीड',
    laterToast: 'बाद के लिए रखा। कल वापस आएगा।',
    doneToast: '“हो गया” चिह्नित किया।',
    aiOff: 'निजी: इस सेव के लिए AI बंद है।',
    aiPending: 'पढ़ रहे हैं…',
    aiFailed: 'इसे पढ़ नहीं पाए। लिंक और नोट सुरक्षित हैं।',
    aiNotSure: 'पक्का नहीं',
    maybe: 'शायद',
    savedAgo: (d) => (d <= 0 ? 'आज सेव किया' : d === 1 ? 'कल सेव किया' : `${d} दिन पहले सेव किया`),
    unavailable: 'उपलब्ध नहीं',
    privateLabel: 'निजी',
    aiSorted: 'AI ने छाँटा',
    youSorted: 'आपने छाँटा',
    noCategory: 'अभी छँटा नहीं',
    emptyTitle: 'अभी कुछ सेव नहीं',
    emptyBody: 'रील, लिंक या स्क्रीनशॉट कुछ शब्दों के साथ सेव करें कि क्यों। वह यहाँ दिखेगा।',
    allCaughtUp: 'सब देख लिया। “बाद में” वाले सेव यहाँ लौटेंगे।',
    theme: 'थीम',
    previewNote: 'प्रीव्यू: इस हिस्से के लिए Neophi सर्वर चाहिए। “बाद में”, “हो गया” और संदर्भ जोड़ना यहाँ चलते हैं।',
    loading: 'लोड हो रहा है…',
    switchOn: 'चालू करें',
    switchOff: 'बंद करें',
    libraryEmpty: 'लाइब्रेरी खाली है। + से कुछ सेव करें, या फ़ीड से सैंपल लाइब्रेरी आज़माएँ।',
    rename: 'नाम बदलें',
    save: 'सेव करें',
    cancel: 'रद्द करें',
    uncategorized: 'अभी छँटा नहीं',
    sampleChip: 'सैंपल लाइब्रेरी लोड है ताकि आप देख सकें। सेटिंग्स में कभी भी मिटाएँ।',
    openOnInstagram: 'Instagram पर खोलें',
    ig: {
      stripTitle: 'सीधे Instagram से सेव करें',
      stripBody: (h) => (h ? `एक बार जोड़ें, फिर कोई भी रील @${h} को भेजें।` : 'एक बार जोड़ें, फिर कोई भी रील हमारे अकाउंट को भेजें।'),
      connect: 'Instagram जोड़ें',
      modalTitle: 'Instagram से सेव करें',
      close: 'बंद करें',
      step1: (h) => (h ? `Instagram खोलें और @${h} को संदेश भेजें` : 'Instagram खोलें और हमारे अकाउंट को संदेश भेजें'),
      openInstagram: 'Instagram खोलें',
      step2: 'यह कोड अपने संदेश में भेजें',
      copy: 'कॉपी',
      copied: 'कॉपी हो गया',
      codeHint: (m) => `सिर्फ़ एक बार चलेगा, अगले ${m} मिनट तक।`,
      expired: 'यह कोड समाप्त हो गया।',
      newCode: 'नया कोड लें',
      step3: 'बस इतना। यह पन्ना अपने आप जुड़ जाएगा।',
      waiting: 'आपके संदेश का इंतज़ार…',
      makingCode: 'कोड बन रहा है…',
      failed: 'अभी कोड नहीं बन पाया।',
      tryAgain: 'फिर कोशिश करें',
      notAvailable: 'Instagram से सेव करना अभी चालू नहीं है।',
      linkedTitle: 'Instagram जुड़ गया',
      linkedBody: (h) => (h ? `कोई भी रील @${h} को भेजें।` : 'कोई भी रील हमारे अकाउंट को भेजें।'),
      linkedHow: 'क्यों सेव किया, वह उसी संदेश में या तुरंत बाद लिखें। करीब एक मिनट में यहाँ दिखेगा, आपके शब्द सबसे ऊपर।',
      done: 'हो गया',
      disconnect: 'Instagram हटाएँ',
      disconnectConfirm: 'Instagram से सेव करना बंद करें? जो सेव हो चुका है वह यहीं रहेगा।',
      disconnected: 'Instagram हट गया।',
      welcomeLinkedTitle: 'अब एक रील भेजें',
      welcomeLinkedBody: (h) =>
        h ? `Instagram पर कोई भी रील @${h} को भेजें और क्यों लिखें। वह यहाँ आ जाएगी।` : 'Instagram पर कोई भी रील हमारे अकाउंट को भेजें और क्यों लिखें। वह यहाँ आ जाएगी।',
      settingsTitle: 'Instagram',
      settingsLinked: 'जुड़ा है। अकाउंट को भेजी गई रील यहाँ सेव होती हैं।',
      settingsNotLinked: 'जुड़ा नहीं है। एक बार जोड़ें, फिर DM से रील सेव करें।',
      arrived: (t) => `Instagram से सेव हुआ: ${t}`,
      view: 'देखें',
      dismiss: 'हटाएँ',
      fromInstagram: 'Instagram से सेव हुआ',
      manage: 'प्रबंधित करें',
    },
  },
};
