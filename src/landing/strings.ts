import type { LanguageCode } from '../types/neophi';

/**
 * Landing page copy. Follows the package's claims list: no invented numbers or users,
 * demos are labelled as illustrative samples, and nothing promises residency or instant deletion.
 */
export interface LandingStrings {
  nav: { steps: string; evidence: string; search: string; today: string; trust: string };
  openApp: string;
  menu: string;
  skip: string;
  scroll: string;
  themeToDark: string;
  themeToLight: string;
  langLabel: string;

  hero: { small: string; big: string; accent: string; sub: string; ctaStart: string; ctaSee: string };

  pile: {
    label: string;
    title: string;
    titleEm: string;
    lede: string;
    body: string;
    sort: string;
    scatter: string;
    hint: string;
    backLabel: string;
    noNote: string;
    noNoteAI: string;
    sample: string;
    categoryWhy: Record<string, string>;
  };

  steps: { title: string; items: { title: string; body: string }[]; artWhy: string; artMatched: string };

  evidence: {
    label: string;
    title: string;
    sub: string;
    hint: string;
    laneSource: string;
    laneYou: string;
    laneAI: string;
    keptExactly: string;
    grounded: string;
    aiPill: string;
    notSure: string;
    nothingToPoint: string;
    confidence: string;
    sceneAlt: string;
    timeline: string;
    play: string;
    pause: string;
    caption: string;
    claims: { redShirt: string; redShirtWhere: string; lights: string; lightsWhere: string; intent: string; brand: string };
    groundingText: string;
  };

  search: {
    label: string;
    title: string;
    sub: string;
    understoodAs: string;
    english: string;
    hindi: string;
    hinglish: string;
    time: { last_week: string; last_month: string };
    whyMatched: string;
    tryAnother: string;
    inputLabel: string;
  };

  fade: {
    label: string;
    title: string;
    sub: string;
    slider: string;
    later: (n: number) => string;
    saved: (n: number) => string;
    tag: string;
    why: string;
    idle: string;
    whyLabel: string;
  };

  trust: { title: string; sub: string; rules: { title: string; body: string }[] };

  ladder: { title: string; sub: string; rungs: { title: string; body: string }[] };

  closing: { title: string; sub: string; ctaStart: string; ctaSamples: string; loading: string; note: string };

  footer: { tagline: string; note: string; welcomeAgain: string };
}

