/**
 * Country Normalization Mapping
 *
 * Maps free-text nationality strings to ISO Alpha-3 codes for the world map.
 * Used by Guest Origin analytics on the Dashboard.
 */

/** Nationality string → ISO Alpha-3 */
export const NATIONALITY_TO_ISO3: Record<string, string> = {
    // Vietnam
    "vietnam": "VNM",
    "vn": "VNM",
    "vietnamese": "VNM",
    "việt nam": "VNM",
    "viet nam": "VNM",

    // South Korea
    "south korea": "KOR",
    "korea": "KOR",
    "kr": "KOR",
    "korean": "KOR",
    "republic of korea": "KOR",
    "hàn quốc": "KOR",

    // China
    "china": "CHN",
    "cn": "CHN",
    "chinese": "CHN",
    "trung quốc": "CHN",
    "people's republic of china": "CHN",

    // United States
    "united states": "USA",
    "us": "USA",
    "usa": "USA",
    "american": "USA",
    "united states of america": "USA",
    "mỹ": "USA",
    "hoa kỳ": "USA",

    // Singapore
    "singapore": "SGP",
    "sg": "SGP",
    "singaporean": "SGP",

    // Thailand
    "thailand": "THA",
    "th": "THA",
    "thai": "THA",
    "thái lan": "THA",

    // Japan
    "japan": "JPN",
    "jp": "JPN",
    "japanese": "JPN",
    "nhật bản": "JPN",
    "nhật": "JPN",

    // Australia
    "australia": "AUS",
    "au": "AUS",
    "australian": "AUS",
    "úc": "AUS",

    // United Kingdom
    "united kingdom": "GBR",
    "uk": "GBR",
    "gb": "GBR",
    "british": "GBR",
    "england": "GBR",
    "anh": "GBR",

    // France
    "france": "FRA",
    "fr": "FRA",
    "french": "FRA",
    "pháp": "FRA",

    // Germany
    "germany": "DEU",
    "de": "DEU",
    "german": "DEU",
    "đức": "DEU",

    // India
    "india": "IND",
    "in": "IND",
    "indian": "IND",
    "ấn độ": "IND",

    // Malaysia
    "malaysia": "MYS",
    "my": "MYS",
    "malaysian": "MYS",

    // Indonesia
    "indonesia": "IDN",
    "id": "IDN",
    "indonesian": "IDN",

    // Philippines
    "philippines": "PHL",
    "ph": "PHL",
    "filipino": "PHL",
    "philippine": "PHL",

    // Taiwan
    "taiwan": "TWN",
    "tw": "TWN",
    "taiwanese": "TWN",
    "đài loan": "TWN",

    // Hong Kong
    "hong kong": "HKG",
    "hk": "HKG",

    // Canada
    "canada": "CAN",
    "ca": "CAN",
    "canadian": "CAN",

    // Russia
    "russia": "RUS",
    "ru": "RUS",
    "russian": "RUS",
    "nga": "RUS",

    // Italy
    "italy": "ITA",
    "it": "ITA",
    "italian": "ITA",
    "ý": "ITA",

    // Spain
    "spain": "ESP",
    "es": "ESP",
    "spanish": "ESP",
    "tây ban nha": "ESP",

    // Netherlands
    "netherlands": "NLD",
    "nl": "NLD",
    "dutch": "NLD",
    "hà lan": "NLD",

    // Cambodia
    "cambodia": "KHM",
    "kh": "KHM",
    "cambodian": "KHM",
    "campuchia": "KHM",

    // Laos
    "laos": "LAO",
    "la": "LAO",
    "lao": "LAO",

    // Myanmar
    "myanmar": "MMR",
    "mm": "MMR",
    "burma": "MMR",

    // New Zealand
    "new zealand": "NZL",
    "nz": "NZL",

    // Sweden
    "sweden": "SWE",
    "se": "SWE",
    "swedish": "SWE",

    // Norway
    "norway": "NOR",
    "no": "NOR",
    "norwegian": "NOR",

    // Denmark
    "denmark": "DNK",
    "dk": "DNK",
    "danish": "DNK",

    // Switzerland
    "switzerland": "CHE",
    "ch": "CHE",
    "swiss": "CHE",

    // Brazil
    "brazil": "BRA",
    "br": "BRA",
    "brazilian": "BRA",

    // Mexico
    "mexico": "MEX",
    "mx": "MEX",
    "mexican": "MEX",

    // UAE
    "united arab emirates": "ARE",
    "uae": "ARE",
    "ae": "ARE",

    // Saudi Arabia
    "saudi arabia": "SAU",
    "sa": "SAU",
    "saudi": "SAU",

    // Israel
    "israel": "ISR",
    "il": "ISR",
    "israeli": "ISR",

    // South Africa
    "south africa": "ZAF",
    "za": "ZAF",

    // Poland
    "poland": "POL",
    "pl": "POL",
    "polish": "POL",

    // Czech Republic
    "czech republic": "CZE",
    "cz": "CZE",
    "czech": "CZE",
    "czechia": "CZE",

    // Belgium
    "belgium": "BEL",
    "be": "BEL",
    "belgian": "BEL",

    // Portugal
    "portugal": "PRT",
    "pt": "PRT",
    "portuguese": "PRT",

    // Austria
    "austria": "AUT",
    "at": "AUT",
    "austrian": "AUT",

    // Finland
    "finland": "FIN",
    "fi": "FIN",
    "finnish": "FIN",

    // Ireland
    "ireland": "IRL",
    "ie": "IRL",
    "irish": "IRL",

    // Turkey
    "turkey": "TUR",
    "tr": "TUR",
    "turkish": "TUR",
    "türkiye": "TUR",

    // Argentina
    "argentina": "ARG",
    "ar": "ARG",

    // Colombia
    "colombia": "COL",
    "co": "COL",

    // Egypt
    "egypt": "EGY",
    "eg": "EGY",

    // Nigeria
    "nigeria": "NGA",
    "ng": "NGA",

    // Bangladesh
    "bangladesh": "BGD",
    "bd": "BGD",

    // Pakistan
    "pakistan": "PAK",
    "pk": "PAK",

    // Nepal
    "nepal": "NPL",
    "np": "NPL",

    // Sri Lanka
    "sri lanka": "LKA",
    "lk": "LKA",

    // Mongolia
    "mongolia": "MNG",
    "mn": "MNG",
};

