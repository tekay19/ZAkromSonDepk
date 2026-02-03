const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: string) {
    return value.trim().toLowerCase();
}

export function isValidEmail(value: string) {
    return EMAIL_REGEX.test(value);
}

export function isStrongPassword(value: string) {
    if (value.length < 10) return false;
    const hasLower = /[a-z]/.test(value);
    const hasUpper = /[A-Z]/.test(value);
    const hasNumber = /\d/.test(value);
    const hasSymbol = /[^A-Za-z0-9]/.test(value);
    return hasLower && hasUpper && hasNumber && hasSymbol;
}
