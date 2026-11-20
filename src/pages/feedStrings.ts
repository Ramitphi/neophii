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
  },
};
