export const categories = {
  documents: "Личные документы",
  transport: "Транспорт",
  payments: "Налоги и платежи",
  home: "Жильё и коммунальные услуги",
  health: "Здоровье",
  social: "Пособия и пенсии",
  family: "Семья и наследство",
  education: "Образование",
  work: "Работа и профессия",
  migration: "Миграция",
  other: "Личное",
} as const;
export type Category = keyof typeof categories;

export type ServiceTemplate = {
  readonly id: string;
  readonly category: Category;
  readonly title: string;
  readonly description: string;
  readonly dateLabel: string;
  readonly calculation: "date" | "passport" | "interval";
  readonly rule: string;
  readonly steps: readonly string[];
  readonly details: {
    readonly conditions: string | null;
    readonly source: {
      readonly url: string;
      readonly reviewedOn: string;
    } | null;
    readonly serviceUrl: string | null;
  };
};

const confirmedDateRule =
  "Используем подтверждённую вами дату из документа, решения, графика или консультации ведомства. Региональные условия и исключения уточните перед обращением.";
const recurringFollowUp =
  "После выполнения сохраните подтверждение и отметьте событие завершённым. Если требуется повторение, добавьте следующую подтверждённую дату.";
const gosuslugiUrl = "https://www.gosuslugi.ru/";

