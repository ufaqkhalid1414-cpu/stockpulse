import {
  EFFECTIVE_DATE,
  GOVERNING_LAW,
  LEGAL_ENTITY_NAME,
  SUPPORT_WHATSAPP_NUMBER,
} from "@/lib/legal-config";
import type { Lang } from "@/lib/i18n";

export type LegalSection = { title: string; paragraphs: string[] };

function joinNonEmpty(parts: Array<string | null | undefined>) {
  return parts.filter((p): p is string => Boolean(p && String(p).trim()));
}

function entityLine(lang: Lang) {
  if (!LEGAL_ENTITY_NAME.trim()) return null;
  if (lang === "ur") return `یہ سروس ${LEGAL_ENTITY_NAME} چلاتی ہے۔`;
  if (lang === "ar") return `يتم تشغيل هذه الخدمة بواسطة ${LEGAL_ENTITY_NAME}.`;
  return `This service is run by ${LEGAL_ENTITY_NAME}.`;
}

function contactLine(lang: Lang) {
  if (!SUPPORT_WHATSAPP_NUMBER.trim()) return null;
  if (lang === "ur") return `مدد کے لیے واٹس ایپ پر رابطہ کریں: ${SUPPORT_WHATSAPP_NUMBER}۔`;
  if (lang === "ar") return `للتواصل عبر واتساب: ${SUPPORT_WHATSAPP_NUMBER}.`;
  return `For help, contact us on WhatsApp at ${SUPPORT_WHATSAPP_NUMBER}.`;
}

function lawLine(lang: Lang) {
  if (!GOVERNING_LAW.trim()) return null;
  if (lang === "ur") return `ان شرائط پر ${GOVERNING_LAW} کا قانون لاگو ہو سکتا ہے۔`;
  if (lang === "ar") return `قد تخضع هذه الشروط لقوانين ${GOVERNING_LAW}.`;
  return `These terms may be governed by the laws of ${GOVERNING_LAW}.`;
}

function effectiveLine(lang: Lang) {
  if (!EFFECTIVE_DATE.trim()) return null;
  if (lang === "ur") return `آخری اپڈیٹ: ${EFFECTIVE_DATE}۔`;
  if (lang === "ar") return `آخر تحديث: ${EFFECTIVE_DATE}.`;
  return `Last updated: ${EFFECTIVE_DATE}.`;
}

/** Plain-language privacy sections. Sentences that need empty config values are omitted. */
export function privacySections(lang: Lang): LegalSection[] {
  const en: LegalSection[] = [
    {
      title: "Who runs StockPulse",
      paragraphs: joinNonEmpty([
        entityLine("en") ?? "StockPulse is a stock management service for shop owners.",
        "It helps you see warehouse, shop, and online stock in one place.",
      ]),
    },
    {
      title: "What we collect",
      paragraphs: [
        "We collect your WhatsApp number for login and alerts.",
        "We store owner and staff names, your business name, stock quantities, purchase prices, product details, and product photos you upload.",
        "We also keep basic technical logs needed to run and secure the service.",
      ],
    },
    {
      title: "WhatsApp messages",
      paragraphs: [
        "Login codes, low-stock alerts, price alerts, and owner reports are sent through a messaging provider and WhatsApp.",
        "WhatsApp and that provider have their own rules for how messages are delivered.",
      ],
    },
    {
      title: "Where data is stored",
      paragraphs: [
        "Your data is stored with cloud database and hosting providers that run the StockPulse service.",
      ],
    },
    {
      title: "Who can see your data",
      paragraphs: [
        "Only people in your own business can see your data, within the permissions you set for owners and staff.",
        "Other businesses cannot see your stock, prices, staff, or reports.",
      ],
    },
    {
      title: "Backups",
      paragraphs: ["We keep daily backups so your business data can be restored if something goes wrong."],
    },
    {
      title: "We do not sell your data",
      paragraphs: ["We do not sell your business or personal data."],
    },
    {
      title: "How long we keep data",
      paragraphs: joinNonEmpty([
        "We keep your data while your account is active and as needed to run the service.",
        "You can ask us to delete your account and related data.",
        contactLine("en"),
      ]),
    },
    {
      title: "Security",
      paragraphs: [
        "We use standard cloud security practices to protect accounts and data.",
        "No service can promise perfect security, so please keep your WhatsApp number safe.",
      ],
    },
    {
      title: "Cookies and sessions",
      paragraphs: [
        "We use a login session cookie so you stay signed in after WhatsApp verification.",
        "We do not use advertising tracking cookies.",
      ],
    },
    {
      title: "Children",
      paragraphs: ["StockPulse is for business use and is not intended for children."],
    },
    {
      title: "Changes",
      paragraphs: joinNonEmpty([
        "If this privacy policy changes in an important way, we will update this page.",
        effectiveLine("en"),
      ]),
    },
    {
      title: "Contact",
      paragraphs: joinNonEmpty([
        contactLine("en") ?? "If you need help with privacy or deletion, use the WhatsApp number linked to your StockPulse account to reach the person who runs your business setup, or contact the service operator when a support number is published.",
      ]),
    },
  ];

  if (lang === "en") return en;

  // Non-English: use English structure with translated titles/bodies via compact packs
  return localizePrivacy(lang, en);
}

