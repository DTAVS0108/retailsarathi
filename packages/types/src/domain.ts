/** Registered production domain — update here only. */
export const SITE_DOMAIN = 'retailsarathi.in' as const;

export const SITE_URL = `https://${SITE_DOMAIN}` as const;
export const WWW_SITE_URL = `https://www.${SITE_DOMAIN}` as const;
export const API_HOST = `api.${SITE_DOMAIN}` as const;
export const API_ORIGIN = `https://${API_HOST}` as const;
export const API_BASE_URL = `${API_ORIGIN}/api/v1` as const;

export const CONTACT_EMAIL = `hello@${SITE_DOMAIN}` as const;
export const SALES_EMAIL = `sales@${SITE_DOMAIN}` as const;
export const ADMIN_EMAIL = `admin@${SITE_DOMAIN}` as const;
export const DEMO_SHOP_EMAIL = `owner@demo.${SITE_DOMAIN}` as const;

/** Comma-separated list for API `CORS_ORIGIN` in production. */
export const PRODUCTION_CORS_ORIGINS = `${SITE_URL},${WWW_SITE_URL}` as const;