export const templates = [
  {
    id: "passport",
    category: "documents",
    title: "Замена паспорта РФ",
    description: "В 20 и 45 лет · расчёт по дате рождения",
    dateLabel: "Дата рождения",
    calculation: "passport",
    rule: "20-й или 45-й день рождения + 90 календарных дней. Выберите нужную замену, включая уже просроченную.",
    steps: [
      "После дня рождения подайте заявление на замену паспорта через Госуслуги или уточните порядок в МВД / МФЦ.",
      "Подготовьте паспорт и фотографии; актуальный список документов и пошлину проверьте перед обращением.",
      "После получения нового паспорта отметьте событие выполненным.",
    ],
    details: {
      conditions:
        "РФ, общая замена по возрасту; особые обстоятельства уточняйте в МВД.",
      source: {
        url: "https://www.consultant.ru/document/cons_doc_LAW_466454/6125ca6a5baabbd3bbff7302f2c6e114b94061fa/",
        reviewedOn: "2026-09-25",
      },
      serviceUrl: gosuslugiUrl,
    },
  },
  {
    id: "fluorography",
    category: "health",
    title: "Флюорография",
    description: "Следующее обследование по вашему интервалу",
    dateLabel: "Дата последнего обследования",
    calculation: "interval",
    rule: "Дата обследования + интервал, рекомендованный врачом. Единого «срока годности» для всех нет: периодичность зависит от возраста, региона и группы риска.",
    steps: [
      "Уточните у врача, когда вам показано следующее обследование.",
      "Запишитесь в поликлинику, если врач рекомендует обследование.",
      "После обследования добавьте новую дату и согласованный с врачом интервал.",
    ],
    details: {
      conditions:
        "Справочная информация регионального Роспотребнадзора; индивидуальный интервал определяет врач.",
      source: {
        url: "https://39.rospotrebnadzor.ru/node/19583",
        reviewedOn: "2026-09-25",
      },
      serviceUrl: gosuslugiUrl,
    },
  },
  {
    id: "tax",
    category: "payments",
    title: "Имущественные налоги",
    description: "Транспорт, недвижимость и земля",
    dateLabel: "Дата из налогового уведомления",
    calculation: "date",
    rule: "Для уведомлений за 2025 год общий срок — 1 декабря 2026 года. Льготы и продления могут менять срок: дата из вашего уведомления приоритетна.",
    steps: [
      "Проверьте начисления, льготы и срок в личном кабинете ФНС.",
      "Оплатите по реквизитам налогового уведомления.",
      "Убедитесь, что платёж учтён, и отметьте событие выполненным.",
    ],
    details: {
      conditions:
        "Уведомления за 2025 год; учитывайте региональные продления и свою дату.",
      source: { url: "https://www.nalog.gov.ru/nu/", reviewedOn: "2026-09-25" },
      serviceUrl: "https://lkfl2.nalog.ru/lkfl/",
    },
  },
  {
    id: "international",
    category: "documents",
    title: "Загранпаспорт",
    description: "Срок действия из вашего документа",
    dateLabel: "Действителен до",
    calculation: "date",
    rule: "Используем дату окончания из документа. Требования к оставшемуся сроку для поездки уточняйте у страны въезда.",
    steps: [
      "Проверьте срок действия в документе.",
      "Если планируете поездку, проверьте требования страны въезда.",
      "Заранее подайте заявление на новый паспорт.",
    ],
    details: {
      conditions: null,
      source: null,
      serviceUrl: gosuslugiUrl,
    },
  },
  {
    id: "insurance",
    category: "transport",
    title: "Полис ОСАГО",
    description: "Напомним продлить полис",
    dateLabel: "Дата окончания полиса",
    calculation: "date",
    rule: "Дата окончания берётся из действующего полиса.",
    steps: [
      "Проверьте период страхования в полисе.",
      "Оформите новый полис до окончания действующего.",
    ],
    details: {
      conditions: null,
      source: null,
      serviceUrl: null,
    },
  },
  {
    id: "passport-name-change",
    category: "documents",
    title: "Паспорт РФ: изменение личных данных",
    description: "Официальное изменение сведений",
    dateLabel: "Крайний срок замены, уточнённый в МВД",
    calculation: "date",
    rule: confirmedDateRule,
    steps: [
      "Подайте заявление на замену паспорта в МВД, через Госуслуги или доступный МФЦ.",
      "Подготовка: Сразу после регистрации изменения. Возможный комплект: Документ об изменении сведений, паспорт, фото, заявление, пошлина. Уточните актуальный перечень у исполнителя услуги.",
      recurringFollowUp,
    ],
    details: {
      conditions: "Основание замены уточните в МВД по действующим правилам.",
      source: null,
      serviceUrl: gosuslugiUrl,
    },
  },
  {
    id: "residence-registration",
    category: "documents",
    title: "Постоянная регистрация",
    description: "Прибытие на новое место жительства",
    dateLabel: "Крайний срок регистрации, уточнённый в МВД",
    calculation: "date",
    rule: confirmedDateRule,
    steps: [
      "Уточните основание проживания и подайте заявление о регистрации по месту жительства.",
      "Подготовка: Сразу после переезда. Возможный комплект: Паспорт, основание проживания, необходимые согласия. Уточните актуальный перечень у исполнителя услуги.",
      recurringFollowUp,
    ],
    details: {
      conditions:
        "Учитывайте исключения: место жительства и место пребывания — разные понятия.",
      source: null,
      serviceUrl: gosuslugiUrl,
    },
  },
  {
    id: "temporary-registration",
    category: "documents",
    title: "Временная регистрация",
    description: "Прибытие на место пребывания",
    dateLabel: "Дата окончания регистрации или срок обращения",
    calculation: "date",
    rule: confirmedDateRule,
    steps: [
      "Согласуйте регистрацию с собственником и уточните в МВД порядок для вашей ситуации.",
      "Подготовка: До превышения разрешённого периода без регистрации. Возможный комплект: Паспорт, основание проживания, согласие собственника. Уточните актуальный перечень у исполнителя услуги.",
      recurringFollowUp,
    ],
    details: {
      conditions: "Территориальные и семейные исключения уточните отдельно.",
      source: null,
      serviceUrl: gosuslugiUrl,
    },
  },
  {
    id: "driver-license",
    category: "transport",
    title: "Российское водительское удостоверение",
    description: "Выдача удостоверения",
    dateLabel: "Подтверждённая дата окончания прав",
    calculation: "date",
    rule: confirmedDateRule,
    steps: [
      "Проверьте фактическую дату окончания с учётом применимого продления; запишитесь на замену в Госавтоинспекцию.",
      "Подготовка: За 2–4 недели с учётом медкомиссии и записи. Возможный комплект: Паспорт, заявление, старые права, медзаключение при замене по сроку, пошлина. Уточните актуальный перечень у исполнителя услуги.",
      recurringFollowUp,
    ],
    details: {
      conditions:
        "Само хранение просроченных прав без управления не равно нарушению",
      source: null,
      serviceUrl: "https://госавтоинспекция.рф/",
    },
  },
  {
    id: "international-driver-license",
    category: "transport",
    title: "Международное водительское удостоверение",
    description: "Выдача международного удостоверения",
    dateLabel: "Дата окончания международных прав",
    calculation: "date",
    rule: confirmedDateRule,
    steps: [
      "Перед поездкой проверьте требования страны и срок российских прав; при необходимости оформите новое удостоверение.",
      "Подготовка: За 1–2 недели с учётом записи. Возможный комплект: Паспорт, российские права, фото, заявление, пошлина. Уточните актуальный перечень у исполнителя услуги.",
      recurringFollowUp,
    ],
    details: {
      conditions: "Проверьте требования страны поездки.",
      source: null,
      serviceUrl: "https://госавтоинспекция.рф/",
    },
  },
  {
    id: "vehicle-registration",
    category: "transport",
    title: "Регистрация приобретённого автомобиля",
    description: "Приобретение права на автомобиль",
    dateLabel: "Крайний срок регистрации автомобиля",
    calculation: "date",
    rule: confirmedDateRule,
    steps: [
      "Запишитесь в Госавтоинспекцию, подготовьте документы и автомобиль для регистрационных действий.",
      "Подготовка: Сразу после приобретения. Возможный комплект: Паспорт, договор, ПТС или ЭПТС, заявление, пошлины, автомобиль; диагностическая карта при необходимости. Уточните актуальный перечень у исполнителя услуги.",
      recurringFollowUp,
    ],
    details: {
      conditions: "ОСАГО и регистрация — отдельные обязанности",
      source: null,
      serviceUrl: "https://госавтоинспекция.рф/",
    },
  },
  {
    id: "vehicle-inspection",
    category: "transport",
    title: "Техосмотр личного легкового автомобиля",
    description: "Регистрационное действие или другое обязательное основание",
    dateLabel: "Согласованная дата техосмотра",
    calculation: "date",
    rule: confirmedDateRule,
    steps: [
      "Уточните, требуется ли техосмотр именно для вашего автомобиля и действия; запишитесь к аккредитованному оператору.",
      "Подготовка: За 1–2 недели с резервом на ремонт. Возможный комплект: Автомобиль, документы, аккредитованный оператор. Уточните актуальный перечень у исполнителя услуги.",
      recurringFollowUp,
    ],
    details: {
      conditions:
        "В частности, применяется к отдельным действиям с ТС старше 4 лет",
      source: null,
      serviceUrl: "https://госавтоинспекция.рф/",
    },
  },
  {
    id: "income-declaration",
    category: "payments",
    title: "Обязательная декларация 3-НДФЛ",
    description: "Окончание года получения дохода",
    dateLabel: "Срок подачи декларации, подтверждённый ФНС",
    calculation: "date",
    rule: confirmedDateRule,
    steps: [
      "Проверьте обязанность декларирования дохода, заполните и отправьте 3-НДФЛ в личном кабинете ФНС.",
      "Подготовка: За 1–3 недели до срока. Возможный комплект: Сведения о доходах, договорах, расходах и праве на вычеты. Уточните актуальный перечень у исполнителя услуги.",
      recurringFollowUp,
    ],
    details: {
      conditions: "Декларация только ради вычета не ограничена этим сроком",
      source: null,
      serviceUrl: "https://www.nalog.gov.ru/",
    },
  },
  {
    id: "declared-income-tax",
    category: "payments",
    title: "НДФЛ по декларации",
    description: "Расчёт налога за завершённый год",
    dateLabel: "Срок уплаты из расчёта ФНС",
    calculation: "date",
    rule: confirmedDateRule,
    steps: [
      "Сверьте расчёт налога и реквизиты в личном кабинете ФНС, внесите платёж и проверьте его учёт.",
      "Подготовка: После расчёта декларации, платёж заранее. Возможный комплект: Расчёт налога, достаточное сальдо ЕНС. Уточните актуальный перечень у исполнителя услуги.",
      recurringFollowUp,
    ],
    details: {
      conditions: "Подача декларации не означает уплату налога",
      source: null,
      serviceUrl: "https://www.nalog.gov.ru/",
    },
  },
  {
    id: "self-employment-tax",
    category: "payments",
    title: "Налог на профессиональный доход",
    description: "Окончание месяца с облагаемыми поступлениями",
    dateLabel: "Срок уплаты из «Мой налог»",
    calculation: "date",
    rule: confirmedDateRule,
    steps: [
      "Откройте «Мой налог», проверьте начисление и оплатите налог по реквизитам приложения.",
      "Подготовка: После начисления в приложении. Возможный комплект: Начисление в «Мой налог», платёж. Уточните актуальный перечень у исполнителя услуги.",
      recurringFollowUp,
    ],
    details: {
      conditions: "Уточните правила первого периода и небольшой суммы налога.",
      source: {
        url: "https://www.nalog.gov.ru/rn77/taxation/princtax/",
        reviewedOn: "2026-09-28",
      },
      serviceUrl: "https://npd.nalog.ru/",
    },
  },
  {
    id: "administrative-fine",
    category: "payments",
    title: "Оплата административного штрафа",
    description: "Вступление постановления в законную силу",
    dateLabel: "Крайний срок из постановления",
    calculation: "date",
    rule: confirmedDateRule,
    steps: [
      "Проверьте постановление, дату вступления в силу и применимость льготы; оплатите по указанным реквизитам.",
      "Подготовка: Сразу проверить постановление, оплатить заранее. Возможный комплект: Постановление, УИН, реквизиты. Уточните актуальный перечень у исполнителя услуги.",
      recurringFollowUp,
    ],
    details: {
      conditions:
        "Проверьте дату вступления постановления в силу и возможную отсрочку; дата появления штрафа в приложении не задаёт срок оплаты.",
      source: {
        url: "https://www.consultant.ru/document/cons_doc_LAW_34661/ebf5dddb0d5fcdf25d19cbc40c405fc254be2f76/",
        reviewedOn: "2026-09-28",
      },
      serviceUrl: gosuslugiUrl,
    },
  },
  {
    id: "tax-signature-certificate",
    category: "work",
    title: "Сертификат электронной подписи ФНС",
    description: "Выпуск сертификата",
    dateLabel: "Дата окончания сертификата",
    calculation: "date",
    rule: confirmedDateRule,
    steps: [
      "Проверьте сертификат и условия дистанционного перевыпуска; обратитесь в удостоверяющий центр ФНС.",
      "Подготовка: За 2–4 недели. Возможный комплект: Действующая подпись или идентификация, носитель, документы. Уточните актуальный перечень у исполнителя услуги.",
      recurringFollowUp,
    ],
    details: {
      conditions: "Сроки сертификатов других УЦ могут отличаться",
      source: null,
      serviceUrl: "https://www.nalog.gov.ru/",
    },
  },
  {
    id: "housing-utilities-payment",
    category: "home",
    title: "Оплата ЖКУ",
    description: "Окончание расчётного месяца",
    dateLabel: "Срок оплаты из квитанции",
    calculation: "date",
    rule: confirmedDateRule,
    steps: [
      "Сверьте начисления с квитанцией, оплатите через поставщика или ГИС ЖКХ и сохраните подтверждение.",
      "Подготовка: После получения квитанции. Возможный комплект: Лицевой счёт, квитанция, реквизиты. Уточните актуальный перечень у исполнителя услуги.",
      recurringFollowUp,
    ],
    details: {
      conditions:
        "Начало начисления пеней регулируется отдельно от крайнего срока оплаты",
      source: null,
      serviceUrl: "https://dom.gosuslugi.ru/",
    },
  },
  {
    id: "meter-readings",
    category: "home",
    title: "Передача показаний приборов учёта",
    description: "Очередной расчётный период",
    dateLabel: "Последний день приёма показаний",
    calculation: "date",
    rule: confirmedDateRule,
    steps: [
      "Снимите показания и передайте их через личный кабинет поставщика в установленное им окно.",
      "Подготовка: В начале установленного окна. Возможный комплект: Показания, лицевой счёт, канал передачи. Уточните актуальный перечень у исполнителя услуги.",
      recurringFollowUp,
    ],
    details: {
      conditions:
        "Сам пропуск передачи обычно не является административным штрафом",
      source: null,
      serviceUrl: "https://dom.gosuslugi.ru/",
    },
  },
  {
    id: "water-meter-verification",
    category: "home",
    title: "Поверка водосчётчика",
    description: "Предыдущая поверка, включая заводскую",
    dateLabel: "Дата следующей поверки",
    calculation: "date",
    rule: confirmedDateRule,
    steps: [
      "Проверьте дату поверки по паспорту прибора и «Аршину», выберите аккредитованного исполнителя; после работ проверьте запись результата.",
      "Подготовка: За 2–4 недели. Возможный комплект: Паспорт прибора, серийный номер, аккредитованный поверитель. Уточните актуальный перечень у исполнителя услуги.",
      recurringFollowUp,
    ],
    details: {
      conditions:
        "Срок отсчитывается не от покупки квартиры или монтажа; результат проверьте в «Аршине».",
      source: null,
      serviceUrl: "https://dom.gosuslugi.ru/",
    },
  },
  {
    id: "electricity-meter-verification",
    category: "home",
    title: "Поверка или замена электросчётчика",
    description: "Окончание поверки, срока службы или неисправность",
    dateLabel: "Согласованная дата обращения или работ",
    calculation: "date",
    rule: confirmedDateRule,
    steps: [
      "Сообщите о приборе гарантирующему поставщику или сетевой организации и согласуйте порядок работ.",
      "Подготовка: После выявления основания. Возможный комплект: Номер прибора, описание основания, обращение. Уточните актуальный перечень у исполнителя услуги.",
      recurringFollowUp,
    ],
    details: {
      conditions:
        "Во многих бытовых случаях работы выполняет обязанная организация, а не потребитель за свой счёт",
      source: null,
      serviceUrl: "https://dom.gosuslugi.ru/",
    },
  },
  {
    id: "gas-equipment-maintenance",
    category: "home",
    title: "Техническое обслуживание газового оборудования",
    description: "Заключение договора или предыдущее ТО",
    dateLabel: "Дата обслуживания по графику",
    calculation: "date",
    rule: confirmedDateRule,
    steps: [
      "Согласуйте визит со специализированной организацией и обеспечьте безопасный доступ к оборудованию.",
      "Подготовка: Записаться заранее по графику. Возможный комплект: Договор со специализированной организацией, доступ к оборудованию. Уточните актуальный перечень у исполнителя услуги.",
      recurringFollowUp,
    ],
    details: {
      conditions:
        "Состав обязанностей различается для оборудования дома и квартиры",
      source: null,
      serviceUrl: "https://dom.gosuslugi.ru/",
    },
  },
  {
    id: "preventive-medical-exam",
    category: "health",
    title: "Профилактический медицинский осмотр взрослого",
    description: "Наступление очередного профилактического периода",
    dateLabel: "Дата осмотра, согласованная с поликлиникой",
    calculation: "date",
    rule: confirmedDateRule,
    steps: [
      "Запишитесь в поликлинику и уточните состав осмотра и подготовку к нему.",
      "Подготовка: За 1–2 недели до удобного времени. Возможный комплект: ОМС, документ личности, запись, подготовка к анализам. Уточните актуальный перечень у исполнителя услуги.",
      recurringFollowUp,
    ],
    details: {
      conditions: "Обязательные профессиональные осмотры — другая процедура",
      source: null,
      serviceUrl: "https://minzdrav.gov.ru/",
    },
  },
  {
    id: "chronic-care-follow-up",
    category: "health",
    title: "Диспансерное наблюдение хронического заболевания",
    description: "Установление диагноза и плана наблюдения",
    dateLabel: "Дата контроля, назначенная врачом",
    calculation: "date",
    rule: confirmedDateRule,
    steps: [
      "Запишитесь к лечащему врачу, уточните назначенные обследования и подготовьте имеющиеся результаты.",
      "Подготовка: Записываться с резервом до контрольного приёма. Возможный комплект: Назначения, анализы, список лекарств, выписки. Уточните актуальный перечень у исполнителя услуги.",
      recurringFollowUp,
    ],
    details: {
      conditions: "Период наблюдения зависит от диагноза и назначения врача.",
      source: null,
      serviceUrl: "https://minzdrav.gov.ru/",
    },
  },
  {
    id: "flu-vaccination",
    category: "health",
    title: "Вакцинация против гриппа",
    description: "Начало очередного сезона вакцинации",
    dateLabel: "Дата вакцинации, согласованная с врачом",
    calculation: "date",
    rule: confirmedDateRule,
    steps: [
      "Уточните у врача показания, противопоказания и подходящее время вакцинации; запишитесь в прививочный кабинет.",
      "Подготовка: Планировать в период доступности сезонной вакцины. Возможный комплект: Осмотр, сведения о противопоказаниях, согласие. Уточните актуальный перечень у исполнителя услуги.",
      recurringFollowUp,
    ],
    details: {
      conditions:
        "Особые требования могут зависеть от работы и эпидпостановлений",
      source: null,
      serviceUrl: "https://minzdrav.gov.ru/",
    },
  },
  {
    id: "tick-encephalitis-vaccination",
    category: "health",
    title: "Вакцинация против клещевого энцефалита",
    description: "Начало или завершение курса, последняя ревакцинация",
    dateLabel: "Дата очередной прививки по назначению",
    calculation: "date",
    rule: confirmedDateRule,
    steps: [
      "Согласуйте с врачом схему вакцинации и срок до поездки, учитывая предыдущие прививки.",
      "Подготовка: Основной курс планировать за месяцы до сезона или поездки. Возможный комплект: Прививочная история, осмотр, вакцина. Уточните актуальный перечень у исполнителя услуги.",
      recurringFollowUp,
    ],
    details: {
      conditions:
        "Ускоренная схема и возрастные особенности определяются врачом",
      source: null,
      serviceUrl: "https://minzdrav.gov.ru/",
    },
  },
  {
    id: "pre-hospital-tests",
    category: "health",
    title: "Анализы перед госпитализацией или операцией",
    description: "Назначение госпитализации",
    dateLabel: "Дата сдачи анализов по плану стационара",
    calculation: "date",
    rule: confirmedDateRule,
    steps: [
      "Получите перечень и допустимые сроки анализов у стационара; согласуйте даты и подготовку к обследованиям.",
      "Подготовка: Планировать от дня госпитализации назад. Возможный комплект: Письменный перечень стационара, направления, подготовка. Уточните актуальный перечень у исполнителя услуги.",
      recurringFollowUp,
    ],
    details: {
      conditions: "Сроки сдачи анализов уточняйте по плану стационара.",
      source: null,
      serviceUrl: "https://minzdrav.gov.ru/",
    },
  },
  {
    id: "employee-medical-exam",
    category: "health",
    title: "Периодический медосмотр работника",
    description: "Предыдущий осмотр и график по факторам труда",
    dateLabel: "Дата медосмотра по направлению",
    calculation: "date",
    rule: confirmedDateRule,
    steps: [
      "Получите направление работодателя, уточните программу и место медосмотра, запишитесь по графику.",
      "Подготовка: По графику работодателя заранее. Возможный комплект: Направление работодателя, медорганизация, обследования. Уточните актуальный перечень у исполнителя услуги.",
      recurringFollowUp,
    ],
    details: {
      conditions: "Не является обычной добровольной диспансеризацией",
      source: null,
      serviceUrl: "https://minzdrav.gov.ru/",
    },
  },
  {
    id: "child-allowance",
    category: "social",
    title: "Единое пособие на ребёнка",
    description: "Назначение пособия решением",
    dateLabel: "Дата подачи на продление пособия",
    calculation: "date",
    rule: confirmedDateRule,
    steps: [
      "Проверьте период назначения в решении СФР, актуальность сведений и условия нового заявления.",
      "Подготовка: За месяц до окончания проверить условия и сведения. Возможный комплект: Заявление, сведения о семье, доходах, имуществе; недостающие документы. Уточните актуальный перечень у исполнителя услуги.",
      recurringFollowUp,
    ],
    details: {
      conditions: "Отсчёт по решению, а не по первому поступлению денег",
      source: null,
      serviceUrl: "https://sfr.gov.ru/",
    },
  },
  {
    id: "maternity-capital-monthly-payment",
    category: "social",
    title: "Ежемесячная выплата из материнского капитала",
    description: "Решение о назначении",
    dateLabel: "Дата подачи на продление выплаты",
    calculation: "date",
    rule: confirmedDateRule,
    steps: [
      "Проверьте решение СФР, остаток маткапитала и условия выплаты; подготовьте заявление на новый период.",
      "Подготовка: За месяц до окончания. Возможный комплект: Заявление, сведения о ребёнке, доходах и остатке капитала. Уточните актуальный перечень у исполнителя услуги.",
      recurringFollowUp,
    ],
    details: {
      conditions:
        "Срок выплаты не равен сроку действия сертификата маткапитала",
      source: null,
      serviceUrl: "https://sfr.gov.ru/",
    },
  },
  {
    id: "housing-subsidy",
    category: "social",
    title: "Субсидия на оплату ЖКУ",
    description: "Решение о предоставлении",
    dateLabel: "Дата подачи на продление субсидии",
    calculation: "date",
    rule: confirmedDateRule,
    steps: [
      "Проверьте период назначения и требования региональной соцзащиты; подайте заявление и недостающие сведения.",
      "Подготовка: За несколько недель до окончания. Возможный комплект: Жилищное основание, семья, доходы, платежи, реквизиты. Уточните актуальный перечень у исполнителя услуги.",
      recurringFollowUp,
    ],
    details: {
      conditions: "Условия зависят от региона и ситуации",
      source: null,
      serviceUrl: "https://sfr.gov.ru/",
    },
  },
  {
    id: "disability-reassessment",
    category: "social",
    title: "Переосвидетельствование инвалидности I группы",
    description: "Установление инвалидности",
    dateLabel: "Дата переосвидетельствования из решения МСЭ",
    calculation: "date",
    rule: confirmedDateRule,
    steps: [
      "Заранее обратитесь в медорганизацию для подготовки направления и обследований; уточните порядок в бюро МСЭ.",
      "Подготовка: За 2–3 месяца подготовить обследования. Возможный комплект: Меддокументы, обследования, направление на МСЭ. Уточните актуальный перечень у исполнителя услуги.",
      recurringFollowUp,
    ],
    details: {
      conditions: "Бессрочная инвалидность не требует планового продления",
      source: null,
      serviceUrl: "https://sfr.gov.ru/",
    },
  },
  {
    id: "survivor-pension",
    category: "social",
    title: "Пенсия по потере кормильца после совершеннолетия",
    description: "Достижение 18 лет, поступление или изменение обучения",
    dateLabel: "Срок подтверждения из запроса СФР",
    calculation: "date",
    rule: confirmedDateRule,
    steps: [
      "Уточните в СФР необходимость подтверждения очного обучения и при необходимости представьте справку.",
      "Подготовка: Перед возрастным переходом и после поступления. Возможный комплект: Справка об обучении при отсутствии межведомственных данных. Уточните актуальный перечень у исполнителя услуги.",
      recurringFollowUp,
    ],
    details: {
      conditions: "Периодичность подтверждения уточните по запросу СФР.",
      source: null,
      serviceUrl: "https://sfr.gov.ru/",
    },
  },
  {
    id: "birth-registration",
    category: "family",
    title: "Государственная регистрация рождения",
    description: "Рождение ребёнка",
    dateLabel: "Срок обращения, уточнённый в ЗАГС",
    calculation: "date",
    rule: confirmedDateRule,
    steps: [
      "Подготовьте сведения о рождении и родителях, подайте заявление в ЗАГС или через доступную электронную услугу.",
      "Подготовка: Сразу после получения медицинских сведений. Возможный комплект: Медицинские сведения о рождении, документы родителей, сведения о браке или отцовстве. Уточните актуальный перечень у исполнителя услуги.",
      recurringFollowUp,
    ],
    details: {
      conditions:
        "Заявление о рождении подают в течение месяца; если срок пропущен, уточните порядок регистрации в ЗАГС.",
      source: {
        url: "https://www.consultant.ru/document/cons_doc_LAW_16758/335a5c2973bfa4e51db27892391be3a08154d4dc/",
        reviewedOn: "2026-09-28",
      },
      serviceUrl: gosuslugiUrl,
    },
  },
  {
    id: "inheritance",
    category: "family",
    title: "Принятие наследства",
    description: "Открытие наследства",
    dateLabel: "Крайний срок, подтверждённый нотариусом",
    calculation: "date",
    rule: confirmedDateRule,
    steps: [
      "Свяжитесь с нотариусом и уточните способ принятия наследства, документы и срок для вашей ситуации.",
      "Подготовка: Обратиться к нотариусу в первые месяцы. Возможный комплект: Паспорт, сведения о смерти, родстве или завещании. Уточните актуальный перечень у исполнителя услуги.",
      recurringFollowUp,
    ],
    details: {
      conditions:
        "Принятие наследства и получение свидетельства — разные действия",
      source: null,
      serviceUrl: "https://notariat.ru/",
    },
  },
  {
    id: "child-support-payments",
    category: "family",
    title: "Алиментные платежи",
    description: "Наступление очередного платёжного периода",
    dateLabel: "Дата платежа по соглашению или решению",
    calculation: "date",
    rule: confirmedDateRule,
    steps: [
      "Сверьте сумму, период и реквизиты с соглашением или судебным решением; сохраните подтверждение платежа.",
      "Подготовка: Обеспечить платёж заблаговременно. Возможный комплект: Реквизиты, расчёт, подтверждение оплаты. Уточните актуальный перечень у исполнителя услуги.",
      recurringFollowUp,
    ],
    details: {
      conditions:
        "Общий возраст окончания не охватывает все виды алиментных обязательств",
      source: null,
      serviceUrl: gosuslugiUrl,
    },
  },
  {
    id: "power-of-attorney",
    category: "family",
    title: "Доверенность",
    description: "Совершение доверенности",
    dateLabel: "Дата окончания доверенности",
    calculation: "date",
    rule: confirmedDateRule,
    steps: [
      "Проверьте дату и полномочия; при необходимости заранее оформите новую доверенность у нотариуса.",
      "Подготовка: За несколько дней до необходимого действия. Возможный комплект: Документы, данные представителя, полномочия. Уточните актуальный перечень у исполнителя услуги.",
      recurringFollowUp,
    ],
    details: {
      conditions:
        "Отмена и другие основания могут прекратить полномочия раньше срока",
      source: null,
      serviceUrl: "https://notariat.ru/",
    },
  },
  {
    id: "unified-state-exam-application",
    category: "education",
    title: "Заявление на ЕГЭ",
    description: "Желание сдавать экзамен в очередной кампании",
    dateLabel: "Срок регистрации из календаря ЕГЭ",
    calculation: "date",
    rule: confirmedDateRule,
    steps: [
      "Согласуйте предметы и место подачи заявления со школой или региональным органом образования; проверьте регистрацию.",
      "Подготовка: До закрытия регистрации; подготовку начинать за месяцы. Возможный комплект: Документы, выбор предметов, заявление. Уточните актуальный перечень у исполнителя услуги.",
      recurringFollowUp,
    ],
    details: {
      conditions: "Проверьте календарь текущей экзаменационной кампании.",
      source: null,
      serviceUrl: "https://obrnadzor.gov.ru/",
    },
  },
  {
    id: "basic-state-exam-application",
    category: "education",
    title: "Заявление на ОГЭ",
    description: "Участие в очередной итоговой аттестации",
    dateLabel: "Срок регистрации из календаря ОГЭ",
    calculation: "date",
    rule: confirmedDateRule,
    steps: [
      "Уточните предметы и срок в школе, подайте заявление и получите подтверждение.",
      "Подготовка: Заранее согласовать предметы. Возможный комплект: Заявление, выбор предметов, документы. Уточните актуальный перечень у исполнителя услуги.",
      recurringFollowUp,
    ],
    details: {
      conditions: "Проверьте календарь и специальные основания отдельно.",
      source: null,
      serviceUrl: "https://obrnadzor.gov.ru/",
    },
  },
  {
    id: "college-university-admission",
    category: "education",
    title: "Поступление в вуз или колледж",
    description: "Начало приёмной кампании",
    dateLabel: "Срок этапа приёмной кампании",
    calculation: "date",
    rule: confirmedDateRule,
    steps: [
      "Проверьте правила конкретной приёмной комиссии, подайте документы или согласие для выбранного этапа.",
      "Подготовка: За несколько месяцев, документы подготовить к приёму. Возможный комплект: Аттестат или диплом, экзамены, льготы, необходимые заявления. Уточните актуальный перечень у исполнителя услуги.",
      recurringFollowUp,
    ],
    details: {
      conditions:
        "Сроки различаются по уровню, форме, финансированию и экзаменам",
      source: null,
      serviceUrl: "https://obrnadzor.gov.ru/",
    },
  },
  {
    id: "student-transport-benefits",
    category: "education",
    title: "Студенческие транспортные и региональные льготы",
    description: "Возникновение статуса и оформление льготы",
    dateLabel: "Дата окончания региональной льготы",
    calculation: "date",
    rule: confirmedDateRule,
    steps: [
      "Уточните порядок у регионального оператора льготы, подтвердите обучение и подайте заявление на продление.",
      "Подготовка: За несколько недель. Возможный комплект: Подтверждение обучения, заявление, документы. Уточните актуальный перечень у исполнителя услуги.",
      recurringFollowUp,
    ],
    details: {
      conditions: "Нет единого федерального срока для всех карт",
      source: null,
      serviceUrl: "https://obrnadzor.gov.ru/",
    },
  },
  {
    id: "medical-accreditation",
    category: "work",
    title: "Аккредитация медицинского или фармацевтического специалиста",
    description: "Аккредитация и начало периода допуска",
    dateLabel: "Дата окончания профессионального допуска",
    calculation: "date",
    rule: confirmedDateRule,
    steps: [
      "Проверьте вид аккредитации и актуальные требования, подготовьте документы и подайте их в установленном порядке.",
      "Подготовка: За несколько месяцев. Возможный комплект: Образование, повышение квалификации, сведения о работе, портфолио. Уточните актуальный перечень у исполнителя услуги.",
      recurringFollowUp,
    ],
    details: {
      conditions:
        "Диплом бессрочен, профессиональный допуск обновляется отдельно",
      source: null,
      serviceUrl: "https://fca-rosminzdrav.ru/",
    },
  },
  {
    id: "visa-stay",
    category: "migration",
    title: "Виза и разрешённый срок пребывания",
    description: "Въезд, выдача визы или возникновение основания пребывания",
    dateLabel: "Последний разрешённый день пребывания",
    calculation: "date",
    rule: confirmedDateRule,
    steps: [
      "Проверьте визу и разрешённый период; заранее уточните законное основание продления или запланируйте выезд.",
      "Подготовка: За несколько недель или месяцев по процедуре. Возможный комплект: Паспорт, виза, основание, документы МВД. Уточните актуальный перечень у исполнителя услуги.",
      recurringFollowUp,
    ],
    details: {
      conditions: "Безвизовый порядок не означает бессрочное пребывание",
      source: null,
      serviceUrl: "https://мвд.рф/",
    },
  },
  {
    id: "residence-confirmation",
    category: "migration",
    title: "Ежегодное подтверждение проживания по РВП или ВНЖ",
    description: "Окончание очередного года со дня получения статуса",
    dateLabel: "Крайний срок уведомления, подтверждённый МВД",
    calculation: "date",
    rule: confirmedDateRule,
    steps: [
      "Уточните порядок и срок для вашего статуса, подготовьте сведения и подайте уведомление допустимым способом.",
      "Подготовка: Подготовить сведения к годовщине статуса. Возможный комплект: Сведения о проживании, доходах и документы в применимом объёме. Уточните актуальный перечень у исполнителя услуги.",
      recurringFollowUp,
    ],
    details: {
      conditions: "Бессрочный ВНЖ не отменяет обязанность уведомления",
      source: null,
      serviceUrl: "https://мвд.рф/",
    },
  },
  {
    id: "foreign-worker-patent-payment",
    category: "migration",
    title: "Авансовый платёж по патенту иностранца",
    description: "Окончание оплаченного периода",
    dateLabel: "Дата окончания оплаченного периода",
    calculation: "date",
    rule: confirmedDateRule,
    steps: [
      "Проверьте реквизиты и региональную сумму, оплатите следующий период и сохраните чек.",
      "Подготовка: За несколько дней до окончания. Возможный комплект: Правильные реквизиты, сумма и данные плательщика. Уточните актуальный перечень у исполнителя услуги.",
      recurringFollowUp,
    ],
    details: {
      conditions: "Проверьте региональную сумму и реквизиты платежа.",
      source: null,
      serviceUrl: "https://мвд.рф/",
    },
  },
  {
    id: "custom",
    category: "other",
    title: "Своё событие",
    description: "Любая важная дата и свои рекомендации",
    dateLabel: "Крайний срок",
    calculation: "date",
    rule: "Срок и рекомендации задаются вами.",
    steps: ["Проверьте условия и необходимые документы у поставщика услуги."],
    details: {
      conditions: null,
      source: null,
      serviceUrl: null,
    },
  },
] as const satisfies readonly ServiceTemplate[];
export type TemplateId = (typeof templates)[number]["id"];
export const templateById = Object.fromEntries(
  templates.map((t) => [t.id, t]),
) as Record<TemplateId, (typeof templates)[number]>;

