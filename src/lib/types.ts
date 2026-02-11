
export interface PlaceResult {
    place_id: string; // Google Place ID
    name: string;
    formatted_address?: string;
    rating?: number;
    user_ratings_total?: number;
    website?: string;
    formatted_phone_number?: string;
    // Emails are only returned in plain form if user has unlocked them for this lead.
    emails?: string[];
    emailScores?: Record<string, number>;
    phones?: string[];
    emailCount?: number;
    maskedEmails?: string[];
    emailUnlocked?: boolean;
    socials?: {
        facebook?: string;
        instagram?: string;
        twitter?: string;
        linkedin?: string;
        [key: string]: string | undefined;
    };
    scrapeStatus?: string;
    location?: {
        latitude: number;
        longitude: number;
    };
    types?: string[];
    business_status?: string;
    opening_hours?: {
        open_now: boolean;
        periods?: any[];
        weekday_text?: string[];
    };
    photos?: any[];
}
