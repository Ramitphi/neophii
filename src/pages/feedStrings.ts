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
  /** The Journey page: every save in one growing tree. */
  journey: JourneyStrings;
}

export interface JourneyStrings {
  nav: string;
  title: string;
  subtitle: string;
  lensThemes: string;
  lensTime: string;
  search: string;
  expandAll: string;
  collapseAll: string;
  saves: (n: number) => string;
  statSaves: string;
  statBranches: string;
  statNew: string;
  statWords: string;
  newBadge: string;
  newCount: (n: number) => string;
  latest: string;
  loading: string;
  emptyTitle: string;
  emptyBody: string;
  noMatch: string;
  withoutWords: string;
  purposes: { shop: string; learn: string; create: string; travel: string; food: string; try_later: string; other: string };
  unsorted: string;
  tip: string;
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
  moreTitle: string;
  moreBody: string;
  soon: string;
  returnHint: string;
  howTitle: string;
  how: [string, string, string];
  demoTitle: string;
  demoBody: string;
  demoNote: string;
  demoSample: string;
  demoSamples: [string, string, string, string];
  demoSend: string;
  demoSending: string;
  demoFailed: string;
  simulated: string;
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
      moreTitle: 'More places to save from',
      moreBody: 'Neophi is built to connect more of the places you save from. These are coming soon.',
      soon: 'Coming soon',
      howTitle: 'How it works',
      how: ['Connect Instagram once with a short code.', 'Share any Reel to the Neophi account and say why, if you like.', 'See it on Journey with your words first.'],
      returnHint: 'After you send it in Instagram, come back to this tab. Your code stays the same, and the page connects by itself.',
      demoTitle: 'No Instagram account handy?',
      demoBody: 'Try the same journey with a simulated Instagram share. It lands in your own library and is labelled simulated.',
      demoNote: 'Your words (optional)',
      demoSample: 'Sample Reel',
      demoSamples: ['Recipe with real steps', 'Place with details', 'Only hashtags and tags', 'Home and plants'],
      demoSend: 'Send a simulated share',
      demoSending: 'Sending and reading it…',
      demoFailed: 'Could not send the sample share just now.',
      simulated: 'Simulated Instagram share',
    },
    journey: {
      nav: 'Journey',
      title: 'Your journey',
      subtitle: 'Everything you saved, in one place. It grows a new branch whenever your saves do.',
      lensThemes: 'By theme',
      lensTime: 'By time',
      search: 'Search your journey',
      expandAll: 'Open all',
      collapseAll: 'Close all',
      saves: (n) => (n === 1 ? '1 save' : `${n} saves`),
      statSaves: 'saves',
      statBranches: 'branches',
      statNew: 'new this week',
      statWords: 'with your words',
      newBadge: 'New',
      newCount: (n) => `${n} new`,
      latest: 'Latest',
      loading: 'Growing your journey…',
      emptyTitle: 'Your journey starts with one save',
      emptyBody: 'Save a Reel, a link or a screenshot with a few words about why. Your first branch grows right here.',
      noMatch: 'Nothing on your journey matches that.',
      withoutWords: 'No words added yet',
      purposes: { shop: 'Things to buy', learn: 'Things to learn', create: 'Making and content', travel: 'Places and trips', food: 'Food and cooking', try_later: 'To try', other: 'Everything else' },
      unsorted: 'Not sorted yet',
      tip: 'Groups come from your own categories and from what each save is about. Nothing here is a guess about why you saved it.',
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
      moreTitle: 'Aur jagahen jahan se save karte ho',
      moreBody: 'Neophi aur jagahen bhi jodne ke liye bana hai. Yeh jaldi aa rahe hain.',
      soon: 'Jaldi aa raha hai',
      howTitle: 'Yeh kaise kaam karta hai',
      how: ['Ek chhote code se Instagram ek baar connect karo.', 'Neophi account ko koi bhi Reel bhejo, aur chaho to kyun likho.', 'Journey mein dekho, tumhare shabd sabse upar.'],
      returnHint: 'Instagram mein bhejne ke baad is tab par wapas aao. Code wahi rahega, aur page apne aap connect ho jaayega.',
      demoTitle: 'Instagram account nahi hai?',
      demoBody: 'Wahi journey ek simulated Instagram share se try karo. Woh tumhari apni library mein aata hai aur simulated likha hota hai.',
      demoNote: 'Tumhare shabd (optional)',
      demoSample: 'Sample Reel',
      demoSamples: ['Asli steps wali recipe', 'Details wali jagah', 'Sirf hashtags aur tags', 'Ghar aur paudhe'],
      demoSend: 'Simulated share bhejo',
      demoSending: 'Bhej rahe hain aur padh rahe hain…',
      demoFailed: 'Abhi sample share nahi bhej paaye.',
      simulated: 'Simulated Instagram share',
    },
    journey: {
      nav: 'Journey',
      title: 'Tumhari journey',
      subtitle: 'Jo bhi save kiya, ek jagah. Jaise saves badhte hain, nayi branch ugti hai.',
      lensThemes: 'Theme se',
      lensTime: 'Samay se',
      search: 'Journey mein dhundo',
      expandAll: 'Sab kholo',
      collapseAll: 'Sab band karo',
      saves: (n) => (n === 1 ? '1 save' : `${n} saves`),
      statSaves: 'saves',
      statBranches: 'branches',
      statNew: 'is hafte naye',
      statWords: 'tumhare shabdon ke saath',
      newBadge: 'Naya',
      newCount: (n) => `${n} naye`,
      latest: 'Sabse naya',
      loading: 'Journey ugi ja rahi hai…',
      emptyTitle: 'Journey ek save se shuru hoti hai',
      emptyBody: 'Reel, link ya screenshot do shabdon ke saath save karo ki kyun. Pehli branch yahin ugegi.',
      noMatch: 'Journey mein aisa kuch nahi mila.',
      withoutWords: 'Abhi shabd nahi jode',
      purposes: { shop: 'Kharidne wali cheezein', learn: 'Seekhne wali cheezein', create: 'Banana aur content', travel: 'Jagah aur trips', food: 'Khana aur recipes', try_later: 'Try karna hai', other: 'Baaki sab' },
      unsorted: 'Abhi sort nahi hua',
      tip: 'Groups tumhari apni categories aur har save kis baare mein hai usse bante hain. Yahan kyun save kiya, iska koi andaza nahi hai.',
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
      moreTitle: 'और जगहें जहाँ से आप सेव करते हैं',
      moreBody: 'Neophi और जगहें जोड़ने के लिए बना है। ये जल्द आ रहे हैं।',
      soon: 'जल्द आ रहा है',
      howTitle: 'यह कैसे काम करता है',
      how: ['एक छोटे कोड से Instagram एक बार जोड़ें।', 'Neophi अकाउंट को कोई भी रील भेजें, और चाहें तो क्यों लिखें।', 'यात्रा में देखें, आपके शब्द सबसे ऊपर।'],
      returnHint: 'Instagram में भेजने के बाद इस टैब पर लौट आएँ। कोड वही रहेगा, और पन्ना अपने आप जुड़ जाएगा।',
      demoTitle: 'Instagram अकाउंट नहीं है?',
      demoBody: 'वही यात्रा एक नकली (सिम्युलेटेड) Instagram शेयर से आज़माएँ। वह आपकी अपनी लाइब्रेरी में आता है और “सिम्युलेटेड” लिखा रहता है।',
      demoNote: 'आपके शब्द (वैकल्पिक)',
      demoSample: 'सैंपल रील',
      demoSamples: ['असली स्टेप वाली रेसिपी', 'जानकारी वाली जगह', 'सिर्फ़ हैशटैग और टैग', 'घर और पौधे'],
      demoSend: 'सिम्युलेटेड शेयर भेजें',
      demoSending: 'भेज रहे हैं और पढ़ रहे हैं…',
      demoFailed: 'अभी सैंपल शेयर नहीं भेज पाए।',
      simulated: 'सिम्युलेटेड Instagram शेयर',
    },
    journey: {
      nav: 'यात्रा',
      title: 'आपकी यात्रा',
      subtitle: 'जो भी सेव किया, एक जगह। जैसे सेव बढ़ते हैं, नई शाखा उगती है।',
      lensThemes: 'विषय के अनुसार',
      lensTime: 'समय के अनुसार',
      search: 'यात्रा में खोजें',
      expandAll: 'सब खोलें',
      collapseAll: 'सब बंद करें',
      saves: (n) => `${n} सेव`,
      statSaves: 'सेव',
      statBranches: 'शाखाएँ',
      statNew: 'इस हफ़्ते नए',
      statWords: 'आपके शब्दों के साथ',
      newBadge: 'नया',
      newCount: (n) => `${n} नए`,
      latest: 'सबसे नया',
      loading: 'आपकी यात्रा उग रही है…',
      emptyTitle: 'यात्रा एक सेव से शुरू होती है',
      emptyBody: 'रील, लिंक या स्क्रीनशॉट कुछ शब्दों के साथ सेव करें कि क्यों। पहली शाखा यहीं उगेगी।',
      noMatch: 'यात्रा में ऐसा कुछ नहीं मिला।',
      withoutWords: 'अभी शब्द नहीं जोड़े',
      purposes: { shop: 'खरीदने की चीज़ें', learn: 'सीखने की चीज़ें', create: 'बनाना और कंटेंट', travel: 'जगहें और यात्राएँ', food: 'खाना और रेसिपी', try_later: 'आज़माना है', other: 'बाकी सब' },
      unsorted: 'अभी छँटा नहीं',
      tip: 'समूह आपकी अपनी श्रेणियों और हर सेव के विषय से बनते हैं। आपने क्यों सेव किया, इसका यहाँ कोई अंदाज़ा नहीं है।',
    },
  },
};