/** Resolve nationality string to ISO Alpha-3 code */
export function resolveISO3(nationality: string | null | undefined): string {
    if (!nationality) return "UNKNOWN";
    const key = nationality.trim().toLowerCase();
    return NATIONALITY_TO_ISO3[key] || "UNKNOWN";
}

/** ISO Alpha-3 → display name */
export const ISO3_TO_NAME: Record<string, string> = {
    VNM: "Vietnam",
    KOR: "South Korea",
    CHN: "China",
    USA: "United States",
    SGP: "Singapore",
    THA: "Thailand",
    JPN: "Japan",
    AUS: "Australia",
    GBR: "United Kingdom",
    FRA: "France",
    DEU: "Germany",
    IND: "India",
    MYS: "Malaysia",
    IDN: "Indonesia",
    PHL: "Philippines",
    TWN: "Taiwan",
    HKG: "Hong Kong",
    CAN: "Canada",
    RUS: "Russia",
    ITA: "Italy",
    ESP: "Spain",
    NLD: "Netherlands",
    KHM: "Cambodia",
    LAO: "Laos",
    MMR: "Myanmar",
    NZL: "New Zealand",
    SWE: "Sweden",
    NOR: "Norway",
    DNK: "Denmark",
    CHE: "Switzerland",
    BRA: "Brazil",
    MEX: "Mexico",
    ARE: "UAE",
    SAU: "Saudi Arabia",
    ISR: "Israel",
    ZAF: "South Africa",
    POL: "Poland",
    CZE: "Czech Republic",
    BEL: "Belgium",
    PRT: "Portugal",
    AUT: "Austria",
    FIN: "Finland",
    IRL: "Ireland",
    TUR: "Turkey",
    ARG: "Argentina",
    COL: "Colombia",
    EGY: "Egypt",
    NGA: "Nigeria",
    BGD: "Bangladesh",
    PAK: "Pakistan",
    NPL: "Nepal",
    LKA: "Sri Lanka",
    MNG: "Mongolia",
};

/** Map ISO3 to ISO2 for flagcdn */
const ISO3_TO_ISO2: Record<string, string> = {
    VNM: "vn", KOR: "kr", CHN: "cn", USA: "us", SGP: "sg", THA: "th",
    JPN: "jp", AUS: "au", GBR: "gb", FRA: "fr", DEU: "de", IND: "in",
    MYS: "my", IDN: "id", PHL: "ph", TWN: "tw", HKG: "hk", CAN: "ca",
    RUS: "ru", ITA: "it", ESP: "es", NLD: "nl", KHM: "kh", LAO: "la",
    MMR: "mm", NZL: "nz", SWE: "se", NOR: "no", DNK: "dk", CHE: "ch",
    BRA: "br", MEX: "mx", ARE: "ae", SAU: "sa", ISR: "il", ZAF: "za",
    POL: "pl", CZE: "cz", BEL: "be", PRT: "pt", AUT: "at", FIN: "fi",
    IRL: "ie", TUR: "tr", ARG: "ar", COL: "co", EGY: "eg", NGA: "ng",
    BGD: "bd", PAK: "pk", NPL: "np", LKA: "lk", MNG: "mn",
};

/** Get flag URL for an ISO3 code (fixes missing Windows Emojis) */
export function getFlag(iso3: string): string | null {
    const iso2 = ISO3_TO_ISO2[iso3];
    if (!iso2) return null;
    return `https://flagcdn.com/w40/${iso2}.png`;
}

/** Get display name for an ISO3 code */
export function getCountryName(iso3: string): string {
    return ISO3_TO_NAME[iso3] || iso3;
}