export const LANDING: Record<LanguageCode, LandingStrings> = {
  en: {
    nav: { steps: 'How it goes', evidence: 'Evidence', search: 'Search', today: 'Today', trust: 'Trust' },
    openApp: 'Open Neophi',
    menu: 'Menu',
    skip: 'Skip to content',
    scroll: 'Scroll',
    themeToDark: 'Switch to dark theme',
    themeToLight: 'Switch to light theme',
    langLabel: 'Language',

    hero: {
      small: 'You saved it for a reason,',
      big: 'Remember why',
      accent: 'not just what.',
      sub: 'Neophi keeps each Reel, short, link or screenshot with your own words about why, and brings it back when you can use it.',
      ctaStart: 'Start saving',
      ctaSee: 'See how it works',
    },

    pile: {
      label: 'Your saves, with your reasons',
      title: 'A library built around you.',
      titleEm: 'Memories you can trust.',
      lede: 'Right now your saves are a pile. Each one was kept for a reason that only you know.',
      body: 'Neophi sorts them by the words you wrote, and every group says why it exists.',
      sort: 'Sort by my reasons',
      scatter: 'Back to the pile',
      hint: 'Hover or tap a card to turn it over and read why it was kept.',
      backLabel: 'Why you kept it',
      noNote: 'No note added.',
      noNoteAI: 'AI suggestion, not sure: maybe a place to go.',
      sample: 'Illustrative sample',
      categoryWhy: {
        goa: 'why: three notes are about going there',
        cooking: 'why: notes say try it, banana hai',
        wedding: 'why: captions mention sangeet and mehendi',
        cafe: 'why: note says “for my reels corner”',
      },
    },

    steps: {
      title: 'How it goes',
      items: [
        { title: 'Save it, and say why', body: 'Paste a link or upload a screenshot or clip. Add a few words, tap one chip, or add nothing. The reason is yours, in your language.' },
        { title: 'It sorts itself around you', body: 'Categories come from your own notes and saves, each with a line on why it exists. Rename them or undo any move.' },
        { title: 'Find it half remembered', body: 'Search the way you remember it, in English, Hindi or Hinglish. Every result says why it matched.' },
      ],
      artWhy: 'why: two notes are about going there',
      artMatched: 'matched: “red” and “shirt” are in your note',
    },

    evidence: {
      label: 'Illustrative sample · your reason comes first',
      title: 'It shows its work.',
      sub: 'The AI points to the frame, second, quote or caption it relied on, or says it is not sure. It never writes your reason for you.',
      hint: 'Hover or tap any line to see what it points at.',
      laneSource: 'Source',
      laneYou: 'Your exact words',
      laneAI: 'AI suggestions',
      keptExactly: 'Kept exactly as typed. The AI cannot rewrite this field.',
      grounded: 'Matches what is on screen',
      aiPill: 'AI suggestion',
      notSure: 'Not sure: no evidence found',
      nothingToPoint: 'Nothing on screen to point at, so no claim is made.',
      confidence: 'confidence',
      sceneAlt: 'Illustration of a sangeet rehearsal: four dancers under string lights, the front-left dancer in a red shirt.',
      timeline: 'Position in the clip, in seconds',
      play: 'Play',
      pause: 'Pause',
      caption: 'Sangeet rehearsal clip with the whole group dancing in coordinated outfits.',
      claims: {
        redShirt: 'Red shirt',
        redShirtWhere: 'front-left dancer',
        lights: 'Gold string lights',
        lightsWhere: 'back wall',
        intent: 'Maybe: find a similar red shirt for the sangeet',
        brand: 'Brand of the shirt',
      },
      groundingText: 'Your note matches the red shirt visible at 0:07–0:12.',
    },

    search: {
      label: 'Search',
      title: 'Search the way you remember.',
      sub: 'Half a phrase, any of three languages, a vague “last month”. Neophi reads it in English, Hindi and Hinglish, then says why each result matched.',
      understoodAs: 'Understood as',
      english: 'English',
      hindi: 'Hindi',
      hinglish: 'Hinglish',
      time: { last_week: 'last week', last_month: 'last month' },
      whyMatched: 'Why it matched',
      tryAnother: 'Try another',
      inputLabel: 'Example search',
    },

    fade: {
      label: 'Today',
      title: 'Saves fade. Neophi notices first.',
      sub: 'Drag time forward. Saves go quiet the way they do in a camera roll. Neophi brings one back before it is gone, and tells you why.',
      slider: 'Move time forward',
      later: (n) => (n === 0 ? 'Now' : n === 1 ? '1 day later' : `${n} days later`),
      saved: (n) => (n === 0 ? 'saved today' : n === 1 ? 'saved 1 day ago' : `saved ${n} days ago`),
      tag: 'Before it fades',
      why: 'You put this in “Goa in January”, and your trip project is active. No streaks, no pressure: Done or Later.',
      idle: 'Everything is still fresh. Keep dragging.',
      whyLabel: 'Why am I seeing this?',
    },

    trust: {
      title: 'A memory you can trust has rules.',
      sub: 'These are enforced in code, not asked of a model.',
      rules: [
        { title: 'Your exact words stay untouched.', body: 'Your note is stored as typed. Whatever a model writes there is thrown away.' },
        { title: 'AI suggestions are separate and labelled.', body: 'A dashed line always means “this can be wrong”, with a confidence beside it.' },
        { title: 'Every interpretation links to evidence.', body: 'A frame, a second, a quote or the caption. Tap it to see it.' },
        { title: 'It says “not sure” when it is not.', body: 'No evidence, no claim. And a save marked private is never sent to a model.' },
      ],
    },

    ladder: {
      title: 'One reason per save, and where it came from.',
      sub: 'Each memory carries its reason with a stated source, strongest first. That is what lets Neophi sort, search and act without pretending to know what you meant.',
      rungs: [
        { title: 'Your words', body: 'Your own note, never edited by AI.' },
        { title: 'Your tap', body: 'One chip such as Buy or Go there, or a project you put it in.' },
        { title: 'A labelled guess', body: 'An AI suggestion with evidence and a confidence.' },
        { title: 'Not known', body: 'Shown as unknown. Nothing is made up to fill the gap.' },
      ],
    },

    closing: {
      title: 'Start with one thing you saved this week.',
      sub: 'Paste the link, add a few words about why, and let it come back when it is useful.',
      ctaStart: 'Open Neophi',
      ctaSamples: 'Explore with sample saves',
      loading: 'Loading samples…',
      note: 'Sample saves are invented and marked “sample”. Delete them from Settings any time.',
    },

    footer: {
      tagline: 'A memory layer for what you save online.',
      note: 'Illustrations and demo saves on this page are samples, not real user content.',
      welcomeAgain: 'Welcome page',
    },
  },

  hinglish: {
    nav: { steps: 'Kaise chalta hai', evidence: 'Saboot', search: 'Search', today: 'Aaj', trust: 'Bharosa' },
    openApp: 'Neophi kholo',
    menu: 'Menu',
    skip: 'Content pe jao',
    scroll: 'Scroll',
    themeToDark: 'Dark theme karo',
    themeToLight: 'Light theme karo',
    langLabel: 'Bhasha',

    hero: {
      small: 'Save kiya tha kisi wajah se,',
      big: 'Wajah yaad rakho',
      accent: 'sirf cheez nahi.',
      sub: 'Neophi har Reel, short, link ya screenshot ko tumhare apne shabdon ke saath rakhta hai, aur jab kaam aaye tab wapas laata hai.',
      ctaStart: 'Save karna shuru karo',
      ctaSee: 'Dekho kaise chalta hai',
    },

    pile: {
      label: 'Tumhare saves, tumhari wajah ke saath',
      title: 'Tumhare hisaab se bani library.',
      titleEm: 'Yaadein jin pe bharosa ho.',
      lede: 'Abhi tumhare saves ek dher hain. Har ek kisi wajah se rakha tha, jo sirf tumhe pata hai.',
      body: 'Neophi unhe tumhare likhe shabdon se sort karta hai, aur har group batata hai woh kyun bana.',
      sort: 'Meri wajah se sort karo',
      scatter: 'Wapas dher mein',
      hint: 'Card pe hover ya tap karo, palat ke dekho kyun rakha tha.',
      backLabel: 'Kyun rakha tha',
      noNote: 'Koi note nahi.',
      noNoteAI: 'AI suggestion, pakka nahi: shayad jaane ki jagah.',
      sample: 'Sample',
      categoryWhy: {
        goa: 'kyun: teen notes wahan jaane ke baare mein',
        cooking: 'kyun: notes mein try karna, banana hai',
        wedding: 'kyun: captions mein sangeet aur mehendi',
        cafe: 'kyun: note mein “for my reels corner”',
      },
    },

    steps: {
      title: 'Kaise chalta hai',
      items: [
        { title: 'Save karo, wajah likho', body: 'Link paste karo ya screenshot ya clip upload karo. Do shabd likho, ek chip dabao, ya kuch nahi. Wajah tumhari, tumhari bhasha mein.' },
        { title: 'Khud sort ho jaata hai', body: 'Categories tumhare notes aur saves se banti hain, har ek ke saath ek line ki kyun. Naam badlo ya koi bhi move undo karo.' },
        { title: 'Aadha yaad, phir bhi mil jaaye', body: 'Jaise yaad hai waise dhundho, English, Hindi ya Hinglish mein. Har result batata hai kyun mila.' },
      ],
      artWhy: 'kyun: do notes wahan jaane ke baare mein',
      artMatched: 'mila: “red” aur “shirt” tumhare note mein hain',
    },

    evidence: {
      label: 'Sample · pehle tumhari wajah',
      title: 'Saboot ke saath batata hai.',
      sub: 'AI us frame, second, quote ya caption ki taraf ishaara karta hai jis pe usne bharosa kiya, ya bolta hai pakka nahi. Tumhari wajah woh kabhi nahi likhta.',
      hint: 'Kisi bhi line pe hover ya tap karo, dekho woh kis cheez ki taraf hai.',
      laneSource: 'Source',
      laneYou: 'Tumhare shabd',
      laneAI: 'AI suggestions',
      keptExactly: 'Bilkul waise hi rakha jaise likha. AI ise badal nahi sakta.',
      grounded: 'Screen pe jo hai usse match karta hai',
      aiPill: 'AI suggestion',
      notSure: 'Pakka nahi: koi saboot nahi mila',
      nothingToPoint: 'Screen pe dikhane ko kuch nahi, isliye koi daawa nahi.',
      confidence: 'confidence',
      sceneAlt: 'Sangeet rehearsal ki illustration: string lights ke neeche chaar dancers, aage-left wale ne laal shirt pehni hai.',
      timeline: 'Clip mein position, seconds mein',
      play: 'Chalao',
      pause: 'Roko',
      caption: 'Sangeet rehearsal clip with the whole group dancing in coordinated outfits.',
      claims: {
        redShirt: 'Laal shirt',
        redShirtWhere: 'aage-left wala dancer',
        lights: 'Golden string lights',
        lightsWhere: 'peeche ki deewar',
        intent: 'Shayad: sangeet ke liye waisi laal shirt dhundhni hai',
        brand: 'Shirt ka brand',
      },
      groundingText: 'Tumhara note 0:07–0:12 pe dikh rahi laal shirt se match karta hai.',
    },

    search: {
      label: 'Search',
      title: 'Jaise yaad hai, waise dhundho.',
      sub: 'Aadha phrase, teen mein se koi bhasha, “pichle mahine” jaisa kuch. Neophi use English, Hindi aur Hinglish mein padhta hai, aur batata hai har result kyun mila.',
      understoodAs: 'Aise samjha',
      english: 'English',
      hindi: 'Hindi',
      hinglish: 'Hinglish',
      time: { last_week: 'pichla hafta', last_month: 'pichla mahina' },
      whyMatched: 'Kyun mila',
      tryAnother: 'Aur try karo',
      inputLabel: 'Example search',
    },

    fade: {
      label: 'Aaj',
      title: 'Saves dhundhle padte hain. Neophi pehle dekh leta hai.',
      sub: 'Time ko aage khiskao. Saves dheere dheere chup ho jaate hain, jaise camera roll mein. Neophi ek ko jaane se pehle wapas laata hai, wajah ke saath.',
      slider: 'Time aage badhao',
      later: (n) => (n === 0 ? 'Abhi' : `${n} din baad`),
      saved: (n) => (n === 0 ? 'aaj save kiya' : `${n} din pehle save kiya`),
      tag: 'Bhoolne se pehle',
      why: 'Tumne ise “Goa in January” mein rakha tha, aur trip project chal raha hai. Koi streak nahi, koi pressure nahi: Done ya Later.',
      idle: 'Sab abhi taaza hai. Aur khiskao.',
      whyLabel: 'Ye kyun dikh raha hai?',
    },

    trust: {
      title: 'Jis yaad pe bharosa ho, uske niyam hote hain.',
      sub: 'Ye code mein lagu hote hain, model se request nahi kiye jaate.',
      rules: [
        { title: 'Tumhare shabd waise hi rehte hain.', body: 'Note bilkul waise save hota hai jaise likha. Model wahan kuch likhe toh phenk diya jaata hai.' },
        { title: 'AI suggestions alag aur labelled.', body: 'Dashed line ka matlab hamesha “ye galat ho sakta hai”, saath mein confidence.' },
        { title: 'Har matlab ka saboot.', body: 'Ek frame, ek second, ek quote ya caption. Tap karo aur dekho.' },
        { title: 'Pakka na ho toh “pakka nahi” bolta hai.', body: 'Saboot nahi, toh daawa nahi. Aur private save kabhi model ko nahi jaata.' },
      ],
    },

    ladder: {
      title: 'Har save ki ek wajah, aur woh kahan se aayi.',
      sub: 'Har yaad ke saath uski wajah hoti hai, source ke saath, sabse pakki pehle. Isi se Neophi sort, search aur kaam kar paata hai, bina ye dikhawa kiye ki use pata hai tum kya chahte the.',
      rungs: [
        { title: 'Tumhare shabd', body: 'Tumhara apna note, AI kabhi edit nahi karta.' },
        { title: 'Tumhara tap', body: 'Buy ya Go there jaisa ek chip, ya koi project jisme rakha.' },
        { title: 'Labelled andaaza', body: 'Saboot aur confidence ke saath AI suggestion.' },
        { title: 'Pata nahi', body: 'Unknown dikhaya jaata hai. Khaali jagah bharne ke liye kuch banaya nahi jaata.' },
      ],
    },

    closing: {
      title: 'Is hafte ki ek save ki hui cheez se shuru karo.',
      sub: 'Link paste karo, do shabd likho kyun, aur jab kaam aaye tab wapas aane do.',
      ctaStart: 'Neophi kholo',
      ctaSamples: 'Sample saves ke saath dekho',
      loading: 'Samples load ho rahe hain…',
      note: 'Sample saves banaye hue hain aur “sample” likhe hain. Settings se kabhi bhi delete karo.',
    },

    footer: {
      tagline: 'Online jo save karte ho, uske liye ek memory layer.',
      note: 'Is page ki illustrations aur demo saves samples hain, asli user content nahi.',
      welcomeAgain: 'Welcome page',
    },
  },

  hi: {
    nav: { steps: 'कैसे चलता है', evidence: 'सबूत', search: 'खोज', today: 'आज', trust: 'भरोसा' },
    openApp: 'Neophi खोलें',
    menu: 'मेन्यू',
    skip: 'सामग्री पर जाएँ',
    scroll: 'नीचे',
    themeToDark: 'डार्क थीम करें',
    themeToLight: 'लाइट थीम करें',
    langLabel: 'भाषा',

    hero: {
      small: 'आपने किसी वजह से सेव किया था,',
      big: 'वजह याद रखें',
      accent: 'सिर्फ़ चीज़ नहीं।',
      sub: 'Neophi हर रील, शॉर्ट, लिंक या स्क्रीनशॉट को आपके अपने शब्दों के साथ रखता है, और जब काम आए तब वापस लाता है।',
      ctaStart: 'सेव करना शुरू करें',
      ctaSee: 'देखें कैसे चलता है',
    },

    pile: {
      label: 'आपके सेव, आपकी वजह के साथ',
      title: 'आपके हिसाब से बनी लाइब्रेरी।',
      titleEm: 'यादें जिन पर भरोसा हो।',
      lede: 'अभी आपके सेव एक ढेर हैं। हर एक किसी वजह से रखा था, जो सिर्फ़ आप जानते हैं।',
      body: 'Neophi उन्हें आपके लिखे शब्दों से छाँटता है, और हर समूह बताता है वह क्यों बना।',
      sort: 'मेरी वजह से छाँटें',
      scatter: 'वापस ढेर में',
      hint: 'कार्ड पर होवर या टैप करें, पलटकर देखें क्यों रखा था।',
      backLabel: 'क्यों रखा था',
      noNote: 'कोई नोट नहीं।',
      noNoteAI: 'AI सुझाव, पक्का नहीं: शायद जाने की जगह।',
      sample: 'सैंपल',
      categoryWhy: {
        goa: 'क्यों: तीन नोट वहाँ जाने के बारे में',
        cooking: 'क्यों: नोट में आज़माना, बनाना है',
        wedding: 'क्यों: कैप्शन में संगीत और मेहंदी',
        cafe: 'क्यों: नोट में “for my reels corner”',
      },
    },

    steps: {
      title: 'कैसे चलता है',
      items: [
        { title: 'सेव करें, वजह लिखें', body: 'लिंक पेस्ट करें या स्क्रीनशॉट या क्लिप अपलोड करें। कुछ शब्द लिखें, एक चिप चुनें, या कुछ नहीं। वजह आपकी, आपकी भाषा में।' },
        { title: 'खुद-ब-खुद छँट जाता है', body: 'श्रेणियाँ आपके नोट और सेव से बनती हैं, हर एक के साथ एक पंक्ति कि क्यों। नाम बदलें या कोई भी बदलाव वापस लें।' },
        { title: 'आधा याद, फिर भी मिल जाए', body: 'जैसा याद है वैसे खोजें, अंग्रेज़ी, हिंदी या हिंग्लिश में। हर नतीजा बताता है क्यों मिला।' },
      ],
      artWhy: 'क्यों: दो नोट वहाँ जाने के बारे में',
      artMatched: 'मिला: “red” और “shirt” आपके नोट में हैं',
    },

    evidence: {
      label: 'सैंपल · पहले आपकी वजह',
      title: 'सबूत के साथ बताता है।',
      sub: 'AI उस फ़्रेम, सेकंड, उद्धरण या कैप्शन की ओर इशारा करता है जिस पर उसने भरोसा किया, या कहता है पक्का नहीं। आपकी वजह वह कभी नहीं लिखता।',
      hint: 'किसी भी पंक्ति पर होवर या टैप करें, देखें वह किस ओर इशारा करती है।',
      laneSource: 'स्रोत',
      laneYou: 'आपके शब्द',
      laneAI: 'AI सुझाव',
      keptExactly: 'ठीक वैसा ही रखा जैसा लिखा। AI इसे नहीं बदल सकता।',
      grounded: 'स्क्रीन पर जो है उससे मेल खाता है',
      aiPill: 'AI सुझाव',
      notSure: 'पक्का नहीं: कोई सबूत नहीं मिला',
      nothingToPoint: 'स्क्रीन पर दिखाने को कुछ नहीं, इसलिए कोई दावा नहीं।',
      confidence: 'भरोसा',
      sceneAlt: 'संगीत रिहर्सल का चित्र: लड़ी वाली लाइटों के नीचे चार डांसर, आगे बाईं ओर वाले ने लाल शर्ट पहनी है।',
      timeline: 'क्लिप में स्थिति, सेकंड में',
      play: 'चलाएँ',
      pause: 'रोकें',
      caption: 'Sangeet rehearsal clip with the whole group dancing in coordinated outfits.',
      claims: {
        redShirt: 'लाल शर्ट',
        redShirtWhere: 'आगे बाईं ओर का डांसर',
        lights: 'सुनहरी लड़ी वाली लाइटें',
        lightsWhere: 'पीछे की दीवार',
        intent: 'शायद: संगीत के लिए वैसी ही लाल शर्ट ढूँढनी है',
        brand: 'शर्ट का ब्रांड',
      },
      groundingText: 'आपका नोट 0:07–0:12 पर दिख रही लाल शर्ट से मेल खाता है।',
    },

    search: {
      label: 'खोज',
      title: 'जैसा याद है, वैसे खोजें।',
      sub: 'आधा वाक्य, तीन में से कोई भी भाषा, “पिछले महीने” जैसा कुछ। Neophi उसे अंग्रेज़ी, हिंदी और हिंग्लिश में पढ़ता है, और बताता है हर नतीजा क्यों मिला।',
      understoodAs: 'ऐसे समझा',
      english: 'अंग्रेज़ी',
      hindi: 'हिंदी',
      hinglish: 'हिंग्लिश',
      time: { last_week: 'पिछला हफ़्ता', last_month: 'पिछला महीना' },
      whyMatched: 'क्यों मिला',
      tryAnother: 'और आज़माएँ',
      inputLabel: 'उदाहरण खोज',
    },

    fade: {
      label: 'आज',
      title: 'सेव धुंधले पड़ते हैं। Neophi पहले देख लेता है।',
      sub: 'समय को आगे खिसकाएँ। सेव धीरे-धीरे चुप हो जाते हैं, जैसे कैमरा रोल में। Neophi एक को खोने से पहले वापस लाता है, वजह के साथ।',
      slider: 'समय आगे बढ़ाएँ',
      later: (n) => (n === 0 ? 'अभी' : `${n} दिन बाद`),
      saved: (n) => (n === 0 ? 'आज सेव किया' : `${n} दिन पहले सेव किया`),
      tag: 'भूलने से पहले',
      why: 'आपने इसे “Goa in January” में रखा था, और यात्रा वाला प्रोजेक्ट चालू है। कोई स्ट्रीक नहीं, कोई दबाव नहीं: Done या Later।',
      idle: 'सब अभी ताज़ा है। और खिसकाएँ।',
      whyLabel: 'यह क्यों दिख रहा है?',
    },

    trust: {
      title: 'जिस याद पर भरोसा हो, उसके नियम होते हैं।',
      sub: 'ये कोड में लागू होते हैं, मॉडल से माँगे नहीं जाते।',
      rules: [
        { title: 'आपके शब्द जस के तस रहते हैं।', body: 'नोट ठीक वैसा सहेजा जाता है जैसा लिखा। मॉडल वहाँ कुछ लिखे तो फेंक दिया जाता है।' },
        { title: 'AI सुझाव अलग और लेबल वाले।', body: 'डैश वाली रेखा का मतलब हमेशा “यह गलत हो सकता है”, साथ में भरोसे का अंक।' },
        { title: 'हर व्याख्या का सबूत।', body: 'एक फ़्रेम, एक सेकंड, एक उद्धरण या कैप्शन। टैप करें और देखें।' },
        { title: 'पक्का न हो तो “पक्का नहीं” कहता है।', body: 'सबूत नहीं, तो दावा नहीं। और निजी सेव कभी मॉडल को नहीं भेजा जाता।' },
      ],
    },

    ladder: {
      title: 'हर सेव की एक वजह, और वह कहाँ से आई।',
      sub: 'हर याद के साथ उसकी वजह होती है, स्रोत के साथ, सबसे पक्की पहले। इसी से Neophi छाँट, खोज और काम कर पाता है, बिना यह दिखावा किए कि उसे पता है आप क्या चाहते थे।',
      rungs: [
        { title: 'आपके शब्द', body: 'आपका अपना नोट, AI कभी नहीं बदलता।' },
        { title: 'आपका टैप', body: 'Buy या Go there जैसी एक चिप, या कोई प्रोजेक्ट जिसमें रखा।' },
        { title: 'लेबल वाला अंदाज़ा', body: 'सबूत और भरोसे के अंक के साथ AI सुझाव।' },
        { title: 'पता नहीं', body: 'अज्ञात दिखाया जाता है। खाली जगह भरने के लिए कुछ गढ़ा नहीं जाता।' },
      ],
    },

    closing: {
      title: 'इस हफ़्ते सेव की गई एक चीज़ से शुरू करें।',
      sub: 'लिंक पेस्ट करें, कुछ शब्द लिखें क्यों, और जब काम आए तब उसे लौटने दें।',
      ctaStart: 'Neophi खोलें',
      ctaSamples: 'सैंपल के साथ देखें',
      loading: 'सैंपल लोड हो रहे हैं…',
      note: 'सैंपल सेव गढ़े हुए हैं और “sample” लिखे हैं। सेटिंग्स से कभी भी मिटाएँ।',
    },

    footer: {
      tagline: 'ऑनलाइन जो सेव करते हैं, उसके लिए एक मेमोरी लेयर।',
      note: 'इस पेज के चित्र और डेमो सेव सैंपल हैं, असली उपयोगकर्ता सामग्री नहीं।',
      welcomeAgain: 'वेलकम पेज',
    },
  },
};
