import type { LanguageCode } from '../types/neophi';

export interface StringsTable {
  appName: string;
  navToday: string;
  navLibrary: string;
  navProjects: string;
  navSettings: string;
  saveButton: string;
  searchPlaceholder: string;
  searchShortcut: string;
  sampleBanner: string;
  instagramBanner: string;
  day0Headline: string;
  day0SaveNow: string;
  day0PasteLink: string;
  day0TrySamples: string;
  sectionJustArrived: string;
  sectionYouAsked: string;
  sectionActiveProjects: string;
  sectionReadyForHour: string;
  sectionBeforeItFades: string;
  sectionWeekly: string;
  whySeeingThis: string;
  actionOpen: string;
  actionDone: string;
  actionLater: string;
  actionIcs: string;
  captureTitle: string;
  captureUploadLabel: string;
  captureUrlLabel: string;
  captureCaptionLabel: string;
  captureNoteLabel: string;
  captureNotePlaceholder: string;
  capturePrivateSwitch: string;
  captureReading: string;
  captureFailed: string;
  laneSource: string;
  laneYourWords: string;
  laneAISuggestions: string;
  keptExactly: string;
  noNoteAdded: string;
  aiSuggestionPill: string;
  notSureNoEvidence: string;
  keyPointsTitle: string;
  aiWhatThisIs: string;
  captionSkipped: string;
  linkOnlyMessage: string;
  unsupportedMessage: string;
  ledgerTitle: string;
  laneSourceEvidence: string;
  laneSourceHint: string;
  laneYourChoices: string;
  laneChoicesHint: string;
  laneAIIdeas: string;
  laneAIHint: string;
  laterNotesLabel: string;
  chipChoiceLabel: string;
  privateChoiceLabel: string;
  privateChoiceHint: string;
  undoLabel: string;
  settingsTitle: string;
  settingsModels: string;
  settingsLanguage: string;
  settingsTheme: string;
  settingsThemeToDark: string;
  settingsThemeToLight: string;
  settingsExport: string;
  settingsImport: string;
  settingsDeleteAll: string;
  settingsDeleteConfirm: string;
  settingsPrivacyNote: string;
  projectsTitle: string;
  buildOutcome: string;
  draftLabel: string;
  notKnownTitle: string;
  copyMarkdown: string;
  downloadMarkdown: string;
  understoodAs: string;
}