// Old workbook IDs remain readable in saved events, chat drafts and existing bot buttons.
export const legacyTemplateIds: Readonly<Record<string, TemplateId>> = {
  "rf-004": "passport-name-change",
  "rf-009": "residence-registration",
  "rf-010": "temporary-registration",
  "rf-012": "driver-license",
  "rf-015": "international-driver-license",
  "rf-018": "vehicle-registration",
  "rf-020": "vehicle-inspection",
  "rf-029": "income-declaration",
  "rf-030": "declared-income-tax",
  "rf-031": "self-employment-tax",
  "rf-035": "administrative-fine",
  "rf-047": "tax-signature-certificate",
  "rf-048": "housing-utilities-payment",
  "rf-050": "meter-readings",
  "rf-051": "water-meter-verification",
  "rf-053": "electricity-meter-verification",
  "rf-054": "gas-equipment-maintenance",
  "rf-062": "preventive-medical-exam",
  "rf-071": "chronic-care-follow-up",
  "rf-074": "flu-vaccination",
  "rf-075": "tick-encephalitis-vaccination",
  "rf-085": "pre-hospital-tests",
  "rf-087": "employee-medical-exam",
  "rf-092": "child-allowance",
  "rf-093": "maternity-capital-monthly-payment",
  "rf-094": "housing-subsidy",
  "rf-103": "disability-reassessment",
  "rf-108": "survivor-pension",
  "rf-112": "birth-registration",
  "rf-116": "inheritance",
  "rf-120": "child-support-payments",
  "rf-122": "power-of-attorney",
  "rf-124": "unified-state-exam-application",
  "rf-125": "basic-state-exam-application",
  "rf-126": "college-university-admission",
  "rf-128": "student-transport-benefits",
  "rf-129": "medical-accreditation",
  "rf-147": "visa-stay",
  "rf-150": "residence-confirmation",
  "rf-152": "foreign-worker-patent-payment",
};
export function resolveTemplateId(id: string): TemplateId | undefined {
  const current = legacyTemplateIds[id] ?? id;
  return Object.hasOwn(templateById, current)
    ? (current as TemplateId)
    : undefined;
}

