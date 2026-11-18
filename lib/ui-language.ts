export type UiLanguage = "en" | "bn" | "hi";
export const languageOptions: { value: UiLanguage; label: string }[] = [
  { value: "en", label: "English" },
  { value: "bn", label: "বাংলা" },
  { value: "hi", label: "हिन्दी" },
];
const bn: Record<string,string> = {
  "Workspace":"কর্মক্ষেত্র","Academics":"শিক্ষাবিষয়ক","Personal":"ব্যক্তিগত",
  "Teaching":"পাঠদান","Learning":"শেখা","Overview":"সংক্ষিপ্ত বিবরণ",
  "Faculty":"শিক্ষকবৃন্দ","Students":"শিক্ষার্থীরা","Departments":"বিভাগসমূহ",
  "Subjects":"বিষয়সমূহ","Classes":"ক্লাসসমূহ","Reports":"প্রতিবেদন",
  "Academic calendar":"শিক্ষা ক্যালেন্ডার","Courses & learning":"কোর্স ও শেখা",
  "Quizzes & exams":"কুইজ ও পরীক্ষা","Class stream":"ক্লাসের আপডেট",
  "Class chat":"ক্লাস চ্যাট","Notifications":"বিজ্ঞপ্তি","Profile":"প্রোফাইল",
  "AI settings":"এআই সেটিংস","College settings":"কলেজ সেটিংস",
  "My classes":"আমার ক্লাস","Assignments":"অ্যাসাইনমেন্ট","Projects":"প্রকল্প",
  "Submissions":"জমা দেওয়া কাজ","Syllabus":"পাঠ্যসূচি","Timetable":"সময়সূচি",
  "Attendance":"উপস্থিতি","Student success":"শিক্ষার্থী অগ্রগতি",
  "Gradebook":"নম্বর তালিকা","Outcomes":"শিখনফল","Learning studio":"পাঠদান স্টুডিও",
  "Announcements":"ঘোষণা","My notes":"আমার নোট","To-do":"করণীয়",
  "Join a class":"ক্লাসে যোগ দিন","Results":"ফলাফল","Certificates":"সনদপত্র",
  "AI Study Copilot":"এআই পড়াশোনা সহায়ক","Settings":"সেটিংস",
  "Light appearance":"হালকা থিম","Dark appearance":"গাঢ় থিম","Sign out":"সাইন আউট",
  "Signing out…":"সাইন আউট হচ্ছে…","Language":"ভাষা",
};
const hi: Record<string,string> = {
  "Workspace":"कार्यस्थल","Academics":"शिक्षा","Personal":"व्यक्तिगत",
  "Teaching":"शिक्षण","Learning":"अध्ययन","Overview":"सारांश",
  "Faculty":"शिक्षक","Students":"विद्यार्थी","Departments":"विभाग",
  "Subjects":"विषय","Classes":"कक्षाएँ","Reports":"रिपोर्ट",
  "Academic calendar":"शैक्षणिक कैलेंडर","Courses & learning":"पाठ्यक्रम और अध्ययन",
  "Quizzes & exams":"क्विज़ और परीक्षा","Class stream":"कक्षा अपडेट",
  "Class chat":"कक्षा चैट","Notifications":"सूचनाएँ","Profile":"प्रोफ़ाइल",
  "AI settings":"एआई सेटिंग","College settings":"कॉलेज सेटिंग",
  "My classes":"मेरी कक्षाएँ","Assignments":"असाइनमेंट","Projects":"प्रोजेक्ट",
  "Submissions":"जमा किए कार्य","Syllabus":"पाठ्यक्रम","Timetable":"समय सारणी",
  "Attendance":"उपस्थिति","Student success":"विद्यार्थी प्रगति",
  "Gradebook":"अंक तालिका","Outcomes":"अधिगम परिणाम",
  "Learning studio":"अध्ययन स्टूडियो","Announcements":"घोषणाएँ",
  "My notes":"मेरे नोट्स","To-do":"कार्य सूची",
  "Join a class":"कक्षा में जुड़ें","Results":"परिणाम","Certificates":"प्रमाणपत्र",
  "AI Study Copilot":"एआई अध्ययन सहायक","Settings":"सेटिंग",
  "Light appearance":"हल्का मोड","Dark appearance":"डार्क मोड",
  "Sign out":"साइन आउट","Signing out…":"साइन आउट हो रहा है…","Language":"भाषा",
};
export function translateUi(label: string, language: UiLanguage): string {
  if (language === "bn") return bn[label] ?? label;
  if (language === "hi") return hi[label] ?? label;
  return label;
}
export function isUiLanguage(value: unknown): value is UiLanguage {
  return value === "en" || value === "bn" || value === "hi";
}
