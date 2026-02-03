export const CONTINENTS = [
    { name: "Asya", code: "AS" },
    { name: "Avrupa", code: "EU" },
    { name: "Afrika", code: "AF" },
    { name: "Kuzey Amerika", code: "NA" },
    { name: "Güney Amerika", code: "SA" },
    { name: "Okyanusya", code: "OC" },
    { name: "Antarktika", code: "AN" }
];

// Mapping of some major countries to continents for demo purposes.
// A full mapping would be very large, so we include major/common ones.
export const COUNTRY_CONTINENT_MAP: Record<string, string> = {
    "TR": "EU", "GB": "EU", "DE": "EU", "FR": "EU", "IT": "EU", "ES": "EU", "NL": "EU", "BE": "EU", "GR": "EU", "PT": "EU", "SE": "EU", "CH": "EU", "AT": "EU", "NO": "EU", "DK": "EU", "FI": "EU", "IE": "EU", "PL": "EU", "CZ": "EU", "HU": "EU", "RO": "EU", "BG": "EU", "RS": "EU", "HR": "EU", "SK": "EU", "SI": "EU", "LT": "EU", "LV": "EU", "EE": "EU", "LU": "EU", "MT": "EU", "IS": "EU", "CY": "EU", "AL": "EU", "MK": "EU", "BA": "EU", "ME": "EU", "MD": "EU", "UA": "EU", "BY": "EU", "RU": "EU",
    "CN": "AS", "IN": "AS", "JP": "AS", "KR": "AS", "ID": "AS", "TH": "AS", "VN": "AS", "MY": "AS", "SG": "AS", "PH": "AS", "PK": "AS", "BD": "AS", "LK": "AS", "NP": "AS", "IR": "AS", "IQ": "AS", "SA": "AS", "AE": "AS", "IL": "AS", "KZ": "AS", "UZ": "AS", "AZ": "AS",
    "US": "NA", "CA": "NA", "MX": "NA", "CU": "NA", "DO": "NA", "GT": "NA", "CR": "NA", "PA": "NA",
    "BR": "SA", "AR": "SA", "CO": "SA", "PE": "SA", "CL": "SA", "VE": "SA", "EC": "SA",
    "EG": "AF", "ZA": "AF", "NG": "AF", "KE": "AF", "ET": "AF", "MA": "AF", "GH": "AF", "DZ": "AF",
    "AU": "OC", "NZ": "OC", "FJ": "OC",
};

// Fallback: If not in map, assume 'Other' or show in all if no filter selected.