const categoryOrder = Object.keys(categories) as Category[];
const ruTitles = new Intl.Collator("ru", { sensitivity: "base" });
export function sortTemplatesForDisplay<
  T extends Pick<ServiceTemplate, "category" | "title">,
>(items: readonly T[]): T[] {
  return [...items].sort(
    (a, b) =>
      categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category) ||
      ruTitles.compare(a.title, b.title),
  );
}

// Bot text and button labels are edited below; handlers only choose a message.
export const chatCopy = {
  defaultUserName: "Пользователь",
  input: { menu: "меню", cancel: "отмена" },
  aliases: {
    события: "/next",
    помощь: "/help",
    настройки: "/settings",
    старт: "/start",
  },
  welcome:
    "Добро пожаловать во «Вовремя». Выберите действие в меню чата или откройте мини-приложение через кнопку MAX.",
  help: "Выберите сферу и услугу кнопками, затем отправьте дату. События общие с мини-приложением. В настройках можно включить напоминания и выбрать время. Документы добавляются в мини-приложении.",
  unknown:
    "Я помогу следить за важными сроками. Выберите действие в меню чата или откройте мини-приложение через кнопку MAX.",
  buttons: {
    addEvent: "Добавить событие",
    myEvents: "Мои события",
    settings: "Настройки",
    help: "Помощь",
    mainMenu: "Главное меню",
    cancel: "Отменить",
    age20: "20 лет",
    age45: "45 лет",
    add: "Добавить",
    previous: "Назад",
    next: "Далее",
    allCategories: "Все сферы",
    recommendations: "Рекомендации",
    completed: "Выполнено",
    nextDate: "Добавить следующую дату",
    disableReminders: "Выключить напоминания",
    enableReminders: "Включить напоминания",
    showRecommendations: "Показывать рекомендации",
    hideDetails: "Скрывать детали",
    notificationTime: "Время уведомлений",
    timezone: "Часовой пояс",
    testNotification: "Тестовое уведомление",
  },
  timezones: [
    { title: "Москва", value: "Europe/Moscow" },
    { title: "Екатеринбург", value: "Asia/Yekaterinburg" },
    { title: "Новосибирск", value: "Asia/Novosibirsk" },
    { title: "Владивосток", value: "Asia/Vladivostok" },
  ],
  hours: [8, 9, 12, 18, 20],
  prompts: {
    title: "Как назвать событие? Напишите название (до 120 символов).",
    date: (title: string, dateLabel: string, rule: string) =>
      `${title}\n${dateLabel}: отправьте дату ДД.ММ.ГГГГ.\n\n${rule}\n\nНомера документов не нужны.`,
    age: "К какому возрасту нужна замена паспорта?",
    interval: "Введите интервал, рекомендованный врачом, в месяцах (1–120).",
    confirmation: (
      title: string,
      date: string,
      category: string,
      enabled: boolean,
    ) =>
      `${title}\nСрок: ${date}\nСфера: ${category}\nНапомним за 30, 7, 1 день и в день срока.\nНапоминания сейчас ${enabled ? "включены" : "выключены — включите их в настройках"}.\n\nДобавить событие?`,
    category: "В какой сфере нужно напоминание?",
    events: "Выберите событие, чтобы увидеть рекомендации или завершить его.",
    localHour: "Выберите местный час отправки.",
    timezone: "Выберите часовой пояс.",
  },
  messages: {
    menu: "Вовремя — сроки и следующие действия. Выберите, что сделать.",
    categoryMissing: "Сфера не найдена. Откройте каталог заново.",
    catalogReset: "Откройте каталог заново.",
    serviceMissing: "Услуга не найдена. Откройте каталог заново.",
    formExpired:
      "Эта форма уже закрыта или устарела. Начните добавление заново.",
    eventLimit: "Можно хранить до 500 событий. Удалите ненужные в календаре.",
    eventSaved: (title: string, date: string, enabled: boolean) =>
      `Добавлено: ${title}\nСрок: ${date}\n${enabled ? "Напоминания включены." : "Включите напоминания в настройках, чтобы получать сообщения о сроках."}`,
    finishStep: "Сначала завершите текущий шаг формы.",
    eventsReset: "Откройте список заново.",
    eventsEmpty: "На этой странице нет событий.",
    eventMissing: "Событие не найдено.",
    invalidSetting: "Некорректная настройка.",
    staleButton: "Кнопка устарела. Откройте главное меню.",
    cancelled: "Добавление отменено.",
    invalidTitle: "Название должно содержать от 1 до 120 символов.",
    invalidDate: "Нужна существующая дата ДД.ММ.ГГГГ, например 01.12.2026.",
    futureDate:
      "Дата рождения или прошлого обследования не может быть в будущем.",
    invalidInterval:
      "Введите целое число месяцев от 1 до 120 по рекомендации врача.",
  },
  labels: {
    note: "Ваша заметка: ",
  },
  status: (
    enabled: boolean,
    hour: number,
    timezone: string,
    privateMessages: boolean,
  ) =>
    `Напоминания ${enabled ? "включены" : "выключены"}.\nВремя: ${String(hour).padStart(2, "0")}:00, ${timezone}.\nДетали в напоминаниях ${privateMessages ? "скрыты" : "видны"}.\nСообщения приходят от этого бота, даже когда календарь закрыт.`,
  details: (
    title: string,
    date: string,
    completed: boolean,
    rule: string,
    steps: string,
    scope: string,
    source: string,
    link: string,
  ) =>
    `${title}\nСрок: ${date}${completed ? " · выполнено" : ""}\n\nОснование расчёта: ${rule}\n\nЧто сделать:\n${steps}${scope ? `\n\nУсловия: ${scope}` : ""}${source ? `\nИсточник: ${source}\n` : ""}${link ? `\nПерейти к услуге: ${link}` : ""}`,
  privateReminder: (milestone: boolean) =>
    `Вовремя: ${milestone ? "наступила важная дата" : "пришло время проверить срок события"} в вашем календаре.\n\nСледующие действия: откройте «Рекомендации», проверьте нужные документы и способ обращения. После выполнения отметьте событие завершённым.\nДетали скрыты вашей настройкой приватности.`,
  reminder: (
    title: string,
    date: string,
    dateState: "overdue" | "today" | "future",
    milestone: boolean,
    steps: string,
    agency: string,
    source: string,
  ) =>
    `Вовремя · ${title}\n${milestone ? "Наступила дата замены паспорта.\n" : ""}${dateState === "overdue" ? "Срок прошёл" : dateState === "today" ? "Срок сегодня" : "Срок"}: ${date}\n\nЧто сделать:\n${steps}${agency ? `\n\nУслуга или ведомство: ${agency}` : ""}${source ? `\nИсточник: ${source}` : ""}\n\nИспользуйте кнопку «Выполнено», когда закончите.`,
  legacy: {
    test: (status: string) =>
      `Тестовое уведомление от бота Вовремя получено.\n${status}\nЕсли нет звука или push, проверьте уведомления этого чата и разрешения MAX на устройстве.`,
    chooseTime: "Выберите час и часовой пояс в настройках.",
    choosePrivacy: "Выберите режим отображения деталей в настройках.",
    dateRequired:
      "Нужна существующая дата ДД.ММ.ГГГГ. Добавьте событие через меню.",
    futureDate:
      "Дата рождения или прошедшего обследования не может быть в будущем.",
    invalidEvent:
      "Проверьте дату и название (до 120 символов). Добавьте событие через меню.",
    saved: (
      title: string,
      date: string,
      custom: boolean,
      health: boolean,
      status: string,
    ) =>
      `Добавлено: ${title}\n${custom ? "Указанный" : "Рассчитанный"} срок: ${date}.\n${health ? "Расчёт по указанному вами интервалу; это не назначение обследования.\n" : ""}Откройте «Мои события», чтобы увидеть рекомендации или отметить выполнение.\nНапомним за 30, 7, 1 день и в день срока.\n${status}`,
    openEvents: "Откройте список событий кнопкой «Мои события».",
    pageEmpty: "На этой странице нет событий. Откройте «Мои события».",
    allEmpty: "Пока нет событий. Добавьте первое через меню чата.",
    eventLine: (date: string, title: string, overdue: boolean) =>
      `${date} — ${title}${overdue ? " · срок прошёл" : ""}`,
    otherEvents: "\n\nДругие события доступны через кнопку «Мои события».",
    chooseEvent: "Выберите событие кнопкой «Мои события».",
    eventMissing:
      "Событие не найдено. Откройте «Мои события» и выберите его снова.",
    done: (title: string) =>
      `Готово: ${title}. Напоминания об этом событии больше не придут. Остальные события доступны через меню.`,
  },
} as const;