function localizePrivacy(lang: Lang, fallback: LegalSection[]): LegalSection[] {
  const map: Partial<Record<Lang, LegalSection[]>> = {
    ur: [
      {
        title: "StockPulse کون چلاتا ہے",
        paragraphs: joinNonEmpty([
          entityLine("ur") ?? "StockPulse دکان داروں کے لیے اسٹاک مینجمنٹ سروس ہے۔",
          "یہ گودام، دکان اور آن لائن اسٹاک ایک جگہ دکھاتی ہے۔",
        ]),
      },
      {
        title: "ہم کیا جمع کرتے ہیں",
        paragraphs: [
          "لاگ اِن اور الرٹس کے لیے آپ کا واٹس ایپ نمبر۔",
          "مالک اور عملے کے نام، کاروبار کا نام، اسٹاک، خریداری قیمتیں، پروڈکٹ تفصیل، اور اپلوڈ کردہ تصاویر۔",
          "سروس چلانے کے لیے بنیادی تکنیکی لاگز۔",
        ],
      },
      {
        title: "واٹس ایپ پیغامات",
        paragraphs: [
          "لاگ اِن کوڈ، کم اسٹاک اور قیمت الرٹس، اور مالک رپورٹس میسجنگ فراہم کنندہ اور واٹس ایپ کے ذریعے بھیجے جاتے ہیں۔",
          "واٹس ایپ اور اس فراہم کنندہ کے اپنے اصول ہیں۔",
        ],
      },
      {
        title: "ڈیٹا کہاں محفوظ ہے",
        paragraphs: ["آپ کا ڈیٹا کلاؤڈ ڈیٹابیس اور ہوسٹنگ فراہم کنندگان پر محفوظ ہوتا ہے۔"],
      },
      {
        title: "آپ کا ڈیٹا کون دیکھ سکتا ہے",
        paragraphs: [
          "صرف آپ کے کاروبار کے مالک اور عملہ، اپنی اجازتوں کے مطابق۔",
          "دوسرے کاروبار آپ کا ڈیٹا نہیں دیکھ سکتے۔",
        ],
      },
      { title: "بیک اپ", paragraphs: ["روزانہ بیک اپ رکھے جاتے ہیں تاکہ ضرورت پڑنے پر ڈیٹا بحال ہو سکے۔"] },
      { title: "ہم ڈیٹا نہیں بیچتے", paragraphs: ["ہم آپ کا کاروباری یا ذاتی ڈیٹا نہیں بیچتے۔"] },
      {
        title: "کتنی دیر رکھتے ہیں",
        paragraphs: joinNonEmpty([
          "اکاؤنٹ فعال رہتے ہوئے اور سروس چلانے کے لیے جتنی ضرورت ہو۔",
          "آپ اکاؤنٹ حذف کرنے کی درخواست کر سکتے ہیں۔",
          contactLine("ur"),
        ]),
      },
      {
        title: "سیکیورٹی",
        paragraphs: [
          "ہم معیاری کلاؤڈ حفاظتی طریقے استعمال کرتے ہیں۔",
          "کوئی سروس مکمل سیکیورٹی کی ضمانت نہیں دے سکتی — اپنا واٹس ایپ محفوظ رکھیں۔",
        ],
      },
      {
        title: "کوکیز اور سیشن",
        paragraphs: [
          "لاگ اِن کے بعد سائن اِن رہنے کے لیے سیشن کوکی استعمال ہوتی ہے۔",
          "ہم اشتہاری ٹریکنگ کوکیز استعمال نہیں کرتے۔",
        ],
      },
      { title: "بچے", paragraphs: ["StockPulse کاروباری استعمال کے لیے ہے، بچوں کے لیے نہیں۔"] },
      {
        title: "تبدیلیاں",
        paragraphs: joinNonEmpty(["اہم تبدیلی پر یہ صفحہ اپڈیٹ ہوگا۔", effectiveLine("ur")]),
      },
      {
        title: "رابطہ",
        paragraphs: joinNonEmpty([
          contactLine("ur") ??
            "پرائیویسی یا حذف کے لیے اپنے StockPulse اکاؤنٹ والے واٹس ایپ یا سروس آپریٹر سے رابطہ کریں جب سپورٹ نمبر دستیاب ہو۔",
        ]),
      },
    ],
    ar: [
      {
        title: "من يشغّل StockPulse",
        paragraphs: joinNonEmpty([
          entityLine("ar") ?? "StockPulse خدمة لإدارة المخزون لأصحاب المتاجر.",
          "تساعدك على رؤية مخزون المستودع والمتجر والمتجر الإلكتروني في مكان واحد.",
        ]),
      },
      {
        title: "ما الذي نجمعه",
        paragraphs: [
          "رقم واتساب لتسجيل الدخول والتنبيهات.",
          "أسماء المالكين والموظفين، اسم النشاط، كميات المخزون، أسعار الشراء، تفاصيل المنتجات، والصور التي ترفعها.",
          "سجلات تقنية أساسية لتشغيل الخدمة وحمايتها.",
        ],
      },
      {
        title: "رسائل واتساب",
        paragraphs: [
          "تُرسل رموز الدخول وتنبيهات المخزون والأسعار وتقارير المالك عبر مزود رسائل وواتساب.",
          "لواتساب ولهذا المزود قواعدهما الخاصة.",
        ],
      },
      {
        title: "أين تُخزَّن البيانات",
        paragraphs: ["تُخزَّن بياناتك لدى مزودي قاعدة بيانات سحابية واستضافة يشغّلون StockPulse."],
      },
      {
        title: "من يمكنه رؤية بياناتك",
        paragraphs: [
          "فقط أشخاص نشاطك ضمن صلاحيات المالكين والموظفين.",
          "لا يمكن للأنشطة الأخرى رؤية مخزونك أو أسعارك أو تقاريرك.",
        ],
      },
      { title: "النسخ الاحتياطي", paragraphs: ["نحتفظ بنسخ يومية لاستعادة البيانات عند الحاجة."] },
      { title: "لا نبيع بياناتك", paragraphs: ["لا نبيع بيانات نشاطك أو بياناتك الشخصية."] },
      {
        title: "مدة الاحتفاظ",
        paragraphs: joinNonEmpty([
          "نحتفظ بالبيانات أثناء نشاط حسابك وحسب حاجة تشغيل الخدمة.",
          "يمكنك طلب حذف حسابك والبيانات المرتبطة.",
          contactLine("ar"),
        ]),
      },
      {
        title: "الأمان",
        paragraphs: [
          "نستخدم ممارسات أمان سحابية معتادة.",
          "لا توجد خدمة آمنة بالكامل؛ حافظ على رقم واتسابك.",
        ],
      },
      {
        title: "ملفات تعريف الارتباط والجلسات",
        paragraphs: [
          "نستخدم ملف جلسة لتسجيل الدخول بعد التحقق عبر واتساب.",
          "لا نستخدم ملفات تتبع إعلانية.",
        ],
      },
      { title: "الأطفال", paragraphs: ["StockPulse للاستخدام التجاري وليس مخصصاً للأطفال."] },
      {
        title: "التغييرات",
        paragraphs: joinNonEmpty(["عند تغيير مهم نحدّث هذه الصفحة.", effectiveLine("ar")]),
      },
      {
        title: "التواصل",
        paragraphs: joinNonEmpty([
          contactLine("ar") ??
            "للخصوصية أو الحذف تواصل عبر واتساب المرتبط بحسابك أو بمشغّل الخدمة عند نشر رقم دعم.",
        ]),
      },
    ],
  };

  if (map[lang]) return map[lang]!;

  // Other languages: English legal text (listed for native review)
  return fallback;
}