export const STRINGS: Record<LanguageCode, StringsTable> = {
  en: {
    appName: 'Neophi',
    navToday: 'Today',
    navLibrary: 'Library',
    navProjects: 'Projects',
    navSettings: 'Settings',
    saveButton: 'Save',
    searchPlaceholder: 'Search by half-remembered words…',
    searchShortcut: 'Ctrl+K / Cmd+K',
    sampleBanner: 'Sample data — loaded so you can explore. Delete everything in Settings any time.',
    instagramBanner: 'Open this in Chrome or Safari to keep your library.',
    day0Headline: 'A quiet desk for what you actually meant to use',
    day0SaveNow: 'Save something now',
    day0PasteLink: 'Paste a link',
    day0TrySamples: 'Try it with the sample library',
    sectionJustArrived: 'Just arrived',
    sectionYouAsked: 'You asked for this',
    sectionActiveProjects: 'Active projects',
    sectionReadyForHour: 'Ready for this hour',
    sectionBeforeItFades: 'Before it fades',
    sectionWeekly: 'This week',
    whySeeingThis: 'Why am I seeing this?',
    actionOpen: 'Open',
    actionDone: 'Done',
    actionLater: 'Later',
    actionIcs: '.ics',
    captureTitle: 'Save a memory',
    captureUploadLabel: 'Upload image or clip (max 15 MB, 60s)',
    captureUrlLabel: 'Or paste a link',
    captureCaptionLabel: 'Caption (optional)',
    captureNoteLabel: 'Why did you save this? (your words)',
    captureNotePlaceholder: 'the red shirt · Sunday ko banana hai · बालकनी के लिए',
    capturePrivateSwitch: 'Keep private, skip AI',
    captureReading: 'Reading…',
    captureFailed: 'Could not analyse this one. Your link and note are saved.',
    laneSource: 'Source',
    laneYourWords: 'Your words',
    laneAISuggestions: 'AI suggestions',
    keptExactly: 'Kept exactly as you typed it. AI never edits this.',
    noNoteAdded: "You didn't add a note.",
    aiSuggestionPill: 'AI suggestion',
    notSureNoEvidence: 'Not sure: no evidence found',
    keyPointsTitle: 'Key points',
    aiWhatThisIs: 'AI · what this is',
    captionSkipped: 'Caption skipped:',
    linkOnlyMessage: 'I only saw the link and caption',
    unsupportedMessage:
      'I could not read this one. Your link and note are kept; upload your own copy to add more.',
    ledgerTitle: 'Ledger',
    laneSourceEvidence: 'Source evidence',
    laneSourceHint: 'What was saved, and what in it the AI could point to.',
    laneYourChoices: 'Your choices',
    laneChoicesHint: 'Only you set these. Change them any time.',
    laneAIIdeas: 'AI ideas',
    laneAIHint: 'Labelled guesses. They never change your words or your choices.',
    laterNotesLabel: 'Added later by DM',
    chipChoiceLabel: 'Why you saved it',
    privateChoiceLabel: 'Keep private (AI off)',
    privateChoiceHint: 'Nothing about this save is sent to an AI model.',
    undoLabel: 'Undo',
    settingsTitle: 'Settings',
    settingsModels: 'Models in use',
    settingsLanguage: 'Language',
    settingsTheme: 'Theme',
    settingsThemeToDark: 'Switch to dark theme',
    settingsThemeToLight: 'Switch to light theme',
    settingsExport: 'Export all (JSON)',
    settingsImport: 'Import JSON',
    settingsDeleteAll: 'Delete everything',
    settingsDeleteConfirm: 'Delete all your saved items, projects, and media? This cannot be undone.',
    settingsPrivacyNote:
      "Your saves are stored in Neophi's Google Cloud project (Firestore and Cloud Storage, Mumbai region) under an anonymous id. When AI is on, the item and your note are analysed by Google's Gemini on Vertex AI. You can export or delete everything at any time in Settings.",
    projectsTitle: 'Projects & Outcomes',
    buildOutcome: 'Build draft outcome',
    draftLabel: 'Draft',
    notKnownTitle: 'Not known',
    copyMarkdown: 'Copy as Markdown',
    downloadMarkdown: 'Download .md',
    understoodAs: 'Understood as:',
  },
  hinglish: {
    appName: 'Neophi',
    navToday: 'Aaj',
    navLibrary: 'Library',
    navProjects: 'Projects',
    navSettings: 'Settings',
    saveButton: 'Save karo',
    searchPlaceholder: 'Adhoore yaad shabdon se dhundho…',
    searchShortcut: 'Ctrl+K / Cmd+K',
    sampleBanner: 'Sample data — dekhne ke liye load kiya gaya hai. Settings mein kabhi bhi delete kar sakte hain.',
    instagramBanner: 'Apni library rakhne ke liye ise Chrome ya Safari mein kholein.',
    day0Headline: 'Jo aap sach mein use karna chahte the, uske liye ek shaant desk',
    day0SaveNow: 'Abhi kuch save karo',
    day0PasteLink: 'Link paste karo',
    day0TrySamples: 'Sample library ke saath try karo',
    sectionJustArrived: 'Abhi aaya',
    sectionYouAsked: 'Aapne yaad dilane ko kaha tha',
    sectionActiveProjects: 'Active projects',
    sectionReadyForHour: 'Is waqt ke liye taiyaar',
    sectionBeforeItFades: 'Bhoolne se pehle',
    sectionWeekly: 'Is hafte',
    whySeeingThis: 'Yeh kyun dikh raha hai?',
    actionOpen: 'Kholo',
    actionDone: 'Ho gaya',
    actionLater: 'Baad mein',
    actionIcs: '.ics',
    captureTitle: 'Ek memory save karo',
    captureUploadLabel: 'Photo ya clip upload karo (max 15 MB, 60s)',
    captureUrlLabel: 'Ya link paste karo',
    captureCaptionLabel: 'Caption (optional)',
    captureNoteLabel: 'Yeh kyun save kiya? (aapke shabd)',
    captureNotePlaceholder: 'the red shirt · Sunday ko banana hai · बालकनी के लिए',
    capturePrivateSwitch: 'Private rakho, AI skip karo',
    captureReading: 'Padh raha hai…',
    captureFailed: 'Ise analyse nahi kar paaye. Aapka link aur note safe hai.',
    laneSource: 'Source',
    laneYourWords: 'Aapke shabd',
    laneAISuggestions: 'AI ke sujhav',
    keptExactly: 'Bilkul waise hi rakha gaya hai jaise aapne likha. AI ise kabhi nahi badalta.',
    noNoteAdded: 'Aapne koi note nahi likha.',
    aiSuggestionPill: 'AI suggestion',
    notSureNoEvidence: 'Pakka nahi: koi saboot nahi mila',
    keyPointsTitle: 'Khaas baatein',
    aiWhatThisIs: 'AI · yeh kya hai',
    captionSkipped: 'Caption chhoda:',
    linkOnlyMessage: 'Maine sirf link aur caption dekha',
    unsupportedMessage:
      'Ise padha nahi ja saka. Aapka link aur note safe hai; aur dekhne ke liye apni copy upload karein.',
    ledgerTitle: 'Hisab (Ledger)',
    laneSourceEvidence: 'Source aur saboot',
    laneSourceHint: 'Kya save hua, aur AI usme kis cheez ki taraf ishaara kar paaya.',
    laneYourChoices: 'Aapke choices',
    laneChoicesHint: 'Ye sirf aap set karte ho. Kabhi bhi badlo.',
    laneAIIdeas: 'AI ke ideas',
    laneAIHint: 'Label wale andaaze. Ye aapke shabd ya choices kabhi nahi badalte.',
    laterNotesLabel: 'Baad mein DM se joda',
    chipChoiceLabel: 'Kyun save kiya',
    privateChoiceLabel: 'Private rakho (AI band)',
    privateChoiceHint: 'Is save ke baare mein kuch bhi AI model ko nahi bheja jaata.',
    undoLabel: 'Undo',
    settingsTitle: 'Settings',
    settingsModels: 'Chal rahe models',
    settingsLanguage: 'Bhasha (Language)',
    settingsTheme: 'Theme',
    settingsThemeToDark: 'Dark theme pe jao',
    settingsThemeToLight: 'Light theme pe jao',
    settingsExport: 'Sab export karo (JSON)',
    settingsImport: 'JSON import karo',
    settingsDeleteAll: 'Sab kuch delete karo',
    settingsDeleteConfirm: 'Kya aap apni saari memories, projects aur media delete karna chahte hain?',
    settingsPrivacyNote:
      "Your saves are stored in Neophi's Google Cloud project (Firestore and Cloud Storage, Mumbai region) under an anonymous id. When AI is on, the item and your note are analysed by Google's Gemini on Vertex AI. You can export or delete everything at any time in Settings.",
    projectsTitle: 'Projects aur Outcomes',
    buildOutcome: 'Draft outcome banao',
    draftLabel: 'Draft',
    notKnownTitle: 'Jo pata nahi hai',
    copyMarkdown: 'Markdown copy karo',
    downloadMarkdown: '.md download karo',
    understoodAs: 'Samjha gaya:',
  },
  hi: {
    appName: 'Neophi',
    navToday: 'आज',
    navLibrary: 'लाइब्रेरी',
    navProjects: 'प्रोजेक्ट्स',
    navSettings: 'सेटिंग्स',
    saveButton: 'सेव करें',
    searchPlaceholder: 'अधूरे याद शब्दों से खोजें…',
    searchShortcut: 'Ctrl+K / Cmd+K',
    sampleBanner: 'सैंपल डेटा — देखने के लिए लोड किया गया है। आप इसे सेटिंग्स में कभी भी हटा सकते हैं।',
    instagramBanner: 'अपनी लाइब्रेरी सुरक्षित रखने के लिए इसे Chrome या Safari में खोलें।',
    day0Headline: 'जो आप सच में इस्तेमाल करना चाहते थे, उसके लिए एक शांत डेस्क',
    day0SaveNow: 'अभी कुछ सेव करें',
    day0PasteLink: 'लिंक पेस्ट करें',
    day0TrySamples: 'सैंपल लाइब्रेरी के साथ आज़माएं',
    sectionJustArrived: 'अभी आया',
    sectionYouAsked: 'आपने याद दिलाने को कहा था',
    sectionActiveProjects: 'सक्रिय प्रोजेक्ट्स',
    sectionReadyForHour: 'इस समय के लिए तैयार',
    sectionBeforeItFades: 'भूलने से पहले',
    sectionWeekly: 'इस सप्ताह',
    whySeeingThis: 'यह क्यों दिख रहा है?',
    actionOpen: 'खोलें',
    actionDone: 'हो गया',
    actionLater: 'बाद में',
    actionIcs: '.ics',
    captureTitle: 'नई मेमोरी सेव करें',
    captureUploadLabel: 'फोटो या वीडियो अपलोड करें (अधिकतम 15 MB, 60s)',
    captureUrlLabel: 'या लिंक पेस्ट करें',
    captureCaptionLabel: 'कैप्शन (वैकल्पिक)',
    captureNoteLabel: 'आपने यह क्यों सेव किया? (आपके शब्द)',
    captureNotePlaceholder: 'the red shirt · Sunday ko banana hai · बालकनी के लिए',
    capturePrivateSwitch: 'प्राइवेट रखें, AI न चलाएं',
    captureReading: 'पढ़ा जा रहा है…',
    captureFailed: 'इसका विश्लेषण नहीं हो सका। आपका लिंक और नोट सुरक्षित है।',
    laneSource: 'स्रोत',
    laneYourWords: 'आपके शब्द',
    laneAISuggestions: 'AI सुझाव',
    keptExactly: 'बिल्कुल वैसे ही रखा गया है जैसा आपने लिखा। AI इसे कभी नहीं बदलता।',
    noNoteAdded: 'आपने कोई नोट नहीं लिखा।',
    aiSuggestionPill: 'AI सुझाव',
    notSureNoEvidence: 'पक्का नहीं: कोई प्रमाण नहीं मिला',
    keyPointsTitle: 'मुख्य बातें',
    aiWhatThisIs: 'AI · यह क्या है',
    captionSkipped: 'कैप्शन छोड़ा:',
    linkOnlyMessage: 'मैंने केवल लिंक और कैप्शन देखा',
    unsupportedMessage:
      'इसे पढ़ा नहीं जा सका। आपका लिंक और नोट सुरक्षित है; अधिक जानकारी के लिए अपनी कॉपी अपलोड करें।',
    ledgerTitle: 'लेज़र (किसने क्या किया)',
    laneSourceEvidence: 'स्रोत और सबूत',
    laneSourceHint: 'क्या सेव हुआ, और AI उसमें किस चीज़ की ओर इशारा कर पाया।',
    laneYourChoices: 'आपके चुनाव',
    laneChoicesHint: 'ये सिर्फ़ आप तय करते हैं। कभी भी बदलें।',
    laneAIIdeas: 'AI के विचार',
    laneAIHint: 'लेबल वाले अंदाज़े। ये आपके शब्द या चुनाव कभी नहीं बदलते।',
    laterNotesLabel: 'बाद में DM से जोड़ा',
    chipChoiceLabel: 'क्यों सेव किया',
    privateChoiceLabel: 'निजी रखें (AI बंद)',
    privateChoiceHint: 'इस सेव के बारे में कुछ भी AI मॉडल को नहीं भेजा जाता।',
    undoLabel: 'वापस लें',
    settingsTitle: 'सेटिंग्स',
    settingsModels: 'उपयोग हो रहे मॉडल',
    settingsLanguage: 'भाषा',
    settingsTheme: 'थीम',
    settingsThemeToDark: 'डार्क थीम चुनें',
    settingsThemeToLight: 'लाइट थीम चुनें',
    settingsExport: 'सब एक्सपोर्ट करें (JSON)',
    settingsImport: 'JSON इम्पोर्ट करें',
    settingsDeleteAll: 'सब कुछ हटाएं',
    settingsDeleteConfirm: 'क्या आप अपनी सभी मेमोरी, प्रोजेक्ट्स और मीडिया हटाना चाहते हैं?',
    settingsPrivacyNote:
      "Your saves are stored in Neophi's Google Cloud project (Firestore and Cloud Storage, Mumbai region) under an anonymous id. When AI is on, the item and your note are analysed by Google's Gemini on Vertex AI. You can export or delete everything at any time in Settings.",
    projectsTitle: 'प्रोजेक्ट्स और परिणाम',
    buildOutcome: 'ड्राफ्ट तैयार करें',
    draftLabel: 'ड्राफ्ट',
    notKnownTitle: 'जो ज्ञात नहीं है',
    copyMarkdown: 'Markdown कॉपी करें',
    downloadMarkdown: '.md डाउनलोड करें',
    understoodAs: 'इस रूप में समझा गया:',
  },
};
