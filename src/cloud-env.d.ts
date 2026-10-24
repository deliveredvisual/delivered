// Optional settings for copying uploads to Dropbox and Google Drive. Added as Secrets in the Cloudflare dashboard.
interface CloudflareEnv {
  DROPBOX_APP_KEY?: string;
  DROPBOX_APP_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /** Local testing only: send every Dropbox / Google request to this address instead (a stand-in server). */
  CLOUD_TEST_BASE?: string;
  /** Local testing only: piece size in bytes for big files. */
  CLOUD_CHUNK?: string;
}