export function termsSections(lang: Lang): LegalSection[] {
  const en: LegalSection[] = [
    {
      title: "What StockPulse is",
      paragraphs: [
        "StockPulse helps shop owners track stock across warehouse, shop, and online places.",
        "You sign in with WhatsApp and manage products, staff access, and alerts in the browser.",
      ],
    },
    {
      title: "Early access",
      paragraphs: [
        "StockPulse is in early access.",
        "Features may change, and the service may be interrupted for maintenance or improvements.",
      ],
    },
    {
      title: "Your account",
      paragraphs: [
        "You are responsible for the WhatsApp number you use to sign in and for keeping access to that number secure.",
        "Do not share login codes with people who should not enter your business.",
      ],
    },
    {
      title: "Owners and staff",
      paragraphs: [
        "Owners are responsible for the staff they add and for what those staff can do.",
        "Owners are also responsible for the accuracy of stock, prices, and other information entered into StockPulse.",
      ],
    },
    {
      title: "Acceptable use",
      paragraphs: [
        "Use StockPulse only for lawful business inventory needs.",
        "Do not try to access another business's data, disrupt the service, or misuse WhatsApp messaging features.",
      ],
    },
    {
      title: "Alerts and reports",
      paragraphs: [
        "Price alerts, low-stock alerts, and daily summaries are informational.",
        "They depend on the data you and your staff enter, and on WhatsApp delivery.",
      ],
    },
    {
      title: "Third-party services",
      paragraphs: [
        "StockPulse uses services such as WhatsApp and cloud hosting.",
        "Those services have their own terms and privacy rules.",
      ],
    },
    {
      title: "Availability",
      paragraphs: [
        "We aim to keep StockPulse available, but we do not guarantee uninterrupted access.",
        "You should keep your own records for critical stock decisions when needed.",
      ],
    },
    {
      title: "Ending use",
      paragraphs: [
        "You can stop using StockPulse at any time.",
        "Equal owners can delete the business account from Settings when that option is available.",
      ],
    },
    {
      title: "Limitation of liability",
      paragraphs: [
        "StockPulse is provided as a tool to help you manage inventory.",
        "To the fullest extent allowed by law, we are not liable for lost sales, stock mistakes, missed alerts, or WhatsApp delivery failures.",
      ],
    },
    {
      title: "Changes to these terms",
      paragraphs: joinNonEmpty([
        "We may update these terms as the service grows.",
        "The current version will be on this page.",
        effectiveLine("en"),
      ]),
    },
    {
      title: "Contact",
      paragraphs: joinNonEmpty([
        contactLine("en") ??
          "For questions about these terms, contact the service operator when a support WhatsApp number is published.",
        lawLine("en"),
      ]),
    },
  ];

  if (lang === "en") return en;
  if (lang === "ur") {
    return [
      {
        title: "StockPulse کیا ہے",
        paragraphs: [
          "StockPulse دکان داروں کو گودام، دکان اور آن لائن اسٹاک ٹریک کرنے میں مدد دیتا ہے۔",
          "آپ واٹس ایپ سے سائن اِن کرتے ہیں اور براؤزر میں پروڈکٹس، عملہ اور الرٹس سنبھالتے ہیں۔",
        ],
      },
      {
        title: "ابتدائی رسائی",
        paragraphs: [
          "StockPulse ابتدائی رسائی میں ہے۔",
          "فیچرز بدل سکتے ہیں اور مرمت یا بہتری کے لیے سروس رک سکتی ہے۔",
        ],
      },
      {
        title: "آپ کا اکاؤنٹ",
        paragraphs: [
          "سائن اِن والا واٹس ایپ نمبر اور اس تک رسائی آپ کی ذمہ داری ہے۔",
          "لاگ اِن کوڈ ان لوگوں کے ساتھ شیئر نہ کریں جنہیں کاروبار میں داخل نہیں ہونا چاہیے۔",
        ],
      },
      {
        title: "مالک اور عملہ",
        paragraphs: [
          "مالک اپنے شامل کردہ عملے اور ان کی اجازتوں کے ذمہ دار ہیں۔",
          "اسٹاک، قیمتوں اور درج کردہ معلومات کی درستگی بھی مالک کی ذمہ داری ہے۔",
        ],
      },
      {
        title: "درست استعمال",
        paragraphs: [
          "StockPulse صرف جائز کاروباری انوینٹری کے لیے استعمال کریں۔",
          "دوسرے کاروبار کا ڈیٹا نہ دیکھیں، سروس نہ روکیں، اور واٹس ایپ کا غلط استعمال نہ کریں۔",
        ],
      },
      {
        title: "الرٹس اور رپورٹس",
        paragraphs: [
          "قیمت، کم اسٹاک الرٹس اور روزانہ خلاصہ معلومات کے لیے ہیں۔",
          "یہ آپ کے درج کردہ ڈیٹا اور واٹس ایپ ڈیلیوری پر منحصر ہیں۔",
        ],
      },
      {
        title: "تیسری پارٹی سروسز",
        paragraphs: [
          "StockPulse واٹس ایپ اور کلاؤڈ ہوسٹنگ جیسی سروسز استعمال کرتا ہے۔",
          "ان کے اپنے اصول اور پرائیویسی قواعد ہیں۔",
        ],
      },
      {
        title: "دستیابی",
        paragraphs: [
          "ہم StockPulse دستیاب رکھنے کی کوشش کرتے ہیں، مگر بلا رکاوٹ رسائی کی ضمانت نہیں۔",
          "اہم فیصلوں کے لیے اپنی الگ ریکارڈ بھی رکھیں۔",
        ],
      },
      {
        title: "استعمال ختم کرنا",
        paragraphs: [
          "آپ کسی بھی وقت استعمال چھوڑ سکتے ہیں۔",
          "برابر کے مالک سیٹنگز سے کاروباری اکاؤنٹ حذف کر سکتے ہیں جب یہ اختیار موجود ہو۔",
        ],
      },
      {
        title: "ذمہ داری کی حد",
        paragraphs: [
          "StockPulse انوینٹری سنبھالنے کا ایک آلہ ہے۔",
          "قانون کی اجازت کی حد تک ہم گمشدہ فروخت، اسٹاک غلطی، چھوٹے الرٹ یا واٹس ایپ ناکامی کے ذمہ دار نہیں۔",
        ],
      },
      {
        title: "شرائط میں تبدیلی",
        paragraphs: joinNonEmpty([
          "سروس بڑھنے پر ہم شرائط اپڈیٹ کر سکتے ہیں۔",
          "موجودہ نسخہ اسی صفحے پر ہوگا۔",
          effectiveLine("ur"),
        ]),
      },
      {
        title: "رابطہ",
        paragraphs: joinNonEmpty([
          contactLine("ur") ?? "ان شرائط کے بارے میں سوال ہو تو سپورٹ واٹس ایپ دستیاب ہونے پر آپریٹر سے رابطہ کریں۔",
          lawLine("ur"),
        ]),
      },
    ];
  }
  if (lang === "ar") {
    return [
      {
        title: "ما هو StockPulse",
        paragraphs: [
          "يساعد StockPulse أصحاب المتاجر على تتبع المخزون عبر المستودع والمتجر والمتجر الإلكتروني.",
          "تسجّل الدخول بواتساب وتدير المنتجات وصلاحيات الموظفين والتنبيهات من المتصفح.",
        ],
      },
      {
        title: "وصول مبكر",
        paragraphs: [
          "StockPulse في مرحلة وصول مبكر.",
          "قد تتغير الميزات وقد تتوقف الخدمة للصيانة أو التحسين.",
        ],
      },
      {
        title: "حسابك",
        paragraphs: [
          "أنت مسؤول عن رقم واتساب المستخدم لتسجيل الدخول وعن حمايته.",
          "لا تشارك رموز الدخول مع من لا يجب أن يدخل نشاطك.",
        ],
      },
      {
        title: "المالكون والموظفون",
        paragraphs: [
          "المالكون مسؤولون عن الموظفين الذين يضيفونهم وعن صلاحياتهم.",
          "كما أنهم مسؤولون عن دقة المخزون والأسعار والمعلومات المدخلة.",
        ],
      },
      {
        title: "الاستخدام المقبول",
        paragraphs: [
          "استخدم StockPulse لاحتياجات المخزون التجارية المشروعة فقط.",
          "لا تحاول الوصول إلى بيانات نشاط آخر أو تعطيل الخدمة أو إساءة استخدام واتساب.",
        ],
      },
      {
        title: "التنبيهات والتقارير",
        paragraphs: [
          "تنبيهات الأسعار والمخزون المنخفض والملخص اليومي معلوماتية.",
          "تعتمد على البيانات التي تدخلها وعلى تسليم واتساب.",
        ],
      },
      {
        title: "خدمات الطرف الثالث",
        paragraphs: [
          "يستخدم StockPulse خدمات مثل واتساب والاستضافة السحابية.",
          "لهذه الخدمات شروطها وقواعد خصوصيتها.",
        ],
      },
      {
        title: "التوفر",
        paragraphs: [
          "نسعى لإبقاء StockPulse متاحاً دون ضمان عدم الانقطاع.",
          "احتفظ بسجلاتك الخاصة للقرارات الحرجة عند الحاجة.",
        ],
      },
      {
        title: "إنهاء الاستخدام",
        paragraphs: [
          "يمكنك التوقف عن استخدام StockPulse في أي وقت.",
          "يمكن للمالكين المتساوين حذف حساب النشاط من الإعدادات عند توفر الخيار.",
        ],
      },
      {
        title: "حدود المسؤولية",
        paragraphs: [
          "StockPulse أداة للمساعدة في إدارة المخزون.",
          "إلى أقصى حد يسمح به القانون لسنا مسؤولين عن خسائر المبيعات أو أخطاء المخزون أو فوات التنبيهات أو فشل واتساب.",
        ],
      },
      {
        title: "تغيير الشروط",
        paragraphs: joinNonEmpty([
          "قد نحدّث هذه الشروط مع تطور الخدمة.",
          "النسخة الحالية ستكون على هذه الصفحة.",
          effectiveLine("ar"),
        ]),
      },
      {
        title: "التواصل",
        paragraphs: joinNonEmpty([
          contactLine("ar") ?? "لأسئلة الشروط تواصل مع مشغّل الخدمة عند نشر رقم واتساب للدعم.",
          lawLine("ar"),
        ]),
      },
    ];
  }
  return en;
}

export function emptyLegalConfigKeys() {
  return [
    !LEGAL_ENTITY_NAME.trim() ? "LEGAL_ENTITY_NAME" : null,
    !SUPPORT_WHATSAPP_NUMBER.trim() ? "SUPPORT_WHATSAPP_NUMBER" : null,
    !GOVERNING_LAW.trim() ? "GOVERNING_LAW" : null,
    !EFFECTIVE_DATE.trim() ? "EFFECTIVE_DATE" : null,
  ].filter(Boolean) as string[];
}
